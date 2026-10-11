import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  allocationPreviewInputSchema,
  closeCollectionBatchInputSchema,
  collectionBatchListQuerySchema,
  createCollectionAreaInputSchema,
  createCollectorAssignmentInputSchema,
  createCollectionBatchInputSchema,
  createCollectorInputSchema,
  createInvoiceInputSchema,
  createPaymentInputSchema,
  createPlanInputSchema,
  createServiceAccountInputSchema,
  createSubscriberInputSchema,
  createUserInputSchema,
  generateBillingInputSchema,
  identifierSchema,
  invoiceListQuerySchema,
  ledgerEntryListQuerySchema,
  loginInputSchema,
  paymentListQuerySchema,
  reconcileCollectionBatchInputSchema,
  reconnectServiceAccountInputSchema,
  remitCollectionBatchInputSchema,
  reversePaymentInputSchema,
  serviceAccountListQuerySchema,
  subscriberListQuerySchema,
  suspendServiceAccountInputSchema,
  updateCollectorInputSchema,
  updateInvoiceInputSchema,
  updatePlanInputSchema,
  updateServiceAccountInputSchema,
  updateSubscriberInputSchema,
  verifyPaymentInputSchema,
} from "@bcis/shared";
import type { AuthUser } from "@bcis/shared";

import type { AuditStore } from "./audit/types.js";
import { LOGIN_RATE_LIMIT, SlidingWindowRateLimiter, type RateLimitOptions } from "./auth/rate-limit.js";
import { AuthError, AuthService, hashPassword } from "./auth/service.js";
import type { AuthStore } from "./auth/types.js";
import { CatalogError, type DirectoryStore } from "./catalog/types.js";
import { REPORT_CATALOG, isReportKey } from "./reports/catalog.js";
import { buildDashboard, buildReport } from "./reports/builders.js";
import { applySecurityHeaders } from "./security.js";

export interface HealthQuery {
  query: (queryText: string) => Promise<unknown>;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

function getBearerToken(authorization: string | undefined): string | null {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/)?.[1];
  return token ?? null;
}

function httpStatus(error: unknown): number {
  if (error && typeof error === "object" && "statusCode" in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    if (typeof value === "number" && value >= 400 && value < 500) return value;
  }
  return 500;
}

export function buildServer(
  database: HealthQuery,
  authStore: AuthStore,
  options: {
    disableLogging?: boolean;
    https?: { cert: Buffer; key: Buffer };
    directory?: DirectoryStore;
    audit?: AuditStore;
    loginRateLimit?: RateLimitOptions;
  } = {},
) {
  const directory = options.directory;
  const audit = options.audit;
  const loginLimiter = new SlidingWindowRateLimiter(options.loginRateLimit ?? LOGIN_RATE_LIMIT);
  const logFile = process.env.LOG_FILE;
  const server = Fastify({
    bodyLimit: 16 * 1024,
    ...(options.https ? { https: options.https } : {}),
    logger: options.disableLogging
      ? false
      : {
          level: process.env.LOG_LEVEL ?? "info",
          redact: ["req.headers.authorization", "req.headers.cookie"],
          ...(logFile
            ? { transport: { target: "pino/file", options: { destination: logFile, mkdir: true } } }
            : {}),
        },
  });

  applySecurityHeaders(server, { https: Boolean(options.https) });

  server.setErrorHandler((error: unknown, request, reply) => {
    const statusCode = httpStatus(error);
    if (statusCode >= 500) {
      request.log.error({ err: error }, "unhandled request error");
      return reply.code(statusCode).send({ error: "Unable to complete the request." });
    }
    return reply.code(statusCode).send({ error: error instanceof Error ? error.message : "Invalid request." });
  });

  const auth = new AuthService(authStore);
  server.decorateRequest("authUser", null);

  const authenticate = async (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
  const token = getBearerToken(request.headers.authorization);
  if (!token) {
    return reply.code(401).send({ error: "Authentication required." });
  }

  request.authUser = await auth.authenticate(token);
  if (!request.authUser) {
    return reply.code(401).send({ error: "Session is invalid or expired." });
  }
  };

  const requirePermission = (permission: string, message: string) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      await authenticate(request, reply);
      if (reply.sent) return;
      if (!request.authUser?.permissions.includes(permission)) {
        return reply.code(403).send({ error: message });
      }
    };

  const requireDirectory = (reply: FastifyReply): DirectoryStore | null => {
    if (!directory) {
      void reply.code(503).send({ error: "Directory services are not available." });
      return null;
    }
    return directory;
  };

  const sendError = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
    if (error instanceof CatalogError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({ error: "Unable to complete the request." });
  };

  const actorOf = (request: FastifyRequest) => ({
    userId: request.authUser?.id ?? null,
    displayName: request.authUser?.displayName ?? "System",
  });

  const recordAudit = async (
    request: FastifyRequest,
    input: {
      action: string;
      summary: string;
      entityType?: string | null;
      entityId?: string | null;
      metadata?: Record<string, unknown> | null;
      actor?: { userId: string | null; displayName: string };
    },
  ): Promise<void> => {
    if (!audit) return;
    const actor = input.actor ?? actorOf(request);
    try {
      await audit.record({
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        summary: input.summary,
        metadata: input.metadata ?? null,
        ipAddress: request.ip,
        userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
      });
    } catch (error) {
      request.log.error({ err: error }, "audit record failed");
    }
  };

  const requireAudit = (reply: FastifyReply): AuditStore | null => {
    if (!audit) {
      void reply.code(503).send({ error: "Audit services are not available." });
      return null;
    }
    return audit;
  };

  server.get("/health", async () => ({
    status: "ok",
    service: "bcis-api",
    timestamp: new Date().toISOString(),
  }));

  server.get("/ready", async (_request, reply) => {
    try {
      await database.query("SELECT 1");
      return { status: "ready", database: "connected" };
    } catch (error) {
      server.log.error({ err: error }, "database readiness check failed");
      return reply.code(503).send({ status: "not_ready", database: "unavailable" });
    }
  });

  server.post("/auth/login", async (request, reply) => {
    const limit = loginLimiter.check(request.ip);
    if (!limit.allowed) {
      reply.header("Retry-After", Math.ceil(limit.retryAfterMs / 1000));
      return reply.code(429).send({ error: "Too many sign-in attempts. Please wait and try again." });
    }

    const parsed = loginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Enter a valid username and password." });
    }

    try {
      const result = await auth.login(parsed.data.username, parsed.data.password);
      loginLimiter.reset(request.ip);
      await recordAudit(request, {
        action: "auth.login",
        summary: `User "${result.user.username}" signed in.`,
        entityType: "user",
        entityId: result.user.id,
        actor: { userId: result.user.id, displayName: result.user.displayName },
      });
      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        await recordAudit(request, {
          action: "auth.login_failed",
          summary: `Failed sign-in for username "${parsed.data.username.trim().toLowerCase()}".`,
          entityType: "user",
          actor: { userId: null, displayName: parsed.data.username.trim() || "unknown" },
        });
        return reply.code(error.statusCode).send({ error: error.message });
      }
      request.log.error({ err: error }, "authentication request failed");
      return reply.code(500).send({ error: "Unable to sign in. Please try again." });
    }
  });

  server.get("/auth/me", { preHandler: authenticate }, async (request) => request.authUser);

  server.post("/auth/logout", { preHandler: authenticate }, async (request, reply) => {
    const token = getBearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "Authentication required." });
    await auth.logout(token);
    return reply.code(204).send();
  });

  server.post("/auth/lock", { preHandler: authenticate }, async (request, reply) => {
    const token = getBearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "Authentication required." });
    await auth.logout(token);
    return reply.code(204).send();
  });

  server.get(
    "/admin/users",
    { preHandler: requirePermission("user.manage", "You do not have permission to manage users.") },
    async () => ({ users: await authStore.listUsers() }),
  );

  server.get(
    "/admin/roles",
    { preHandler: requirePermission("user.manage", "You do not have permission to manage users.") },
    async () => ({ roles: await authStore.listAssignableRoles() }),
  );

  server.post(
    "/admin/users",
    { preHandler: requirePermission("user.manage", "You do not have permission to manage users.") },
    async (request, reply) => {
      const parsed = createUserInputSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Enter valid user details and an allowed role." });
      if (parsed.data.role === "Owner / Super Admin") {
        return reply.code(400).send({ error: "The owner role can only be assigned during initial bootstrap." });
      }
      try {
        const roles = await authStore.listAssignableRoles();
        if (!roles.includes(parsed.data.role)) {
          return reply.code(400).send({ error: "Select an available role." });
        }
        const user = await authStore.createUser({
          ...parsed.data,
          passwordHash: await hashPassword(parsed.data.password),
        });
        await recordAudit(request, {
          action: "user.create",
          summary: `Created user "${user.username}" with role "${parsed.data.role}".`,
          entityType: "user",
          entityId: user.id,
          metadata: { role: parsed.data.role },
        });
        return reply.code(201).send({ user });
      } catch (error) {
        if (error instanceof Error && error.message === "A user with that username already exists.") {
          return reply.code(409).send({ error: error.message });
        }
        request.log.error({ err: error }, "user creation failed");
        return reply.code(500).send({ error: "Unable to create the user." });
      }
    },
  );

  const viewDirectory = requirePermission("subscriber.view", "You do not have permission to view subscribers.");
  const createSubscribers = requirePermission("subscriber.create", "You do not have permission to create subscribers.");
  const updateSubscribers = requirePermission("subscriber.update", "You do not have permission to update subscriber records.");
  const managePlans = requirePermission("plan.manage", "You do not have permission to manage service plans.");
  const manageCollections = requirePermission("collection.manage", "You do not have permission to manage collection areas.");
  const reconcileCollections = requirePermission(
    "collection.reconcile",
    "You do not have permission to reconcile collections.",
  );
  const manageBilling = requirePermission("billing.generate", "You do not have permission to generate billing.");
  const createPayments = requirePermission("payment.create", "You do not have permission to post payments.");
  const verifyPayments = requirePermission("payment.verify_gcash", "You do not have permission to verify GCash payments.");
  const reversePayments = requirePermission("payment.reverse", "You do not have permission to reverse payments.");
  const viewReports = requirePermission("report.view", "You do not have permission to view reports.");
  const exportReports = requirePermission("report.export", "You do not have permission to export reports.");
  const viewAudit = requirePermission("audit.view", "You do not have permission to view audit records.");

  const parseIdentifier = (reply: FastifyReply, value: unknown, resource: string) => {
    const parsed = identifierSchema.safeParse(value);
    if (!parsed.success) {
      void reply.code(400).send({ error: `Enter a valid ${resource} identifier.` });
      return null;
    }
    return parsed.data;
  };

  server.get("/plans", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const includeInactive = (request.query as { includeInactive?: unknown } | undefined)?.includeInactive === "true";
    try {
      return { plans: await store.listPlans(includeInactive) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/plans", { preHandler: managePlans }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = createPlanInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid service plan details." });
    try {
      return reply.code(201).send({ plan: await store.createPlan(parsed.data) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.patch("/plans/:id", { preHandler: managePlans }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "service plan");
    if (!id) return;
    const parsed = updatePlanInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid service plan details." });
    try {
      return { plan: await store.updatePlan(id, parsed.data) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/collection-areas", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    try {
      return { areas: await store.listCollectionAreas() };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collection-areas", { preHandler: manageCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = createCollectionAreaInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid collection area details." });
    try {
      return reply.code(201).send({ area: await store.createCollectionArea(parsed.data) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/subscribers", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = subscriberListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid subscriber list filters." });
    try {
      return await store.listSubscribers(parsed.data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/subscribers", { preHandler: createSubscribers }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = createSubscriberInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid subscriber details." });
    try {
      return reply.code(201).send({ subscriber: await store.createSubscriber(parsed.data) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/subscribers/:id", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "subscriber");
    if (!id) return;
    try {
      const subscriber = await store.getSubscriber(id);
      if (!subscriber) return reply.code(404).send({ error: "Subscriber was not found." });
      return { subscriber };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.patch("/subscribers/:id", { preHandler: updateSubscribers }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "subscriber");
    if (!id) return;
    const parsed = updateSubscriberInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid subscriber details." });
    try {
      return { subscriber: await store.updateSubscriber(id, parsed.data) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/service-accounts", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = serviceAccountListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid service account list filters." });
    try {
      return await store.listServiceAccounts(parsed.data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/service-accounts/:id", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "service account");
    if (!id) return;
    try {
      const serviceAccount = await store.getServiceAccount(id);
      if (!serviceAccount) return reply.code(404).send({ error: "Service account was not found." });
      return { serviceAccount };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/subscribers/:id/service-accounts", { preHandler: createSubscribers }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "subscriber");
    if (!id) return;
    const parsed = createServiceAccountInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid service account details." });
    try {
      const serviceAccount = await store.createServiceAccount(id, parsed.data, actorOf(request));
      return reply.code(201).send({ serviceAccount });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.patch("/service-accounts/:id", { preHandler: updateSubscribers }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "service account");
    if (!id) return;
    const parsed = updateServiceAccountInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid service account details." });
    try {
      return { serviceAccount: await store.updateServiceAccount(id, parsed.data, actorOf(request)) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/invoices", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = invoiceListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid invoice list filters." });
    try {
      return await store.listInvoices(parsed.data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/invoices/:id", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "invoice");
    if (!id) return;
    try {
      const invoice = await store.getInvoice(id);
      if (!invoice) return reply.code(404).send({ error: "Invoice was not found." });
      return { invoice };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/invoices", { preHandler: manageBilling }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = createInvoiceInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid invoice details." });
    try {
      return reply.code(201).send({ invoice: await store.createInvoice(parsed.data, actorOf(request)) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.patch("/invoices/:id", { preHandler: manageBilling }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "invoice");
    if (!id) return;
    const parsed = updateInvoiceInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid invoice details." });
    try {
      return { invoice: await store.updateInvoice(id, parsed.data, actorOf(request)) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/billing/generate", { preHandler: manageBilling }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = generateBillingInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a valid billing period and dates." });
    try {
      return await store.generateInvoices(parsed.data, actorOf(request));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/ledger", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = ledgerEntryListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid ledger filters." });
    try {
      return await store.listLedgerEntries(parsed.data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/payments", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = paymentListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid payment list filters." });
    try {
      return await store.listPayments(parsed.data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/payments/:id", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "payment");
    if (!id) return;
    try {
      const payment = await store.getPayment(id);
      if (!payment) return reply.code(404).send({ error: "Payment was not found." });
      return { payment };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/payments/preview", { preHandler: createPayments }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = allocationPreviewInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Select a subscriber and a positive payment amount." });
    try {
      return await store.previewAllocation(parsed.data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/payments", { preHandler: createPayments }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = createPaymentInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid payment details." });
    try {
      const payment = await store.createPayment(parsed.data, actorOf(request));
      await recordAudit(request, {
        action: "payment.create",
        summary: `Recorded payment ${payment.receiptNumber} of ${payment.amountCents} cents (${payment.method}).`,
        entityType: "payment",
        entityId: payment.id,
        metadata: { subscriberId: payment.subscriberId, amountCents: payment.amountCents, method: payment.method },
      });
      return reply.code(201).send({ payment });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/payments/:id/verify", { preHandler: verifyPayments }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "payment");
    if (!id) return;
    const parsed = verifyPaymentInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Choose whether to verify or reject the payment." });
    try {
      const payment = await store.verifyPayment(id, parsed.data, actorOf(request));
      await recordAudit(request, {
        action: parsed.data.decision === "reject" ? "payment.reject" : "payment.verify",
        summary: `Payment ${payment.receiptNumber} ${parsed.data.decision === "reject" ? "rejected" : "verified"}.`,
        entityType: "payment",
        entityId: payment.id,
      });
      return { payment };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/payments/:id/reverse", { preHandler: reversePayments }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "payment");
    if (!id) return;
    const parsed = reversePaymentInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a reversal reason of at least 5 characters." });
    try {
      const payment = await store.reversePayment(id, parsed.data, actorOf(request));
      await recordAudit(request, {
        action: "payment.reverse",
        summary: `Reversed payment ${payment.receiptNumber}: ${parsed.data.reason}`,
        entityType: "payment",
        entityId: payment.id,
      });
      return { payment };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/collectors", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const includeInactive = (request.query as { includeInactive?: unknown } | undefined)?.includeInactive === "true";
    try {
      return { collectors: await store.listCollectors(includeInactive) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collectors", { preHandler: manageCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = createCollectorInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a valid collector code and name." });
    try {
      return reply.code(201).send({ collector: await store.createCollector(parsed.data) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.patch("/collectors/:id", { preHandler: manageCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collector");
    if (!id) return;
    const parsed = updateCollectorInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid collector details." });
    try {
      return { collector: await store.updateCollector(id, parsed.data) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/collector-assignments", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const raw = (request.query as { collectorId?: unknown } | undefined)?.collectorId;
    let collectorId: string | undefined;
    if (raw !== undefined) {
      const parsed = identifierSchema.safeParse(raw);
      if (!parsed.success) return reply.code(400).send({ error: "Enter a valid collector identifier." });
      collectorId = parsed.data;
    }
    try {
      return { assignments: await store.listCollectorAssignments(collectorId) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collector-assignments", { preHandler: manageCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = createCollectorAssignmentInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Select a collector and at least one subscriber." });
    try {
      return reply.code(201).send({ assignments: await store.createCollectorAssignments(parsed.data) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.delete("/collector-assignments/:id", { preHandler: manageCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collector assignment");
    if (!id) return;
    try {
      await store.removeCollectorAssignment(id);
      return reply.code(204).send();
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/collection-batches", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = collectionBatchListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid collection batch filters." });
    try {
      return await store.listCollectionBatches(parsed.data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/collection-batches/:id", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collection batch");
    if (!id) return;
    try {
      return { batch: await store.getCollectionBatch(id) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collection-batches", { preHandler: manageCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const parsed = createCollectionBatchInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Select a collector and route date." });
    try {
      return reply.code(201).send({ batch: await store.createCollectionBatch(parsed.data, actorOf(request)) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collection-batches/:id/start", { preHandler: manageCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collection batch");
    if (!id) return;
    try {
      return { batch: await store.startCollectionBatch(id, actorOf(request)) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collection-batches/:id/submit", { preHandler: manageCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collection batch");
    if (!id) return;
    try {
      return { batch: await store.submitCollectionBatch(id, actorOf(request)) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collection-batches/:id/remit", { preHandler: reconcileCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collection batch");
    if (!id) return;
    const parsed = remitCollectionBatchInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter the remitted amount." });
    try {
      return { batch: await store.remitCollectionBatch(id, parsed.data, actorOf(request)) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collection-batches/:id/reconcile", { preHandler: reconcileCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collection batch");
    if (!id) return;
    const parsed = reconcileCollectionBatchInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid reconciliation details." });
    try {
      return { batch: await store.reconcileCollectionBatch(id, parsed.data, actorOf(request)) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.post("/collection-batches/:id/close", { preHandler: reconcileCollections }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collection batch");
    if (!id) return;
    const parsed = closeCollectionBatchInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Confirm closing the collection batch." });
    try {
      return { batch: await store.closeCollectionBatch(id, actorOf(request)) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/collection-batches/:id/route-sheet", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "collection batch");
    if (!id) return;
    try {
      return await store.getRouteSheet(id);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/collector-report", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    try {
      return await store.getCollectorReport(rawFrom(request), rawTo(request));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/aging-report", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    try { return await store.getAgingReport(rawFrom(request)); } catch (error) { return sendError(request, reply, error); }
  });
  server.get("/overdue", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    try { return await store.getOverdueInvoices(rawFrom(request)); } catch (error) { return sendError(request, reply, error); }
  });
  server.get("/suspension-candidates", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    try { return await store.getSuspensionCandidates(rawFrom(request)); } catch (error) { return sendError(request, reply, error); }
  });
  server.get("/service-accounts/:id/suspensions", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "service account");
    if (!id) return;
    try { return { suspensions: await store.listSuspensions(id) }; } catch (error) { return sendError(request, reply, error); }
  });
  server.get("/suspensions", { preHandler: viewDirectory }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    try { return { suspensions: await store.listSuspensions() }; } catch (error) { return sendError(request, reply, error); }
  });
  server.post("/service-accounts/:id/suspend", { preHandler: updateSubscribers }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "service account");
    if (!id) return;
    const parsed = suspendServiceAccountInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid suspension details." });
    try {
      const suspension = await store.suspendServiceAccount(id, parsed.data, actorOf(request));
      await recordAudit(request, {
        action: "service.suspend",
        summary: `Suspended service account ${id}.`,
        entityType: "service_account",
        entityId: id,
        metadata: { suspensionId: suspension.id, reason: parsed.data.reason ?? null },
      });
      return { suspension };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
  server.post("/service-accounts/:id/reconnect", { preHandler: updateSubscribers }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const id = parseIdentifier(reply, (request.params as { id?: unknown }).id, "service account");
    if (!id) return;
    const parsed = reconnectServiceAccountInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Enter valid reconnection details." });
    try {
      const suspension = await store.reconnectServiceAccount(id, parsed.data, actorOf(request));
      await recordAudit(request, {
        action: "service.reconnect",
        summary: `Reconnected service account ${id}.`,
        entityType: "service_account",
        entityId: id,
        metadata: { suspensionId: suspension.id, reason: parsed.data.reason ?? null },
      });
      return { suspension };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
  server.get("/reports", { preHandler: viewReports }, async () => REPORT_CATALOG);

  server.get("/reports/dashboard", { preHandler: viewReports }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    try {
      return await buildDashboard(store, rawAsOf(request));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/reports/:key/export", { preHandler: exportReports }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const key = String((request.params as { key?: unknown }).key ?? "");
    if (!isReportKey(key)) return reply.code(404).send({ error: "Report not found." });
    try {
      const report = await buildReport(store, key, reportParams(request));
      if (!report) return reply.code(404).send({ error: "Report not found." });
      return report;
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/reports/:key", { preHandler: viewReports }, async (request, reply) => {
    const store = requireDirectory(reply);
    if (!store) return;
    const key = String((request.params as { key?: unknown }).key ?? "");
    if (!isReportKey(key)) return reply.code(404).send({ error: "Report not found." });
    try {
      const report = await buildReport(store, key, reportParams(request));
      if (!report) return reply.code(404).send({ error: "Report not found." });
      return report;
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  server.get("/admin/audit", { preHandler: viewAudit }, async (request, reply) => {
    const store = requireAudit(reply);
    if (!store) return;
    try {
      return { events: await store.list(auditQuery(request)) };
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  return server;
}

function reportParams(request: FastifyRequest): Record<string, string | undefined> {
  const query = (request.query as Record<string, unknown> | undefined) ?? {};
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && value.length > 0) params[key] = value;
  }
  return params;
}

function rawAsOf(request: FastifyRequest): string | undefined {
  const value = (request.query as { asOf?: unknown } | undefined)?.asOf;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function rawFrom(request: FastifyRequest): string | undefined {
  const value = (request.query as { from?: unknown } | undefined)?.from;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function rawTo(request: FastifyRequest): string | undefined {
  const value = (request.query as { to?: unknown } | undefined)?.to;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function auditQuery(request: FastifyRequest): {
  from?: string;
  to?: string;
  action?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
} {
  const query = (request.query as Record<string, unknown> | undefined) ?? {};
  const stringValue = (key: string): string | undefined => {
    const value = query[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  const limitRaw = Number(query.limit);
  return {
    from: stringValue("from"),
    to: stringValue("to"),
    action: stringValue("action"),
    actorUserId: stringValue("actorUserId"),
    entityType: stringValue("entityType"),
    entityId: stringValue("entityId"),
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : undefined,
  };
}
