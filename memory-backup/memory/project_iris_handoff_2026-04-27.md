---
name: Iris session handoff (2026-04-27)
description: End-of-session state for Iris build. Captures shipped work, rolling backlog, workflow rules, and model-routing strategy so we can continue cleanly in the next session (likely Sonnet 4.7 high for QA cycles).
type: project
originSessionId: ab3880cf-d0b1-4774-9ee9-5fdbbd57f650
---
## What shipped this session

### Tier 1 (daily-use polish — all done)
- Auto-sync SimpleFIN on app launch (4-hr throttle, fire-and-forget)
- CC payment dedup verified clean (transfers correctly excluded across all consumers)
- PaycheckBreakdown waterfall demoted to collapsible "Advanced" section
- Bucket Groups manager with flex-budget toggle, wired into Budget Overview

### Tier 2 (distribution polish — packaging deferred)
- Stripped all Scott/Claire/Abnormal/Mimecast/Primrose/Vivian/Logan/Deluke hardcodes from defaults; sample-only versions persist for "Load sample data" button
- `services/sampleData.ts` with loadSampleData / clearAllUserData (truly nukes all 3 IndexedDB stores)
- `SampleDataPanel` in Settings (Load + Clear buttons with double-confirm)
- Onboarding step 1 redesigned: mainstream user-creation pattern (required primary user, optional partner, optional 4-digit PIN per user)
- `UserManagementPanel` in Settings (add/remove users + PIN management at any time)
- App.tsx lock screen now opt-in — fires only when ≥1 user has a non-empty PIN
- LockScreen reads users from `auth_users` setting, no hardcoded names
- Dynamic action items in `dynamicActions.ts` — gated on actual user data (has equity, has 401k, has spouse, has assets), no Scott-specific items injected
- Dashboard equity label/tooltip dynamic from `equity.company`
- `fun_scott`/`fun_wife` labels generic ("Personal Fun (1/2)")
- FirstReportView greeting reads `profile.name.split(' ')[0]`
- AppShell user avatar gradient no longer keyed off `=== 'Scott'`
- Gemini system prompt no longer mentions Scott/Claire/Deluke

### Critical bugs fixed
- **`saveUserProfile` keyPath singleton bug** — userProfile store has `keyPath: 'name'`, so saving with `name: ''` then `name: 'Alex'` left two records. `getUserProfile` returned the first (alphabetically empty key wins). Fix: `clear` + `put` to enforce singleton. Verified with 3-way test (empty → Alex → Casey).
- **OnboardingView pre-population bug** — name/spouse fields used `useState(profile?.name || '')` which leaked stale profile data into the create-user form. Fix: always start with empty strings; this is a create-flow not an edit-flow.
- **OnboardingView API key pre-population** — Gemini key field was bound to AppDataContext's shared `apiKeyInput` which auto-loads any saved key on app mount. Fix: switched to local component state.

### LLM provider verification (final ship of the session)
- New `testProvider()` function in `src/services/llm/index.ts` — fires a minimal "ok" ping per provider, returns `{ ok, model, latencyMs }` or `{ ok: false, error }` with friendly error mapping (auth/quota/network/model-not-found)
- OnboardingView step 3 redesigned: **Verify & continue** single CTA at bottom (no per-input buttons)
- Failure UX: red error panel + split CTAs — primary "🔄 Retry" + secondary "Continue anyway →" link
- Continue-anyway saves the key as-is + sets `provider_unverified=true` flag (dashboard can surface a yellow toast about it later)
- Pattern mirrors macOS Wi-Fi join failure / Stripe API key validation / GitHub SSH key add — retry primary, override hidden behind smaller affordance
- **Stale-state bug fixed mid-build:** `saveApiKey()` from AppDataContext reads `apiKeyInput` state which is async; replaced with direct `saveSetting + setupLLMRouter` calls

## Rolling backlog (pick up next session)

### Fix-on-fly stream (blocking risk)
- *None pending right now — Scott's about to start his fresh-user walkthrough on his real data*

### Polish stream (can batch)
1. **Settings redesign** — split 16 panels into 5-6 sub-pages with sidebar nav (You & users / AI / Money / Data / Notifications / Advanced). Mac System Settings post-Ventura pattern. ~half day.
2. **Settings dedup** — duplicate Notifications + SimpleFIN sections live in two places
3. **Bucket-groups editor UI** — schema is done from step 8 of locked architecture, just needs the bucket-assignment + flex toggle UI
4. **Stale-submitted expense surfacing** — "these 4 expenses have been submitted >90 days, mark as paid manually?" in IncomeSources panel
5. **Multi-provider checkboxes** — let user save Gemini AND Ollama (cloud + local fallback). Defer until someone wants it
6. **Tutorial / contextual help during wizard** — Scott's idea: hover on each provider for pros/cons, welcome blurbs explaining what AI can do for Iris. Defer until app is mostly nailed down
7. **Most pages information-overload** — priority-order pass across Dashboard / Budget / Investments. Visual hierarchy needs work
8. **PaycheckBreakdown waterfall** — currently demoted but math runs on `paycheck` setting which is zeroed for fresh users; collapsed by default so not visible

### Packaging sprint (its own session, multi-day)
- Tauri shell setup (Mac + PC)
- IndexedDB → SQLite migration with one-time importer
- Signed installer build
- First-run wizard (cloud LLM key OR local Ollama)
- Auto-updater (Tauri built-in, signed manifest)
- Lightweight license-key check

## Workflow rules (locked this session)

1. **Pause and ask before building, even on fix-on-fly.** Scott explicitly called this out — UX decisions especially. Don't just pick a pattern and ship it.
2. **Two work streams:**
   - **Fix-on-fly:** spotted-during-QA bugs that might cascade. Fix immediately.
   - **Rolling backlog:** polish, redesign, real-but-contained issues. Log it, batch later.
3. **QA pattern that's working:** Scott walks the app → screenshot or describes weirdness → fix in real-time. Don't pre-plan tests; let real bugs surface.

## Model routing strategy

| Mode | Model | Why |
|---|---|---|
| Routine QA cycles (~80% of remaining work) | **Sonnet 4.7 high** | Spot-bug-fix-bug loops. Sonnet at ~1/3 cost, indistinguishable for surface fixes |
| Diagnostic mode (non-obvious bug, suspect deeper rot) | Opus 4.7 extra-high | Worth the cost when "why does this happen" matters |
| UX decisions that compound (new flows, multi-step interactions) | Opus 4.7 extra-high | Verification-flow-quality decisions belong here |
| Architecture / packaging | Opus 4.7 extra-high | Hard problems with cross-cutting impact |
| Mass cleanup, batch edits | Sonnet 4.7 high | Mechanical |
| Strategic brainstorms (like the locked architecture session) | Opus 4.7 extra-high | Depth pays off |

**Switching mid-conversation works seamlessly** — no packet loss. When Scott describes a task, Claude should help flag whether it's a depth-needs-Opus problem or a mechanical-Sonnet-fine problem.

## Where we are right now (start-of-next-session state)

- Dev server running on port 5173
- IndexedDB wiped clean (Scott will refresh his browser to walk through fresh-user flow)
- Profile = empty, no accounts, no transactions, no API keys
- Welcome screen, step 1 of 5 ready
- Scott has Gemini API key ready to test the new verification UX during his walkthrough
- All hardcodes audited and either stripped (defaults), moved to sample data (loadable), or made dynamic (driven from profile)

## Files modified this session (high-touch list)

- `src/types/budget.ts` — IncomeSource, InflowDecision, Earner, NotificationPreferences, BucketGroup types
- `src/stores/budgetStore.ts` — DB v4, new accessor functions
- `src/stores/budgetDefaults.ts` — sample* exports + neutral default* exports
- `src/stores/defaultData.ts` — same split
- `src/stores/portfolioStore.ts` — saveUserProfile singleton fix
- `src/utils/incomeDetector.ts` — base/variable/bonus/reimbursement/dividend classification
- `src/utils/reimbursementMatcher.ts` — subset-sum with escalating window + temporal-proximity tie-breaker
- `src/utils/triggerDetector.ts` — pace warnings, surplus, classification triggers, group-flex support
- `src/utils/dynamicActions.ts` — fully gated on user data, no Scott-specific items
- `src/services/sampleData.ts` — loadSampleData + clearAllUserData
- `src/services/llm/index.ts` — testProvider function
- `src/views/OnboardingView.tsx` — user-creation step + verify/retry/continue-anyway flow
- `src/views/DashboardView.tsx` — dynamic greeting, dynamic equity labels
- `src/views/SettingsView.tsx` — wired UserManagementPanel + SampleDataPanel + HouseholdEarners + NotificationSettings
- `src/views/FirstReportView.tsx` — dynamic greeting
- `src/components/Auth/LockScreen.tsx` — reads users from store
- `src/components/Layout/AppShell.tsx` — generic avatar
- `src/components/Budget/IncomeSources.tsx` — main panel with detection + reimbursement matching surfaced
- `src/components/Budget/InflowQuestions.tsx` — disambiguation prompt
- `src/components/Budget/TriggerCenter.tsx` — trigger card display
- `src/components/Budget/BucketGroupsManager.tsx` — group + flex toggle
- `src/components/Budget/RecurringBills.tsx` — already shipped earlier in session
- `src/components/Settings/HouseholdEarners.tsx` — cold-start wizard
- `src/components/Settings/NotificationSettings.tsx` — tier toggles
- `src/components/Settings/UserManagementPanel.tsx` — add/remove users + PIN
- `src/components/Settings/SampleDataPanel.tsx` — load/clear buttons
- `src/context/AppDataContext.tsx` — auto-sync on launch
- `src/App.tsx` — lock screen opt-in, dynamic activeUser

## Architecture references

The 8 locked decisions live in [project_iris_budget_architecture.md](project_iris_budget_architecture.md). They were verified ahead of Monarch/YNAB/Copilot/Rocket on 7 of 8.
