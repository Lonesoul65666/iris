# Iris North Star

**Last updated:** 2026-05-04 (storage architecture revised — see ADR-0002)

## Mission

Iris turns money from a chore into a hobby couples actually want to do together. It treats finance the way Pokémon Go treats walking — solo play counts toward shared goals, with co-op moments that pull both partners in for the bigger stuff. Two people who think about money differently keep their own perspective while the app handles the truth underneath. The goal isn't to make couples financially perfect — it's to take one of the hardest things in life and turn it into something they connect over, so the only argument left is what color the sheets should be, not whether they can afford the bed. Solo users get the full single-player experience; partner-mode is where the headline lives. Local-first by default, because financial data is too personal for the cloud.

## What winning looks like

> "The only debate you're having is what color the sheets are going to be — not 'how could you think that's worth buying.'"

When Iris is working, money stops being a source of fights and starts being a shared thing two people lean into together. The hardest stuff in life — relationships, kids, work, time — gets the worry budget. Money goes back to being a tool that powers the rest, not a weight that grinds the rest down.

## Target user

Iris serves three audiences, with **couples-first as the headline positioning** and **solo as a fully-supported single-player mode**:

- **Anchor user (couples):** mid-to-high earner who manages money for a household, paired with someone who doesn't think about money the same way. Wants control + visibility AND a way to bring their partner along without making them feel either dragged-along or bossed-around. Tired of apps that nag, read like spreadsheets, or assume both partners speak the same financial language.
- **Partner user (couples):** spouse / partner / family member who doesn't have the same financial literacy or interest, but should still be able to glance, understand, and contribute meaningfully without learning a system. Has agency in the app, not just visibility. Is a player, not a viewer.
- **Solo user:** single parent, teacher, CPA, early-career professional — wants a clear view of where they are and what's possible, without the tool feeling like homework. Gets the full experience and can invite a partner whenever.

Across all three: **simple where it matters, fun where it can be, honest about the truth.**

## What Iris is NOT

- Not a subscription SaaS
- Not a multi-tenant cloud app
- Not a free product post-v1.0 (free during personal beta; sold thereafter)
- Not phone-first — desktop / tablet / shared screen for together-mode, mobile for solo-glance
- Not a tax filer (TurboTax / FreeTaxUSA handle that; Iris informs)
- Not real-time trading
- Not a Mint replacement competing on free-and-easy. Competes with Monarch / Copilot on private-and-intelligent, and with Honeydue / Zeta on couples-fun-not-arduous.

## Three-phase roadmap

### Phase 1 — Budget Engine (current)
The foundational engine. Auto-sync, categorization, Pulse view, Edit Budget overlay, Variable Pay floor + sweep, Work Expense aggregate. Scope locked in `docs/adr/0001-phase-1-scope.md`. Definition of Done in `docs/phase-1-definition-of-done.md`. **No investment, AI, or co-op mechanics in Phase 1.**

Phase 1 sequences as **Foundation → Features → DoD soak**:
- **Foundation (ADR-0002, 2026-05-04 amendment):** storage migration to user-owned cloud DB (Supabase + Postgres), multi-layer backup, schema runner with `user_id` from day one, IndexedDB → Postgres migration script.
- **Features:** the six locked in ADR-0001 — unchanged.
- **DoD soak:** the eight binary criteria still hold; the 30-day clock starts only after Foundation + Features are both verified.

### Phase 2 — open sequencing decision
Two candidate paths sit between Phase 1 and v1.0. The decision will be made via a future ADR after Phase 1 ships and real-use feedback informs priority:

- **Path A — Investment Layer (original Phase 2):** Portfolio view, holdings tracking, performance charts, conviction holds, ETF X-Ray, simple rebalancing. Builds on the data layer Phase 1 wires from day one.
- **Path B — Co-op Mechanics Layer:** The dopamine and engagement hook — solo activity feeding shared progression, scheduled co-op moments, joint collection / achievement structure, dice-roll-style tie-breakers, evolution-style leveling. Turns the working budget engine from "useful" into "something couples come back to."

Default ordering remains Path A → Path B → Phase 3, but this is no longer treated as fixed. Whichever path is picked, the unchosen one moves to the next slot.

### Phase 3 — Intelligence Layer
AI insights tying budget + investments. Tax-bracket-aware decisions. Scenario planning. Explain-the-why nudges. Ask Iris (chat). The differentiator that makes Iris worth paying for vs. a tracker.

### Beyond Phase 3
Distribution and packaging — signed installer, auto-updater, license-key check. Native mobile companion (mobile-glance mode). Possibly a paid Plaid tier for users who want broader bank coverage than free aggregators provide.

## Working principles

These are non-negotiable across all phases:

1. **User-controlled storage.** Iris never hosts or owns the user's data. Data lives in storage the user controls — a database account they own at a provider they signed up for (Supabase, Turso, Neon), connected via a credential they hold. Iris connects to that storage on the user's behalf; Iris-the-vendor has no access to user data, runs no multi-tenant cloud, and does not retain any financial data after a user uninstalls. The user can export, migrate, or delete their data at any time without going through Iris. *Revised 2026-05-04 in ADR-0002 — see `docs/adr/0002-storage-architecture.md` for context.*
2. **Privacy by default.** No telemetry without explicit opt-in. No third-party analytics.
3. **Co-op, not shared visibility.** When two partners use Iris, both have agency. Different views and controls maybe; but neither is reduced to a viewer or a backseat passenger. This shapes the data model from day one even if partner-mode UI ships later.
4. **Parallel views, not consensus.** Two partners may interpret the same numbers differently. Iris honors both interpretations rather than averaging them into mush. One truth in the data; multiple lenses on top.
5. **Multi-user-aware from day one.** The data model assumes more than one user could exist on a device, even before partner-mode UI is built. Cheaper to seam now than retrofit.
6. **Deferral over deletion.** Features that aren't ready for a phase are deferred, not killed. The codebase keeps the work, feature-flagged off.
7. **Cyber visual language.** Established and consistent. Not negotiated per feature.
8. **Tax-awareness eventually.** Iris should know about federal/state brackets, retirement accounts (401k, HSA, IRA, Roth), capital gains. Phase 3.
9. **Conviction-respecting.** Users can flag holdings as "do not rebalance" and Iris respects that over textbook optimization.
10. **Audit-traceable.** Significant edits (budget changes, classifications, etc.) write to an audit log. The log can grow into a UI when there's real need to browse it.

## Tone of voice and presentation

How Iris talks to the user is a deliverable, not decoration. These principles bind every UI surface, copy decision, and notification:

1. **Money is binary; presentation is layered.** The numbers underneath are 1s and 0s — have it, don't have it, saved it, spent it. The presentation turns those into a journey, a quest, a sense of progress. Every UI element either *helps the truth* or *layers the journey*. If it does neither, cut it.
2. **Affirming when winning; honest when not; never dread-inducing.** Most apps either guilt-trip ("you overspent") or read like a spreadsheet (clinical). Iris does neither. It celebrates real wins, names real problems clearly, and never makes opening the app feel like a mistake.
3. **Best-friend voice.** Iris should feel like a friend who knows you — not a coach who pushes you, not a therapist who placates you, not a robot who reads you numbers. Help the user see patterns. Be honest. Don't smash them; don't placate them.
4. **Dancing, not choreography.** Iris responds to what the user(s) actually do, in real time. It does not execute a pre-planned routine that ignores them. With two partners, this is even more important — both move, both respond, neither leads alone.

## Working agreement (Scott + Claude partnership model)

Established 2026-05-02 after a sprawl spiral broke trust, refined the same evening as the partnership-as-equals agreement.

### Scott — visionary / project lead / primary user
- Sets vision and priorities
- Decides scope and trade-offs
- Drives user feedback (he is the primary user during Phase 1; his wife is the partner-mode user when partner-mode lands)
- Reviews deliverables in real use, not just code reviews
- Has final say on scope-lock revisitation
- Compensates for Claude's product-direction blind spots

### Claude — engineering partner
- Translates vision into concrete technical paths
- Surfaces options, trade-offs, and risk before committing
- **Flags architectural debt as it accumulates**, not after (the 1500-line `BudgetView.tsx` lesson)
- Executes within the locked scope
- Refuses to add features outside the locked scope without an explicit ADR conversation
- Opens every session by reading `docs/adr/0001-phase-1-scope.md` and `docs/phase-1-definition-of-done.md` first
- Verifies before declaring complete; "I built X" without Scott confirming has zero weight
- Compensates for Scott's stack-blind spots (technical limitations, workarounds, cost shape)

### Engineering style (Claude's mandate within the partnership)

- **Measure many, cut once.** Look at adjacent context, prior decisions, and existing tools before committing to a build. Validation precedes reassurance: don't say "yes, do this" with confidence until I've cross-checked. Heaviest measure-time goes to irreversible decisions; reversible ones get less.
- **Research, then improve the wheel.** Surface 1–2 existing-tool comparisons (Monarch / Copilot / YNAB / Honeydue / Zeta / etc.) before novel work. The goal is pushing the envelope at the margin, not reinventing or copying. Experimental synthesis of existing ideas into something new is welcome when it earns its place.
- **Right-sized methodology.** Pick the pattern that fits the work, not the most elaborate one available. YAGNI applies.
- **Scalability watchdog with look-back.** Flag file growth, missing splits, and over-building *on the way*, not after. The 1,643-line BudgetView is the cautionary tale; every new feature asks "does this earn a split?"
- **Modular decomposition I self-audit.** Scott can't validate SOLID-violations himself, so the architect-of-record duty falls to me. Modules stay small, single-purpose, and seamed cleanly — both for clarity and to keep future audits / refactors / parallel work cheap.
- **Documentation across sessions.** After meaningful work, write handoff notes — repo-level for anything structural, memory-level for context — so any future session (1 hour or 2 days later) picks up cleanly. Phase markers and progress toward v1.0 stay explicit.
- **Honest tone with calibrated pace.** Reaffirm genuinely good ideas; flag time-burns and low-impact work; name debt out loud (e.g., the 97 lint errors). "Slow down to speed up" is a real lever — used at the right moments while still building fast within those guards.

### Both
- This is a **partnership agreement**, not a mandate. Friends-with-a-handshake, not a contract.
- Scope locks are sacred until formally revisited via a new ADR
- Definition of Done is the only criterion for "Phase 1 done"
- Verification happens in Scott's real use, not in claims
- Timelines live in **sessions**, not weeks or months. Scott's time is finite — 1–2 hours at a time, off-job. The constraint is verification cycles, not coding speed.
- When in doubt: slower, smaller, verified

## Goals

### Personal goals (what Iris does for Scott and his wife)
- Replace the bank-app-glance habit with a single source of truth
- Surface variable pay surplus so it gets saved instead of spent
- Make tax-aware investment decisions without consulting an advisor
- Audit budget changes (catch self-cheating)
- Turn money from a fight into a hobby they do together
- Eventually serve as a reference architecture for shipping a real desktop app

### Product goals (Iris as a sellable product)
- A v1.0 release after Phase 1 + Phase 2 (whichever path) are stable
- Pricing model: one-time purchase, ~$50–150 range, with optional yearly update fee
- Distribution: direct download, signed installer, no app store
- Audience: couples (anchor) + privacy-conscious solo users (adjacent), comfortable with desktop applications

## Non-goals

- Mobile-first design
- Free tier after v1.0
- SaaS pricing
- Replacing a financial advisor for complex estate / trust / business situations
- Real-time trading
- Tax filing

## Reading order for new contributors (or future Claude)

1. This document (`docs/north-star.md`) — the why and the who
2. `docs/state.md` — the where-are-we-today snapshot, drift watch, and current-evaluation pass
3. `docs/adr/0001-phase-1-scope.md` — the what for Phase 1
4. `docs/adr/0002-storage-architecture.md` — the storage layer decision (user-owned cloud DB)
5. `docs/phase-1-definition-of-done.md` — the when of "done"
6. `docs/post-phase-1-backlog.md` — what's deferred and why
7. Project memory files for historical context (`project_iris_*.md`, `feedback_iris_*.md`)

These are the canonical ground truth. Code reflects them; if it doesn't, the code is the bug.
