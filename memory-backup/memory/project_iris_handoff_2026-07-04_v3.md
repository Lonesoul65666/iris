---
name: project-iris-handoff-2026-07-04-v3
description: "Iris handoff 2026-07-04 (LATE, v3) — READ FIRST. Big dashboard+budget polish/functionality pass (cadence/ETA, OTE tracker, retire/trophy shelf, hype budget status, tab-cards+sidebar accordion, lean-up) THEN a 53-agent swarm audit + security hardening. Branch 121 over master, tsc clean, 161/161. Next: use it a month or two, then package off-machine (needs real API auth)."
metadata: 
  node_type: memory
  type: project
  originSessionId: 24007950-2e02-45e6-920d-8fa5c1e9810b
---

# Iris handoff — 2026-07-04 LATE (v3) · READ FIRST

Supersedes [[project_iris_handoff_2026-07-04_v2]]. Repo `C:\Claude\projects\signal\signal-app`, branch **`overnight-polish-2026-06-11` — 121 commits over master, UNMERGED (Scott reviews/merges)**. **tsc clean · 161/161 · pre-commit runs tsc+vitest.** Working tree clean except untracked throwaway `scripts/*.mjs` + `public/*mockup.html`. Dev: `npx vite` :5173 (Vite middleware API) OR `npm run server` (standalone, Node 24). Postgres via `.env.local DATABASE_URL`.

This was a long "tweaks, both visual and plumbing" session — Scott's near ready to live on it a month or two, then maybe package it off this machine with GitHub-based updates.

## Shipped this session (all committed, browser-verified)
**Have-To/Want-To (stash) engine:**
- **Cadence + gamified ETA** in card Settings: `SinkingFund.cadence` ('semiannual'|'annual'|'custom') + `dueMonth`; `nextDueDate()` + reworked `computeStashForecast()` (day-granular, cadence-aware, semiannual paces the per-cycle payment via `expectedHit`/`hitRemaining`); `formatDuration()`. Replaced the "cover a category" picker with a "When's it due?" control (picker now shows only on an UNLINKED stash — needed for reserve-lane reconciliation).
- **Auto-fill $/mo** from goal+date (`requiredMonthlyForGoal`) — set a goal or date, it computes the monthly.
- **Chunk D shortfall nudge** (`computeShortfall`) — pot went negative → "$X short, back to even in N mo".
- **Retire a crushed goal (Phase 2)**: `achievedAt` + durable `achievement` snapshot (savedAmount/target/startMonth/monthsSaving); "We bought it — mark done" (want-to at goal) / Settings "Mark as bought"; goes inert (zeroes fill/categories/startMonth) → **"Crushed · bought & done" trophy shelf** with undo; excluded from active tracking + dashboard.
- No-double-count guard verified + test (commit-then-bill counts once via reserve lane).

**Dashboard:** Net-worth **"how it's calculated"** expandable ledger (each account/equity/home−mortgage/car, sums to total — surfaced that CAR is entered at $200k, likely a data slip); **modernized Spending donut** (hand-drawn SVG, gradient+rounded+sweep-in) + legend mini spend-vs-budget bars; **OTE-over-base take-home tracker** ([[project_iris_dynamic_action_items]]-adjacent — reads income txns DIRECTLY since the `income_sources` layer is empty; groups by employer before "DES:"; since the Feb-2026 raise; monthly overage bars + avg benchmark line; **net dollars, NOT gross/$360k** per Scott) — now positioned below Goal Tracker, above Spend-by-account; Goal Tracker **de-ghosted** (removed synthesized Emergency Fund — was double-counting savings) + renamed "Have To's / Want To's" + grouped + **escalating encouragement** (hype for want, relief for have) + 100% celebration; Spend-by-account header matched to the section style.

**Budget view restructure:** tabs (Overview/Monthly Detail/Transactions/Action Items) → **rich pinned stat-cards** (each a glanceable analytic + nav; month clicker consolidated into Overview card; 7-day line folded into Transactions card; styled as obvious pressable buttons with hover-lift + arrow); **sidebar Budget accordion** (open/shut sub-menu, deep-links each tab). Made these work by promoting the active tab to shared context (`budgetSection` is now the single source of truth — sidebar + cards + deep-links stay in sync; BudgetView `section = budgetSection ?? 'overview'`). **Hype-machine Budget Status** (celebrates green + "where you're kicking ass" wins + "better than last month" on improving over-categories; month-to-date wins gated to complete/avg so early-month "99% under" isn't hollow). Money Map header redundancy fixed ("How's the month?"). Work Float title capitalized + monthly table collapsed by default. **Removed** (redundant/inaccurate): Monthly Spending avg-tiles, Income Sources + Recurring Bills auto-detection lists. "Completed" action items → "knocked out".
- **Emojis OFF** per Scott (2026-07-04) in budget/encouragement/celebration copy — clean text only. Full-send/R-rated voice is welcome in the copy.
- Instant custom-category refresh (lifted `customCategories` to BudgetView shared state) + Edit-Budget add-category now registers a REAL selectable category (was an orphan bucket).

## ⭐ 53-agent SWARM AUDIT + security hardening (end of session)
Ran a Workflow swarm (8 dims × adversarial verify): **44 raw → 32 verified, 19 confirmed. Report: `docs/audits/2026-07-04-swarm-audit.md`.** Verdict: **no criticals; safe to live on a month or two on this machine.**
- **Fixed the 5 High blockers:** backup-restore made non-destructive (MERGE, never delete + 2-step confirm — `DataBackup.tsx`); server binds **loopback by default** (LAN only via `IRIS_LAN=1`); **DB TLS** on the pool (remote only); **Teller `access_token` no longer returned** by `/api/connectors/list` (sync reads it server-side); Yahoo proxy **path allow-listed**. `.env.local` confirmed gitignored + untracked.
- **Hygiene:** deleted orphaned IncomeSources/RecurringBills files; consolidated 3 currency formatters onto shared `utils/format` (Transactions now 0-decimal like everywhere); stable list keys; `engines` + `.nvmrc` (node 24).

## ⏭️ NEXT — queue (nothing urgent; Scott gates)
1. **Before packaging off-machine:** real **API auth (PIN → server session)** so LAN/partner-mode is safe (loopback-default covers it until then); rotate the `.env.local` password + keep it out of any packaged artifact; add a server build step (runs `.ts` directly today).
2. **Medium money-math/atomicity (next, not blockers):** `savingsScorecard.ts:51` base = `round(paycheckCount/months)` distorts on thin data; `BudgetView.tsx` addBucket slug collision across devices; `replaceCollection` non-atomic (the [[project_iris_offline_architecture]] clobber); `syncTellerTransactions.ts:135` income fetch lacks try/catch → 5-min "up to date ✓" lie. Full list in the audit doc.
3. **Deferred visions:** [[project_iris_trophy_room]] (achievements wall; retire foundation shipped) · [[project_iris_dynamic_action_items]] (prescriptive weekly nudges).

## Scott's homework
- **Review + merge the branch** (121 commits — a lot).
- **Set real cadences** on the Have-To/Want-To cards (car-insurance renewal month, etc.) so the ETAs go live — I only wired the mechanic, his real values aren't set.
- Look at the **$200k car value** in Settings (net-worth breakdown surfaced it).

## Gotchas (still true)
- **Shared-DB clobber:** the preview browser (:5173) and Scott's real Chrome hit the SAME Postgres; `replaceCollection`/`saveFunMoney`/`saveBudgetBuckets` delete-missing-keys → last-write-wins. Don't edit stashes/buckets in two browsers at once; reload before mutating; prefer targeted SQL for cleanup. See [[project_iris_offline_architecture]].
- Bash cwd resets to `C:\Claude` — `cd /c/Claude/projects/signal/signal-app` first. Probe/one-off scripts under `scripts/*.mjs` (pg + DATABASE_URL, ssl rejectUnauthorized:false). BACK UP before mutating stashes/expenses.
- Preview MCP: two-click confirm buttons (delete/retire/restore) don't arm cleanly via automation `.click()` timing (real user clicks are fine — same pattern as the working delete). Nav clicks race the SPA on reload — click by ref, verify in a separate eval.
