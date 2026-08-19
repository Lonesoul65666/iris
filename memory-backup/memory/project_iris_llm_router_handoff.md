---
name: Iris router + onboarding + nudge + x-ray + conviction + why handoff
description: Status of LLM router, onboarding wizard, nudge system, X-Ray, conviction holds, explain-the-why — for continuing in a fresh session
type: project
originSessionId: ab3880cf-d0b1-4774-9ee9-5fdbbd57f650
---
Iris chat routes through LLMRouter when appropriate. Provider stack + settings UI + bootstrap + onboarding wizard in place. **Phase B nudge system shipped (v1) on 2026-04-19. ETF X-Ray v1 shipped 2026-04-19. Conviction holds shipped (date unknown, found complete 2026-04-20). Explain-the-why for movement nudges shipped 2026-04-20.**

**Completed (through 2026-04-20):**
- LLM router wired into chat. Preferred-provider dropdown in Settings. Default path remains `geminiChatStream` for Google Search grounding.
- Market intelligence tightened (3 DCA changes + 3-5 opportunities, dollar-specific, dedupe).
- **First-run onboarding wizard** (`src/views/OnboardingView.tsx`) — 5 steps, soft-skip everywhere. Marks `onboarding_complete`.
- **SetupChecklist** on Dashboard w/ soft-dismiss (24h), permanent dismiss, resume. Default-portfolio heuristic is ID-based (fragile if account IDs change).
- **Phase B nudge engine v1** (`src/utils/nudgeEngine.ts` + `NudgeCenter.tsx`): welcome_back, net_worth_milestone, cash_drag, portfolio_move, holding_move, monthly_dca, stale_actions. Dismiss state in settings store. Max 4 visible. Watchlist alerts + holy-shit news scanner both route through this surface too.
- **Per-holding price snapshots** (`PortfolioSnapshot.holdings`) written on every daily snapshot — enables holding_move nudge.
- **Nudge management panel** in Settings showing snoozed/dismissed records w/ reset.
- **ETF X-Ray v1** (`src/data/etfConstituents.ts` + `src/utils/etfXray.ts` + `EtfXrayPanel.tsx`). ~20 popular ETFs hardcoded (late-2025 snapshot). Surfaces hidden concentrations.
- **FirstReportView / Phase 1 revelation** (`src/views/FirstReportView.tsx`) — 8-step walkthrough after onboarding. Auto-routes when onboarding done + `!first_report_complete` + non-default account IDs.
- **Conviction holds** (fully wired across the app):
  - Type: `Holding.conviction: boolean` + optional `convictionNote: string` in `types/portfolio.ts`.
  - Central utility `src/utils/conviction.ts` — `isConviction`, `nonConviction`, `convictionHoldings`, `aggregateConvictionBySector`, `listAllConvictions`, `totalConvictionValue`, `convictionNote(pct)` messaging helper.
  - Star toggle in `PortfolioView.tsx` on each holding (lines ~547-710), with editable note.
  - Settings panel (`SettingsView.tsx` ~540-625) listing all conviction holds w/ unmark buttons.
  - Respected in: `portfolioIntelligence.ts` (rebalance), `nextDeploymentBrief.ts` (deposit advisor), `etfXray.ts` (concentrations: informational copy instead of "consider trimming"), `nudgeEngine.ts` (holding_move softens to "no trim suggested"), `synthesisDigest.ts`, `marketIntelligence.ts`, `gemini.ts` (tags `[CONVICTION HOLD]` in LLM portfolio context). Also referenced in watchlist.
- **Explain-the-why for movement nudges** (2026-04-20):
  - `src/services/nudgeExplain.ts` — `explainNudgeWhy(whyKey, prompt)` hits Gemini + Google Search grounding, returns one-sentence explanation. Caches in settings store under `nudge_explain::<whyKey>` with 24h TTL. Falls back to null on missing provider / failure / model returning "UNKNOWN".
  - `Nudge` type extended with optional `whyPrompt` + `whyKey` fields.
  - `portfolio_move_weekly` generator sets `whyKey: portfolio_move:<dir>:<magPctBucket>` and asks "why are US stock markets up/down X%".
  - `holding_move:*` generator sets `whyKey: holding_move:<ticker>:<dir>:<5ptBucket>` and asks "why is TICKER up/down X%".
  - `NudgeCard.tsx` renders a "WHY:" bordered block below the body when `whyPrompt` is present. Hook `useNudgeWhy` fetches async; shows "checking recent news…" → text, or "no clear catalyst in recent news." on failure. Does NOT fetch when whyPrompt missing (zero cost for non-movement nudges).
  - Verified in browser 2026-04-20 via seeded snapshot + pre-cached "why": portfolio_move fires with "Portfolio up 11% this week" and "WHY:" block renders the cached text under the body. Test data cleaned up.

**Known gotchas:**
- FirstReportView auto-route uses `isDefaultPortfolio(accounts)` heuristic checking account IDs against hardcoded defaults. If user keeps default shells but loads real holdings, auto-route never fires. Manual trigger via Settings → Re-run first report works. Future fix: heuristic should inspect holdings count/diversity, not just IDs.
- **`src/views/WatchlistView.tsx` line 347 has an oxc parser error** ("Unterminated string") on a template-literal label containing em-dash + nested quotes + apostrophe. Pre-existed 2026-04-20. Blocks the Watchlist view only; rest of app loads. Quick fix: replace the template literal with a plain string or escape differently. Needed before shipping.

**Not yet wired / known gaps:**
- `IntelligenceView` / `marketIntelligence.ts` still Gemini-only (Google Search grounding dependency).
- Router providers declare `streaming: true` but none implement `chatStream()`. Router path is non-streaming.
- ETF X-Ray uses static constituent data (late-2025 snapshot). Plan v2 dynamic refresh in ~4-6 months.
- Legacy cleanup: hardcoded action executor switch in `actionStore.ts` (templates cover all 6 cases).

**Next priorities (post-why):**
1. Fix WatchlistView.tsx:347 parse error — trivial, unblocks Watchlist.
2. **Packaging** — electron or tauri wrapper w/ auto-updater (see `project_iris_target.md`). This is the main remaining gap to "friends/colleagues can download and use it." Favor Tauri for smaller binaries + built-in signed-updater. License-key gate behind a Gumroad/Stripe Payment Link.
3. **Tax-aware basics** — flag short-term vs long-term lots on trim suggestions; honor 30-day wash-sale windows in rebalance. Needs `costBasis` + `acquiredAt` on holdings (check portfolio schema).
4. Onboarding that works for any portfolio (not just Scott's defaults) — currently fragile because of hardcoded default-account-ID set used in default-portfolio heuristic.
5. **Nudge integration with X-Ray**: fire a concentration nudge when a single underlying exposure crosses a threshold (e.g., "NVDA is now 7% of your portfolio across 5 funds"). Data pipeline already in place.
6. Richer holding-move nudge: once >30 days of holdings snapshots, add 30-day and YTD variants.
7. Action-item nudge: surface a specific high-priority action (by title) rather than just the count.
8. Route market intelligence through router as fallback when Gemini unavailable (non-grounded).

**Important context for product direction:**
- Distribution target: downloadable local-first app + license gate. NOT SaaS. See `project_iris_target.md`.
- Audience: Scott + wife + industry friends. Product, not demo.
- Completion against "friends pay and use it" target: was 60-70% on 2026-04-19; conviction + why close a few more points but packaging is the remaining large chunk.
- Gating philosophy: soft-skip everywhere, dismissible nags on Dashboard, never block.

**How to apply:** If continuing in a fresh session, read this + `project_iris_target.md` + `feedback_iris_product_journey.md` + `feedback_iris_explain_why.md` + `feedback_conviction_holds.md`. To extend nudges, add a generator to `nudgeEngine.ts` — flows through NudgeCenter automatically. To enrich a new nudge with "why," set `whyPrompt` + `whyKey` and the card hook picks it up. To extend X-Ray coverage, add entries to `etfConstituents.ts`.
