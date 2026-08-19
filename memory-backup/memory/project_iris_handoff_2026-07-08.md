---
name: project-iris-handoff-2026-07-08
description: "Iris handoff 2026-07-08 — READ FIRST. The always-on HOST is UP on Scott's other machine (C:\\ProjectIris\\iris), running + reachable on the LAN, accounts created, auth gate live. Auth-hardening pass SHIPPED + pushed (commit 28b4237): login lockout, 10-char+confirm passwords, in-app Change Password, session idle/max expiry, 90-day password age (reuse allowed), host reset-password.bat, start-iris.bat launcher + boot auto-start. 298 tests. NEXT = Tailscale Funnel for real internet access."
metadata: 
  node_type: memory
  type: project
  originSessionId: b5b6daf6-8dcb-4cc3-8b06-70219bf8d84b
---

# Iris handoff — 2026-07-08 · READ FIRST

Supersedes [[project-iris-handoff-2026-07-06-v2]] as read-first (its context still valid — esp. the 5 big rocks in [[project-iris-gamification-roadmap]] and the self-hosted direction). Repo `C:\Claude\projects\signal\signal-app` on **master**, pushed to github.com/Lonesoul65666/iris (latest `28b4237`). tsc clean · **298 tests**.

## ✅ THE ALWAYS-ON HOST IS UP (the big milestone)
Scott stood up the self-hosted host on his OTHER computer (the one bringing up "issues" at the end of the last session — resolved this session). It is **running, LAN-reachable, accounts created, auth gate live.** Distribution goal essentially reached; only remote/internet access (Tailscale) remains.
- **Host layout:** `C:\ProjectIris\iris\` = the cloned app (repo root IS the app — NO `signal-app` subfolder), `C:\ProjectIris\certs\` = the 2 Teller cert files. New box has NO Claude and does NOT use the `C:\Claude` path.
- **Bring-up that worked:** clone → `npm install` → `.env.local` (same `DATABASE_URL` as dev; Teller cert paths under `C:\ProjectIris\certs`) → **`npm run build`** (dist/ is NOT in the repo — a fresh clone MUST build once or the server 404s "dist/ is missing") → start → first-run "Set up Iris" (accounts created, auth gate now LIVE) → log in. Data folded over perfectly from shared Supabase.
- **LAN reachability = `192.168.68.71:5173`** on his home network (phone + 2 PCs confirmed). NOTE this is LAN-only / private IP — it does NOT work off-network (office/cellular); that needs the tunnel (below).
- **⚠️ LAN-bind gotcha (cost us time):** the server binds loopback unless `IRIS_LAN=1` AND accounts exist ([standalone.ts:117-131](server/standalone.ts:117)). The `.env.local` `IRIS_LAN=1` line would NOT take effect (env-file parse quirk — never fully root-caused; a clean top-of-file line still didn't read, while `DATABASE_URL` from the same file did). **Solution = the launcher sets it explicitly**, sidestepping the file entirely.

## ✅ start-iris.bat launcher + boot auto-start (Scott wanted icon + auto-start)
- **`start-iris.bat`** (repo root, committed) — `cd /d "%~dp0"` (portable), `set IRIS_LAN=1`, `call npm run server`, pause-on-exit. Double-click to run; the explicit `set` is what reliably gets LAN mode. Scott had hand-created a local copy first → caused a `git pull` "would be overwritten by merge" conflict on the first Update; fixed by `Remove-Item start-iris.bat` on the host then re-pulling (the committed one is canonical).
- **Auto-start on login:** a minimized shortcut `Iris.lnk` in the Startup folder (created via a WScript.Shell one-liner, `WindowStyle=7`). Caveat given to Scott: Startup runs at *login*, not pre-login boot — fine for a stays-logged-in laptop; a Task Scheduler "at startup" job is the upgrade if he ever wants truly headless (NOT built — offered).

## ✅ AUTH HARDENING SHIPPED (commit `28b4237`, pushed, host updated + restarted, migration applied, login verified)
Scott's requirement before exposing a public URL: the API had real session auth but the LOGIN had zero brute-force/password protections. Scoped together (he answered forks via AskUserQuestion), then built. **2FA + email alerts were explicitly DEFERRED ("neither yet").**
- **Login lockout** — 5 failed attempts → account locked 15 min (`failed_attempts`/`locked_until` on `auth_accounts`; pure `computeLockout` for tests; login returns 423 when locked).
- **Password rules** — min **10 chars + confirm field** on setup, change, AND reset (`validatePasswordStrength` server-side + client match check). Scott's ask: a fat-finger shouldn't lock you out.
- **In-app Change Password** — Settings → **Security** (collapsible), shared `ChangePasswordForm` (current → new → confirm). Verifies current, reuse allowed.
- **Session expiry** — fixes Scott's "it caches the connection / stays logged in forever": **idle timeout 24h + absolute max 14 days**, enforced in `validateSession` with a throttled (5-min) sliding `last_used_at` write.
- **Password age** — forced re-set every **90 days**, **reuse allowed** (Scott's exact call — just walk the change flow, restarts the clock). Full-screen `ForcedChangePasswordScreen` gate in `AuthGate` when `mustChangePassword`.
- **Host reset tool ("jailbreak")** — `npm run reset-password [username]` + double-click **`reset-password.bat`**. Runs against the DB directly (imports `hashPassword`/`validatePasswordStrength` from auth-core), lists accounts, prompts name + new pw + confirm, clears lockout. The true lockout escape hatch — no login/UI needed.
- **Migration 0006** (`0006_auth_hardening.sql`) — additive columns w/ defaults (safe on live install; existing accounts get `now()` so nobody is retroactively expired). Applies on boot via `runMigrations` (before serve) — so Update → restart order is safe.
- Files: `auth-core.ts` (policy knobs + pure helpers + DB primitives), `auth.ts` (setup/login/me/change-password handlers), `routes.ts` (+`/api/auth/change-password`), `authClient.ts`, `AuthScreens.tsx`, `AuthGate.tsx`, `SettingsView.tsx` (SecurityPanel), `updates.ts` (What's New bumped to `2026.07.07`). +14 tests.

## ⚠️ SHARED-DB SIDE EFFECT (told Scott)
Host + dev laptop share the SAME Supabase. Creating accounts on the host means the **dev laptop's Iris now ALSO requires login** (same accounts) — it's no longer first-run-open. Expected, not a bug. Dev laptop still runs old code until it pulls, but migration 0006 is additive so old code keeps working against the new schema.

## ⏭️ NEXT — Tailscale Funnel (the point of the hardening)
Internet access from anywhere (office machine that can't install a VPN client, buddy's PC, phone on cellular). Decision locked with Scott: **zero install on the connecting device — reach by URL only.** Chose **Tailscale Funnel** over Cloudflare Tunnel (stable public `*.ts.net` URL, free, reuses Tailscale on the host, hides home IP) over raw port-forwarding (rejected — exposes home IP/router). Runbook already in SETUP.md (install Tailscale on host → `IRIS_LAN=1` → `tailscale serve/funnel` for auto-HTTPS → open ts.net URL anywhere). Corrected Scott's mental model: local printing ≠ internet-reachable; HTTPS encrypts but ≠ authorization (why the login hardening had to land first).
- Optional later: Task Scheduler pre-login autostart; 2FA (TOTP) + email login alerts (both deferred this pass); meet-in-middle tuning (Rock 1 leftover); investments/equity still `PHASE_1_LOCK` deferred.

## Mobile + design — PARKED (Scott's call)
Mobile layout is "pretty rough"; desktop design also not loved — but both are "heavy lifts for little return right now." Scott is chilling on design. Do NOT spend effort here unless he re-opens it.

## Gotchas (still current)
- Fresh clone MUST `npm run build` once (dist/ not in repo).
- Bash cwd resets to `C:\Claude` — `cd /c/Claude/projects/signal/signal-app` first.
- Push to `master` needs explicit in-session user authorization (classifier blocks otherwise) — the Update button's `git pull --ff-only` requires the fix to be ON master.
- Untracked `scripts/*.mjs` probes + `public/*-mockup.html` — do NOT commit; stage feature files explicitly.
- vitest include glob: `src/utils/__tests__/**` + `server/__tests__/**`.
