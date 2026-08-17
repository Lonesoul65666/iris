# Iris — Gamification & AI Quest Engine (vision brief)

> A portable summary of what we're building, why, and how — written to be dropped
> into another tool (Gemini, a lighter model, etc.) for riffing. Assumes no prior
> context on Iris. Author: Scott + Claude, 2026-07-19.

---

## 1. What Iris is

Iris is a **self-hosted personal-finance app for a couple** (Scott + Claire). It's
not SaaS — it runs on a home host, reachable privately (Tailscale), data lives in
the couple's own Postgres. It connects to real accounts (via Plaid) and pulls
transactions, balances, and investment/net-worth data automatically.

It started **engineer-driven and surgical** — a precise budget engine. It's now
growing two more legs: **gamification** (make money fun, for both partners) and an
**AI layer** (Iris can be asked about your money and answer with real analysis).

The core budget metric: a **guaranteed base** of ~$15,800/mo (the steady income
floor). "Are we living under our base, month over month, and what have we banked?"
Variable/bonus income is treated as surplus on top. This "base" is the frame for
everything.

## 2. The north star / mission

**Money is a top source of conflict and divorce for couples. Make it not suck —
turn budgeting-together from a fight into a cooperative game with a victory lap.**
If it works for Scott + Claire, it could genuinely help other couples. That's the
emotional core, and it's the tie-breaker for every design decision.

**And the HOW (Scott, 2026-08-12):**

> **Use AI to drive engagement, fun, and understandable narrative around finances,
> to help couples grow and win together.**

This is a *mandate*, not a fence — and it puts the AI **outside the numbers** by
construction. The finances are the given; the AI is the layer that makes them legible
and enjoyable. **"Understandable" is the real product claim** (every app promises
insight; almost none deliver comprehension) — which makes narrative a *mechanism*, not
decoration: story is how humans retain quantity. **"Together" is load-bearing** — one
story two people are in, told in *we/us*, able to name what the other partner did.
⚠️ **"Engagement" means *they want to come back*, NEVER *maximized time-in-app*** —
the second meaning is what later justifies "Claire hasn't checked in for 4 days."

Full treatment: `iris-front-and-center-design.md`.

Three pillars, in priority:
1. **Deepen the moat** — couples-cooperative money, an opinionated AI voice
   ("Iris's Take"), fun-money game, local-first/private.
2. **The big swing** — adult money **gamification** + **Proactive Iris** (the AI
   quest/nudge engine) as ONE project. ← this brief is mostly about this.
3. Catch up to big apps last (cash-flow calendar, subscription radar, etc.).

## 3. Design DNA (non-negotiables)

These constraints are load-bearing — riff *within* them:

- **⭐ THE NORTH STAR — design for the money-averse partner: "money is the mechanic,
  not the message."** Claire (Scott's wife) genuinely *hates* talking about money —
  making it fun for *her* is the entire reason the gamification exists. So: make the
  money **invisible** and the game **visible.** The **verbs are play-verbs** — catch,
  level, co-op, grow, keep the streak — **never finance-verbs** — budget, review,
  track, analyze. She's not "reviewing spending," she's "catching the thing before
  midnight." Dollar signs are *what you catch*; the experience never says "budget" at
  her. **The test for every quest/feature idea: "Would Claire, who hates money-talk,
  actually want to poke at this?" If it smells like a chore, it's dead.**
- **⭐ THE OTHER NORTH STAR — "same board, two games."** Scott *saves*, Claire
  *spends* — opposite-looking desires that are actually the SAME transactions viewed
  from opposite ends. So each partner gets their OWN Player-1 win-condition rendered
  from the same data:
    - **Scott's HUD:** banked / surplus over base / streaks / net worth (optimization).
    - **Claire's HUD:** unlocked / gifted / guilt-free pool grew / companion evolved /
      date-night drop earned (acquisition).
  Nobody is "Player 2." **And the key mechanic: for the spender, the reward must BE a
  spend.** Saved dollars become the currency she gets to spend on delightful things —
  *saving funds the fun of spending.* Her actual desire (spend) is wired as the engine
  of his actual desire (save). Crucially it is **NOT a trick played on her** — she
  genuinely gets to spend more, guilt-free, genuinely funded by real saving; both
  people actually win. The only thing "tricked" is the friction and the dread. **Every
  quest/reward is tested against BOTH HUDs, not just the saver's.**
- **Reward velocity, never restriction.** Reward *banked / swept / grew / streak-kept*
  — NEVER "you resisted / didn't buy." A quest that rewards not-spending is a diet in a
  Pikachu hat; it reads as policing and dies. (Anti-pattern to avoid: a "went 7 days
  without buying X" quest.)
- **95% autopilot — she claims, never works.** The backend runs on automated data; her
  only actions are *positive taps* (claim a win, confirm, send a gift). If she has to do
  budget *work* to move the game, she disengages. She's opening loot boxes made by money
  already saved — not managing the engine.
- **Dopamine-per-dollar, maxed.** The reward-spend is a *small fraction* of the win
  (bank $500 → a $50 guilt-free drop) but the *celebration* is disproportionately big.
  Pokémon gives you three candies and makes it feel like a jackpot.
- **Guts-first, design-later.** Build the tested engine; defer the look/layout to
  one deliberate design pass once the full feature set exists.
- **Data-honest.** The AI and the UI narrate **computed truth**, never guesses.
  Detection over data-entry. If we can't source a number, we don't show it.
- **Anti-guilt soul + optional-but-rewarding cadence.** Iris rewards **consistency,
  not grinding** (à la Pokémon GO's streaks that don't reset on a missed day).
  Missing a day is fine; there's a "welcome back" pick-me-up, not a punishment. The
  cadence should feel like Pokémon's "a reason to poke at it before midnight" — an
  optional, rewarding check-in you *choose*, **never a nag or obligation.** Never a
  shame machine.
- **Cooperative — co-op against an external challenge, never each other.** The
  adversary is never one partner, and never "the budget as a scold" — it's an
  *external* thing you team up against (Pokémon GO: "fight the gym together"). Either
  partner can advance/finish a shared quest asynchronously ("she does part, I close it
  out, or vice versa") — low-pressure teamwork a money-averse partner can join without
  a "money conversation" ever happening. One partner's miss must NEVER cost the
  *other* (that breeds resentment/control). Shared goals = win-together; personal
  goals = self-contained. Reward-for-together, yes; punish-your-partner, never.
- **Self-hosted & private.** Two-person app. No multi-tenant plumbing.

## 4. The gamification stack (how the layers wire together)

Five layers, each rewarding against the one below it:

```
COMPANION / PET      ← the reward sink; grows as you stay consistent
   ▲ fed by
REWARDS (real $)     ← self-funded treats: "you earned this, spend it clean"
   ▲ unlocked by
QUESTS (AI-generated)← tasks that come TO you, on a cadence
   ▲ completion produces
MOMENTS              ← repeatable wins (mostly monthly); the heartbeat
   ▲ tally into
ACHIEVEMENTS         ← permanent, one-and-done, tiered; the trophy wall
```

- **Achievements** = the monument. Permanent, earned once, tiered
  (bronze→platinum). E.g. net-worth milestones ($1M, $2M…), "banked $100k". Fire a
  full-screen celebration. *(Built.)*
- **Moments** = the heartbeat. Repeatable, mostly-monthly wins that celebrate every
  time and **tally** over time ("Beat the Clock ×22"). v1 catalog: Beat the Clock
  (month under base), Both Banked (both partners under fun-money allowance), Held
  the Line (solo fun win), Goal Crushed (bought a Want-To in cash). They surface as
  quiet cards, and their *counts* roll up to unlock Achievements. *(Engine built;
  collection grid + count-achievements next.)*
- **Quests** = the draw (see §5). *(Vision.)*
- **Rewards** = the payoff (see §6). *(Vision.)*
- **Companion** = the ambient hook (see §7). *(Vision.)*

## 5. The AI Quest Engine (the star)

**The insight:** in Pokémon GO, the quests come **TO you** — the game hands you
bite-sized, achievable, *rewarded* tasks on a cadence, so you have a reason to log
in. A static budget can't do that. But an **AI that reads your actual spend can**:
*"Iris noticed dining crept up → this week's quest: hold dining to $X."*

Pokémon GO mechanics we're mirroring:
- **Field Research (daily/weekly small tasks)** → weekly AI-generated quests.
- **Research Breakthrough (7 stamps → reward box; stamps DON'T reset on a missed
  day)** → a monthly "breakthrough" from weekly wins. The no-reset rule matches our
  anti-guilt soul exactly.
- **Special Research (multi-step story questlines)** → multi-month "sagas" Iris
  authors (e.g. "The Emergency Fund Saga," staged, big payoff).
- **Buddy** → Iris herself, a companion that levels with you.
- **Pokédex** → the Moments collection grid (gotta-fill-'em-all).

### The architecture that makes it real (and also fixes "comparative analysis")

Today the AI gets a **fixed pre-flattened text blob** of data, once per message.
That's fine for "how did June go" but breaks for anything we didn't pre-anticipate
("correlate my dining with paycheck timing," "compare Amazon's growth rate to my
income's over 12 months"). LLMs are also **bad at doing math in free text** — they
produce plausible-but-wrong numbers.

**The unlock is tool-calling:** give the LLM the ability to *ask Iris* for a
specific computed comparison on demand. The LLM says "give me category X by month
for 12 months" or "compute correlation between Y and Z"; **Iris runs the real math
in code** and hands back grounded numbers; the LLM **narrates those** — never does
arithmetic itself. Same "AI narrates computed truth" philosophy the whole app runs
on, extended so the model asks for the *specific* slice instead of us guessing.

**This one backbone powers BOTH:**
- **Sophisticated comparative analysis** ("tear my finances apart and put them back
  together with different variables") — the thing that makes Iris more than a dumb
  chatbot.
- **The Quest Engine** — generating quests requires computing grounded numbers about
  your behavior to hand to the LLM. Same infrastructure. Build once, used twice.

Note on **local (Ollama) vs hosted models**: local is the *privacy/no-rate-limit*
option, NOT the more-powerful one. Hosted Gemini/Claude are stronger at multi-step
reasoning than anything runnable locally today. So local isn't the lever for "heavy
analytical lifting" — the tool-calling architecture is.

## 6. The stakes & rewards model

**The stake (penalty), done non-evil:** miss a monthly quest → your rollover fun
money **sweeps into savings** instead of rolling over as spendable. That's not a
loss — it's a **redirect**. Worst case of "failing" = you saved money. Incentive
aligned with outcome. (And per §3: personal stakes stay self-contained; shared
stakes are win-together, never one partner penalizing the other.)

**The reward (carrot), self-funded:** wins → **real rewards drawn from money you
actually saved** — never phantom money. Iris only offers a treat it can *source the
dollars for*. The reward's real job is **permission to enjoy without guilt** — the
guilt-tax on spending is what makes money suck for disciplined savers. "You banked
$150 → go book the dinner, here's where it comes from." Prefer **experiences tied to
existing Want-To goals** over raw "+$50." Iris sizes and sources it. **Couple
rewards** = a shared win funds a shared treat (date night) — the healthy
positive-cross-partner inverse of the ruled-out punishment.

## 7. The companion / pet

The ambient, always-there emotional hook (Pokémon GO's Buddy) and the **reward
sink** — quests/Moments earn things that feed and evolve it. **Open question:** a
literal creature (fun, risks feeling infantilizing for adults) vs. an **abstract
growth thing** (a money tree/garden, a city you build, a constellation that fills
in). Leaning abstract for two adults tracking net worth. The cheese lives entirely
in the art — a deferred design decision.

## 8. Current state (built vs. vision)

**Built & live:** budget engine (base/surplus/banked, safe-to-spend), net worth
(real, via Plaid), Achievements system (incl. net-worth milestone celebrations +
replay + a synthesized celebration chime), Moments engine + a live current-month
"Beat the Clock" quest card, subscription watchdog, auto-refresh, auth, private
hosting. AI chat ("Ask Iris") that now reads real per-month actuals.

**Vision (not built):** the AI Quest Engine, the tool-calling analytical backbone,
the stakes/reward mechanics, the companion, and the full design pass that makes it
all cohere on the page.

## 9. Open questions to riff on

1. What's the right **quest cadence** — weekly tasks + monthly breakthrough, or
   something else? How many active quests at once before it's noise?
2. What makes a quest **feel good vs. feel like a chore**? (PoGo's are trivially
   achievable — is "hold dining to $X" too much like a diet?)
3. How does Iris **decide which quest to generate** from your data without feeling
   nagging or arbitrary? What's the tone?
4. The **companion**: creature vs. abstract? What does it *do* — purely cosmetic
   growth, or does it unlock things?
5. **Sagas** (multi-month questlines): what are good real-money story arcs beyond
   "emergency fund"?
6. How do we keep the whole thing **cooperative and warm** — a game Claire *wants*
   to play — without it ever feeling like surveillance or a scold?
7. What's the **tool-calling API surface**? What computed queries should the LLM be
   able to ask Iris for? (by-month, by-category, correlations, rate-of-change,
   what-if projections…)
