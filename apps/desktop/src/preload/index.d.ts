import type {
  AuthUser,
  DesktopAdminResult,
  DesktopApiHealth,
  DesktopAuthResult,
  ManagedUser,
} from "@bcis/shared";

declare global {
  interface Window {
    bcis: {
      getApiHealth: () => Promise<DesktopApiHealth>;
      getSession: () => Promise<{ ok: true; user: AuthUser } | { ok: false; message: string } | null>;
      login: (username: string, password: string) => Promise<DesktopAuthResult>;
      logout: () => Promise<{ ok: true } | { ok: false; message: string }>;
      listAdminUsers: () => Promise<DesktopAdminResult<ManagedUser[]>>;
      listAdminRoles: () => Promise<DesktopAdminResult<string[]>>;
      createAdminUser: (input: {
        username: string;
        displayName: string;
        password: string;
        role: string;
      }) => Promise<DesktopAdminResult<ManagedUser>>;
    };
  }
}
