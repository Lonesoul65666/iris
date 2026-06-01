-- 0003_audit_log: audit trail (Build-D2c).
--
-- Moves the IndexedDB `iris-audit` store to Postgres. Holds budget-edit,
-- account, holding, and CSV-import audit entries — a Phase 1 budget feature
-- (the Edit Budget overlay writes 'budget_edit' entries here).
--
-- Hybrid shape: id + ts promoted to columns (ordering / entity lookup); the
-- full AuditEntry object lives in `data` jsonb.

CREATE TABLE IF NOT EXISTS audit_log (
  user_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id      text        NOT NULL,
  ts      timestamptz NOT NULL,
  data    jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Newest-first listing.
CREATE INDEX IF NOT EXISTS audit_log_ts_idx
  ON audit_log (user_id, ts DESC);

-- getAuditLogForEntity(entityId) — filter by the entity the entry refers to.
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (user_id, (data->>'entityId'));
