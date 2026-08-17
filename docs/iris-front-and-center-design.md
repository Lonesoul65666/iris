# Iris, Front and Center — design session 2026-08-12

> Design decisions from the "bring Iris to the front" session. Supersedes nothing;
> extends `gamification-vision.md` (the DNA) and `iris-project-state.md` (the
> inventory). Author: Scott + Claude, 2026-08-12.
>
> **Status: DESIGN LOCKED, NOT BUILT.** No code written this session.

---

## 0. The mission sentence (Scott's words, 2026-08-12)

> **Use AI to drive engagement, fun, and understandable narrative around finances,
> to help couples grow and win together.**

This is the **how** that sits underneath the existing **why** ("money is a top source
of couple conflict and divorce — make it not suck"). Added to
`gamification-vision.md` §2.

Why this phrasing is load-bearing:

- **It's a mandate, not a fence.** The old formulation was a prohibition ("the AI
  never invents numbers"). This is a job description — and it puts the AI *outside*
  the numbers by construction. The finances are the given; the AI is the layer that
  makes them legible and enjoyable.
- **"Understandable" is the real product claim.** Every budgeting app promises
  *insight*; almost none deliver *comprehension*. People don't fail at money for want
  of a pie chart — they fail because the numbers never meant anything. That reframes
  narrative from decoration to **mechanism**: story is how humans retain quantity.
  "$2,911 banked in June" is forgotten by Thursday; "June was the month you two
  actually pulled it off" survives a year. Same number.
- **"Together" is load-bearing.** Not "help you win" — win *together*. The narrative
  must be **one story two people are in**, not two dashboards side by side.
  Practically: Iris speaks in *we/us* for shared things and can name what the other
  partner did ("Claire closed out the last stretch while you were in Dubai"). That
  gives the async-co-op and gift mechanics a **voice**, not just a data model — and
  it's the cheapest way to make Claire a player rather than an audience.
- **⚠️ "Engagement" has two meanings — lock the right one.** It means *they want to
  come back*. It NEVER means *maximized time-in-app*. The second meaning is what
  later justifies a notification reading "Claire hasn't checked in for 4 days." The
  test stays Pokémon GO's "a reason to poke at it before midnight," never a guilt owl.

---

## 1. Bring Iris to the front — the rail

**Decision: Iris becomes an ambient presence on every screen, as a slim collapsed
rail that expands when she has something to say or you reach for her.**

### The trap we avoided

The obvious build is "put the chat box on every screen." That is **wrong**, and it
fights the north star. A blank composer (*"Ask about your budget, spending, goals…"*)
is a **work surface** — a standing obligation to compose. Read it against the locked
principle: *"95% autopilot — she claims, never works. If she has to do budget work to
move the game, she disengages."* An omnipresent text input is the most literal
violation of that available. Scott would love it; Claire would learn to look past it
inside a week — and "the thing she trained herself to ignore" is the worst possible
fate for the surface we plan to deliver quests through.

### The inversion

**What is persistent is Iris *speaking*, not a box *waiting*.**

- **Iris-who-initiates** — says things unprompted, hands over a quest, calls a win,
  notes "you're $2,770 under with 11 days left." Interaction is a *tap*: claim,
  confirm, react. This is PoGo's Buddy. This is Proactive Iris. This is the draw, and
  it's exactly the specced "positive taps, never work."
- **A-box-that-waits** — a power tool for someone who already wants to dig. Real
  value, wrong default, wrong audience.

Those are the **two HUDs**. "Same board, two games" already answered this: the
omnipresent layer is Iris's voice; the composer is something you *reach for*.

So the rail's default state is Iris's latest **utterance** — quest, nudge,
celebration, real number — with a small, unshouty way to talk back. The empty
composer lives in the full-screen `ChatView`, where Scott goes to tear data apart.

### Why the rail and not a drawer or a bottom bar

It's the only one of the three that can be **ambiently co-present and mostly
silent**. A drawer is modal-ish — in your face or entirely gone, so "quietly there"
is impossible. A bottom bar reads as a composer no matter what you put in it. The
rail also gives the future companion layer a home without inventing a new surface.

### Why this is not a detour from the Quest Engine

It **is** the Quest Engine's delivery channel. Quests need somewhere to *arrive*;
Moments need somewhere to *land* that isn't a full-screen takeover. Today those have
no home but cards competing for dashboard space — and `DashboardView` is already
1,050 lines / 56 component instances. The rail may absorb a chunk of the dashboard's
job: some of what is currently a card fighting for real estate is better as Iris
saying one sentence at the right moment.

### The discipline it demands

**Iris speaks only when she's earned it** — a real win, a real quest, a real number.
Otherwise she is small and quiet. **Silence is a designed state, not a gap between
messages.** If she chirps to fill space, we've built a shame machine with a friendly
avatar.

### Why the persistent panel is cheap

`ChatView.tsx` is a 126-line **thin shell**. Every piece of state it needs
(`chatMessages`, `chatLoading`, `sendMessage`, `chatEndRef`, `llmReady`, `setView`)
already lives in `AppDataContext`, which wraps the whole app; input state is
deliberately local so typing doesn't re-render context consumers. So: extract the
message list + input into `<IrisChat>`, mount it in `AppShell`. **No state migration,
no lifting.** History survives navigation for free because it never lived in the view.

---

## 2. The engagement ladder (three rungs, one surface)

Not three products and **not three modes** — three depths of the same thing.

| Rung | What it is | Whose home | What it needs technically |
|---|---|---|---|
| **1 — Follow the ball** | Iris leads, you tap. A quest arrives, you claim it, something grows. Zero composition, zero money vocabulary. | Claire | **Nothing new from the LLM.** Quests are computed in code on a cadence; the model only dresses them in language. |
| **2 — Ask about the ball** | "Why this quest?" "How close are we?" "What if we skip it?" Conversational but *anchored to something Iris just said* — you're never facing a blank prompt, you're replying. | the bridge | **The tool-calling backbone.** Iris must fetch the specific answer. |
| **3 — Tear it apart** | Full-screen, blank composer, 12-month correlations, the existing views. | Scott | Mostly already exists. |

**Rung 2 is the insight.** Without it, Claire taps and Scott analyzes and there is no
path between them. With it, she asks one question from a place where asking is *easy*
— and that's the only route from "I don't do money" to "wait, actually, why?"

### 🚫 The one thing that would kill it: NO MODE SWITCHER. EVER.

The moment we ship a "Claire view / Scott view" toggle we've built a money app with a
simplified mode — condescending, and it makes her Player 2 *by construction*, the
deepest risk the vision doc names.

Rungs **self-select by what you do**, never by what you set. She lives on rung 1
because rung 1 is satisfying, not because she was assigned there. Scott gets yanked
down to rung 1 by a celebration; she gets pulled up to rung 2 by a question she
actually wants answered. Same rail, same Iris, same data. **Depth is emergent.**

---

## 3. ⭐ REVISED BUILD SEQUENCE (this session changed it)

Previously (2026-07-21 handoff): **backbone first, then quests.** That was wrong — it
means guessing at the tool surface.

**New order:**

1. **Rail + voice + persona** — rung 1 gets a home, rung 3 keeps working.
2. **Quests** — real ones, computed, arriving on the rail.
3. **Backbone** — scoped by the actual follow-ups those quests provoke.

**Why:** the backbone's job is *not* "general analytics" (that's rung 3, and rung 3
mostly exists in the views already). Its job is **letting Iris answer follow-ups
about a thing she just said.** That's a far tighter, answerable spec — "whatever a
quest's follow-ups require" — but it's only enumerable once quests exist. Build
quests first and the tool surface falls out of the requirements instead of being
invented.

**Navigation-by-chat** belongs here too, as a *tool* (`navigate_to`), not as a
stopgap. A cheap directive-parser could ship now (`setView` already sits in the same
context as the chat, ~30 lines) but it would be deleted the moment the real loop
lands. Per Scott's own methodology — get the core right, then add features and paint
— we skip the throwaway.

---

## 4. Narrative mechanics (the "understandable" layer)

### 4a. Dollar → tangible translation

"You saved $2,641" is a number you forget. **"That's 40% of the theater room"** is a
thing you want. It converts a *saving* event into *spending*-language before a dollar
moves — which is "the reward must BE a spend" operating at the narrative level, for
free, on the spender's HUD.

**Disciplines (both non-negotiable):**
- **Source the comparison from their actual Want-To stashes**, never generic units.
  "That's 88 lattes" is the smug-finance-blog genre and reads as a lecture. Want-To
  stashes are already in the data model, so real targets are sourceable.
- **The math must be real.** If Iris says "that's a theater room" and the theater
  room costs $14,000, she just implied $2,641 buys one — the invented-numbers failure
  wearing a costume. Real target, real percentage, or don't say it.

**Variant worth building:** retroactive attribution — *"did you save that for this?"*
— connecting something you already did to something you already want. Costs nothing,
feels like Iris was paying attention.

### 4b. Iris giving you a hard time

She needs the capacity. **A coach with no capacity for disapproval is a cheerleader,
and cheerleaders are useless** — praise from someone who's never critical isn't
believed. (Same reason Scott wants Claude sarcastic about accountability.)

**Three constraints:**

1. **Tease the anomaly, never the identity.** "Three months running on dining" is
   data with attitude. "You're bad with money" is character assassination — and it's
   what every finance app makes people feel right before they delete it. The joke is
   always about *the thing*, never *the person*.
2. **⚠️ The target is yourself or the household — NEVER your partner. The dial is
   per-person.** Scott gets an Iris that busts his balls (affirming for a saver's
   identity); Claire gets one that never once does. Same engine, different setting.
   **If Iris ribs Claire and Scott can see it, Iris has become Scott's proxy for
   nagging** — the "Player 2 in a game Player 1 engineered" failure in its purest
   form, an automated version of the exact conversation this app exists to prevent.
   Any hard time must be **private to the person receiving it.**
3. **Household misses are "we," always.** Blowing the base as a couple gets ribbed as
   a team event — never "someone's dining habit did this."

### 4c. ⭐ The "no good excuse" mechanic (Scott's, and the best idea in the thread)

**Iris asks first.** She notices the anomaly, asks about it, and *accepts the answer*.
"Vet emergency" → dropped, maybe sympathy, no grief. Nothing to explain → *then* the
ribbing lands, and it lands **fair**, because you had the chance and passed.

Three things fall out, all good:
- **Fair by construction.** The hard time is earned by the *silence*, not by the
  spend. That's the difference between a coach and a scold, and why it won't read as
  surveillance.
- **It IS rung 2.** She says something, you reply. No blank composer, no "money
  conversation" — just answering a question about a thing that already happened.
- **It's data collection disguised as banter.** Every "vet emergency" teaches Iris why
  anomalies happen in this life, making next month's quests smarter and next month's
  ribbing better targeted.

### 4d. Architectural implication: Iris needs MEMORY

The chat is currently **stateless** — a fresh context blob per message, no
persistence of "Scott said the March spike was the vet." An Iris that asks about an
anomaly and then asks again next month is **worse** than one that never asked.

So this needs a small durable store: **anomaly → explanation given → date.** Not a
big lift, and it's the seed of Iris actually *knowing* you rather than re-reading your
file every time.

**Open question parked here:** how much should Iris remember, and does she ever bring
it back up unprompted?

### 4e. The guardrail on "AI-driven adventure"

**The plot is computed; the prose is generated.** Quest selection, thresholds, stakes,
reward sourcing — all code, all tested, all pure functions like `moments.ts`. The
LLM's job is to make it sound like an adventure instead of a variance report. That's
not a lesser role — it's the whole difference between "hold dining to $340" and "catch
it before midnight." **But it never picks the number.**

If Iris authors facts she will eventually contradict herself, promise a reward she
can't source, or be confidently wrong about money. That isn't a bug you fix — it's
trust you don't get back. Claire in particular gets **one** bad experience before this
becomes another app that made her feel dumb about money.

---

## 5. Code-review findings (fresh-eyes pass, 2026-08-12)

Verified state at review time: `tsc` clean, **341/341 tests passing** in 5s. The
foundation is healthy — `moments.ts` / `achievements.ts` are the kind of pure,
documented, forward-only engines that will still be correct in two years.

### 5a. Ask Iris is behind an unlabeled door 🔴

`PHASE_1_LOCK = true` (`src/hooks/useEnabledModules.ts:32`) forces
`investments: false`, and `chat` sits inside the investments gate (`:88-93`).
Therefore:
- Sidebar entry — filtered out (`AppShell.tsx:86`)
- Floating "Ask Iris" FAB — gated on `allowed.has('chat')`, so **dead**
  (`AppShell.tsx:256`)
- Mobile bottom nav — filtered out (`AppShell.tsx:274`)

Only route in: clicking the "Iris" logo, advertised by a `title` tooltip
(`AppShell.tsx:124-126`). A full session was spent fixing that chat's data grounding
and its surface is functionally undiscoverable — which also means **neither partner
has been living with it**, so there's no usage intuition to design quests from.

### 5b. The persona is still Signal's, not Iris's 🔴

`src/services/gemini.ts:249` — *"You are Iris, a personal market intelligence AI."*
Then rules about tickers, trades, rotations, before/after allocation tables,
conviction holds, "always show both monthly AND annual impact," "end actionable
responses with a Next steps: section."

That is a Bloomberg terminal with a friendly preamble — precisely the voice
`gamification-vision.md` declares fatal (finance-verbs, chore-shaped, homework at the
end of every answer). **The 2026-07-19 "soul fix" gave it real numbers; the soul
itself was never touched.**

Good news: one `SYSTEM_PROMPT` const feeds all four providers (`:299`, `:385`,
`:464`). Cheapest change in the project, largest effect on the next several months of
work. **§0's mission sentence is the replacement's opening paragraph.**

### 5c. "Same board, two games" has rails but no product 🟡

Better than expected: `activeUser` is plumbed from auth through `AppDataProvider`
(`App.tsx:139`) — **the app already knows who's looking.** That's the hard part, done
right.

But it's referenced 25 times across 5 files (App, AppShell, DataBackup, Tutorial,
AppDataContext) — **not Dashboard.** Zero surface differentiation today.

⚠️ Unlike Moments (genuinely additive), this is **not** safely deferrable to a design
pass: if Claire's HUD is real, quests are authored *per-HUD* — "hold the line" and
"unlock the drop" are different quest objects from the same transactions.
**Retrofitting a person dimension onto a quest schema is the one piece here that will
hurt later. Decide it at schema-design time.**

### 5d. ~7,400 lines of gated-off ancestry 🟢

Intelligence / Portfolio / Watchlist / FirstReport / Health views,
`portfolioIntelligence.ts`, `marketIntelligence.ts`, `newsApi.ts`,
`marketDataApi.ts`, `insightsEngine.ts`, `newsScanner.ts`, plus dead Teller sync
(`syncTellerBalances/Transactions.ts`, `server/api-handlers/teller.ts` — Teller shut
down in 2026). `AppShell` still *computes* `overallScore` and `pendingActions` badges
for tabs nobody can reach.

Not urgent, not a bug. But it's why the codebase reads twice the size of the product,
and it will muddy the tool-calling design — "what can the LLM ask Iris about?"
currently has many answers pointing at dead market-data code.

### 5e. Minor 🟢

- **Model IDs a generation behind**: `claude-sonnet-4-6`, `gpt-4o-mini`,
  `gemini-2.5-flash`. Worth a deliberate pass, especially since quest *generation* is
  the most reasoning-heavy ask in the roadmap.
- **`DashboardView` 1,050 lines / 56 component instances.** "Getting long" has
  graduated from polish to blocker now that quests + companion + Moments-grid all
  want real estate.

### 5f. The biggest risk isn't technical

**The entire vision is a hypothesis about a person who has never used the app.**
`gamification-vision.md` is Scott + Claude reasoning *about* Claire, at length, with
real insight and zero observations. Cheapest de-risk available: fix the voice, un-hide
the chat, put one live quest in front of her, and watch. A fraction of a session, and
it either validates or reshapes the five layers planned on top.
