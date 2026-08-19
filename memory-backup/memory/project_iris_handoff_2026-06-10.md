---
name: Iris session handoff (2026-06-10 — Phase-1 Budget Engine essentially DONE; architecture cleanup is next; portfolio is Phase 2 PARKED)
description: Marathon session. De-browsered the whole app (standalone Node server + all data → Postgres, nothing browser-trapped). Rebuilt net worth on real Teller cash ($544,574). Wired REAL income to the GUARANTEED BASE ($15,800/mo, variable=surplus). Scott did a manual categorization pass (work flagged, 'other'→0). Seeded budget targets from real spend. Shipped the savings scorecard ("living under the guarantee"). 9 commits ea4ea4d→3aac02b. NEXT = architecture cleanup (extract, don't rewrite) + Scott keeps cutting the budget. Portfolio (Coinbase/Fidelity/equity) is Phase 2, PARKED.
type: project
originSessionId: 2026-06-10-budget-engine-done
---

## ⭐ LATEST STATE (read first)
**📍 REPO: `C:\Claude\projects\signal\signal-app`** (Iris = product; repo = `signal`; no folder named "iris"). Latest commit **`3aac02b`**, **tree clean**, type-check green. Dev server was running on :5173 this session (may be stopped now — `npm run dev` to restart; do NOT auto-launch browser windows). **9 commits on top of `e88923f`:**
```
3aac02b feat(budget): savings scorecard + income baseline = guaranteed base (not blended)
a4c978e fix(budget): collapse merchant fragmentation in recurring/subscription detection
ac6d33f fix(budget): income excludes reimbursements + accurate grossMonthly derivation
29610bc feat(budget): import real income inflows from Teller (Phase-1 income)
42a7faa feat(portfolio): optional "current value" on add-account (painless manual assets)
9ba3bba feat(dashboard): spend-by-account breakdown card
ae368b4 feat(portfolio): Teller balance sync — real cash into net worth
09af106 feat(stores): move portfolio + action stores to Postgres (browser-independent)
ea4ea4d feat(server): standalone Node server + env auto-connect (de-browser backend)
```
**Backups** (full `/api/export/full`): latest **`iris-backup-2026-06-10-budget-engine-done.json`** (captures real income + budget targets + base, 1.2MB) + earlier `iris-backup-pre-placeholder-purge-2026-06-10.json`. All real data also lives in Scott's Postgres.

## What shipped this session
1. **De-browsered (ea4ea4d, 09af106).** Standalone Node server (`server/standalone.ts`, `npm run server`) runs the whole API WITHOUT Vite — shared route table `server/routes.ts`, connect-compatible router `server/router.ts`, Yahoo proxy `server/yf-proxy.ts`; Vite plugin (`api-plugin.ts`) is now a thin adapter (dev routing byte-identical). DB config off the browser: `DATABASE_URL` in `.env.local`, both transports auto-connect (`db-pool.autoConnectFromEnv()`); localStorage paste now optional. **ALL data moved off the two IndexedDB DBs into Postgres `collections`** via shared `src/lib/collectionsClient.ts` — `portfolioStore` (accounts/equity/monthlyInvestments/snapshots/chatHistory) + `actionStore` (action items + **135 merchant mappings**). Any browser/profile (Edge/Chrome/Firefox/Claire) on a server with `DATABASE_URL` sees identical data — proven: full app rendered on standalone :5180 with empty localStorage.
2. **Net worth = real (ae368b4, 9ba3bba).** `GET /api/teller/balances` + "Sync bank balances" button (Settings→Connectors) pulled 3 real BoA cash accounts = **$161,440**. Net worth = **$544,574** = $161,440 cash + $183,134 home equity ($585k home − $401,866 mtg) + $200,000 cars. (Investments + Abnormal equity NOT loaded — Phase 2.) Spend-by-account dashboard card shipped.
3. **Real income wired to GUARANTEED BASE (29610bc, ac6d33f, 3aac02b).** `POST /api/teller/import-income` imported **18 Abnormal paychecks = $188,033** + **5 Coupa reimbursements = $14,007** (kept SEPARATE — Coupa = work-expense payback, NOT income). `computeMonthlySpending` splits reimbursements out of `totalIncome` (new `totalReimbursement`). **Budget income baseline = GUARANTEED BASE $15,800/mo** (2 × ~$7,900 paychecks; variable/RSU = surplus, NOT in the monthly target) — `paycheck` record set to net $15,800 / gross $21,944 (corrected a stale blended $26,490).
4. **Categorization clean (Scott's manual pass).** `other` 14→**0**; **170 txns flagged isWorkExpense ($8.6k)** + 263 travel_work ($29.9k, sanity-checked = real business travel); sources 100% clean (credit_card_1/2, bofa_checking). Merchant fragmentation fixed (a4c978e: Peacock 9→1, Oculus ~20→1 via dropping txn-id tokens in `normalizeMerchant`).
5. **Budget targets SET + savings scorecard SHIPPED.** Seeded all 29 buckets from real avg spend (`monthlyBudget`): total **$20,520/mo** ($19,520 spend + $1,000 investing) vs $15,800 base → **~$3,700/mo of spend to cut**. Scorecard (`src/utils/savingsScorecard.ts` + `src/components/Dashboard/SavingsScorecard.tsx`): "Living under the guarantee" — base, **"banked since Sept +$12,369"**, green/red month strip, **under base 3/9 full months**, trend (May $17,826 < Apr $24,438 = better). Validated vs live data; **NOT yet visually confirmed in browser.**

## Locked decisions / key facts (don't re-litigate)
- **Budget income = GUARANTEED BASE (~$15,800/mo), variable=surplus.** Scott: budget must fit under the two guaranteed paychecks; RSU/OT/bonus is upside shown separately, never in the monthly target. (Matches [[project_iris_budget_architecture]].)
- **Coupa deposits = reimbursement (expenses paid back), NOT income.** Work expenses stay out of personal spend (via `travel_work`/`isWorkExpense`); Coupa is the offset that lands later. NO line-by-line reconciliation engine. Note: Scott turns in expense reports every **1.5–2 months**, so a real "work float" (fronted-not-yet-reimbursed) sits out for weeks — future: a float/aging widget.
- **Work flagging is MANUAL (locked).** Auto-detection can't tell work from personal (Uber bills as "CA" regardless of trip; only destination-city merchants are unambiguous). Scott flags by hand; the classifier learns per-merchant.
- **"$388,534" was REAL** (home equity + car from profile), never fake. `defaultAccounts=[]` — app never auto-injects a fake portfolio. The big `sampleAccounts`/`sampleEquityProfile` in `defaultData.ts` ("Real Scott numbers" Apr 2026) only load via a Settings button.
- **Cars = single lumped "Total Car Value" $200k** (not itemized) — Scott confirmed, system-of-record only.
- **Mission: Phase 1 Budget Engine FIRST, Phase 2 (portfolio/net-worth) AFTER.** UI redesign is LAST, gated behind clean architecture. Scott: "too much CLAUD, not enough cool" — but UI must NOT get ahead. Gamified scorecard (streaks/confetti) = V2, deferred.

## ⭐⭐ NEXT SESSION — START HERE
The Budget Engine is essentially done (income on base + targets + scorecard). Two threads:
1. **Verify in Scott's real Chrome** (validate-before-reassurance): the savings scorecard renders (~$15,800 base, "+$12,369 banked", green/red strip), income shows $15,800 base (not blended), and budget over/under lights up per category. Math is validated; the render isn't.
2. **Architecture cleanup — the next BUILD (Scott's stated priority, gates the cool-UI redesign).** From the 2-agent review: server is HEALTHY; frontend has 4 overweight files + a god-context. **"Don't rewrite — EXTRACT."** Prioritized: (a) collapse duplicate collections helpers (`budgetStore` vs `collectionsClient`, ~75 dup lines) [S]; (b) delete dead one-shot migration code (`migrate-indexeddb-to-postgres.ts` 461L + `migrate-browser-stores.ts` — still bundled, pull in `idb`) [S]; (c) extract `utils/investmentCsvParser.ts` (from PortfolioView 1276L) + `utils/bankImport.ts` (from ExpenseManager 1237L) — highest test payoff [M]; (d) decompose `BudgetView.tsx` (1647L → `useBudgetData` hook + `budgetDiff.ts` + section components) [L]; (e) split `AppDataContext.tsx` (735L god-context → extract `portfolioMigrations`, `useChat`, `usePriceRefresh`, `useTransactionAnalysis` — kills a duplicated pipeline) [L]. **ZERO tests; 145 lint problems (33 are REAL rules-of-hooks bugs).** Add vitest + test the extracted pure fns first. `server/api-handlers/teller.ts` (now ~700L w/ income import) is the only server file worth splitting.
3. **Scott's ongoing (his UI work, parallel):** keep cutting the budget — trim the $3,700 gap (levers: travel_personal $2,860, Amazon $1,360, dining $1,040, subscriptions $440). Each cut → more green months + grows "banked." Also finish reclassifying subscription mis-tags (Oculus→entertainment?, GOODBUNDLE, SP JULEP, WeWork=work) in the transaction list.

## ⚠️ Blocked cleanups (need Scott's action)
The auto-mode classifier **blocks bulk `/delete` from Bash even with a verbal yes** (it can't treat chat as authorization — correctly). So these need either a Bash permission rule for `/api/*/delete`, or the app's own clear buttons (browser, no new windows):
- **11 stale snapshots** (flat $388,534, dead `sf-ACT-` ids) — clear so the net-worth chart starts fresh.
- **22 stale CSV-era income sources** (`batch-deluke main.txt`, Jan–Apr dates) — superseded by the live detector; dismiss in Budget→Income or clear.
Both low-stakes (snapshots regenerate; sources get superseded by live detection).

## PARKED — PHASE 2: portfolio / net-worth rebuild (do NOT resume until budget done + Scott says)
- **Manual "add asset" foundation DONE** (`42a7faa`): PortfolioView `AddAccountButton` + optional "Current Value" field → one-step 401k/crypto/brokerage entry. Equity/RSUs need a richer grant form (gap).
- **Automated feeds Scott picked (need his inputs):** (a) **Coinbase** balance-pull connector (like Teller; Scott provides read-only API key → `.env.local`); (b) **Fidelity CSV import** (Scott exports a positions CSV → parser); (c) **Fidelity OFX** (fragile, last). Build order: Coinbase → Fidelity CSV → OFX. **Don't hand-enter the stale April numbers — crypto+market moved; feeds pull current.**
- **Credit-card liabilities** — Citi/CapOne balances reported by `/api/teller/balances` (kind:'liability') but not in net worth (AccountType has no liability type). Decide: add `'credit'` type vs negative-cash-under-bank. Immaterial (~$3,100 on $544k).
- **Savings scorecard V2:** gamification — streaks, milestones, confetti, "actually banked vs under-guarantee" dual number, income-vs-spend trend graph (3/6/12mo).

## Run commands
- Dev (HMR, canonical): `npm run dev` / `npx vite --port 5173`. **`vite.config.ts` `server.open:false`** — never auto-pops windows.
- Standalone (no Vite): `npm run server` (= `node --env-file=.env.local server/standalone.ts`, Node 24 runs .ts directly). `npm run start` = build + serve. Default :5173 (override `PORT`).

## Operating notes (REINFORCED — Scott emphatic)
- **NEVER auto-launch browser windows.** Reuse the ONE existing Chrome tab via the Claude-in-Chrome extension; don't repeatedly `tabs_context_mcp createIfEmpty` (spawns isolated windows). Client changes hot-reload via HMR. See [[feedback_iris_partnership_model]].
- **Validate in real Chrome + verify server-side via curl** (caught the actionItems seed/migrate race, the "$388,534 is real" correction, the stale-paycheck-$26,490 gotcha — all by inspecting data, not assuming).
- **Destructive Postgres deletes need explicit consent + a backup** — and the classifier will still block Bash `/delete`; do consented deletes via the app's browser channel, not a Bash workaround.
- Teller certs at `C:\Claude\projects\Teller\`; `.env.local` uses ABSOLUTE paths (update if folder moves). Teller dev tier rate-limited — fetch once, persist.
