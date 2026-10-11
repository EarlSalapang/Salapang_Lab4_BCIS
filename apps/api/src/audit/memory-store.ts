import { randomUUID } from "node:crypto";

import type { AuditEvent, AuditEventInput, AuditEventQuery, AuditStore } from "./types.js";

export class MemoryAuditStore implements AuditStore {
  readonly events: AuditEvent[] = [];

  async record(input: AuditEventInput): Promise<void> {
    this.events.push({
      id: randomUUID(),
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      actorUserId: input.actorUserId,
      actorDisplayName: input.actorDisplayName,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  async list(query: AuditEventQuery): Promise<AuditEvent[]> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    return this.events
      .filter((event) => {
        if (query.from && event.occurredAt < `${query.from}T00:00:00.000Z`) return false;
        if (query.to && event.occurredAt >= `${query.to}T23:59:59.999Z`) return false;
        if (query.action && event.action !== query.action) return false;
        if (query.actorUserId && event.actorUserId !== query.actorUserId) return false;
        if (query.entityType && event.entityType !== query.entityType) return false;
        if (query.entityId && event.entityId !== query.entityId) return false;
        return true;
      })
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit);
  }
}
