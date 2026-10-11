import type { FastifyInstance } from "fastify";

export interface SecurityHeaderOptions {
  https?: boolean;
}

export function applySecurityHeaders(server: FastifyInstance, options: SecurityHeaderOptions = {}): void {
  server.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    reply.header("Cache-Control", "no-store");
    if (options.https) {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });
}
