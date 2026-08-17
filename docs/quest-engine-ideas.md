# Quest Engine — raw ideas board (for triage)

> A working scratchpad of ideas from the 2026-07-20/21 riffing session (Scott +
> Claude + Gemini). Deliberately UNSORTED — good, bad, and half-baked all live here.
> Next session: bounce more against the wall, then triage with Claude (who has the
> build-feasibility context) into keep / cut / park. Locked principles live in
> `gamification-vision.md`; this is the messy front-of-house.

Status tags: 🟢 strong candidate · 🟡 needs work · 🔴 flagged risk / likely cut ·
💡 raw / unsorted

---

## Locked frames (decided — see gamification-vision.md for full text)
- ⭐ **Money is the mechanic, not the message** — design for money-averse Claire;
  play-verbs not finance-verbs.
- ⭐ **Same board, two games** — saver (Scott) and spender (Claire) each get their own
  Player-1 HUD from the same data. **For the spender, the reward must BE a spend:
  saving buys the fun.**
- **Reward velocity, never restriction** (no diet-in-a-Pikachu-hat).
- **95% autopilot — she claims wins, never does work.**
- **Dopamine-per-dollar maxed** — small real spend, huge celebration.
- **Co-op against an external challenge, never each other** (async finish; no
  cross-partner punishment).
- **Optional-but-rewarding cadence, never a nag.**

## Candidate mechanics
- 🟢 **Gifts / Buddy sending** (from Gemini — best new idea). Iris logs a passive win →
  drops a "gift" in your inventory → you *send it to your partner*, which triggers a
  real micro-perk for them (e.g. $15 to their guilt-free coffee fund) + a custom theme.
  Dopamine for *giving* your partner a win. Positive-cross-partner; directly serves the
  spender (she gets to "spend"/give). Also a candidate **Player-2 antidote** (she has
  agency — she gives, not just receives).
- 🟢 **Guilt-free spend pool that grows by saving.** The more the household banks, the
  bigger Claire's guilt-free pool — saving directly funds her spending. (Extends the
  existing fun-money system — the seed already exists.)
- 🟢 **Companion / "money garden" that evolves** as you stay consistent. Reward sink.
  Abstract-vs-creature still open (leaning abstract for adults). Claire could have her
  OWN companion/track (agency → co-owner, not Player 2).
- 🟡 **Monthly "Battle Pass" level 1→100 track.** Continuous forward momentum; leveling
  unlocks positive milestones (themes, companion stages, real-world reward drops).
  Needs: what earns XP (banked weeks, passive Moments) without becoming a grind.
- 🟡 **Real-world reward "drops"** (date night, a treat) that Claire *chooses/sets* —
  agency is the Player-2 antidote. Self-funded from real surplus.
- 💡 **Themes / cosmetics as unlockables** — cheap dopamine, purely positive.

## Candidate quests (reskinned — play-verbs, no finance words shown)
- 🟢 **"Vault Overcharge"** — banked surplus over the ~$15,800 base for the month.
  (Velocity reward — keeper.)
- 🟢 **"Co-Op Supply Drop"** — sweep $X of leftover discretionary cash into HYSA
  *together* (dual-confirm). (Velocity + co-op — keeper.)
- 🟡 **"Clear the Radar"** — tag/confirm a few uncategorized transactions.
  (Maintenance, neutral — ok if it never feels like an audit.)
- 🟡 **"Radar Ping"** — 10-sec app-open just to view safe-to-spend, small XP.
  (Pure low-friction check-in — fine, but must reward *showing up*, not judging.)
- 🔴 **"Hold the Perimeter"** — reward for going N days without buying X.
  **CUT** — this is restriction/policing = the diet-in-a-Pikachu-hat anti-pattern;
  reads as "Scott is watching my shopping." (Gemini proposed it AND warned against its
  own pattern.)

## Open questions (next session)
1. **Quest cadence** — Scott floated **bi-weekly + monthly** quests. Weekly sprints +
   a monthly "breakthrough/saga"? How many active at once before it's noise?
2. **Multi-year shelf life** — a static list gets memorized in ~3 months. The answer is
   the **procedural AI generator** (tool-calling on live Plaid/Postgres data → spot
   anomalies/seasonality/emergent wins → fresh narrative skins). What's the minimum
   viable version of that?
3. **The Player-2 problem** (deepest risk) — Claire didn't build this; how does she
   become co-owner not conscript? Working answer: **agency + giving** (she chooses
   rewards, has her own track/companion, sends gifts) — not just claiming Scott's loot.
4. **Companion:** creature vs. abstract? Shared vs. one-each? What does it *do*?
5. **Sagas** — good multi-month real-money story arcs beyond "emergency fund" (trip
   fund, seasonal: summer camp / holiday travel defense).
6. **What earns XP / advances the game** without becoming a grind or a chore.
7. **Reward ratio / guardrails** — reward-spend as a fraction of the win; where's the
   line before "saving to spend" just becomes "spending"?

## Known build constraints (what Claude can/can't do — the triage filter)
- Needs the **tool-calling backbone** (LLM asks Iris for computed queries; Iris does the
  math; LLM narrates). Not built yet — it's the prerequisite for procedural quests AND
  comparative analysis. Build once, used twice.
- **Moments engine = the root** (built, source-agnostic). Quests are a NEW producer that
  feeds the same tallies — they compose, no rework.
- **Moments phase 4 (collection grid) = deferred** until quests are designed (it's the
  display case for all wins).
- **Forward-only** discipline; **no per-month skim tracking yet** (one Moment deferred).
- Free-Gemini-tier limits for heavy generation; local Ollama is weaker at reasoning.
- Two-person app; self-hosted; data in own Postgres.
