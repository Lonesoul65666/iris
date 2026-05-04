# Cadence Log

**Purpose:** Track Scott's evolution as project lead across the Iris build. Real evidence, not vibes. Provides receipts for milestone re-grades.

**Goal:** 85% flat across all dimensions by v2.0 release. Realistic learning-curve target.

**Last updated:** 2026-05-04

---

## Dimensions tracked

Five dimensions, each scored as a rough directional read (not a precise number — directional honesty over false precision).

| Dimension | Definition |
|---|---|
| **Vision discipline** | Holding the mission steady. Catching own visionary spirals. Re-anchoring on mandates. |
| **Scope discipline** | Spotting creep early. Defaulting to "ADR conversation" when scope tries to shift. Saying "that's backlog" reflexively. |
| **Process discipline** | Running the working-agreement process automatically. ADRs, joint decisions, validation before reassurance. |
| **Validation discipline** | Closing the ship-to-verify loop fast. Same-session validation when possible. Real-use feedback over screenshots. |
| **Decision velocity** | Picking the smaller-bounded path when ambiguous. Sizing work for time and energy available. Not deferring to "do it properly" forever. |

## Current scores (2026-05-04)

| Dimension | Score | What 85% would look like |
|---|---|---|
| Vision discipline | ~85% | Already there. Keep flagging spirals at minute 2, not minute 5. |
| Scope discipline | ~75% | "ADR conversation" reflex on every scope shift. Backlog-default for new ideas. |
| Process discipline | ~80% | Working-agreement steps are automatic — Scott runs them, not prompted by Claude. |
| Validation discipline | ~65% | Validation step in same session as ship, not "next session." |
| Decision velocity | ~75% | Smaller-bounded default when ambiguous. "Do it properly" balanced against "ship and learn." |

**Lowest dimension:** Validation discipline. **Biggest jumps since 2026-05-02:** Scope (~50% → ~75%) and Process (~60% → ~80%).

---

## Session modes (declare at start)

Different sessions serve different purposes. Calling out the mode at the start prevents confusing intentional ideation with unintentional drift.

- **Riff** — open ideation, no scope discipline expected. Vision crystallization. Time-boxed. *During riff sessions, visionary spirals are the point — Claude does NOT flag them as drift.* Endpoint is "OK, what crystallized?"
- **Decision** — pick between options. Validation, mandates check, ADR-conversation discipline. Crystallizes into ADR or commit.
- **Build** — execute on decisions already made. Tight scope. Ship and verify.
- **Validation** — verify shipped work against real use. Reconcile numbers, eyeball UX, confirm DoD criteria.
- **Audit / cleanup** — backlog grooming, doc updates, drift-watch review, stepping back.

Sessions can be **sequenced** (riff → decision → build is common, as on 2026-05-02 evening). Each segment runs by its own rules. Scott calls the transitions: "OK we're done riffing, decision mode now."

**Why this matters:** Cadence scoring penalizes unintentional drift, not intentional riffs. Naming the mode keeps the scoring honest.

---

## Vocabulary — patterns to flag

Both Scott and Claude use this shorthand. Faster than re-explaining, neutral framing (not value-laden).

### Drift patterns (call out when they appear)

- **Visionary spiral** — unstructured riffing past ~3 min in a non-riff session, without crystallization. Flag: "flagging — visionary spiral, want to keep going or lock?"
- **Bucket creep** — small task expanding mid-conversation. Flag: "flagging — this just grew. Stay or trim?"
- **Validation gap** — shipping ahead of confirmation. Flag: "flagging — shipped X, haven't validated Y."
- **Done-but-deferred** — using "do it properly" as a perpetual reason to defer. Flag: "flagging — this might be a defer-forever, want to ship the smaller version?"
- **Process punch-through** — scope changing without an ADR conversation. Flag: "flagging — we're amending scope, need an ADR conversation."
- **Auto-mode sprint** — using auto-mode to blast past discipline rules. Flag: "flagging — auto mode is on but this needs a checkpoint."

### Positive patterns (call out when they land)

- **Self-flag** — Scott catches his own pattern before Claude does.
- **Anchor return** — Scott explicitly pulls us back to mandates ("make sure this fits our mandates").
- **Joint affirm** — "we BOTH agree" before committing to scope changes.
- **Right-sized** — picking work bounded to time/energy ("C first because smaller, then D").
- **Stop-and-verify** — pausing to confirm before proceeding ("before we decide a path...").
- **Mode declaration** — explicitly naming the session mode at the start.

---

## Re-grading cadence

Formal re-grades happen at **milestones**, not session-by-session. Too-frequent grading creates performance anxiety; milestone-paced grading rewards real trajectory.

| Milestone | Expected timing | What gets re-graded |
|---|---|---|
| **Phase 1 DoD achieved** | After 30-day soak passes | All five dimensions |
| **v1.0 ship** | After Phase 1 + Phase 2 (Path A or B) ship | All five dimensions |
| **v2.0 ship** | After Phase 2 unchosen path + Phase 3 ship | All five dimensions — target hit point |

Between milestones: end-of-session cadence note (one bullet improved, one bullet slipped). Not graded. Just observed evidence for the next re-grade.

---

## Trajectory — append-only evidence log

Each entry: date, session mode, observations on each dimension, specific examples.

### 2026-05-04 evening — Mode: Riff → Decision → Audit

**Vision discipline (steady ~85%):**
- 3+ self-flags during the storage-architecture conversation: "this is where I start to spin," "we're still just conceptually riffing," "let me know if I'm missing anything."
- Returned to mandates explicitly: "make sure it fits into our mandates. Look over the logic for any gaps... validate it against and rewrite our focus."

**Scope discipline (~75%, up from prior session):**
- Caught storage migration as a real architectural call-out, not silent drift: "we should pause... this doesn't seem scalable."
- Asked for ADR conversation explicitly before any code: "let's not build yet, let's just keep talking through some of these conceptual ideas."
- Insisted on joint decision: "if we BOTH agree this is correct direction to take."

**Process discipline (~80%, up):**
- Ran the working-agreement process *for* Claude, not waiting for Claude to surface it.
- Required validation pass against mandates BEFORE drafting the ADR.
- Required documentation of changes with versioning before moving forward.

**Validation discipline (~65%, no change):**
- Pattern repeated: shipped Variable Pay band-detection fix on 2026-05-03, validated on real data later. Still a lag, but the lag closed within the same calendar day.
- Reclassified the variable-comp source manually after diagnostic; verified totals dropped sane same-session.

**Decision velocity (~75%, up):**
- Picked "C first because smaller, then D" — explicit sizing.
- Picked "B (log it)" over "A (quick fix)" when the right answer needed more thought.
- Caught when Claude was about to recommend single-machine SQLite and pushed back: "I don't think this is a good architecture at all."

**Mode flag observation:** Scott asked tonight whether to openly call out riff sessions. Yes — codified in this doc.

**Net for the session:** The partnership operating well. Architectural decision documented cleanly with mandates checked, alternatives considered, joint yes before commit, and explicit ADR-versioned record. This is the working-agreement at full strength.

---

## How Claude will use this log

- **Real-time flagging** during sessions using the vocabulary above. Both drift and positive patterns named explicitly.
- **End-of-session note** appended here on substantive sessions. One bullet improved, one bullet slipped, key examples.
- **Milestone re-grades** reference the accumulated entries — evidence over recall.
- **Calibration check** — if Claude's flagging starts feeling either too lenient or too harsh, this log shows the trajectory and we recalibrate together.

---

## Reminders for both partners

- The point isn't the score. The point is the trajectory.
- Riff sessions don't get penalized — they get *named* so they don't get confused with drift.
- "85% by v2" is ambitious and realistic. It's a learning curve, not a sprint.
- Honest tone over flattery. Both directions — name the wins, name the slips.
- The log lives in the repo so it survives across sessions and across Claude instances.
