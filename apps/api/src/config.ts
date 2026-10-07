import { config as loadEnvironment } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadEnvironment({
  path: path.resolve(fileURLToPath(new URL("../../../.env", import.meta.url))),
});

const environmentSchema = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  API_TLS_CERT_FILE: z.string().min(1).optional(),
  API_TLS_KEY_FILE: z.string().min(1).optional(),
}).superRefine((environment, context) => {
  const hasCertificate = Boolean(environment.API_TLS_CERT_FILE);
  const hasPrivateKey = Boolean(environment.API_TLS_KEY_FILE);
  if (hasCertificate !== hasPrivateKey) {
    context.addIssue({
      code: "custom",
      message: "API_TLS_CERT_FILE and API_TLS_KEY_FILE must be configured together.",
    });
  }
  if (
    !["127.0.0.1", "::1", "[::1]", "localhost"].includes(environment.API_HOST) &&
    (!hasCertificate || !hasPrivateKey)
  ) {
    context.addIssue({
      code: "custom",
      message: "TLS certificate and key files are required when the API listens beyond loopback.",
    });
  }
});

export const config = environmentSchema.parse(process.env);
