import { app, BrowserWindow, ipcMain } from "electron";
import {
  apiHealthSchema,
  authUserSchema,
  createUserInputSchema,
  loginInputSchema,
  loginResponseSchema,
  managedUserSchema,
  stringArraySchema,
} from "@bcis/shared";
import type { DesktopApiHealth, ManagedUser } from "@bcis/shared";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiBaseUrl = process.env.BCIS_API_URL ?? "http://127.0.0.1:3000";
const apiUrl = new URL(apiBaseUrl);
if (
  apiUrl.protocol !== "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(apiUrl.hostname)
) {
  throw new Error("BCIS_API_URL must use HTTPS when connecting to a remote server.");
}
let sessionToken: string | null = null;

async function requestApi(pathname: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBaseUrl}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(5000),
    headers: {
      ...(init?.headers ?? {}),
      ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
    },
  });
}

async function apiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    return "The server returned an unreadable error response.";
  }
  return "The server could not complete the request.";
}

ipcMain.handle("bcis:get-api-health", async (): Promise<DesktopApiHealth> => {
  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return { status: "offline", message: "The API server is not responding." };
    }

    const result = apiHealthSchema.safeParse(await response.json());
    if (!result.success) {
      return { status: "offline", message: "The API server returned an invalid response." };
    }

    return {
      status: "online",
      service: result.data.service,
      timestamp: result.data.timestamp,
    };
  } catch {
    return { status: "offline", message: "The API server is unreachable." };
  }
});

ipcMain.handle("bcis:get-session", async () => {
  if (!sessionToken) return null;
  try {
    const response = await requestApi("/auth/me");
    if (response.status === 401) {
      sessionToken = null;
      return null;
    }
    if (!response.ok) return { ok: false, message: await apiError(response) };
    const user = authUserSchema.safeParse(await response.json());
    if (!user.success) return { ok: false, message: "The server returned an invalid session." };
    return { ok: true, user: user.data };
  } catch {
    return { ok: false, message: "Unable to verify the session because the API server is unreachable." };
  }
});

ipcMain.handle("bcis:login", async (_event, input: unknown) => {
  const parsed = loginInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter a valid username and password." };
  try {
    const response = await requestApi("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!response.ok) return { ok: false, message: await apiError(response) };
    const result = loginResponseSchema.safeParse(await response.json());
    if (!result.success) return { ok: false, message: "The server returned an invalid sign-in response." };
    sessionToken = result.data.token;
    return { ok: true, user: result.data.user };
  } catch {
    return { ok: false, message: "Unable to sign in because the API server is unreachable." };
  }
});

ipcMain.handle("bcis:logout", async () => {
  if (!sessionToken) return { ok: true };
  try {
    const response = await requestApi("/auth/logout", { method: "POST" });
    if (!response.ok) return { ok: false, message: await apiError(response) };
    sessionToken = null;
    return { ok: true };
  } catch {
    return { ok: false, message: "Unable to end the session because the API server is unreachable." };
  }
});

ipcMain.handle("bcis:admin-list-users", async () => {
  if (!sessionToken) return { ok: false, message: "Sign in to manage users." };
  try {
    const response = await requestApi("/admin/users");
    if (response.status === 401) sessionToken = null;
    if (!response.ok) return { ok: false, message: await apiError(response) };
    const body: unknown = await response.json();
    const users = zodArrayOfManagedUsers(body);
    return users
      ? { ok: true, data: users }
      : { ok: false, message: "The server returned an invalid user list." };
  } catch {
    return { ok: false, message: "Unable to load users because the API server is unreachable." };
  }
});

ipcMain.handle("bcis:admin-list-roles", async () => {
  if (!sessionToken) return { ok: false, message: "Sign in to manage users." };
  try {
    const response = await requestApi("/admin/roles");
    if (response.status === 401) sessionToken = null;
    if (!response.ok) return { ok: false, message: await apiError(response) };
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("roles" in body)) {
      return { ok: false, message: "The server returned an invalid role list." };
    }
    const roles = stringArraySchema.safeParse(body.roles);
    return roles.success
      ? { ok: true, data: roles.data }
      : { ok: false, message: "The server returned an invalid role list." };
  } catch {
    return { ok: false, message: "Unable to load roles because the API server is unreachable." };
  }
});

ipcMain.handle("bcis:admin-create-user", async (_event, input: unknown) => {
  if (!sessionToken) return { ok: false, message: "Sign in to manage users." };
  const parsed = createUserInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter valid user details." };
  try {
    const response = await requestApi("/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (response.status === 401) sessionToken = null;
    if (!response.ok) return { ok: false, message: await apiError(response) };
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("user" in body)) {
      return { ok: false, message: "The server returned an invalid user record." };
    }
    const user = managedUserSchema.safeParse(body.user);
    return user.success
      ? { ok: true, data: user.data }
      : { ok: false, message: "The server returned an invalid user record." };
  } catch {
    return { ok: false, message: "Unable to create the user because the API server is unreachable." };
  }
});

function zodArrayOfManagedUsers(body: unknown): ManagedUser[] | null {
  if (typeof body !== "object" || body === null || !("users" in body)) return null;
  const result = managedUserSchema.array().safeParse(body.users);
  return result.success ? result.data : null;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#f6f8fb",
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(currentDirectory, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
