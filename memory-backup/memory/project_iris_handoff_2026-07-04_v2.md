---
name: project-iris-handoff-2026-07-04-v2
description: "Iris handoff 2026-07-04 EVENING — big Make-Every-Dolla functional build (chunks A-C, insurance split + Have-To cards, Edit-Budget delete/pots) THEN a full design overhaul (cyberpunk retired → premium Inter + Card-E chrome). Clean pause. READ FIRST — next session is FUNCTIONALITY (verify Have-To/Want-To flow, trim budget-screen boxes, punch up buttons)."
metadata: 
  node_type: memory
  type: project
  originSessionId: b37e92ff-abd9-4afd-9d8e-5c0a224f5064
---

# Iris handoff — 2026-07-04 EVENING (v2) · READ FIRST

Supersedes [[project_iris_handoff_2026-07-04]] (still valid for chunk/insurance detail). Repo `C:\Claude\projects\signal\signal-app`, branch `overnight-polish-2026-06-11` (**90 commits over master, unmerged — Scott reviews/merges**), dev server :5173 (`npx vite`), Postgres via `.env.local DATABASE_URL`. **tsc clean · 130/130 · working tree clean · pre-commit runs tsc+vitest.** Scott called a clean PAUSE on design ("done a lot here"); next up = FUNCTIONALITY.

## Shipped this session (all committed)
**Functional (Make Every Dolla Holla + budget):**
- **Chunk C — reserved→committed reserve-math flip** (`6f502b6`): killed the auto $2k off-the-top; `committedReserves()` helper; `computeSafeToSpend` `reserveOverride`; Money Map "Committed" slice, Pulse header, both Safe-to-Spends (Budget + Dashboard via AppDataContext), scorecard all use committed. See [[project_iris_handoff_2026-07-04]].
- **Insurance split + Have-To cards** (`704a9b8`): durable classifier rules (State Farm→utilities, Liberty Mutual→`car_insurance`, Allianz→travel_personal) + in-DB migration (`scripts/insurance-migration.mjs`, backup `scripts/backups/pre-insurance-migration-2026-07-04.json`); created **Car Insurance ($275/mo) + Credit Card Memberships ($73/mo)** Have-To cards w/ linked categories (auto reserve-lane + draw-down); deleted empty insurance bucket; `getCategoryLabel()` so bucket-less cats show real names.
- **Edit Budget: delete/rename categories + pots count toward $15,800** (`43ade32`): two-click ✕ delete + click-to-edit labels per bucket row; new "Have-To's/Want-To's · planned moves" section whose fills fold into `unallocated` + allocation bar + footer ("Left to allocate ✓ budget complete" <$500). This is the zero-based plan surface.
- **"fixed"→"Essentials" verbiage** (`6a5c901`); **emoji stripped from budget UI** (`e1e0199`).
- **Toll investigation + full Teller resync** (not a commit — data/ops): all 5 accounts healthy through 7/3; NTTA/HCTRA tolls already `transportation`, nothing since 5/29 is NORMAL (prepaid top-ups, not monthly bills). See [[reference_iris_teller_accounts]].

**Design overhaul (cyberpunk RETIRED — see [[project_iris_design_direction]] for the full spec):** `88d7842` retire cyberpunk (unified Inter incl. numbers, Card-E chrome-edge depth, quiet labels, de-glass, AA contrast) · `37734b8` darken card fills (fixed a grey-wash regression — depth comes from border+shadow, NOT a light fill: `#15151d→#0e0e13`) · `3350e21` center all views at shared `max-w-[1600px]` in AppShell · `b4ed352` uniform typography app-wide (`font-mono` utility → Inter, `--font-code` for chat code, cyan retired). **Scott + Claire's look now — premium, not hacker-dashboard.**

## ⏭️ NEXT SESSION — FUNCTIONALITY (Scott's stated goals, 2026-07-04)
1. **Verify the Have-To/Want-To ("one-twos") flow works end-to-end.** Confirm the commit mechanic + that pots can be **applied in Edit Budget appropriately** and everything reconciles (planned fill ↔ card ↔ commit ↔ $15,800 ↔ Money Map/Pulse/Safe-to-Spend). This is validating chunks A-C in real use + likely finishing **chunk D (lumpy-bill draw-down alarm / shortfall nudge — design locked in [[project_iris_handoff_2026-07-04]]) and E (Free "give it a job" nudge)**.
2. **Trim the budget screen — REMOVE the Fun Money box** (`FunMoneyCard`, the "Scott & Claire's Fun Money" card): Scott says it's redundant/unneeded — the fun categories already show in the budget itself. (Component: `src/components/Budget/FunMoneyCard.tsx`, rendered in `BudgetView.tsx`.)
3. **Other budget-dashboard display changes** — Scott has a few more trims/tweaks to what's shown on the budget overview; he'll specify.
4. **Make a couple buttons more pronounced on the budget screen** — Scott will point at which (candidates: Edit Budget, Commit, Confirm deposit).

## Deferred / parked
- Design: Scott has "a couple things to change, will come back" (unspecified). Plus P2 hygiene in [[project_iris_design_direction]]: dedupe duplicated CSS blocks, rename now-misnamed classes (`cyber-chip`/`mono-num`/`term-label`/`--font-mono`), **center SettingsView (hugs left)**, decide on emoji in non-budget views (Dashboard emoji ☀️🔔 + spending icons kept ON PURPOSE).
- `public/*.html` throwaway mockups deleted (card-lab, fusion, redesign).

## Gotchas
- Bash cwd resets to `C:\Claude` — `cd /c/Claude/projects/signal/signal-app` first. Probe scripts `scripts/*.mjs` (pg + DATABASE_URL, ssl rejectUnauthorized:false). BACK UP before mutating stashes/expenses (seedDefaultStashes dup-id trap — watch stash count).
- Chrome MCP: nav clicks race the SPA on reload — click by `find` ref, and a stray click may open a row drilldown. Reload lands on Dashboard.
