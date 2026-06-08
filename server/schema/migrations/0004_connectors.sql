-- 0004_connectors: bank/card/brokerage enrollment tokens (Build-T2).
--
-- Stores access tokens captured by in-app enrollment flows (Teller first,
-- later Coinbase + OFX). Tokens are shown once by the provider; persisting
-- them in the user's own Postgres is the whole point of moving enrollment
-- in-app after the throwaway scratch launcher discarded the first round.
--
-- One row per enrollment. `provider` discriminates Teller / Coinbase / OFX;
-- `provider_enrollment_id` is the provider's identifier (Teller returns
-- `enrollment.id`); `access_token` is the secret we need for subsequent
-- API calls. Status lets us mark disconnected enrollments without losing
-- the historical record (needed when txns tagged with this connector's
-- source already exist).

CREATE TABLE IF NOT EXISTS connectors (
  id                      text        NOT NULL,
  user_id                 uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                text        NOT NULL,                    -- 'teller' | 'coinbase' | 'ofx'
  institution             text        NOT NULL,                    -- 'Bank of America', 'Citi', etc.
  provider_enrollment_id  text,                                    -- Teller: enrollment.id
  access_token            text        NOT NULL,                    -- secret; user-owned DB only
  status                  text        NOT NULL DEFAULT 'active',   -- 'active' | 'disconnected'
  data                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- List active connectors for the user, newest first.
CREATE INDEX IF NOT EXISTS connectors_status_idx
  ON connectors (user_id, status, created_at DESC);

-- Lookup by provider+enrollment when reconciling duplicate enrollments.
CREATE INDEX IF NOT EXISTS connectors_provider_enrollment_idx
  ON connectors (user_id, provider, provider_enrollment_id);
