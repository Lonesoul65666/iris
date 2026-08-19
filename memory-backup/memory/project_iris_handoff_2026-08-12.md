---
name: project-iris-handoff-2026-08-12
description: "Iris handoff 2026-08-12 — READ FIRST (with [[project-iris-backlog]]). Design + review session, NO CODE WRITTEN. Fresh-eyes code review found 5 things (chat is unreachable behind PHASE_1_LOCK; SYSTEM_PROMPT is still the old market-intelligence persona; two-HUD has rails but no product; ~7,400 lines of dead Signal ancestry). Locked the mission sentence, the 3-rung engagement ladder, the Iris voice-rail, narrative mechanics. REVISED BUILD ORDER: rail+persona → quests → backbone (was backbone first). Plus Scott's month-rollover bug list: achievements fire too early (no settle lag), cash-out categorization inconsistent, no dispute state on transactions."
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-13T04:08:05.864Z
  originSessionId: 68757d78-ee6c-4aab-9400-0cc28ab33a62
---

# Iris handoff — 2026-08-12 · READ FIRST (+ [[project-iris-backlog]])

Supersedes [[project-iris-handoff-2026-07-20]] as read-first (its content still valid).
Repo `C:\Claude\projects\signal\signal-app` on **master**, still at `f2a1470` —
**no code was written this session.** Verified healthy: `tsc` clean, **341/341 tests
pass** in 5s.

This was a **review + design** session. Three new docs written (uncommitted):
- `docs/iris-front-and-center-design.md` — the full design lock (the star doc).
- `docs/data-integrity-queue-2026-08.md` — Scott's bug list, each item pinned to code.
- `docs/gamification-vision.md` — §2 amended with the mission sentence.

## ⭐ The mission sentence (Scott's words — now the persona brief)

> **Use AI to drive engagement, fun, and understandable narrative around finances, to
> help couples grow and win together.**

The **how** under the existing **why**. It's a *mandate not a fence* — puts the AI
outside the numbers by construction. **"Understandable" is the real product claim**
(everyone promises insight, nobody delivers comprehension) → narrative is a
*mechanism*, not decoration; story is how humans retain quantity. **"Together"** = one
story two people are in, told in *we/us*, able to name what the partner did.
⚠️ **"Engagement" = they want to come back, NEVER time-in-app maximized.**

## ⭐ Design locked this session

**1. Bring Iris to the front — as a voice-RAIL, not a chat box.** Scott's ask was "chat
on every screen + pull data + navigate." The trap: a persistent blank composer is a
**work surface**, which violates "95% autopilot — she claims, never works." So invert
it: **what's persistent is Iris *speaking*, not a box *waiting*.** Default state = her
latest utterance (quest/nudge/win/real number) + a small reach-for-it input. Full
composer stays in `ChatView`. Form factor = **slim rail** (only option that can be
ambiently co-present *and mostly silent*; a drawer is modal-ish, a bottom bar reads as
a composer). **Discipline: Iris speaks only when she's earned it — silence is a designed
state.** This is NOT a detour — it's the **delivery channel** quests/Moments need.
**Cheap:** `ChatView.tsx` is a 126-line thin shell; all state already lives in
`AppDataContext`, input is local → extract `<IrisChat>`, mount in `AppShell`, no state
migration.

**2. The 3-rung engagement ladder** (one surface, three depths — NOT three modes):
- **Rung 1 "follow the ball"** — Iris leads, you tap. Claire's home. Needs *nothing* new
  from the LLM (quests computed in code; model only dresses them).
- **Rung 2 "ask about the ball"** — "why this quest?" Anchored to something she just
  said, so never a blank prompt. **This is what the tool-calling backbone is FOR.**
- **Rung 3 "tear it apart"** — full-screen, correlations. Scott's home. Mostly exists.
- **Rung 2 was the missing bridge** — without it Claire taps, Scott analyzes, no path
  between. 🚫 **NO MODE SWITCHER EVER** — a "Claire view/Scott view" toggle makes her
  Player 2 by construction. Rungs self-select by what you *do*. Depth is emergent.

**3. ⭐ REVISED BUILD ORDER (changed from the 07-20 plan):**
`rail + persona` → `quests` → `backbone`. **Was backbone-first; that was wrong** — it
means guessing the tool surface. The backbone's job is NOT general analytics (that's
rung 3, mostly built) — it's **answering follow-ups about a thing Iris just said**,
which is only enumerable once quests exist. Navigation-by-chat goes in as a *tool*
(`navigate_to`), not a throwaway directive parser.

**4. Narrative mechanics.** (a) **Dollar→tangible translation**: "$2,641 = 40% of the
theater room" — converts saving into spending-language on the spender's HUD for free.
Disciplines: source from their **real Want-To stashes** (never "88 lattes" — that's the
smug-blog genre) and **the math must be real** or it's invented-numbers in a costume.
(b) **Iris can give you a hard time** — a coach with no capacity for disapproval is a
useless cheerleader. 3 constraints: tease the **anomaly never the identity**; target is
**self or household, NEVER your partner**, dial is **per-person** and any ribbing is
**private to its recipient** (else Iris = Scott's nagging proxy = the Player-2 failure);
household misses are **"we."** (c) ⭐ **The "no good excuse" mechanic (Scott's, best idea
in the thread): Iris ASKS FIRST**, accepts the answer ("vet emergency" → dropped, no
grief); ribbing is earned by the **silence**, not the spend. Fair by construction, IS
rung 2, and it's data collection disguised as banter. (d) **→ Iris needs MEMORY** — chat
is stateless today; an Iris that asks about an anomaly then asks again next month is
worse than one that never asked. Needs a small durable store: anomaly → explanation →
date. **Parked open question: how much should she remember, and does she ever bring it
up unprompted?** (e) **Guardrail: the plot is COMPUTED, the prose is GENERATED** — quest
selection/thresholds/stakes/reward-sourcing all in tested pure code; the LLM never
picks the number. Claire gets **one** bad experience before the app is dead to her.

## 🔍 Code-review findings (fresh eyes — details in the design doc §5)

1. 🔴 **Ask Iris is unreachable.** `PHASE_1_LOCK = true`
   (`src/hooks/useEnabledModules.ts:32`) forces `investments:false`, and `chat` lives
   inside that gate → sidebar entry filtered (`AppShell.tsx:86`), FAB **dead**
   (`:256`), mobile nav filtered (`:274`). Only route in = clicking the Iris logo
   (`:124`). **Neither partner has been living with the chat** → no usage intuition.
2. 🔴 **The persona is still Signal's.** `src/services/gemini.ts:249` = *"You are Iris,
   a personal market intelligence AI"* + rules on tickers/trades/allocation
   tables/"show monthly AND annual impact"/"end with Next steps:". Exactly the
   chore-voice the vision calls fatal. **The 07-19 "soul fix" fixed the DATA, not the
   SOUL.** One const feeds all 4 providers (`:299`, `:385`, `:464`) → cheapest
   high-leverage fix in the project. The mission sentence is its new first paragraph.
3. 🟡 **Two-HUD has rails, no product.** `activeUser` IS plumbed auth→`AppDataProvider`
   (`App.tsx:139`) — the app knows who's looking (hard part done). But 25 refs / 5
   files, **not Dashboard**. ⚠️ Unlike Moments this is NOT deferrable-as-design:
   per-HUD quests are different quest objects, so **decide the person dimension at
   quest-schema time** — retrofitting it is the one piece that hurts later.
4. 🟢 **~7,400 lines of dead Signal ancestry** — Intelligence/Portfolio/Watchlist/
   FirstReport/Health views + portfolioIntelligence/marketIntelligence/newsApi/
   marketDataApi/insightsEngine/newsScanner + dead Teller sync (Teller shut down).
   `AppShell` still *computes* badges for unreachable tabs. Will muddy the tool-calling
   design.
5. 🟢 Model IDs a generation behind (`claude-sonnet-4-6`, `gpt-4o-mini`,
   `gemini-2.5-flash`). `DashboardView` = 1,050 lines / 56 components — "long" is now a
   blocker, not polish.
6. **Biggest risk isn't technical: the whole vision is a hypothesis about a person who
   has never used the app.** Cheapest de-risk = fix voice, un-hide chat, put one live
   quest in front of Claire, watch.

## 🐞 Scott's month-rollover bug list (full spec: `docs/data-integrity-queue-2026-08.md`)

**July was a WIN — they crushed it.** Two of these surfaced *because* the system worked.

1. 🔴 **Achievements/Moments fire too early — no settle lag.** `isCompleteMonth` is a
   pure string compare (`transactionAnalysis.ts:14`: `ym < currentMonthKey(now)`) →
   `savingsScorecard.ts:146` `partial` → gates Beat-the-Clock (`moments.ts:116`),
   streaks (`:169`), `gamification.ts:67`. So at 00:00 on the 1st the prior month is
   "final" — but Plaid settles 1–3+ days late. **Worse than cosmetic:** Moments are
   idempotent on `(type,periodKey,person)` and persist `magnitude`, so an early fire
   writes a wrong number the key then blocks re-firing → trophy permanently disagrees
   with the ledger → corrupts the Quest Engine's substrate. Fix = settle lag (display
   live, celebrate/log only after close) + an amend policy.
2. 🟡 **Cash-out categorization inconsistent.** `transactionCategorize.ts`: Venmo
   (`:71`)→`personal`, Zelle-out (`:72`)→`other`, ATM (`:73`)→`personal`; **Cash App
   isn't matched at all.** Want one cash-out/peer-transfer concept. ⚠️ Recategorizing
   retroactively re-scores months → can change which Moments qualify → do after the
   amend policy from #1.
3. 🔴 **No dispute state on transactions.** `Expense` (`types/budget.ts:70-91`) has
   `reimbursementStatus` but nothing for disputes. Scott's CC dispute was caught by the
   watchdog (worked!) and already settled, but couldn't be marked. Needs
   `disputeStatus` lifecycle + scorecard treatment (open→exclude visibly; won→exclude
   AND suppress the matching credit row or the month double-counts; lost→normal spend).
4. 🟡 **"Charges I can't realize going out"** — ⚠️ **ASK SCOTT WHICH:** (a) real charges
   missing from Iris's outflow = serious ingest/mapping bug understating spend, or (b)
   charges shown but untraceable = display/attribution. Get one concrete example first.
5. 🟢 "VA" capitalization in Spend-by-account (carried over; likely `txDisplay.ts:35-41`).
6. 🟡 Rollover freshness — possible rung-1 win: the rail says "July is closing, holding
   the scorecard until charges settle," turning a constraint into an honest narrative beat.

**Sequencing: #1 and #3 first** (they corrupt stored state), then #2, then #4 after the
clarifying question. **All of it before the Quest Engine** — quests reward against
Moments, Moments come from this data.

## Gotchas (still current)
- `npx tsc` outside the app dir hits a squatter — `cd /c/Claude/projects/signal/signal-app` first.
- Frontend changes need host rebuild + hard-refresh (Ctrl+Shift+R); server changes need restart.
- Push to master needs explicit in-session user OK. **`docs/` is still uncommitted** —
  now 5 files' worth (3 from 07-19 + 2 new + the vision edit).
- Dev server needs login (shared-DB auth); Claude can't log in (won't enter passwords).
- Standalone server must launch from the app root or `--env-file=.env.local` misses.
