import { contextBridge, ipcRenderer } from "electron";
import type {
  AuthUser,
  DesktopAdminResult,
  DesktopApiHealth,
  DesktopAuthResult,
  ManagedUser,
} from "@bcis/shared";

contextBridge.exposeInMainWorld("bcis", {
  getApiHealth: (): Promise<DesktopApiHealth> => ipcRenderer.invoke("bcis:get-api-health"),
  getSession: (): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string } | null> =>
    ipcRenderer.invoke("bcis:get-session"),
  login: (username: string, password: string): Promise<DesktopAuthResult> =>
    ipcRenderer.invoke("bcis:login", { username, password }),
  logout: (): Promise<{ ok: true } | { ok: false; message: string }> =>
    ipcRenderer.invoke("bcis:logout"),
  listAdminUsers: (): Promise<DesktopAdminResult<ManagedUser[]>> =>
    ipcRenderer.invoke("bcis:admin-list-users"),
  listAdminRoles: (): Promise<DesktopAdminResult<string[]>> =>
    ipcRenderer.invoke("bcis:admin-list-roles"),
  createAdminUser: (input: {
    username: string;
    displayName: string;
    password: string;
    role: string;
  }): Promise<DesktopAdminResult<ManagedUser>> => ipcRenderer.invoke("bcis:admin-create-user", input),
});
