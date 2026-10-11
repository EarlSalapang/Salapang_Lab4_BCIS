import { z } from "zod";
import {
  agingBucketSchema,
  collectorReportRowSchema,
  identifierSchema,
  isoDateSchema,
  isoDateTimeSchema,
  paymentMethodEnum,
} from "./catalog.js";

export const reportValueFormatSchema = z.enum(["text", "money", "number", "date", "datetime", "percent"]);
export const reportAlignSchema = z.enum(["left", "right", "center"]);

export const reportColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  format: reportValueFormatSchema.default("text"),
  align: reportAlignSchema.default("left"),
});

export const reportRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()]),
);

export const reportSectionSchema = z.object({
  title: z.string().optional(),
  columns: z.array(reportColumnSchema).min(1),
  rows: z.array(reportRowSchema),
  totals: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export const reportKpiSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
  format: reportValueFormatSchema.default("number"),
  hint: z.string().optional(),
});

export const reportParameterTypeSchema = z.enum(["date", "text", "select"]);

export const reportParameterSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: reportParameterTypeSchema,
  required: z.boolean().default(false),
  defaultValue: z.string().optional(),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .optional(),
});

export const reportCategorySchema = z.enum([
  "Collections",
  "Receivables",
  "Revenue",
  "Subscribers",
  "Collectors",
  "Payments",
]);

export const reportSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().nullable().optional(),
  generatedAt: isoDateTimeSchema,
  parameters: z.record(z.string(), z.string()).optional(),
  kpis: z.array(reportKpiSchema).optional(),
  sections: z.array(reportSectionSchema),
});

export const reportCatalogItemSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: reportCategorySchema,
  parameters: z.array(reportParameterSchema),
});

export const reportCatalogSchema = z.object({ reports: z.array(reportCatalogItemSchema) });

export const reportExportFormatSchema = z.enum(["xlsx", "pdf"]);

export const dashboardSeriesPointSchema = z.object({
  period: z.string().min(1),
  billedCents: z.number().int().min(0),
  collectedCents: z.number().int().min(0),
});

export const dashboardMethodPointSchema = z.object({
  method: paymentMethodEnum,
  amountCents: z.number().int().min(0),
  count: z.number().int().min(0),
});

export const dashboardOverdueAlertSchema = z.object({
  subscriberId: identifierSchema,
  subscriberAccountNumber: z.string(),
  subscriberName: z.string(),
  totalOverdueCents: z.number().int().min(0),
  oldestOverdueDays: z.number().int().min(0),
});

export const dashboardRecentPaymentSchema = z.object({
  id: identifierSchema,
  receiptNumber: z.string(),
  subscriberName: z.string(),
  method: paymentMethodEnum,
  amountCents: z.number().int().min(0),
  paymentDate: isoDateTimeSchema,
});

export const dashboardSchema = z.object({
  asOf: isoDateSchema,
  kpis: z.array(reportKpiSchema),
  billingVsCollection: z.array(dashboardSeriesPointSchema),
  paymentMethods: z.array(dashboardMethodPointSchema),
  arAging: z.array(agingBucketSchema),
  collectorPerformance: z.array(collectorReportRowSchema),
  overdueAlerts: z.array(dashboardOverdueAlertSchema),
  recentPayments: z.array(dashboardRecentPaymentSchema),
});

export const statementOfAccountSubscriberSchema = z.object({
  subscriberId: identifierSchema,
  subscriberAccountNumber: z.string(),
  subscriberName: z.string(),
  addressLine: z.string().nullable().optional(),
  barangay: z.string().nullable().optional(),
  municipality: z.string().nullable().optional(),
});

export type ReportValueFormat = z.infer<typeof reportValueFormatSchema>;
export type ReportAlign = z.infer<typeof reportAlignSchema>;
export type ReportColumn = z.infer<typeof reportColumnSchema>;
export type ReportRow = z.infer<typeof reportRowSchema>;
export type ReportSection = z.infer<typeof reportSectionSchema>;
export type ReportKpi = z.infer<typeof reportKpiSchema>;
export type ReportParameter = z.infer<typeof reportParameterSchema>;
export type ReportCategory = z.infer<typeof reportCategorySchema>;
export type Report = z.infer<typeof reportSchema>;
export type ReportCatalogItem = z.infer<typeof reportCatalogItemSchema>;
export type ReportCatalog = z.infer<typeof reportCatalogSchema>;
export type ReportExportFormat = z.infer<typeof reportExportFormatSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardSeriesPoint = z.infer<typeof dashboardSeriesPointSchema>;
export type DashboardMethodPoint = z.infer<typeof dashboardMethodPointSchema>;
export type DashboardOverdueAlert = z.infer<typeof dashboardOverdueAlertSchema>;
export type DashboardRecentPayment = z.infer<typeof dashboardRecentPaymentSchema>;
export type StatementOfAccountSubscriber = z.infer<typeof statementOfAccountSubscriberSchema>;
