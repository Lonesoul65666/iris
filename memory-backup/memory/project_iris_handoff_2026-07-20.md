---
name: project-iris-handoff-2026-07-20
description: "Iris handoff 2026-07-20/21 — READ FIRST (with [[project-iris-backlog]]). Big session: shipped milestone celebrations + trophy replay + first sound, Moments engine phases 1-3 (repeatable-wins layer + live current-month quest card), fixed the Ask Iris chat 'soul' (was blind to real data — now fed per-month actuals vs the $15,800 base), disabled the Supabase Data API (closed 12 security findings), fixed a host env-load bind gotcha. Then a long Quest-Engine design riff. All shipped code pushed to origin/master. Now: concept-designing the AI Quest Engine (the big swing)."
metadata:
  node_type: memory
  type: project
  originSessionId: b5b6daf6-8dcb-4cc3-8b06-70219bf8d84b
  modified: 2026-07-21T13:29:27.447Z
---

# Iris handoff — 2026-07-20/21 · READ FIRST (+ [[project-iris-backlog]])

Supersedes [[project-iris-handoff-2026-07-18]] as read-first (its content still valid).
Repo `C:\Claude\projects\signal\signal-app` on **master**, pushed (latest `f2a1470`).
Big multi-part session. Tests grew 316 → **341**, tsc + prod build clean throughout.

## What shipped + pushed this session (chronological)
1. **Milestone celebrations + trophy replay + first sound** (`e246936`). Net-worth
   milestone ladder $250k→$10M (`celebrationStyle: 'takeover'`, forward-only vs frozen
   baseline). Full-screen `CelebrationOverlay` (queue drains oldest-first) + **trophy
   REPLAY** (click any earned wall tile → relive w/ unlock date; the couples "you saw
   it, I didn't" case). Modal hygiene (Esc/autofocus/prefers-reduced-motion), confetti
   (live unlock only), "Next up: $X →" line, **synthesized Web-Audio chime** (Iris's
   first sound, opt-out toggle in Settings→Preferences). Fixed a `$1,001,842k`
   formatter bug live.
2. **Moments engine — phases 1-3** (`f568c76`). The repeatable-wins layer that
   complements the permanent Achievements wall. `src/utils/moments.ts`, pure/tested.
   v1 catalog: Beat the Clock, Both Banked, Held the Line, Goal Crushed (all from
   existing data). Forward-only + idempotent; tallies computed live. Celebrations route
   to quiet NudgeCards (NOT takeover). **Live current-month quest card** on the
   dashboard ("Beat the Clock — $X buffer, N days left, on track"). Extracted
   `funMonthlyResults` in gamification.ts as shared source. **Phases 4-5 (collection
   grid + count-based achievements) NOT built — grid deliberately deferred until the
   Quest Engine is designed.**
3. **Ask Iris "soul" fix** (`f2a1470`). The chat was blind: `buildPortfolioContext`
   (src/services/gemini.ts) fed the LLM only a budget PLAN + averages, so it mislabeled
   the **$13,397 bucket sum** as "your budget", had no per-month actuals, and said
   "upload documents". Fix: added a transaction-grounded `performance` block
   (guaranteed base $15,800, per-month actuals table, current-month MTD/buffer/safe-to-
   spend/days-left) from `computeScorecard(rawExpenses)`; relabeled the bucket sum as
   "category budget (planning detail — NOT the income frame)". **One builder covers all
   4 providers** (Gemini + router for Claude/OpenAI/Ollama). Verified LIVE: "how did I
   do in June?" → "$14,371 spent, $1,429 under your $15,800 base, banked $2,911".
4. **Security:** disabled the **Supabase Data API** (Project Settings→API→"Enable Data
   API" OFF) — Iris uses a direct `DATABASE_URL` connection (role `postgres`, bypasses
   RLS), never PostgREST, so the public REST API was pure unused attack surface. Closed
   all 12 Security Advisor findings. See [[project-iris-backlog]] security note.
5. **Host bug fixed:** "REFUSING LAN bind" + timeout was NOT data loss — the standalone
   server launched from the wrong cwd so `--env-file=.env.local` didn't load → no
   DATABASE_URL → connection-string prompt + loopback-only bind. Fix = launch from app
   root; harden the Startup launcher to `cd` in first. DB + accounts were fine.

## Where we are now: designing the AI QUEST ENGINE (the big swing)
Not building yet — **riffing/architecting**. This is the north-star "Proactive Iris"
layer. Three design docs written this session (also copied to
`C:\Users\ScottDeluke\Documents\Iris-Context\` for dropping into other models):
- `docs/iris-project-state.md` — full app catch-up (what/how/interconnections/limits).
- `docs/gamification-vision.md` — the Quest-Engine deep dive + LOCKED principles.
- `docs/quest-engine-ideas.md` — the raw unsorted idea board for triage.

**Breakthrough principles locked this session (in gamification-vision.md):**
- ⭐ **"Money is the mechanic, not the message"** — design for money-averse Claire;
  play-verbs (catch/level/co-op/grow) never finance-verbs.
- ⭐ **"Same board, two games"** — Scott saves, Claire spends; same transactions, two
  Player-1 HUDs (his = banked/surplus/streaks; hers = unlocked/gifted/pool-grew).
  **For the spender, the reward must BE a spend — saving buys the fun.** NOT a trick
  played on her; both genuinely win.
- **Reward velocity, never restriction** (no diet-in-a-Pikachu-hat / policing quests).
- **95% autopilot — she claims wins, never does work.**
- **Dopamine-per-dollar maxed** (small real spend, big celebration).
- Best new mechanic (from a Gemini riff): **Gifts/Buddy sending** — send your partner a
  win that triggers a real micro-perk for them (positive-cross-partner + spender agency).
- Deepest risk: the **"Player 2 in a game Player 1 engineered"** problem — antidote is
  Claire's **agency + giving** (she chooses rewards, own track, sends gifts).

## Methodology (Scott's, confirmed)
Guts-first: build tested ENGINES now (keep-forever), defer PRESENTATION/layout to one
design pass later. Riff wide in voice models (Gemini/ChatGPT) + paste back here where
Claude has full build-feasibility context to integrate/triage. Scott can't voice-chat
Claude (text only here); he dictates in, reads out. Work laptop lost Fable access.

## Immediate next steps (next session)
- Triage the `quest-engine-ideas.md` board (keep/cut/park) against build feasibility.
- Resolve open questions: cadence (bi-weekly + monthly?), the Player-2 antidote, the
  companion (creature vs abstract, shared vs one-each), sagas, XP source.
- The real prerequisite to BUILD anything: the **tool-calling backbone** (LLM asks Iris
  for computed queries → Iris does the math → LLM narrates). Same backbone unlocks
  sophisticated comparative analysis. Build once, used twice.
- Then: Moments phase 5 (count-achievements, safe anytime) and eventually phase 4 (grid).

## Gotchas (still current)
- `npx tsc` outside the app dir hits a squatter — `cd /c/Claude/projects/signal/signal-app` first.
- Frontend changes need host rebuild + hard-refresh (Ctrl+Shift+R); server changes need restart. The soul fix + celebrations + moments are all client-side (no restart).
- Push to master needs explicit in-session user OK (classifier blocks git push; user must approve the prompt). Docs in `docs/` written this session are NOT committed.
- Dev server on this machine now requires login (shared-DB auth); Claude can't log in (won't enter passwords).
