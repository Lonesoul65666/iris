# Iris North Star

**Last updated:** 2026-05-02

## Vision in one paragraph

Iris is a local-first personal-finance app that combines budgeting, investment tracking, and AI-powered intelligence in a single tool that lives on the user's machine and never sends financial data anywhere. It's designed for people who are financially literate, want deep visibility into their money, and refuse to trust their data to cloud services. Iris is sold as a one-time-purchase downloadable application — not a subscription SaaS.

## Target user

The user Iris is built for:

- **Financially literate.** Understands net worth, asset allocation, tax brackets, surplus vs. budgeted income, reimbursement timing, vesting schedules.
- **Privacy-conscious.** Doesn't want Plaid storing bank credentials in the cloud. Doesn't want Mint / Monarch / Copilot reading their data.
- **Comfortable with manual fallback.** Prefers automation but accepts CSV imports for banks aggregators don't cover.
- **Wants intelligence, not just tracking.** Already knows what they spent — they want context: "should I pay down debt or invest?", "is my variable pay surplus on pace?", "what's a tax-aware rebalance look like?"
- **Has variable income.** Commission, RSUs, bonuses — the kind of income that breaks naive "budget against last month's salary" tools.
- **Does work-expense reimbursement.** Coupa, Concur, Expensify users who want cash-flow timing visible without per-line double-bookkeeping.

## What Iris is NOT

- Not a subscription SaaS
- Not a multi-tenant cloud app
- Not a beginner's first budget tool — there is a financial-literacy floor
- Not a free product post-v1.0 (free during personal beta; sold thereafter)
- Not phone-first — desktop-hosted, LAN-accessible from the user's other devices
- Not a tax filer (TurboTax / FreeTaxUSA handle that; Iris informs)
- Not real-time trading
- Not a Mint replacement competing on free-and-easy. Competes with Monarch / Copilot on private-and-intelligent.

## Three-phase roadmap

### Phase 1 — Budget Engine *(current)*
The foundational engine. Auto-sync, categorization, Pulse view, Edit Budget overlay, Variable Pay floor + sweep, Work Expense aggregate. Scope locked in `docs/adr/0001-phase-1-scope.md`. Definition of Done in `docs/phase-1-definition-of-done.md`. **No investment or AI features in Phase 1.**

### Phase 2 — Investment Layer
Portfolio view, holdings tracking, performance charts, conviction holds, ETF X-Ray, simple rebalancing recommendations. Builds on the data layer Phase 1 already wires (the connectors pull brokerage data from day one; Phase 1 just doesn't display it).

### Phase 3 — Intelligence Layer
AI insights tying budget + investments. Tax-bracket-aware decisions. Scenario planning. Explain-the-why nudges. Ask Iris (chat). The differentiator that makes Iris worth paying for vs. a tracker.

### Beyond Phase 3
Distribution and packaging — signed installer, auto-updater, license-key check. Multi-user mode. Possibly a paid Plaid tier for users who want broader bank coverage than free aggregators provide. Native mobile companion (maybe).

## Working principles

These are non-negotiable across all phases:

1. **Local-first.** Data lives in IndexedDB / SQLite on the user's machine. No cloud storage of financial data. Ever.
2. **Privacy by default.** No telemetry without explicit opt-in. No third-party analytics.
3. **Deferral over deletion.** Features that aren't ready for a phase are deferred, not killed. The codebase keeps the work, feature-flagged off.
4. **Cyber visual language.** Established and consistent. Not negotiated per feature.
5. **Tax-awareness eventually.** Iris should know about federal/state brackets, retirement accounts (401k, HSA, IRA, Roth), capital gains. Phase 3.
6. **Conviction-respecting.** Users can flag holdings as "do not rebalance" and Iris respects that over textbook optimization.
7. **Audit-traceable.** Significant edits (budget changes, classifications, etc.) write to an audit log. The log can grow into a UI when there's a real need to browse it.

## Working agreement (Scott + Claude partnership model)

Established 2026-05-02 after a sprawl spiral broke trust.

### Scott — designer / product owner
- Sets vision and priorities
- Decides scope and trade-offs
- Drives user feedback (he is the primary user during Phase 1)
- Reviews deliverables in real use, not just code reviews
- Has final say on scope-lock revisitation

### Claude — engineering
- Translates vision into concrete technical paths
- Surfaces options, trade-offs, and risk before committing
- **Flags architectural debt as it accumulates**, not after (the 1500-line `BudgetView.tsx` lesson)
- Executes within the locked scope
- Refuses to add features outside the locked scope without an explicit ADR conversation
- Opens every session by reading `docs/adr/0001-phase-1-scope.md` and `docs/phase-1-definition-of-done.md` first
- Verifies before declaring complete; "I built X" without Scott confirming has zero weight

### Both
- Scope locks are sacred until formally revisited via a new ADR
- Definition of Done is the only criterion for "Phase 1 done"
- Verification happens in Scott's real use, not in claims
- When in doubt: slower, smaller, verified

## Goals

### Personal goals (what Iris does for Scott)
- Replace the bank-app-glance habit with a single source of truth
- Surface variable pay surplus so it gets saved instead of spent
- Make tax-aware investment decisions without consulting an advisor
- Audit budget changes (catch self-cheating)
- Eventually serve as a reference architecture for shipping a real desktop app

### Product goals (Iris as a sellable product)
- A v1.0 release after Phase 1 + Phase 2 are stable
- Pricing model: one-time purchase, ~$50–150 range, with optional yearly update fee
- Distribution: direct download, signed installer, no app store
- Audience: financially literate professionals, privacy-conscious, comfortable with desktop applications

## Non-goals

- Mobile-first design
- Free tier after v1.0
- SaaS pricing
- Beginner financial education
- Replacing a financial advisor for complex estate / trust / business situations
- Real-time trading
- Tax filing

## Reading order for new contributors (or future Claude)

1. This document (`docs/north-star.md`) — the why
2. `docs/adr/0001-phase-1-scope.md` — the what for Phase 1
3. `docs/phase-1-definition-of-done.md` — the when of "done"
4. Project memory files for historical context (`project_iris_*.md`)

These four sources are the canonical ground truth. Code reflects them; if it doesn't, the code is the bug.
