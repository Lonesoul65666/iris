# Iris — Where We Are

**Last reviewed:** 2026-05-02 (post vision-lock session)
**Status:** Phase 0 foundation complete. Phase 1 mission newly widened. No Phase 1 features have shipped yet under the locked scope.

This doc is the single "where are we today" snapshot. It is overwritten every substantive session. It does NOT replace `north-star.md` (vision), `adr/0001-phase-1-scope.md` (scope), `phase-1-definition-of-done.md` (gates), or `post-phase-1-backlog.md` (deferrals). It pulls from all four into a single readable picture.

---

## Current state at a glance

**Locked:**
- Phase 1 scope (6 features) — `adr/0001-phase-1-scope.md`
- Phase 1 Definition of Done (8 binary criteria) — `phase-1-definition-of-done.md`
- Mission and target user — `north-star.md` (rewritten 2026-05-02 evening)
- Tone of voice and presentation — `north-star.md`
- Working principles (10 items, including new Co-op + Parallel-views + Multi-user-aware)
- Working agreement and engineering style — `north-star.md`
- Pre-commit hook (`tsc -b --noEmit`) — `scripts/hooks/pre-commit`
- Local-first, no SaaS, no cloud-storage of financial data — invariant across phases

**In progress / open:**
- Phase 2 sequencing decision — Path A (Investments) vs Path B (Co-op Mechanics). Default Path A → Path B → Phase 3 but no longer fixed. Will be decided via ADR-0002 after Phase 1 ships.
- BudgetView refactor — 1,643-line file, deferred, plan in `post-phase-1-backlog.md`.
- Vitest data-layer test suite (~10 tests) — deferred, plan in backlog.
- Coinbase / Teller / Fidelity OFX connectors — Coinbase next; Teller and Fidelity gated on Scott's pre-build verification (teller.io signup + NetBenefits OFX check).
- Income-source auto-classifier hardening — surfaced 2026-05-03. Multiple mis-classifications on Scott's real data (Cap One CC payment as base, dispute credits / AA refunds / intra-family Zelle transfers as income, variable comp tagged as reimbursement). Needs a guard pass: when one payer produces multiple subtypes, prefer high-variance large-amount streams as `variable` not `reimbursement`; filter out CC payments, dispute credits, refunds, intra-family transfers from income detection entirely.
- DoD #5 verification — Variable Pay card now lands on $7,918 floor (correct after band-detection fix). Pending Scott confirming surplus totals reconcile against his actual paychecks.
- DoD #6 verification — Work Expense card was wildly off due to the classifier bug. Scott reclassified the variable source manually 2026-05-03. Needs verification next session that totals now reconcile against Coupa within $50 over 90d.
- Lint debt (97 errors) — deferred to dedicated session.

**Most recent commits:**
```
4896476 fix(variable-pay): require 3+ paychecks before declaring a pay-band change
80af74f feat(phase-1): trim sidebar to budget engine only via PHASE_1_LOCK
a202e03 docs(north-star): add state.md to reading order
41e04b6 docs: add state.md as the rolling current-state + drift-watch + evaluation snapshot
32c914f docs(north-star): widen mission to couples-first; lock tone principles and engineering style
0765cce chore: initial commit — Iris pre-Phase-1 baseline
```

---

## Vision anchors — the immovable rails

These are the ideas we agreed are central. If a future session drifts from any of these, that's a problem to call out, not silently accept.

1. **Couples-first, solo as single-player mode.** Iris's headline positioning is the partnership-around-money. Solo gets the full experience. The data model anticipates partner-mode from day one.
2. **Money from a chore into a hobby.** The reframe is the heart of the product. If a feature pulls toward "tracking" without "engagement," it's drifting.
3. **Both partners have agency, neither is a viewer.** Co-op, not shared visibility. Honeydue's mistake. If we ever ship a "partner can only read" mode, we've drifted.
4. **Parallel views, not consensus.** Two partners can interpret the same numbers differently. Iris honors both. Don't average opinions into mush.
5. **Money is binary; presentation is layered.** Every UI element either helps the truth or layers the journey. Anything that does neither gets cut.
6. **Local-first, never cloud-storage of financial data.** No exceptions. SaaS is off the table. Cloud sync, if it ever exists, is encrypted P2P or user-controlled file transport.
7. **One-time purchase, not subscription.** Iris itself is sold once, not rented. User-paid third-party data services (Teller, Coinbase API) are separate.
8. **Phase 1 is the Budget Engine. No investment, no AI, no co-op mechanics in Phase 1.** The boring bones come first. Everything else is Phase 2+.
9. **One feature per session. Verify before declaring done.** The discipline rule that prevents the 2026-04-29 sprawl from recurring.
10. **Sessions, not weeks.** Scott's time is finite. The constraint is verification cycles, not coding speed.

---

## Recent shifts (drift detection log)

Append-only log of meaningful vision/scope shifts. Each entry: date, what changed, why, and whether it's a logical enhancement or a drift.

### 2026-05-03 — First Phase 1 ships + income-source classifier diagnosed

- **Changed:** Two code changes shipped: sidebar trimmed to Phase 1 visible views (PHASE_1_LOCK in `useEnabledModules`), and Variable Pay band-detection algorithm hardened with a 3-paycheck minimum-band-size guard (prevents single bonuses/RSU vests from being mistaken for new pay rates). Verified in preview against sample data; verified on Scott's real data — floor lands on his actual $7,918 base.
- **Diagnosed (not yet fixed):** The Work Reimbursements card on Scott's real data shows YTD reimbursed = $38,617 against $8,131 spent — way out of balance. Root cause identified via DevTools query: `inc-abnormal-sec-osv-variable` was mis-classified as `subtype: 'reimbursement'` instead of `'variable'`. Scott reclassified manually. Other classifier oddities surfaced (Cap One credit card payment as 'base', dispute-credit refunds as income, intra-family Zelle transfers as base/variable, restaurant refunds as base) — all logged for a future auto-classifier hardening pass.
- **Why:** First real-shipping moment after the foundation work. Real-use feedback against Scott's data exposed both that the Variable Pay fix worked and that the income-source auto-classifier needs tightening.
- **Enhancement or drift?** **Enhancement.** Scope-clean: stayed within Phase 1 features. The classifier issues feed Phase 1's auto-sync hardening, not a new feature.

### 2026-05-02 evening — Mission widened to couples-first
- **Changed:** target user from "financially literate with literacy floor" → couples-first / solo-mode-supported. Mission paragraph rewritten. Tone principles added. Phase 2 sequencing made open (Path A vs Path B).
- **Why:** Scott explicitly named that he had narrowed the original vision too far. The original incubation was about helping his marriage with money, not about "investment intelligence for financially literate users." The widening returns the product to its original purpose.
- **Enhancement or drift?** **Enhancement.** Returns to original incubation purpose; doesn't expand scope unproperly because Phase 1 features are unchanged.

### 2026-05-02 morning — Phase 0 foundation
- **Changed:** Git initialized; pre-commit hook installed; 33 TS errors fixed; three governing docs committed.
- **Why:** Foundation work to make future feature work less fragile.
- **Enhancement or drift?** Pure enhancement. No vision change.

### 2026-05-01 — Hard reset
- **Changed:** Scope locked at 6 features (ADR-0001 created). Data-layer plan changed from SimpleFIN to Teller dev tier + Coinbase API + Fidelity OFX. Discipline rules adopted.
- **Why:** Recovery from 2026-04-29 sprawl spiral.
- **Enhancement or drift?** Enhancement of process discipline; the data-layer pivot was forced by SimpleFIN limitations.

---

## Honest evaluation: is this a good idea?

This section runs the reality checks Scott asked for. Updated each substantive session.

### Broader competitive / comparable landscape

Beyond the Honeydue / Zeta / YNAB / Monarch / Copilot baseline:

**Co-op gaming references (the mechanics we're trying to port from):**

- **Pokémon Go (Niantic).** Solo + co-op raids + community days. Solo activity always meaningful; co-op multiplies it. Reference for "couples can each do solo and the co-op moments are bonus, not required."
- **It Takes Two (Hazelight Studios).** A literal couples-only video game — designed so neither player can play alone. Won Game of the Year 2021. Proof-point that mechanics designed *only* for two-person play can be both commercially successful and artistically credible. Caveat: the only-two-can-play model is too restrictive for Iris (we want solo-mode-fully-supported), but the design philosophy is instructive.
- **Dark Pictures Anthology (Supermassive Games).** Choose-your-own-adventure horror with drop-in/drop-out co-op for 2–5 players. Each player has perspective on different scenes; choices affect outcomes; partial information drives discussion. Reference for "scheduled co-op moments" — the Movie Night mode is exactly the kind of structured shared experience Iris's Phase 2 Path B could borrow from.
- **Pandemic (Z-Man Games, board game).** 2–4 player full co-op against the game. Specialized roles (Medic, Scientist, Researcher) — different agency, same goal. Reference for "different roles for different partners" — Scott (financial driver) and his wife (financial passenger today, partner tomorrow) have different specialties; Iris should make those specialties productive instead of one-dominant.
- **Codenames Duet (CGE, board game).** 2-player co-op variant of Codenames. Both players see partial information. Each gives clues to the other. Reference for "parallel views with partial information" — exactly the partner-mode UX problem when each partner has different financial visibility.
- **Spiritfarer (Thunder Lotus).** 1–2 player resource management with emotional narrative. Demonstrates co-op + emotional weight + non-combat mechanics — closest tonal cousin to what Iris should feel like.
- **Overcooked (Ghost Town Games).** 1–4 player co-op chaos. Reference for "co-op in real-time" — Iris's "dancing not choreography" principle has analog here.

**Habit / wellness / social-engagement apps (reference for solo-feeds-shared mechanics):**

- **Strava.** Solo activity (running, cycling) feeds shared club challenges, kudos, segments. Strong example of "your solo workout helps the team." Adoption pattern Iris should mirror.
- **Duolingo Friends Quest.** Solo lessons feed a shared streak with a friend. Both must contribute or the streak breaks. Closer to Iris's structure than Strava because the social pressure is bilateral.
- **Apple Fitness+ Group Workouts (SharePlay).** Two people can work out together remotely. Reference for "synchronized but separate" — both partners doing the activity at the same time, not the same physical space.
- **Headspace Buddies (limited rollout).** Shared meditation streaks. Less polished than Duolingo's version; mostly a counter, not a real cooperative mechanic.
- **Strong (workout tracking).** Solo, but social via shared programs. Mostly relevant for what NOT to do — the social layer feels bolted on.

**Other finance apps not previously mentioned:**

- **Splitwise.** Bill splitting between roommates / couples. Transactional, not collaborative. Solves "who owes whom." Doesn't try to do shared financial planning. Reference for what couples *currently* use; people pay for Splitwise Pro because the gap is real.
- **Acorns Together / Family.** Joint investing accounts with kids. Cute but the parent-child framing doesn't translate to spousal partnership.
- **GreenLight / FamZoo.** Family financial education for kids. Different audience but proves families pay for software that ties money to relationships.
- **Goodbudget.** Envelope budgeting with family sharing (free + paid tiers). Closest existing example of "couples sharing a budget tool" but the UX is dated and boring.
- **Lunch Money.** Solo budget app with strong /r/personalfinance fan base. Modern, lovable, $40/yr. Solo-focused. Proof-point that small subscriptions for budget apps can sustain.
- **Origin Money.** Wealth-management app with spouse plan ($200/yr). Adviser-led, not self-service. Different segment.
- **Empower (formerly Personal Capital).** Free wealth tracking, sells advisory services. Very polished. Solo-mental-model. Comp for what Iris's Phase 2 investment layer should reach toward visually.
- **Quicken Premier (desktop, perpetual + subscription tiers).** The dinosaur — clunky but trusted. Reference for "you can charge for desktop financial software."
- **Tiller Money.** Spreadsheet-based finance. Power-user audience. Proof that some users want flexibility over polish; Iris is NOT trying to be Tiller (we're polished + opinionated).

**Conclusion from the broader scan:**

The "couples + co-op + fun + private + local-first" intersection is genuinely empty. Pieces of it exist in adjacent products:
- Strava / Duolingo Friends Quest = solo-feeds-shared mechanic, not in finance
- Honeydue / Zeta = couples in finance, not co-op-fun
- Goodbudget = couples in budgeting, not modern or fun
- Splitwise = couples transactional finance, not planning or fun
- Pandemic / Codenames Duet = different-roles-same-goal, in board games not software

No competitor combines all five attributes. The thesis still holds.

### Reality checks

#### 1. Can we actually build co-op with the local-first constraint?

**Engineering complexity:** Real. Two devices, one shared dataset, no cloud means the sync layer needs careful design. Options:

- **LAN sync (gaming-PC server, family clients):** works at home, breaks when partners are apart. Phase 1 doesn't need this — single device only. Phase 2+ needs it for couples-mode.
- **Encrypted P2P over internet (e.g., Tailscale-like):** works anywhere; Scott already runs Tailscale-style infra at home. Plausible.
- **Shared file via Dropbox/iCloud as transport, e2e encrypted:** simplest; user already has cloud storage. The "cloud" is the user's, not Iris's. Doesn't violate local-first.
- **CRDT-based merge layer:** more rigorous; useful if both partners can edit offline simultaneously. Probably overkill for v1.

**Verdict:** **Solvable, not trivial.** Phase 1 builds single-device only — no sync work needed. Phase 2 design must pick one of the options above. Recommendation: e2e-encrypted-file-on-user-cloud is the smallest defensible path; CRDTs only if real conflicts emerge.

#### 2. Is the dopamine hook designable for finance?

**Risk:** Money tracking is intrinsically NOT delightful. Pokémon Go is fun because catching creatures is intrinsically delightful. Iris's entire delight has to come from the presentation layer.

**Sources of dopamine to investigate during Phase 2 Path B design:**

- **Streaks** — proven (YNAB has them; Duolingo has them). Easy to implement, medium engagement value.
- **Goal progress visualization** — proven. The "you're 67% of the way to Cabo" feeling. Mint-style but better.
- **Surprise wins** — under-explored. "You have $400 surplus you didn't notice this month" hits differently than "your monthly summary."
- **Joint achievements** — Scott's Pokémon-cards-with-his-son model. The "joint book of pulled rares." Untested in finance; designable.
- **Level-ups / tier crossings** — "you've hit Saver Tier 3" — corny in isolation but powerful when paired with real meaning.
- **Scheduled reveal moments** — the "weekly raid" equivalent. A scheduled time the app says "let's look at this together" with prepared content.

**Verdict:** **Designable but requires creative work.** Not a given. We'll need a dedicated Path B design session to actually pick mechanics, not just list them.

#### 3. Are gaming mechanics translatable to finance?

**Translates cleanly:** streaks, leveling, achievements, social progress, goal collisions ("you want X, here's what it costs you in terms of Y").

**Translates with care:** randomness (gambling regulation concerns), competitive ranking (creates marriage stress — bad for Iris), loot boxes (predatory — never).

**Translates poorly:** the "discovery" mechanic (Pokémon Go's "find creatures") — there's nothing intrinsically delightful to discover in your bank account. The "battle" mechanic — money should not be adversarial between partners.

**Verdict:** Selective import. Cherry-pick mechanics, don't wholesale-port a game.

#### 4. Will couples actually adopt it?

**The unproven part of the thesis.** Honeydue claims 1M+ users. Zeta claims 100K+. Both smaller than Mint (24M+) / YNAB (~750K+) / Monarch (1M+). The fun-couples hypothesis is testable but unproven.

Mitigations:
- **Solo-mode-fully-supported** breaks chicken-and-egg. If your partner doesn't sign up, Iris is still useful. Honeydue collapses without partner adoption; Iris doesn't.
- **Authentic founder motivation** — Scott has lived the pain. That correlates with apps that don't get thrown away in three months.
- **Local-first** as differentiator gives a non-couples reason to adopt — privacy-conscious solo users come for that, partner-mode is upsell.

**Verdict:** **Real risk. Not project-killing.** Phase 1 ships even if partner-mode never lands. The couples premium thesis is the upside bet.

#### 5. Can we charge $50–150 one-time?

Comparable pricing:
- Lunch Money: $40/yr
- Tiller: $79/yr
- YNAB: $99/yr
- Monarch: $100/yr
- Copilot: $95/yr
- Quicken Premier: ~$100/yr (subscription) or perpetual $50–80
- Origin Money: $200/yr (advisor-led)
- Honeydue / Zeta: free (freemium)

$50–150 one-time = ~1–1.5 years of competitor subscription. Privacy-and-local-first justifies premium. Quicken's perpetual-license precedent exists.

**Verdict:** **Defensible at $50–80 one-time, more aggressive at $150.** Pricing not locked. Final figure depends on perceived value at launch.

#### 6. Is the engineering capacity (Scott + Claude) realistic?

Comparison:
- Pokémon Go: 100+ engineers
- Honeydue: 10–20 engineers
- YNAB: 50–100 engineers
- Monarch: ~30 engineers
- Lunch Money: solo founder + occasional contractors

Iris is closer to the Lunch Money pattern. Phase 1 (boring bones) is achievable in N sessions because most patterns are proven. Phase 2 Path A (investments) is straightforward portfolio math. Phase 2 Path B (co-op mechanics) is harder — design-novel + sync architecture. Phase 3 (intelligence) is hardest — LLM cost, accuracy, latency.

**Verdict:** **Phase 1 realistic. Phase 2 doable. Phase 3 ambitious.** The engineering bottleneck is Scott's time, not Claude's output.

### Strong ideas vs. maybe-not ideas

**Strong (high-confidence keep):**
- Couples-first positioning + solo-also-fully-supported
- Money-as-hobby reframe
- Local-first as differentiator
- Joint collection model (Scott's Pokémon-cards analog)
- Scheduled co-op moments (Dark-Pictures-Anthology pattern)
- Streak / leveling / goal-progress dopamine sources
- Tone principles (best-friend voice, dancing-not-choreography, money-binary-presentation-layered)
- Validation-before-reassurance engineering style
- Sessions-not-weeks timeline framing

**Medium (designable, not yet validated):**
- D&D dice-roll for ties — fun but niche; v3+ candidate
- Personalization-by-interest (racing/games/etc.) — strong v5 concept; far future
- Surprise wins as a first-class feature — needs design work
- Different-roles-different-partners (Pandemic-style) — interesting but partner-mode UX must come first
- Evolution arc — works in Duolingo / Strava; needs Iris-native flavor
- E2E-encrypted-file-on-user-cloud as sync layer — defensible but unproven for finance

**Maybe-not (flagged risks):**
- Literal "Pokémon Finance" with creature characters — Scott self-flagged as too niche
- Mobile-first — Scott explicitly ruled out
- Cloud sync as primary — violates local-first
- Random rewards / loot boxes — predatory pattern, never
- Competitive ranking between partners — creates marriage stress, anti-mission
- "Battle" or adversarial mechanics — money shouldn't be a fight

### Overall assessment

**Positioning:** ~30% of total design work, done well. The thesis is defensible against the broader competitive landscape (no competitor combines all five attributes — couples + co-op + fun + private + local-first).

**Mechanics:** ~5% done. We have a list of candidates from gaming and adjacent apps; we have not yet designed Iris-native mechanics. This is Phase 2 Path B work.

**Engineering:** ~10% done. Foundation laid. Phase 1 features designed but not built. Sync architecture for partner-mode is unsolved.

**Reality-check verdict:** **Yes, this is a good idea that's worth building.** The risks are real (partner-mode adoption is unproven; local-first sync is non-trivial; money is intrinsically boring under the hood) but none are project-killing. The path through Phase 1 is clear and doesn't depend on the unproven parts.

The hardest thing left is designing the co-op mechanics that turn a working budget engine into something couples come back to. That's a Phase 2 Path B problem, not a Phase 1 problem. **Phase 1 is the right thing to build now.**

---

## Open decisions and bets

These are the things we know are unresolved. They don't need to be resolved now, but they shouldn't be forgotten.

| Decision | When it gets made | Inputs needed |
|---|---|---|
| Phase 2 sequencing: Path A (Investments) vs Path B (Co-op Mechanics) | ADR-0002, after Phase 1 ships | Scott + wife real-use feedback; Path B mechanics design sketches |
| Sync architecture for partner-mode | Phase 2 design | Pick: LAN-only, e2e-encrypted-file, CRDT, or hybrid |
| Pricing at v1.0 launch | Just before v1.0 release | Comparable pricing audit; perceived value at that point |
| Native mobile companion (mobile-glance mode) | Beyond Phase 3 | Whether desktop adoption produces real demand for it |
| Lint cleanup session | Between end of Phase 1 dogfood and start of Phase 2 | Decide whether to fix in one pass or roll into Phase 2 |
| Whether to publish openly (GitHub) before v1.0 | Personal preference, no engineering blocker | Scott's comfort with public-WIP visibility |

---

## Drift watch — things to call out next session if they show up

If the next session does any of these without an explicit ADR conversation, push back:

- Adds a feature outside the locked Phase 1 six
- Drops one of the locked Phase 1 six
- Builds anything Phase 2 / Phase 3 in Phase 1
- Designs partner-mode UI before the data layer is multi-user-aware
- Switches to cloud-storage of financial data
- Adds SaaS plumbing, hosted accounts, or cloud-required features
- Bypasses the pre-commit hook (`--no-verify`) without explicit permission
- Skips the verification step for a "shipped" feature
- Drops the partnership-as-equals frame (e.g., reverts to deferential mode or flips to bossy mode)
