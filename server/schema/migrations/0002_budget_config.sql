-- 0002_budget_config: generic key/value collections table for budget-config stores.
--
-- The eight budget-config IndexedDB stores (buckets, sinkingFunds, funMoney,
-- paycheck, customCategories, recurringDecisions, inflowDecisions, earners)
-- all share the same shape: a collection name, a row key (the IDB keyPath
-- value), and a jsonb blob. No per-resource filtering or aggregation queries —
-- the consumers always read full collections at once.
--
-- One generic table beats eight per-resource tables here. Less code, less
-- migration churn, no schema work when a new collection lands. We can split
-- a specific collection into its own typed table later if a real query need
-- emerges.
--
-- Compare to expenses / income_sources, which DO get typed columns because
-- they have real query needs (date range filters, status filters).

CREATE TABLE IF NOT EXISTS collections (
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text        NOT NULL,    -- 'buckets', 'sinkingFunds', etc.
  key        text        NOT NULL,    -- the IDB keyPath value (category, id, person, expenseId, ...)
  data       jsonb       NOT NULL,    -- the full row from IndexedDB
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, name, key)
);

CREATE INDEX IF NOT EXISTS collections_name_idx
  ON collections (user_id, name);
