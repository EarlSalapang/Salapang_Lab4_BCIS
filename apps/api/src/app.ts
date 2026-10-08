import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createCollectionAreaInputSchema,
  createInvoiceInputSchema,
  createPlanInputSchema,
  createServiceAccountInputSchema,
  createSubscriberInputSchema,
  createUserInputSchema,
  generateBillingInputSchema,
  identifierSchema,
  invoiceListQuerySchema,
  ledgerEntryListQuerySchema,
  loginInputSchema,
  serviceAccountListQuerySchema,
  subscriberListQuerySchema,
  updateInvoiceInputSchema,
  updatePlanInputSchema,
  updateServiceAccountInputSchema,
  updateSubscriberInputSchema,
} from "@bcis/shared";
import type { AuthUser } from "@bcis/shared";

import { AuthError, AuthService, hashPassword } from "./auth/service.js";
import type { AuthStore } from "./auth/types.js";
import { CatalogError, type DirectoryStore } from "./catalog/types.js";

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

export function buildServer(
  database: HealthQuery,
  authStore: AuthStore,
  options: {
    disableLogging?: boolean;
    https?: { cert: Buffer; key: Buffer };
    directory?: DirectoryStore;
  } = {},
) {
  const directory = options.directory;
  const server = Fastify({
    bodyLimit: 16 * 1024,
    ...(options.https ? { https: options.https } : {}),
    logger: options.disableLogging
      ? false
      : {
          level: process.env.LOG_LEVEL ?? "info",
          redact: ["req.headers.authorization", "req.headers.cookie"],
        },
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
    const parsed = loginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Enter a valid username and password." });
    }

    try {
      return await auth.login(parsed.data.username, parsed.data.password);
    } catch (error) {
      if (error instanceof AuthError) {
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
  const manageBilling = requirePermission("billing.generate", "You do not have permission to generate billing.");

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

  return server;
}
