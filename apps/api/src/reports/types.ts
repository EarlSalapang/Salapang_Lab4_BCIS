import type {
  AgingReport,
  CollectorReport,
  InvoiceStatus,
  OverdueList,
  PaymentMethod,
  PaymentStatus,
  ServiceType,
  SubscriberDetail,
  SubscriberSummary,
  SuspensionList,
} from "@bcis/shared";

export interface DateRange {
  from?: string;
  to?: string;
}

export interface InvoiceFact {
  id: string;
  invoiceNumber: string;
  subscriberId: string;
  subscriberAccountNumber: string;
  subscriberName: string;
  serviceAccountId: string | null;
  planName: string | null;
  serviceType: ServiceType | null;
  collectionAreaName: string | null;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  status: InvoiceStatus;
}

export interface PaymentFact {
  id: string;
  receiptNumber: string;
  subscriberId: string;
  subscriberAccountNumber: string;
  subscriberName: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  paymentDate: string;
  collectorId: string | null;
  collectionBatchId: string | null;
}

export interface LedgerFact {
  id: string;
  subscriberId: string;
  serviceAccountId: string | null;
  invoiceId: string | null;
  entryDate: string;
  entryType: "debit" | "credit";
  sourceType: string;
  amountCents: number;
  balanceCents: number;
  description: string;
  createdAt: string;
}

export interface ReportDataSource {
  listInvoiceFacts(filter: DateRange): Promise<InvoiceFact[]>;
  listPaymentFacts(filter: DateRange): Promise<PaymentFact[]>;
  listSubscriberRows(): Promise<SubscriberSummary[]>;
  listLedgerFacts(filter: { subscriberId?: string } & DateRange): Promise<LedgerFact[]>;
  getAgingReport(asOf?: string): Promise<AgingReport>;
  getOverdueInvoices(asOf?: string, pageSize?: number): Promise<OverdueList>;
  getCollectorReport(from?: string, to?: string): Promise<CollectorReport>;
  getSubscriber(id: string): Promise<SubscriberDetail | null>;
  getSuspensionCandidates(asOf?: string): Promise<SuspensionList>;
}
