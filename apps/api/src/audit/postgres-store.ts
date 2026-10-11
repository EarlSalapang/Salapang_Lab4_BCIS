import type { Pool, QueryResultRow } from "pg";

import type { AuditEvent, AuditEventInput, AuditEventQuery, AuditStore } from "./types.js";

interface AuditEventRow extends QueryResultRow {
  id: string;
  occurred_at: Date;
  actor_user_id: string | null;
  actor_display_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
}

const AUDIT_SELECT = `SELECT id, occurred_at, actor_user_id, actor_display_name, action,
                             entity_type, entity_id, summary, metadata, ip_address, user_agent
                      FROM audit_events`;

function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    metadata: row.metadata,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
  };
}

export class PostgresAuditStore implements AuditStore {
  constructor(private readonly pool: Pool) {}

  async record(input: AuditEventInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events
         (occurred_at, actor_user_id, actor_display_name, action, entity_type, entity_id,
          summary, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.occurredAt ?? new Date(),
        input.actorUserId,
        input.actorDisplayName,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.summary,
        input.metadata ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
  }

  async list(query: AuditEventQuery): Promise<AuditEvent[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, value: unknown) => {
      values.push(value);
      conditions.push(condition.replace("?", `$${values.length}`));
    };

    if (query.from) add("occurred_at >= ?", query.from);
    if (query.to) add("occurred_at < (?::date + INTERVAL '1 day')", query.to);
    if (query.action) add("action = ?", query.action);
    if (query.actorUserId) add("actor_user_id = ?", query.actorUserId);
    if (query.entityType) add("entity_type = ?", query.entityType);
    if (query.entityId) add("entity_id = ?", query.entityId);

    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    values.push(limit);
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query<AuditEventRow>(
      `${AUDIT_SELECT}${where} ORDER BY occurred_at DESC, id DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(toAuditEvent);
  }
}
