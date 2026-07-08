-- 0006_auth_hardening: brute-force lockout, session idle timeout, password age.
--
-- Additive columns on the existing auth tables (0005). All have defaults so the
-- migration is safe on a live install with accounts already created:
--   * failed_attempts / locked_until  — per-account login throttle.
--   * password_changed_at             — drives periodic forced re-set (reuse
--                                        allowed; this just restarts the clock).
--   * last_used_at (sessions)         — drives idle-timeout auto-logout, separate
--                                        from the absolute expires_at ceiling.
--
-- Existing rows get now() for the timestamp columns, so the password-age clock
-- and idle window start at update time — nobody is retroactively expired.

ALTER TABLE auth_accounts
  ADD COLUMN IF NOT EXISTS failed_attempts     int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until        timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
