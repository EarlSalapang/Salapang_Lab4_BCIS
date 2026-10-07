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

export type ServiceType = z.infer<typeof serviceTypeSchema>;
export type SubscriberStatus = z.infer<typeof subscriberStatusSchema>;
export type ServiceAccountStatus = z.infer<typeof serviceAccountStatusSchema>;
export type ServicePlan = z.infer<typeof servicePlanSchema>;
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>;
export type CollectionArea = z.infer<typeof collectionAreaSchema>;
export type CreateCollectionAreaInput = z.infer<typeof createCollectionAreaInputSchema>;
export type SubscriberSummary = z.infer<typeof subscriberSummarySchema>;
export type SubscriberDetail = z.infer<typeof subscriberDetailSchema>;
export type SubscriberAddress = z.infer<typeof subscriberAddressSchema>;
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
