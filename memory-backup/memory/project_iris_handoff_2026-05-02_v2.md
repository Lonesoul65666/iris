---
name: Iris session handoff (2026-05-02 evening — vision lock)
description: Vision-locking session. North-star widened to couples-first co-op gaming framing. Phase 2 sequencing now open (Path A investments vs Path B co-op mechanics). Partnership agreement formalized with engineering style, communication preferences, sessions-not-weeks timeline framing. Commit 32c914f landed. Next session ships something verifiable.
type: project
originSessionId: 2026-05-02-evening
---

## What this session was about

Vision-locking, not building. Scott opened with "audit before deciding," realized the mission was too narrow, and we spent the session widening it through dialogue. By the end, north-star was rewritten and committed; the partnership agreement was formalized.

No code changed. No features shipped. This was deliberate.

## What changed (committed in 32c914f)

### `docs/north-star.md`
- **New mission:** "Iris turns money from a chore into a hobby couples actually want to do together." Pokémon Go is the reference model — solo play feeds shared goals, co-op moments pull both partners in.
- **New "What winning looks like" section** anchored on the bedroom-furniture quote: "The only debate you're having is what color the sheets are going to be."
- **Target user widened** from "financially literate" to three audiences: anchor user (couples), partner user (couples), solo user. **Couples-first is the headline; solo is fully-supported single-player mode.** This was the answered hinge — Scott picked couples-first.
- **New "Tone of voice and presentation" section.** Four binding principles: money-binary-presentation-layered, affirming-not-dread-inducing, best-friend voice, dancing-not-choreography.
- **Working principles** gain three: Co-op-not-shared-visibility, Parallel-views-not-consensus, Multi-user-aware-from-day-one. Multi-user moved out of "Beyond Phase 3" — partner-mode is Phase 2 territory now.
- **Phase 2 reframed as an open sequencing decision.** Path A (Investments, original) vs Path B (Co-op Mechanics, new). ADR-0002 will pick after Phase 1 ships.
- **Working agreement** gains "Engineering style" sub-section (7 condensed bullets) and "partnership agreement, not mandate" framing, plus "timelines live in sessions, not weeks or months."

### `docs/post-phase-1-backlog.md`
- New "Co-op mechanics ideas (Phase 2 Path B candidates)" section captures: evolution arc, joint collection model (Scott's Pokémon-cards-with-his-son metaphor), D&D dice-roll tie-breakers, dopamine hook, scheduled co-op moments.
- New "Phase 2 sequencing decision (open)" section names the Path A vs Path B trade-off explicitly.

### Memory
- `feedback_iris_partnership_model.md` rewritten as the durable operating contract — engineering style, communication style, accountability, mutual-limitation awareness, what Claude needs from Scott, auto-mode + scope discipline, speed-vs-quality balance.
- `project_iris_grading_request.md` closed — grade delivered earlier 2026-05-02, ~70% avg, variable. Don't re-offer.

## What did NOT change

**Phase 1 scope (ADR-0001) holds.** The six features are unchanged: Pulse, Edit Budget overlay, Work Expense aggregate, Variable Pay floor + sweep, Daily auto-sync, Merchant memory. The vision widening shapes *how* we build them (tone, copy, partner-awareness in the data model), not *what* we build.

**DoD criteria hold.** Eight binary criteria still gate "Phase 1 done."

**Variable Pay card visibility bug** — still open. Still a DoD #5 blocker.

**Connectors** — Coinbase / Teller / Fidelity OFX still not built. Scott still owes the teller.io signup verification and the NetBenefits OFX check.

**1,643-line BudgetView.tsx** — still the deferred refactor. Still the cautionary tale.

**Foundation from yesterday** — git, pre-commit hook (`tsc -b --noEmit`), governing docs all in place. Type-check stays green.

## The partnership shift Scott named explicitly

This session formalized the move from "boss/employee" to "partners as equals." Tomorrow-Claude should NOT slide back to deferential mode. Concrete shifts:

- **Sarcastic accountability runs both ways.** When Scott says "looks good," push back: "did you actually check, or are you being lazy?"
- **Read intent, not literal phrasing.** Scott uses slang, sarcasm, and non-absolutes. "Measure 3–4 times" was sarcasm — the real rule is "validate feasibility before committing, then go bold."
- **Reckless ambition is welcomed**, not feared, *after* the feasibility gut-check. Don't take Scott down a road that ends with "this needs 9 billion engineers."
- **Timelines in sessions, not weeks/months.** Scott has 1–2 hours at a time, off-job. The constraint is verification cycles, not coding speed.
- **Validation before reassurance.** Don't say "yes, do this" with confidence until adjacent context, prior art, and existing tools have been checked.
- **What Claude needs from Scott** is now in the agreement: real-use feedback over screenshots, nudges when Claude is too cautious, quick unblocks on Scott-side items.

## Honest gap I named, that Scott accepted

We've nailed *positioning*. We have NOT yet designed *mechanics*. The co-op-fun-couples mechanics that turn Iris from "useful budget app" into "Pokémon Go for money" don't have a phase yet. They're now captured as Phase 2 Path B candidates in the backlog. **The mechanics are designable; positioning is the hard part to get right, and we got it right.**

## Next session priorities (in order)

1. **Open by reading `docs/north-star.md`** (rewritten), `docs/adr/0001-phase-1-scope.md` (unchanged), `docs/phase-1-definition-of-done.md` (unchanged), `docs/post-phase-1-backlog.md` (new sections).
2. **Ship something verifiable.** Per the partnership rule "we need a shipping moment soon" — don't open with the full BudgetView refactor. Pick a small slice that Scott can run on his machine and react to within a week. Real-use feedback over screenshots.
3. **Then BudgetView refactor.** Split the 1,643-line file. Type-check guards each move.
4. **Then Vitest test suite** (~10 tests for the data layer per backlog).
5. **Then connectors** — Coinbase first (smallest), Teller after Scott verifies coverage, Fidelity OFX after Scott verifies NetBenefits.

## Discipline reminders for tomorrow-Claude

- Auto mode does NOT override scope discipline. The 2026-04-29 sprawl happened in a similar autonomous setting.
- One feature per session. Verify before declaring done.
- Don't bypass the pre-commit hook. Type-check is the gate.
- Write a handoff memory at session end. This file is the template.
- The vision is now in the doc — don't re-litigate it. Build against it.

## Commit at session end (after post-session consolidation pass)

```
a202e03 docs(north-star): add state.md to reading order
41e04b6 docs: add state.md as the rolling current-state + drift-watch + evaluation snapshot
32c914f docs(north-star): widen mission to couples-first; lock tone principles and engineering style
0765cce chore: initial commit — Iris pre-Phase-1 baseline
```

Four commits. Working tree clean.

## Post-session consolidation (while Scott was mowing)

Scott explicitly requested a post-session pass with three deliverables: rolling memory continuity, documentation, and an evaluation pass with broader competitive references.

**Memory continuity:**
- Annotated stale memories: `project_iris_direction.md` and `feedback_iris_product_journey.md` marked SUPERSEDED with pointers to the new mission.
- Updated still-valid memories with status notes: `feedback_iris_budget_is_primary.md`, `feedback_iris_deployment_model.md`, `feedback_iris_product_vision.md`.
- Restructured `MEMORY.md` index into clear sections: User and general / Iris current operational / Iris architecture and operational / Iris Phase 2-3 product feedback / Iris superseded historical / Iris session handoffs (chronological).

**Documentation — `docs/state.md` created and committed (41e04b6):**
- Single rolling "where are we today" snapshot. Overwritten each substantive session.
- Sections: current state at a glance, vision anchors (10 immovable rails), recent shifts log (append-only), honest evaluation, open decisions and bets, drift watch.
- Added to north-star reading order at #2 (a202e03).

**Evaluation pass — embedded in state.md:**
- Broader competitive landscape: Pokémon Go, It Takes Two, Dark Pictures Anthology, Pandemic, Codenames Duet, Spiritfarer, Overcooked, Strava, Duolingo Friends Quest, Apple Fitness+ SharePlay, Splitwise, Acorns Together, GreenLight, FamZoo, Goodbudget, Lunch Money, Origin Money, Empower, Quicken, Tiller. Confirms the "couples + co-op + fun + private + local-first" intersection is genuinely empty.
- Reality checks on: sync architecture (4 options weighed), dopamine hook designability, gaming-mechanics translation, adoption risk, pricing, engineering capacity.
- Strong vs maybe-not idea categorization.
- **Verdict: yes, worth building.** Phase 1 is the right thing now; Phase 2 Path B mechanics design is the hardest thing left.
