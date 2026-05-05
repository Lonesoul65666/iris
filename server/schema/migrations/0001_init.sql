-- 0001_init: foundation tables for Phase 1 Build-C.
--
-- Hybrid schema strategy: typed columns for the queryable fields (id, user_id,
-- date, status, key), jsonb `data` column for the rest. Keeps hot paths
-- indexable; lets the row shape evolve without schema churn.
--
-- `user_id` is on every domain table from day one (Working Principle #5),
-- even though Phase 1 is single-user. Cheap now, expensive later.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        text        NOT NULL,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS income_sources (
  id                text        NOT NULL,
  user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payer             text        NOT NULL,
  subtype           text        NOT NULL,
  status            text        NOT NULL,
  include_in_budget boolean     NOT NULL DEFAULT true,
  data              jsonb       NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS income_sources_status_idx
  ON income_sources (user_id, status);

CREATE TABLE IF NOT EXISTS expenses (
  id         text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       text        NOT NULL,  -- ISO date 'YYYY-MM-DD' for range queries
  amount     numeric     NOT NULL,
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS expenses_date_idx
  ON expenses (user_id, date);
