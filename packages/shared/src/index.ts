import { z } from "zod";
export * from "./catalog.js";
export * from "./reports.js";

export const apiHealthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("bcis-api"),
  timestamp: z.string().datetime(),
});

export type ApiHealthResponse = z.infer<typeof apiHealthSchema>;

export type DesktopApiHealth =
  | { status: "online"; service: "bcis-api"; timestamp: string }
  | { status: "offline"; message: string };

export const loginInputSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(128),
});

export const createUserInputSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(64)
    .regex(/^[a-z0-9._-]+$/, "Use letters, numbers, dots, underscores, or hyphens."),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
  role: z.string().min(1).max(80),
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});

export const managedUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  isActive: z.boolean(),
  roles: z.array(z.string()),
});

export const stringArraySchema = z.array(z.string());

export const loginResponseSchema = z.object({
  token: z.string().min(40),
  user: authUserSchema,
  expiresAt: z.string().datetime(),
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type ManagedUser = z.infer<typeof managedUserSchema>;

export type DesktopAuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; message: string };

export type DesktopAdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export type DesktopResult<T> = DesktopAdminResult<T>;
