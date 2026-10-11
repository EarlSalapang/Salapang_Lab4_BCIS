import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import {
  agingReportSchema,
  allocationPreviewInputSchema,
  allocationPreviewSchema,
  apiHealthSchema,
  authUserSchema,
  billingGenerationResultSchema,
  dashboardSchema,
  closeCollectionBatchInputSchema,
  collectionAreaListSchema,
  collectionAreaResponseSchema,
  collectionBatchListSchema,
  collectionBatchResponseSchema,
  collectorAssignmentListSchema,
  collectorListSchema,
  collectorReportSchema,
  collectorResponseSchema,
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
  invoiceListSchema,
  invoiceResponseSchema,
  ledgerEntryListSchema,
  loginInputSchema,
  loginResponseSchema,
  managedUserSchema,
  overdueListSchema,
  paymentListSchema,
  paymentResponseSchema,
  reconcileCollectionBatchInputSchema,
  reportCatalogSchema,
  reportSchema,
  reconnectServiceAccountInputSchema,
  remitCollectionBatchInputSchema,
  reversePaymentInputSchema,
  routeSheetSchema,
  serviceAccountListSchema,
  serviceAccountResponseSchema,
  servicePlanListSchema,
  servicePlanResponseSchema,
  serviceSuspensionListSchema,
  serviceSuspensionResponseSchema,
  stringArraySchema,
  subscriberListSchema,
  subscriberResponseSchema,
  suspendServiceAccountInputSchema,
  suspensionListSchema,
  updateCollectorInputSchema,
  updateInvoiceInputSchema,
  updatePlanInputSchema,
  updateServiceAccountInputSchema,
  updateSubscriberInputSchema,
  verifyPaymentInputSchema,
} from "@bcis/shared";
import type { DesktopApiHealth, ManagedUser } from "@bcis/shared";
import type { ZodType } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildReportPdf, buildReportWorkbook } from "./exporters";

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

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function listParams(input: unknown, allowed: readonly string[]): Record<string, string | number | undefined> {
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const output: Record<string, string | number | undefined> = {};
  for (const key of allowed) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) output[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
  }
  return output;
}

async function directoryRequest<T>(
  pathname: string,
  schema: ZodType<T>,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  if (!sessionToken) return { ok: false, message: "Sign in to continue." };
  try {
    const response = await requestApi(pathname, {
      method: init.method ?? "GET",
      ...(init.body !== undefined
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) }
        : {}),
    });
    if (response.status === 401) sessionToken = null;
    if (!response.ok) return { ok: false, message: await apiError(response) };
    const parsed = schema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, message: "The server returned an invalid response." };
  } catch {
    return { ok: false, message: "Unable to reach the central API server." };
  }
}

function identifierResult(input: unknown): { ok: true; data: string } | { ok: false; message: string } {
  const parsed = identifierSchema.safeParse(input);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, message: "Enter a valid record identifier." };
}

function splitPayload(payload: unknown): { ok: true; id: string; input: unknown } | { ok: false; message: string } {
  const source = typeof payload === "object" && payload !== null ? (payload as { id?: unknown; input?: unknown }) : {};
  const identifier = identifierResult(source.id);
  if (!identifier.ok) return identifier;
  return { ok: true, id: identifier.data, input: source.input };
}

ipcMain.handle("bcis:list-plans", (_event, includeInactive: unknown) =>
  directoryRequest(
    `/plans${queryString({ includeInactive: includeInactive === true ? "true" : "" })}`,
    servicePlanListSchema,
  ));

ipcMain.handle("bcis:create-plan", (_event, input: unknown) => {
  const parsed = createPlanInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter valid service plan details." };
  return directoryRequest("/plans", servicePlanResponseSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:update-plan", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return split;
  const parsed = updatePlanInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Enter valid service plan details." };
  return directoryRequest(`/plans/${split.id}`, servicePlanResponseSchema, { method: "PATCH", body: parsed.data });
});

ipcMain.handle("bcis:list-collection-areas", () =>
  directoryRequest("/collection-areas", collectionAreaListSchema));

ipcMain.handle("bcis:create-collection-area", (_event, input: unknown) => {
  const parsed = createCollectionAreaInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter valid collection area details." };
  return directoryRequest("/collection-areas", collectionAreaResponseSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:list-subscribers", (_event, params: unknown) =>
  directoryRequest(
    `/subscribers${queryString(listParams(params, ["query", "status", "collectionAreaId", "page", "pageSize"]))}`,
    subscriberListSchema,
  ));

ipcMain.handle("bcis:get-subscriber", (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  return directoryRequest(`/subscribers/${identifier.data}`, subscriberResponseSchema);
});

ipcMain.handle("bcis:create-subscriber", (_event, input: unknown) => {
  const parsed = createSubscriberInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter valid subscriber details." };
  return directoryRequest("/subscribers", subscriberResponseSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:update-subscriber", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return split;
  const parsed = updateSubscriberInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Enter valid subscriber details." };
  return directoryRequest(`/subscribers/${split.id}`, subscriberResponseSchema, { method: "PATCH", body: parsed.data });
});

ipcMain.handle("bcis:list-service-accounts", (_event, params: unknown) =>
  directoryRequest(
    `/service-accounts${queryString(listParams(params, ["query", "status", "page", "pageSize"]))}`,
    serviceAccountListSchema,
  ));

ipcMain.handle("bcis:get-service-account", (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  return directoryRequest(`/service-accounts/${identifier.data}`, serviceAccountResponseSchema);
});

ipcMain.handle("bcis:create-service-account", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return split;
  const parsed = createServiceAccountInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Enter valid service account details." };
  return directoryRequest(`/subscribers/${split.id}/service-accounts`, serviceAccountResponseSchema, {
    method: "POST",
    body: parsed.data,
  });
});

ipcMain.handle("bcis:update-service-account", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return split;
  const parsed = updateServiceAccountInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Enter valid service account details." };
  return directoryRequest(`/service-accounts/${split.id}`, serviceAccountResponseSchema, {
    method: "PATCH",
    body: parsed.data,
  });
});

ipcMain.handle("bcis:list-invoices", (_event, params: unknown) =>
  directoryRequest(
    `/invoices${queryString(
      listParams(params, ["query", "status", "subscriberId", "serviceAccountId", "from", "to", "page", "pageSize"]),
    )}`,
    invoiceListSchema,
  ));

ipcMain.handle("bcis:get-invoice", (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  return directoryRequest(`/invoices/${identifier.data}`, invoiceResponseSchema);
});

ipcMain.handle("bcis:create-invoice", (_event, input: unknown) => {
  const parsed = createInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter valid invoice details." };
  return directoryRequest("/invoices", invoiceResponseSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:update-invoice", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return split;
  const parsed = updateInvoiceInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Enter valid invoice details." };
  return directoryRequest(`/invoices/${split.id}`, invoiceResponseSchema, { method: "PATCH", body: parsed.data });
});

ipcMain.handle("bcis:generate-billing", (_event, input: unknown) => {
  const parsed = generateBillingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter a valid billing period and dates." };
  return directoryRequest("/billing/generate", billingGenerationResultSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:list-ledger", (_event, params: unknown) =>
  directoryRequest(
    `/ledger${queryString(listParams(params, ["subscriberId", "invoiceId", "page", "pageSize"]))}`,
    ledgerEntryListSchema,
  ));

ipcMain.handle("bcis:list-payments", (_event, params: unknown) =>
  directoryRequest(
    `/payments${queryString(listParams(params, ["query", "status", "method", "subscriberId", "from", "to", "page", "pageSize"]))}`,
    paymentListSchema,
  ));

ipcMain.handle("bcis:get-payment", (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  return directoryRequest(`/payments/${identifier.data}`, paymentResponseSchema);
});

ipcMain.handle("bcis:preview-allocation", (_event, input: unknown) => {
  const parsed = allocationPreviewInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Select a subscriber and a positive payment amount." };
  return directoryRequest("/payments/preview", allocationPreviewSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:create-payment", (_event, input: unknown) => {
  const parsed = createPaymentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter valid payment details." };
  return directoryRequest("/payments", paymentResponseSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:verify-payment", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return { ok: false, message: split.message };
  const parsed = verifyPaymentInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Choose whether to verify or reject the payment." };
  return directoryRequest(`/payments/${split.id}/verify`, paymentResponseSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:reverse-payment", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return { ok: false, message: split.message };
  const parsed = reversePaymentInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Enter a reversal reason of at least 5 characters." };
  return directoryRequest(`/payments/${split.id}/reverse`, paymentResponseSchema, { method: "POST", body: parsed.data });
});


ipcMain.handle("bcis:list-collectors", (_event, includeInactive: unknown) =>
  directoryRequest(`/collectors${queryString({ includeInactive: includeInactive === true ? "true" : "" })}`, collectorListSchema));

ipcMain.handle("bcis:create-collector", (_event, input: unknown) => {
  const parsed = createCollectorInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter a valid collector code and name." };
  return directoryRequest("/collectors", collectorResponseSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:update-collector", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return { ok: false, message: split.message };
  const parsed = updateCollectorInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Enter valid collector details." };
  return directoryRequest(`/collectors/${split.id}`, collectorResponseSchema, { method: "PATCH", body: parsed.data });
});

ipcMain.handle("bcis:list-collector-assignments", (_event, collectorId: unknown) => {
  const query = typeof collectorId === "string" && collectorId.length > 0 ? queryString({ collectorId }) : "";
  return directoryRequest(`/collector-assignments${query}`, collectorAssignmentListSchema);
});

ipcMain.handle("bcis:create-collector-assignments", (_event, input: unknown) => {
  const parsed = createCollectorAssignmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Select a collector and at least one subscriber." };
  return directoryRequest("/collector-assignments", collectorAssignmentListSchema, {
    method: "POST",
    body: parsed.data,
  });
});

ipcMain.handle("bcis:remove-collector-assignment", async (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  if (!sessionToken) return { ok: false, message: "Sign in to continue." };
  try {
    const response = await requestApi(`/collector-assignments/${identifier.data}`, { method: "DELETE" });
    if (response.status === 401) {
      sessionToken = null;
      return { ok: false, message: "Your session has expired. Sign in again." };
    }
    if (!response.ok) return { ok: false, message: await apiError(response) };
    return { ok: true, data: { removed: true } };
  } catch {
    return { ok: false, message: "Unable to reach the API server." };
  }
});

ipcMain.handle("bcis:list-collection-batches", (_event, params: unknown) =>
  directoryRequest(
    `/collection-batches${queryString(listParams(params, ["collectorId", "status", "from", "to", "page", "pageSize"]))}`,
    collectionBatchListSchema,
  ));

ipcMain.handle("bcis:get-collection-batch", (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  return directoryRequest(`/collection-batches/${identifier.data}`, collectionBatchResponseSchema);
});

ipcMain.handle("bcis:create-collection-batch", (_event, input: unknown) => {
  const parsed = createCollectionBatchInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Select a collector and route date." };
  return directoryRequest("/collection-batches", collectionBatchResponseSchema, { method: "POST", body: parsed.data });
});

ipcMain.handle("bcis:start-collection-batch", (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  return directoryRequest(`/collection-batches/${identifier.data}/start`, collectionBatchResponseSchema, {
    method: "POST",
  });
});

ipcMain.handle("bcis:submit-collection-batch", (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  return directoryRequest(`/collection-batches/${identifier.data}/submit`, collectionBatchResponseSchema, {
    method: "POST",
  });
});

ipcMain.handle("bcis:remit-collection-batch", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return { ok: false, message: split.message };
  const parsed = remitCollectionBatchInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Enter the remitted amount." };
  return directoryRequest(`/collection-batches/${split.id}/remit`, collectionBatchResponseSchema, {
    method: "POST",
    body: parsed.data,
  });
});

ipcMain.handle("bcis:reconcile-collection-batch", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return { ok: false, message: split.message };
  const parsed = reconcileCollectionBatchInputSchema.safeParse(split.input ?? {});
  if (!parsed.success) return { ok: false, message: "Enter a valid reconciliation note." };
  return directoryRequest(`/collection-batches/${split.id}/reconcile`, collectionBatchResponseSchema, {
    method: "POST",
    body: parsed.data,
  });
});

ipcMain.handle("bcis:close-collection-batch", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return { ok: false, message: split.message };
  const parsed = closeCollectionBatchInputSchema.safeParse(split.input);
  if (!parsed.success) return { ok: false, message: "Confirm closing the collection batch." };
  return directoryRequest(`/collection-batches/${split.id}/close`, collectionBatchResponseSchema, {
    method: "POST",
    body: parsed.data,
  });
});

ipcMain.handle("bcis:get-route-sheet", (_event, id: unknown) => {
  const identifier = identifierResult(id);
  if (!identifier.ok) return identifier;
  return directoryRequest(`/collection-batches/${identifier.data}/route-sheet`, routeSheetSchema);
});

ipcMain.handle("bcis:get-collector-report", (_event, params: unknown) =>
  directoryRequest(
    `/collector-report${queryString(listParams(params, ["from", "to"]))}`,
    collectorReportSchema,
  ));

ipcMain.handle("bcis:get-aging-report", (_event, params: unknown) =>
  directoryRequest(
    `/aging-report${queryString(listParams(params, ["from"]))}`,
    agingReportSchema,
  ));

ipcMain.handle("bcis:get-overdue-invoices", (_event, params: unknown) =>
  directoryRequest(
    `/overdue${queryString(listParams(params, ["from"]))}`,
    overdueListSchema,
  ));

ipcMain.handle("bcis:list-suspension-candidates", (_event, params: unknown) =>
  directoryRequest(
    `/suspension-candidates${queryString(listParams(params, ["from"]))}`,
    suspensionListSchema,
  ));

ipcMain.handle("bcis:list-suspensions", (_event, serviceAccountId: unknown) => {
  if (typeof serviceAccountId === "string" && serviceAccountId.length > 0) {
    const identifier = identifierResult(serviceAccountId);
    if (!identifier.ok) return identifier;
    return directoryRequest(`/service-accounts/${identifier.data}/suspensions`, serviceSuspensionListSchema);
  }
  return directoryRequest("/suspensions", serviceSuspensionListSchema);
});

ipcMain.handle("bcis:suspend-service-account", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return { ok: false, message: split.message };
  const parsed = suspendServiceAccountInputSchema.safeParse(split.input ?? {});
  if (!parsed.success) return { ok: false, message: "Enter valid suspension details." };
  return directoryRequest(`/service-accounts/${split.id}/suspend`, serviceSuspensionResponseSchema, {
    method: "POST",
    body: parsed.data,
  });
});

ipcMain.handle("bcis:reconnect-service-account", (_event, payload: unknown) => {
  const split = splitPayload(payload);
  if (!split.ok) return { ok: false, message: split.message };
  const parsed = reconnectServiceAccountInputSchema.safeParse(split.input ?? {});
  if (!parsed.success) return { ok: false, message: "Enter valid reconnection details." };
  return directoryRequest(`/service-accounts/${split.id}/reconnect`, serviceSuspensionResponseSchema, {
    method: "POST",
    body: parsed.data,
  });
});

const REPORT_PARAM_KEYS = ["from", "to", "asOf", "granularity", "subscriberId"] as const;

ipcMain.handle("bcis:list-reports", () => directoryRequest("/reports", reportCatalogSchema));

ipcMain.handle("bcis:get-dashboard", (_event, params: unknown) =>
  directoryRequest(`/reports/dashboard${queryString(listParams(params, ["asOf"]))}`, dashboardSchema));

ipcMain.handle("bcis:get-report", (_event, payload: unknown) => {
  const source = typeof payload === "object" && payload !== null ? (payload as { key?: unknown; params?: unknown }) : {};
  const key = typeof source.key === "string" ? source.key : "";
  if (!key) return { ok: false as const, message: "Choose a report to open." };
  const query = queryString(listParams(source.params, REPORT_PARAM_KEYS));
  return directoryRequest(`/reports/${encodeURIComponent(key)}${query}`, reportSchema);
});

ipcMain.handle("bcis:export-report", async (_event, payload: unknown) => {
  const source =
    typeof payload === "object" && payload !== null
      ? (payload as { key?: unknown; format?: unknown; params?: unknown })
      : {};
  const key = typeof source.key === "string" ? source.key : "";
  const format = source.format === "pdf" ? "pdf" : "xlsx";
  if (!key) return { ok: false, message: "Choose a report to export." };
  const query = queryString(listParams(source.params, REPORT_PARAM_KEYS));
  const result = await directoryRequest(`/reports/${encodeURIComponent(key)}/export${query}`, reportSchema);
  if (!result.ok) return result;
  const report = result.data;
  const stamp = report.parameters?.asOf ?? report.generatedAt.slice(0, 10);
  try {
    const chosen = await dialog.showSaveDialog({
      title: `Export ${report.title}`,
      defaultPath: `${report.key}-${stamp}.${format}`,
      filters:
        format === "pdf"
          ? [{ name: "PDF document", extensions: ["pdf"] }]
          : [{ name: "Excel workbook", extensions: ["xlsx"] }],
    });
    if (chosen.canceled || !chosen.filePath) {
      return { ok: true, data: { canceled: true, filePath: null } };
    }
    const buffer = format === "pdf" ? await buildReportPdf(report) : await buildReportWorkbook(report);
    await writeFile(chosen.filePath, buffer);
    return { ok: true, data: { canceled: false, filePath: chosen.filePath } };
  } catch {
    return { ok: false, message: "Unable to write the export file." };
  }
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#f6f8fb",
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/index.cjs"),
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
