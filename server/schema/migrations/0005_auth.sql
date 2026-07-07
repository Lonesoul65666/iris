-- 0005_auth: real server-side authentication (login accounts + sessions).
--
-- These are LOGIN identities, distinct from the single household `users` row
-- (0001) that scopes all financial data. Multiple accounts (e.g. Scott +
-- Claire) can log in and all operate on the SAME household data — auth gates
-- ACCESS, it does not partition data. Per-household isolation is at the
-- database level (one Postgres per household), not per-account here.
--
-- Passwords are stored only as scrypt hashes (server/api-handlers/auth.ts).
-- Session tokens are stored only as SHA-256 hashes, so a DB leak never yields
-- a usable session cookie.

CREATE TABLE IF NOT EXISTS auth_accounts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text        NOT NULL UNIQUE,   -- lowercased; login match key
  display_name  text        NOT NULL,          -- as entered; for the UI
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text        PRIMARY KEY,          -- SHA-256 of the cookie token
  account_id uuid        NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_account_idx ON auth_sessions (account_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires_at);
