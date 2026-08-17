# Iris — Complete Project State

> A full catch-up doc for an outside model (Gemini, etc.) with ZERO prior context.
> Explains what Iris is, everything built, how it's wired, where we are now, and the
> gamification challenge we're solving. Pair with `gamification-vision.md` (the
> Quest-Engine deep dive). Author: Scott + Claude, 2026-07-19.

---

## 1. Elevator

**Iris** is a **self-hosted personal-finance app for one couple** (Scott + Claire).
Product name = *Iris*; the code repo is named *signal* (app dir `signal-app`). It is
**not SaaS** — it runs on a home host, is reachable privately over Tailscale, and all
data lives in the couple's own Postgres database. It connects to real financial
accounts and pulls live data. It started as a precise budget engine and is growing
two new legs: **gamification** (make money fun for both partners) and an **AI layer**
(ask Iris about your money, get real analysis).

## 2. Mission (the "why")

**Money is a leading source of conflict and divorce for couples. Iris's goal is to
make money *not suck* — to turn budgeting-together from a fight into a cooperative
game with a victory lap.** If it works for Scott + Claire, it could help other
couples. This thesis is the tie-breaker for every design decision.

The governing budget metric: a **guaranteed base** of ~$15,800/mo (the steady income
floor). The core question is *"are we living under our base, month over month, and
what have we banked?"* Variable/bonus income is surplus on top. This base is THE
frame everything is measured against.

## 3. What's been built (feature inventory)

**Budget engine (the original core):**
- Base / surplus / banked math; per-month scorecard; "safe to spend" for the current
  month; budget "lanes"; category buckets.
- **Stashes** (goal savings, split Have-To vs Want-To); **fun money** per partner
  (each gets an allowance; a gamified head-to-head "who banks more" race).
- Couples data model: spend attribution per person, account owners, multiple earners.

**Data connectivity:**
- **Plaid** integration pulls transactions, balances, and investment accounts.
  (Migrated off Teller, which shut down its API in 2026.)
- **Net worth is real and complete** (~$1.0M): bank + all investment accounts
  (Fidelity 401k/brokerage) + home equity + car. Crossed $1M on 2026-07-18.
- Coinbase (crypto) and Robinhood are **not yet** wired to net worth — next up.
- Auto-refresh: a 12-hour host timer + an on-open sync (no manual clicking).

**Achievements system:**
- Forward-only, tiered (bronze→platinum) permanent trophies. "Forward-only" =
  progress made only AFTER you started using Iris counts; whatever you'd already
  achieved is your start line, not a freebie.
- **Net-worth milestone celebrations** ($250k→$10M) with a full-screen takeover,
  **trophy replay** (click any earned trophy to relive it — a couples feature so one
  partner can see a moment the other caught), confetti, and a synthesized celebration
  chime (the app's first sound). *(Shipped this session.)*

**Moments (the repeatable-wins layer):**
- Repeatable, mostly-monthly wins that celebrate every time and **tally** over time
  ("Beat the Clock ×22"). Lighter than achievements; their counts roll up to unlock
  achievements. v1: Beat the Clock, Both Banked, Held the Line, Goal Crushed.
- A **live current-month quest card** ("Beat the Clock — $X buffer, N days left").
- *Phases 1–3 shipped; 4–5 (a collection grid + count-based achievements) pending.*

**AI layer ("Ask Iris"):**
- A chat that answers questions about your money, routed through an **LLM router**
  supporting Gemini (default, web-grounded), Claude, OpenAI, and local Ollama.
- Just fixed (2026-07-19): the chat now receives **real transaction-grounded
  per-month actuals** framed against the $15,800 base — previously it only saw a
  budget plan + averages and gave wrong/evasive answers.
- "Iris's Take" = an opinionated coach voice; explain-the-why grounding.

**Other:** subscription watchdog (catch/cancel/ignore recurring charges), weekly
briefing / "this week's focus", what's-new card, tutorial, onboarding wizard.

**Infrastructure:** real session auth (login, lockout, password rules, session
expiry); an always-on host (Scott's other PC) with Startup auto-launch; **Tailscale
Funnel** for private remote access; **Supabase Data API disabled** (Iris uses a
direct DB connection, so the public REST API was an unused attack surface — closed).

## 4. Architecture (how it's built)

**Frontend:** React + Vite (TypeScript). Views: Dashboard, Budget, Achievements, Ask
Iris (chat), Settings. Tailwind-style utility CSS. State via a big `AppDataContext`.

**Backend:** a **standalone Node server** (`server/standalone.ts`) serves the built
client and hosts `/api/*` routes; in dev, Vite middleware plays the same role. Node
loads secrets from `.env.local` via `--env-file` (must launch from the app root).

**Storage:** the couple's **own Postgres** (Supabase-hosted, connected by direct
`DATABASE_URL` as role `postgres`). Three shapes: a `collections` table (JSON blobs
keyed by name — buckets, stashes, expenses, snapshots, etc.), a `settings` table
(JSON per key — profile, API keys, achievements_unlocked, moments_log, etc.), and
auth tables (`auth_accounts`, `auth_sessions`, `users`).

**Data pipeline:** Plaid → server sync → normalized → stored in Postgres → client
reads via `/api` → **pure functions** compute everything (scorecard, gamification
state, moments, achievements) from raw expenses + accounts. Heavily tested (341
tests). Nothing is hand-entered that can be detected.

**AI pipeline:** client-side services (`gemini.ts` + `LLMRouter`). A single function,
`buildPortfolioContext`, assembles the data payload the LLM sees — **one builder
feeds all four providers.** Provider API keys live in `settings`. The chat calls the
provider directly; Iris never proxies the calls.

## 5. How it all interconnects (the philosophy)

The spine is **"compute the truth once, everything derives from it."** Raw expenses +
accounts → the scorecard → which feeds gamification, moments, achievements, the
dashboard, AND the AI's context. The AI **narrates computed truth**; it doesn't
invent numbers. This "detection over data-entry, AI narrates computed truth" rule is
the connective tissue — and it's exactly what the Quest Engine will extend.

## 6. Where we are RIGHT NOW

Foundation is healthy and live. This session shipped the milestone celebrations,
Moments 1–3, the security + host fixes, and the AI "soul" fix. **Moments 4–5** (grid
+ count achievements) is a small paused remainder. We are now **concept-riffing the
AI Quest Engine** — the big swing.

## 7. The gamification challenge (the Pokémon GO idea)

**The problem:** a static budget has no *draw*. It doesn't give you a reason to open
it, and it's a solo chore. We want the opposite — something a couple *wants* to check,
together, that creates small dopamine hits for good money behavior.

**The muse: Pokémon GO.** Its genius is that **quests come TO you** — it hands you
small, achievable, *rewarded* tasks on a cadence, so you have a reason to log in. It
rewards **consistency, not grinding** (its weekly "breakthrough" stamps don't reset
on a missed day). We want to translate those loops to money:

| Pokémon GO | Iris translation |
|---|---|
| Field Research (small daily/weekly tasks) | Weekly AI-generated quests ("hold dining to $X this week") |
| Research Breakthrough (7 stamps → reward) | Monthly breakthrough from weekly wins |
| Special Research (story questlines) | Multi-month "sagas" (e.g. an emergency-fund arc) |
| Buddy (a companion that grows) | Iris herself / a companion or "money garden" that evolves |
| Pokédex (collect 'em all) | The Moments collection grid |
| Streaks / loss-aversion | Under-base + fun-money streaks (already exist) |

**The gamification layer stack** (each rewards against the one below):
Achievements (permanent wall) ← Moments (repeatable heartbeat) ← Quests (AI, come to
you) ← Rewards (real, self-funded) ← Companion (ambient hook). See
`gamification-vision.md` for the full treatment, including the stakes model
(miss a quest → fun money redirects to savings = a nudge, not a loss) and the reward
model (wins fund real treats you already saved for = *permission to enjoy* guilt-free).

## 8. Limitations (given our architecture)

- **The AI can't do arbitrary comparative analysis yet.** It receives a *fixed,
  pre-flattened* data blob once per message. Great for "how did June go," useless for
  "correlate dining with paycheck timing." LLMs also do math badly in free text.
  **The fix is a tool-calling backbone** (§9 advantages) — not yet built.
- **Local (Ollama) models are weaker at reasoning** than hosted Gemini/Claude — local
  is the privacy/no-rate-limit option, not the horsepower one.
- **Forward-only gamification** — no true retroactive history (pre-tracking net-worth
  curve is a flat estimate; historical months seed tallies but don't retro-celebrate).
- **No per-month "skim to savings" tracking yet** (one planned Moment deferred).
- **Two-person app** — deliberately no multi-tenant plumbing.
- **UI is "bones"** — guts-first; the dashboard is getting long; a deliberate design
  pass is deferred until the feature set stabilizes.
- **Free Gemini tier** rate/quality limits for heavy analysis.
- **New-account inflation guard pending** — connecting Coinbase/Robinhood could
  falsely fire a net-worth milestone until we re-baseline; flagged, deferred to that
  work.

## 9. Advantages (given our architecture)

- **All data in one owned Postgres**, real-time via Plaid, device-agnostic, private.
- **Pure-function computation** → testable, deterministic, data-honest.
- **One AI context builder** feeds all four providers — fix once, fixed everywhere.
- **Self-hosted + Tailscale** → private, no SaaS costs, full control.
- **The tool-calling backbone we need for the Quest Engine is the SAME thing that
  unlocks sophisticated comparative analysis.** Build once, used twice: let the LLM
  *ask Iris* for a specific computed comparison, Iris runs the real math, the LLM
  narrates grounded numbers. This is the single highest-leverage architecture piece.
- **Moments + tallies already exist** as a ready-made *reward substrate* for quests.
- **An opinionated AI voice + couples model** already differentiate Iris from generic
  budgeting apps — the game sits on top of a real, honest engine.

## 10. What we're solving next (riff targets)

1. Quest **cadence** (weekly tasks + monthly breakthrough?) and how many at once.
2. What makes a quest **feel good vs. a chore** (avoid "financial diet" vibes).
3. How Iris **chooses** which quest to generate from your data — tone, not nagging.
4. The **companion**: literal creature vs. abstract growth (money tree / city /
   constellation)? What does it *do*?
5. Good multi-month **saga** arcs beyond "emergency fund".
6. Keeping it **cooperative and warm** — a game Claire *wants* to play, never a scold
   or surveillance.
7. The **tool-calling API surface**: what computed queries should the LLM be able to
   request (by-month, by-category, correlations, rate-of-change, what-if)?
