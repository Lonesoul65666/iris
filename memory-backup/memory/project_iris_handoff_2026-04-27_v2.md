---
name: Iris session handoff (2026-04-27 evening)
description: End-of-session state for Iris build. Wizard rebuilt with module gating + cents support, dashboard rebuilt multiple times (final = polished version + cyber overlay), swarm-applied cyber paint to all 8 views, sync fixed between profile.monthlyInvestment and monthlyInv.amount.
type: project
originSessionId: 2026-04-27-evening
---
## What shipped this session

### Wizard (10 steps, conditional)
- Order: Welcome → User → **Modules** → About you → Risk (if invest) → Earners → Wealth (if wealth) → AI → Portfolio (if invest) → Done
- Module selection: Budget always-on; Investments / Equity / Wealth opt-in
- About You: age, state, income (auto-fills tax bracket via 2025 IRS table), retirement age. Skippable.
- Risk Tolerance: 4-card "how do you sleep at night" picker, gated on Investments
- Earners: pre-seeded cards per household member, manual currently-working toggle, 6 pay shapes, take-home + cadence
- Wealth: home/mortgage + vehicles with depreciation note
- All money inputs accept cents via `sanitizeMoneyInput` helper or HTML `step="0.01"`
- Welcome screen: "Hey, I'm Iris. Money's stressful enough." + 2-column hero with preview tiles, Pinky promise tagline
- Iris brand mark in header (gradient "i" tile)

### Dashboard (rebuilt from scratch, polished version)
- Hero: animated counter, gradient area chart (purple→pink), trend pill, breakdown chips (color dots)
- Iris noticed banner — collapsible, alert pill for critical/warning count
- Two donuts with center labels (spending % of budget, investments score)
- 3-segment cash flow gradient bar (rose→pink, violet→indigo, emerald→teal)
- Recent activity feed (last 5 outflows, category emojis, relative dates)
- Equity + Wealth tiles (gated)
- Action items footer with gradient bg
- **Cyber overlay applied:** HUD top strip with LIVE chip + timestamp, scanline sweep on hero, mono numbers, term-label cyan eyebrows, cyber-chip trend pills with ▲/▼

### Swarm "coat of paint" — all 8 views polished
Applied via 8 parallel agents using shared CSS classes (cyber-grid, cyber-corners, cyber-scanlines, term-label, cyber-chip, mono-num, cyber-divider):
- BudgetView, PortfolioView, HealthView, EquityView, WatchlistView, IntelligenceView, ChatView, SettingsView all got eyebrow→term-label, hero numbers→mono-num, trend/status pills→cyber-chip
- Hero cards on Health + Intelligence + Portfolio got grid+corners+scanlines
- All compile clean

### Bug fixes
- `|| 2000` hardcoded fallback killed (3 places — budget calc, BudgetView's 2 instances)
- Hardcoded `?? 590000`, `?? 401866`, `?? 195000` for home/mortgage/cars (3 places in AppDataContext) → `?? 0`
- `defaultActionItems` Scott-specific items removed (HYSA $103k, ISO $90k, $7287 discretionary, etc.) — array now empty
- `clearAllUserData` now scorched-earth: enumerates all `iris-*` IndexedDB databases via `indexedDB.databases()`, deletes each, plus localStorage/sessionStorage scrub. Auto-reload after.
- Gemini verification bug fixed: `res.text` → `res.content`
- Gemini test ping budget bumped: 8 → 256 tokens (Gemini 2.5 burns thinking tokens before emitting visible text)
- TypeScript profile/monthlyInv fallback hardcodes audited and stripped from production paths
- **Settings sync:** profile.monthlyInvestment and monthlyInv.amount now write each other on edit

### CSS additions
- Cyber overlay layer: `.cyber-grid`, `.cyber-scanlines` (with 6s sweep animation), `.cyber-corners` (HUD brackets), `.term-label`, `.cyber-chip` (sharp clip-path pill), `.mono-num`, `.cyber-divider`
- Cyber accent tokens: `--color-cyber-cyan: #00e5ff`, `--color-cyber-magenta: #ff2d92`

### Hooks/components added
- `useEnabledModules` — reads `enabled_modules` setting, returns granular flags
- `useHasRealData` — single source of truth for "fresh user vs has data"
- `EmptyState` component — generic "no data yet" tile with CTA + module-aware copy
- `sanitizeMoneyInput` helper in `utils/format.ts`
- `getFederalBracket` + `isNoIncomeTaxState` in `utils/taxBrackets.ts` (2025 IRS brackets)

## Where we are at session end
- App fully rendering with sample data
- Wizard walkable end-to-end
- Dashboard at "polished + cyber overlay" — Scott called it "much better from a dashboarding perspective"
- Settings monthly investment sync just fixed — Scott about to start using the app
- All 8 views have consistent cyber visual language

## Rolling backlog

### High priority (Scott has surfaced)
1. **"Have my investments changed?" diff view** — surface the existing `iris-audit` DB. Show a sidebar or banner with "since last login" account/holding deltas.
2. **Budget tab redesign** — TriggerCenter still dumps full-card-per-bucket "X over budget" wall. Replace with single horizontal stacked bar OR compact category table.
3. **Equity tab buildout** — currently a thin wrapper around `<EquitySection>`. Real equity UX needed before sharing (vesting timeline, ISO planner, sale opportunity callouts).

### Medium
4. Settings reorg — 16 panels stacked. Split into 5-6 sub-pages with sidebar nav (Mac System Settings post-Ventura pattern).
5. Settings dedup — Notifications + SimpleFIN sections live in two places.
6. Bucket-groups editor UI (schema is done, needs wiring).
7. Stale-submitted expense surfacing in IncomeSources.
8. Multi-provider checkboxes (Gemini AND Ollama for cloud + local fallback).

### Packaging sprint (separate session)
- Tauri shell (Mac + PC), IndexedDB → SQLite migration, signed installer, auto-updater, license-key check.

## Open architectural decisions

### profile.monthlyInvestment vs monthlyInv.amount
- **Right now:** synced bidirectionally (just shipped). Both stay in lockstep on every edit.
- **Long-term:** consolidate to one source. monthlyInv is the richer model (has allocations). profile.monthlyInvestment should be retired and consumers migrated.
- Same architectural smell exists in other places likely — audit when packaging-prep starts.

### SOXQ/XLK leftover allocations
- When sample data is loaded, monthlyInv allocations get set to SOXQ 50% / XLK 50% (Scott's old picks).
- Currently these persist until user edits them or wipes data.
- Decision pending: auto-clear on first non-sample edit, or leave (allocations are user-customizable anyway)?

## Workflow rules (carried forward from prior session)
1. Pause and ask before building, even on fix-on-fly. Especially UX decisions.
2. Two streams: fix-on-fly vs rolling backlog. Don't conflate.
3. QA pattern: walk → screenshot → fix in real time. Don't pre-plan tests.
4. Brevity in responses. Use tables for choices. No walls of text. Laid-back tone in product copy. Serious tone reserved for major alerts.
5. Sample data > fresh-user QA when iterating UX (consistency = easier visual diff). Wipe + walk fresh only for empty-state work.

## Model routing
- Sonnet 4.7 high → routine QA, mechanical edits, swarm tasks
- Opus 4.7 → UX decisions that compound, deep diagnosis, architecture, packaging

## Files of note (this session)
- `src/views/DashboardView.tsx` — rewritten 4 times. Final = polished + cyber overlay
- `src/views/OnboardingView.tsx` — wizard expanded to 10 steps with conditional gating
- `src/index.css` — cyber overlay layer added
- `src/hooks/useEnabledModules.ts`, `src/hooks/useHasRealData.ts` — new hooks
- `src/components/ui/EmptyState.tsx` — new generic empty-state
- `src/utils/format.ts` — added `sanitizeMoneyInput`
- `src/utils/taxBrackets.ts` — new file, 2025 IRS brackets
- `src/services/sampleData.ts` — `clearAllUserData` rewritten as scorched-earth
- `src/context/AppDataContext.tsx` — hardcoded Scott home/mortgage/car fallbacks stripped
- `src/components/Dashboard/TriggerCenter.tsx` — STILL DUMPS WALL OF CARDS on Budget tab (next priority)

## Pending: grading request
Per [project_iris_grading_request.md](project_iris_grading_request.md), Scott asked for an honest grade on his Iris build approach when work hits a natural pause. This is a natural pause. Offer the grade in the next session if not delivered this one.
