export const isoDateTimeSchema = z.string().datetime({ offset: true }).min(1);
import { z } from "zod";

export const serviceTypeSchema = z.enum(["INTERNET", "CABLE", "COMBO"]);
export const subscriberStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED", "TERMINATED"]);
export const serviceAccountStatusSchema = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "DISCONNECTED", "TERMINATED"]);

export const centsSchema = z.number().int().min(0).max(100_000_000);
export const dayOfMonthSchema = z.number().int().min(1).max(28);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
export const identifierSchema = z.string().uuid();
export const optionalText = (max: number) => z.string().trim().max(max).optional();

export const servicePlanSchema = z.object({
  id: identifierSchema,
  code: z.string(),
  name: z.string(),
  serviceType: serviceTypeSchema,
  monthlyPriceCents: centsSchema,
  installationFeeCents: centsSchema,
  reconnectionFeeCents: centsSchema,
  speed: z.string().nullable(),
  channelCount: z.number().int().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});

export const createPlanInputSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(24).regex(/^[A-Z0-9-]+$/, "Use letters, numbers, and hyphens."),
  name: z.string().trim().min(2).max(120),
  serviceType: serviceTypeSchema,
  monthlyPriceCents: centsSchema,
  installationFeeCents: centsSchema.default(0),
  reconnectionFeeCents: centsSchema.default(0),
  speed: optionalText(40),
  channelCount: z.number().int().min(1).max(999).optional(),
  description: optionalText(500),
});

export const updatePlanInputSchema = createPlanInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine(
    (value) => Object.keys(value).length > 0,
    { message: "Provide at least one field to update." },
  );

export const collectionAreaSchema = z.object({
  id: identifierSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});

export const createCollectionAreaInputSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(24).regex(/^[A-Z0-9-]+$/, "Use letters, numbers, and hyphens."),
  name: z.string().trim().min(2).max(120),
  description: optionalText(500),
});

export const subscriberAddressSchema = z.object({
  id: identifierSchema,
  label: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  barangay: z.string().nullable(),
  municipality: z.string().nullable(),
  isDefault: z.boolean(),
});

export const subscriberSummarySchema = z.object({
  id: identifierSchema,
  accountNumber: z.string(),
  displayName: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  contactNumber: z.string().nullable(),
  email: z.string().nullable(),
  addressLine: z.string().nullable(),
  barangay: z.string().nullable(),
  municipality: z.string().nullable(),
  status: subscriberStatusSchema,
  collectionAreaId: identifierSchema.nullable(),
  collectionAreaName: z.string().nullable(),
  billingDay: z.number().int().nullable(),
  dueDay: z.number().int().nullable(),
  serviceAccountCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const serviceEventSchema = z.object({
  id: identifierSchema,
  serviceAccountId: identifierSchema,
  fromStatus: serviceAccountStatusSchema.nullable(),
  toStatus: serviceAccountStatusSchema,
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  changedByUserId: identifierSchema.nullable(),
  changedByName: z.string().nullable(),
  occurredAt: z.string().datetime(),
});

export const serviceAccountSummarySchema = z.object({
  id: identifierSchema,
  accountNumber: z.string(),
  subscriberId: identifierSchema,
  subscriberName: z.string(),
  subscriberAccountNumber: z.string(),
  planId: identifierSchema,
  planCode: z.string(),
  planName: z.string(),
  serviceType: serviceTypeSchema,
  installationAddress: z.string(),
  collectionAreaId: identifierSchema.nullable(),
  collectionAreaName: z.string().nullable(),
  activationDate: isoDateSchema.nullable(),
  billingStartDate: isoDateSchema.nullable(),
  billingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  currentRateCents: centsSchema,
  status: serviceAccountStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const serviceAccountDetailSchema = serviceAccountSummarySchema.extend({
  events: z.array(serviceEventSchema),
});

export const subscriberDetailSchema = subscriberSummarySchema.extend({
  notes: z.string().nullable(),
  addresses: z.array(subscriberAddressSchema),
  serviceAccounts: z.array(serviceAccountSummarySchema),
});

export const createSubscriberInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  middleName: optionalText(80),
  lastName: z.string().trim().min(1).max(80),
  contactNumber: z.string().trim().regex(/^[0-9+()\s-]{7,20}$/, "Enter a valid contact number.").optional(),
  email: z.string().trim().email().max(120).optional(),
  addressLine: optionalText(200),
  barangay: optionalText(120),
  municipality: optionalText(120),
  collectionAreaId: identifierSchema.optional(),
  billingDay: dayOfMonthSchema.optional(),
  dueDay: dayOfMonthSchema.optional(),
  notes: optionalText(1000),
});

export const updateSubscriberInputSchema = createSubscriberInputSchema
  .partial()
  .extend({ status: subscriberStatusSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

export const subscriberListQuerySchema = z.object({
  query: optionalText(120),
  status: subscriberStatusSchema.optional(),
  collectionAreaId: identifierSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const subscriberListSchema = z.object({
  subscribers: z.array(subscriberSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});

export const createServiceAccountInputSchema = z.object({
  planId: identifierSchema,
  installationAddress: z.string().trim().min(3).max(200),
  collectionAreaId: identifierSchema.optional(),
  activationDate: isoDateSchema.optional(),
  billingStartDate: isoDateSchema.optional(),
  billingDay: dayOfMonthSchema.optional(),
  dueDay: dayOfMonthSchema.optional(),
  currentRateCents: centsSchema.optional(),
  notes: optionalText(1000),
});

export const updateServiceAccountInputSchema = z.object({
  planId: identifierSchema.optional(),
  installationAddress: optionalText(200),
  status: serviceAccountStatusSchema.optional(),
  currentRateCents: centsSchema.optional(),
  billingDay: dayOfMonthSchema.optional(),
  dueDay: dayOfMonthSchema.optional(),
  activationDate: isoDateSchema.nullable().optional(),
  notes: optionalText(1000),
  reason: optionalText(200),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

export const serviceAccountListQuerySchema = z.object({
  query: optionalText(120),
  status: serviceAccountStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const serviceAccountListSchema = z.object({
  serviceAccounts: z.array(serviceAccountSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});

export const servicePlanListSchema = z.object({ plans: z.array(servicePlanSchema) });
export const servicePlanResponseSchema = z.object({ plan: servicePlanSchema });
export const collectionAreaListSchema = z.object({ areas: z.array(collectionAreaSchema) });
export const collectionAreaResponseSchema = z.object({ area: collectionAreaSchema });
export const subscriberResponseSchema = z.object({ subscriber: subscriberDetailSchema });
export const serviceAccountResponseSchema = z.object({ serviceAccount: serviceAccountDetailSchema });
export const invoiceStatusEnum = z.enum(["draft", "posted", "paid", "partially_paid", "void", "overdue"]);
export const paymentMethodEnum = z.enum(["cash", "gcash", "bank_transfer", "other"]);

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1).max(255),
  quantity: z.number().int().min(1).default(1),
  unitPriceCents: z.number().int().min(0),
  amountCents: z.number().int().min(0),
});

export const invoiceSchema = z.object({
  id: identifierSchema,
  invoiceNumber: z.string().min(1).max(50),
  subscriberId: identifierSchema,
  serviceAccountId: identifierSchema.optional(),
  billingPeriodStart: isoDateSchema,
  billingPeriodEnd: isoDateSchema,
  issueDate: isoDateSchema,
  dueDate: isoDateSchema,
  subtotalCents: z.number().int().min(0),
  taxCents: z.number().int().min(0).default(0),
  totalCents: z.number().int().min(0),
  amountPaidCents: z.number().int().min(0).default(0),
  balanceCents: z.number().int().min(0),
  status: invoiceStatusEnum,
  notes: z.string().max(500).nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  postedAt: isoDateTimeSchema.nullable().optional(),
  lineItems: z.array(invoiceLineItemSchema).optional(),
});

export const invoiceListQuerySchema = z.object({
  query: optionalText(120),
  status: invoiceStatusEnum.optional(),
  subscriberId: identifierSchema.optional(),
  serviceAccountId: identifierSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const invoiceListSchema = z.object({ invoices: z.array(invoiceSchema), total: z.number().int().min(0), page: z.number().int().min(1), pageSize: z.number().int().min(1) });
export const invoiceResponseSchema = z.object({ invoice: invoiceSchema });
export const createInvoiceInputSchema = z.object({ subscriberId: identifierSchema, serviceAccountId: identifierSchema.optional(), billingPeriodStart: isoDateSchema, billingPeriodEnd: isoDateSchema, issueDate: isoDateSchema, dueDate: isoDateSchema, lineItems: z.array(invoiceLineItemSchema).min(1), notes: z.string().max(500).optional() });
export const updateInvoiceInputSchema = z.object({ status: invoiceStatusEnum.optional(), notes: z.string().max(500).optional() }).partial().refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

export const ledgerEntryTypeSchema = z.enum(["debit", "credit"]);
export const ledgerSourceTypeSchema = z.enum(["invoice", "payment", "adjustment", "reversal"]);
export const ledgerEntrySchema = z.object({
  id: identifierSchema,
  subscriberId: identifierSchema,
  serviceAccountId: identifierSchema.nullable().optional(),
  invoiceId: identifierSchema.nullable().optional(),
  entryDate: isoDateSchema,
  entryType: ledgerEntryTypeSchema,
  sourceType: ledgerSourceTypeSchema,
  amountCents: z.number().int(),
  balanceCents: z.number().int(),
  description: z.string().min(1).max(255),
  createdByUserId: identifierSchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
});
export const ledgerEntryListSchema = z.object({
  entries: z.array(ledgerEntrySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export const ledgerEntryListQuerySchema = z.object({
  subscriberId: identifierSchema.optional(),
  invoiceId: identifierSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const generateBillingInputSchema = z.object({
  billingPeriodStart: isoDateSchema,
  billingPeriodEnd: isoDateSchema,
  issueDate: isoDateSchema,
  dueDate: isoDateSchema,
  serviceAccountIds: z.array(identifierSchema).min(1).optional(),
});

export const billingGenerationResultSchema = z.object({
  created: z.array(invoiceSchema),
  skipped: z.number().int().min(0),
});

export type ServiceType = z.infer<typeof serviceTypeSchema>;
export type SubscriberStatus = z.infer<typeof subscriberStatusSchema>;
export type ServiceAccountStatus = z.infer<typeof serviceAccountStatusSchema>;
export type ServicePlan = z.infer<typeof servicePlanSchema>;
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>;
export type CollectionArea = z.infer<typeof collectionAreaSchema>;
export type CreateCollectionAreaInput = z.infer<typeof createCollectionAreaInputSchema>;
export type SubscriberSummary = z.infer<typeof subscriberSummarySchema>;
export type SubscriberAddress = z.infer<typeof subscriberAddressSchema>;
export type SubscriberDetail = z.infer<typeof subscriberDetailSchema>;
export type CreateSubscriberInput = z.infer<typeof createSubscriberInputSchema>;
export type UpdateSubscriberInput = z.infer<typeof updateSubscriberInputSchema>;
export type SubscriberListQuery = z.infer<typeof subscriberListQuerySchema>;
export type SubscriberListResponse = z.infer<typeof subscriberListSchema>;
export type ServiceAccountSummary = z.infer<typeof serviceAccountSummarySchema>;
export type ServiceAccountDetail = z.infer<typeof serviceAccountDetailSchema>;
export type ServiceEvent = z.infer<typeof serviceEventSchema>;
export type CreateServiceAccountInput = z.infer<typeof createServiceAccountInputSchema>;
export type UpdateServiceAccountInput = z.infer<typeof updateServiceAccountInputSchema>;
export type ServiceAccountListQuery = z.infer<typeof serviceAccountListQuerySchema>;
export type ServiceAccountListResponse = z.infer<typeof serviceAccountListSchema>;

export type InvoiceStatus = z.infer<typeof invoiceStatusEnum>;
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;
export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type InvoiceListResponse = z.infer<typeof invoiceListSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceInputSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceInputSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type LedgerEntryListResponse = z.infer<typeof ledgerEntryListSchema>;
export type LedgerEntryListQuery = z.infer<typeof ledgerEntryListQuerySchema>;
export type GenerateBillingInput = z.infer<typeof generateBillingInputSchema>;
export type BillingGenerationResult = z.infer<typeof billingGenerationResultSchema>;
export type BillingLineItemInput = z.infer<typeof invoiceLineItemSchema>;
