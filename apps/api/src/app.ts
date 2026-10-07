import Fastify from "fastify";
import { createUserInputSchema, loginInputSchema } from "@bcis/shared";
import type { AuthUser } from "@bcis/shared";

import { AuthError, AuthService, hashPassword } from "./auth/service.js";
import type { AuthStore } from "./auth/types.js";

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
  options: { disableLogging?: boolean; https?: { cert: Buffer; key: Buffer } } = {},
) {
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
    {
      preHandler: async (request, reply) => {
        await authenticate(request, reply);
        if (reply.sent) return;
        if (!request.authUser?.permissions.includes("user.manage")) {
          return reply.code(403).send({ error: "You do not have permission to manage users." });
        }
      },
    },
    async () => ({ users: await authStore.listUsers() }),
  );

  server.get(
    "/admin/roles",
    {
      preHandler: async (request, reply) => {
        await authenticate(request, reply);
        if (reply.sent) return;
        if (!request.authUser?.permissions.includes("user.manage")) {
          return reply.code(403).send({ error: "You do not have permission to manage users." });
        }
      },
    },
    async () => ({ roles: await authStore.listAssignableRoles() }),
  );

  server.post(
    "/admin/users",
    {
      preHandler: async (request, reply) => {
        await authenticate(request, reply);
        if (reply.sent) return;
        if (!request.authUser?.permissions.includes("user.manage")) {
          return reply.code(403).send({ error: "You do not have permission to manage users." });
        }
      },
    },
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

  return server;
}
