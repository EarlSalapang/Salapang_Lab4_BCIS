export interface AuditEventInput {
  actorUserId: string | null;
  actorDisplayName: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  occurredAt?: Date;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorDisplayName: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditEventQuery {
  from?: string;
  to?: string;
  action?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export interface AuditStore {
  record(input: AuditEventInput): Promise<void>;
  list(query: AuditEventQuery): Promise<AuditEvent[]>;
}
