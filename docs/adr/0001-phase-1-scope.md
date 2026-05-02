# ADR-0001: Phase 1 Scope — Budget Engine MVP

**Status:** Accepted
**Date:** 2026-05-02
**Decision-makers:** Scott (designer / product owner), Claude (engineering)

## Context

After several weeks of iterative development, Iris had grown to ten-plus feature surfaces across eight module views (Dashboard, Budget, Investments, Health Check, Equity, Watchlist, Intelligence, Ask Iris). On 2026-04-29 a single session attempted to build six features in one sitting; none received adequate iteration time. The result:

- Numbers across surfaces stopped reconciling (Pulse vs avg-spend tiles vs Paycheck Waterfall vs Work Expense card)
- Newly-built features (Variable Pay card, Work Reimbursements card) shipped half-built and were not findable by the user
- A 1500-line `BudgetView.tsx` accumulated complexity faster than it could be tested or refactored
- The user's trust dropped to "I'm about to nuke this and start over"

The root cause was scope sprawl plus absence of definition-of-done discipline, NOT technical infeasibility. The data layer is sound; the iteration process broke down.

## Decision

Phase 1 of Iris is explicitly scoped to a **budget engine MVP**. Six core features are locked in. Everything else is deferred — not deleted — to Phase 2 or Phase 3.

### IN Phase 1 (locked six + supporting infrastructure)

1. **Pulse** — pace-aware budget read with multi-select filter chips, status pills (over / pacing / on track / untouched), calendar-pace tick markers
2. **Edit Budget overlay** — sticky chrome bar, save/cancel/dirty tracking, inline `+ Add bucket`, audit-log integration. Daily Budget tab is read-only by default.
3. **Work Expense aggregate tracker** — totals only (this month / last 90d / YTD spent vs reimbursed). No per-line itemization. No mark-paid UX.
4. **Variable Pay floor + sweep prompt** — pay-band detection (>6% jump = boundary), user-overridable floor, sweep-destination preference (HYSA / extra payment / stash / investing / manual)
5. **Daily auto-sync** — Teller dev tier connector (BoA / Citi / Cap One), Fidelity OFX or Teller (brokerage + 401k pending plan check), Coinbase official API. Manual CSV import remains as universal fallback.
6. **Merchant memory** — classify a merchant once, persist forever via merchant store

Supporting infrastructure that stays IN:

- Manual CSV import for any bank
- Action Items badge on Budget nav (count only)
- Stashes (sinking funds) and Fun Money editors — accessed inside the Edit Budget overlay
- Audit log infrastructure (data only, no browsing UI)
- Cyber visual language and existing component primitives

### DEFERRED to Phase 2 (Investment Layer)

- Investments / Portfolio view (currently visible — gets feature-flagged off)
- Health Check view
- Equity view
- Watchlist view
- Recurring Bills detection UI (detection logic still computes in background; no UI surface)
- Bucket Groups Manager (flex budgeting, Copilot pattern)
- InflowQuestions card (classification happens via IncomeSources only)
- IncomeSources detail panel — relocates from Budget tab to Settings → Income
- Conviction holds
- Dashboard view expansion (Phase 1 keeps Dashboard but simplified to a budget summary; investment + net-worth tiles return in Phase 2)

### DEFERRED to Phase 3 (Intelligence Layer)

- Intelligence / Market Intelligence view
- Ask Iris (chat)
- Explain-the-why nudges (lazy-load already shipped; do not iterate further in Phase 1)
- AI insights tying budget + investments
- Tax-bracket-aware decisions
- ETF X-Ray
- Scenario planning
- Audit log browsing UI

### Sidebar in Phase 1

**Visible:** Dashboard (simplified), Budget, Settings.
**Hidden:** Investments, Health Check, Equity, Watchlist, Intelligence, Ask Iris.

The hidden views remain in the codebase, feature-flagged off via the existing `useEnabledModules` mechanism. They are not deleted. They re-enable in Phase 2 / Phase 3 ADRs.

## Consequences

### Positive

- Clear, binary criterion for "complete." Trust rebuilds by shipping the six and verifying each.
- Surface area shrinks dramatically. The daily Budget tab becomes coherent.
- Each session opens with a binary "is this on the Phase 1 list?" filter. Default answer for anything not listed: no.
- Phase 2 and Phase 3 build on a working, tested foundation rather than competing with it.

### Negative

- The deferred features represent real value. AI insights and tax-awareness are Iris's eventual differentiators against Monarch / Copilot. Their absence is felt in the short term.
- Hiding entire sidebar views feels like visible regression to anyone who saw the sprawling earlier state.
- Several weeks of partial work on deferred features (Recurring Bills detection UI, Bucket Groups Manager, etc.) stays in the repo dark for now.

### Mitigations

- Deferred code remains in the repo. Re-enabling is a feature-flag flip plus polish, not a rebuild.
- Phase ordering ensures Phase 2 (investments) builds on a working budget engine, and Phase 3 (intelligence) builds on both halves of the data already flowing.
- Visible sidebar regression is the cost of professional discipline. It is not negotiable.

## Alternatives considered

**Alt 1: Continue building everything in parallel.** Rejected — this is the pattern that produced the 2026-04-29 breakdown. Continuing it produces the same outcome.

**Alt 2: Switch to Lunch Money / Monarch / Copilot, abandon Iris.** Considered seriously on 2026-05-01. Rejected by the product owner — the vision is to build a sellable local-first tool, not consume someone else's. Lunch Money would solve the data layer but eliminate the differentiated features (variable pay floor, Coupa-aware reimbursement aggregate, local-first privacy, eventual sale).

**Alt 3: Lock scope at 3 features instead of 6.** Considered. Rejected because Variable Pay floor and Work Expense aggregate are differentiators that justify Iris's existence. Without them the project loses its reason to exist relative to commercial alternatives.

## Revisitation

This ADR is revisited only when Phase 1 hits its Definition of Done (see `docs/phase-1-definition-of-done.md`). At that point ADR-0002 opens and supersedes this scope with a concrete Phase 2 scope.

Until then: feature additions to Phase 1 require a new ADR explaining why the scope lock is being violated. Default answer is no. Both Scott and Claude are bound by this rule.
