# Iris — Next Steps (as of 2026-06-11)

Working branch: **`overnight-polish-2026-06-11`** (NOT merged to `master` — review & merge first).
Review the branch: `git log master..overnight-polish-2026-06-11` and `git diff master...overnight-polish-2026-06-11`.

## ✅ Shipped this session (5 commits, all pass pre-commit `tsc`, browser-verified)
1. `0e09796` Three-lane budget view (Fixed=green on-target / Flexible / Reserve) — `src/utils/budgetLanes.ts`. Net-Take-Home hero; dropped Gross/OTE tile + Paycheck Waterfall; Budget Health sorted best→worst; bars = % of own budget.
2. `25705c0` On-demand Teller sync UI (`SyncStatus.tsx` + `syncTellerTransactions.ts`): "Refresh accounts" + 48h staleness banner, 5-min debounce, 429 back-off, new/updated/through indicators. **Upsert preserves manual edits on re-sync** (was clobbering). No auto-sync by design.
3. `ae6001f` Categorization fix — Teller import runs the merchant-tuned `classifyBankTransaction` first (EXXON→transportation, not groceries). `server/teller-map.ts`.
4. `0baaffd` Dashboard false-alarm kill — lane-aware insights/summary/over-count. No more "10 categories over" / false "$3.4k over income". Shows +$837 surplus; donut operating-only.
5. `9d3e89d` Quick fixes — housing-ratio NaN guard, disabled unbuilt screenshot button, corrected 4 false "data in your browser" privacy claims (it's Postgres).

Verified clean: no real duplicate transactions; synced through June 10.

## 🔜 Next steps (prioritized — needs Scott on the first four)
1. **Safe-to-Spend number** (HIGH) — the missing consumer-defining number. Decide the formula with Scott: take-home − fixed bills − reserve set-asides − already-spent. Then place it on the dashboard + budget.
2. **Fix the Dubai-medical healthcare artifact** — the one-time $12,298 "Saudi German Dubai" charge (Jan) is miscategorized as `healthcare`, inflating the healthcare average so it reads red. Recategorize that one row (travel/medical-abroad) or exclude outliers from category averages.
3. **Clean up already-synced mislabels** — the fix only auto-corrects NEW syncs (existing categories are preserved so manual work isn't clobbered). Run a TARGETED recategorize on recently-mislabeled rows — NOT `/api/expenses/recategorize?all=1` (that clobbers the 135 user merchant mappings). Or Scott fixes in-app.
4. **Sync: replace full-page reload with in-place refetch** — `SyncStatus.tsx` calls `window.location.reload()`. Better: expose a refresh fn from `AppDataContext` and re-fetch. Small refactor, do with Scott watching.
5. **Investment + equity** (Phase 2, bumped up — Scott leaving Abnormal): wire the $1k/mo destination, Coinbase, Fidelity, and RSU/equity value. Equity liquidity is a near-term real event.
6. **Multi-PC for Claire** (easy, deferred): `npm run server` with `--host` (already in launch config) + cloud DB → her laptop/upstairs PC open `http://<host-ip>:5173`, no install, same data.
7. **Gamification = Phase 3. HOLD.** Scott asked to be braked — don't build until budget is in daily use AND investment/equity are in.

## ⚠️ Gotchas for the next session
- **Budget buckets are app-owned** — the app rebalances/persists them, so setting targets via direct SQL gets CLOBBERED. Set targets through the in-app Edit Budget UI.
- **Teller dev tier**: rate limit is undisclosed (429 → back off); the scarce resource is the **100-enrollment lifetime cap** (re-connecting a bank burns one permanently). Sync uses existing tokens = free. Don't auto-poll.
- **Plain language**: Scott LIKES "watermark" and "reserves" (his words) — do NOT strip them.
- Lane rules + reserve amounts (tax $1500/mo, travel $1000/mo) live in `src/utils/budgetLanes.ts` (code, not DB — clobber-proof).
- Untracked scratch in `scripts/` (budget-shave-*, work-travel-*, verify-classifier.ts, buckets-backup-2026-06-10.json) is disposable.
