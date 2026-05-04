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

### Security process (permanent rules — non-negotiable)

These aren't dimensions to score; they're hard process rules. Both Scott and Claude follow them.

- **Credentials never go in chat.** Database connection strings, API keys, passwords, OAuth tokens — none of them. Even when explaining what you're looking at in a dashboard. Even partial pastes count.
- **Confirm shape, not content.** If Claude needs to verify a string's format, the user describes the shape ("`postgresql://user:pass@host:port/db`, password starts with a capital letter") rather than pasting the actual string. The shape is enough for diagnostics.
- **Leaked credential → rotate immediately.** Before proceeding with anything else, before end of session, before "I'll do it later." Rotating an empty-DB credential is free; rotating one holding real data isn't.
- **Storage rule.** Credentials live in: a password manager, an encrypted note, OS keychain, or `localStorage` on the user's own machine. Never in: chat transcripts, source code, commit messages, commit bodies, doc files, Slack, email, screenshots without redaction.
- **No re-paste after correction.** If Claude has flagged a credential exposure, the response must not include the credential again — not to confirm format, not as a quote, not anywhere. Refer to it abstractly ("the password you just rotated") and move on.

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

### 2026-05-04 evening — Foundation Session 1 (Build-B) ship

**Mode:** Build (declared at session start).

**What landed:**
- Vite middleware API at `/api/*` via `configureServer`. `pg.Pool` (max: 5) cached server-side. `POST /api/connect` opens the pool from a connection string POSTed by the client; `GET /api/health` round-trips `SELECT 1`.
- Client bootstrap (`src/lib/db-client.ts`) hooked into `main.tsx` reads `localStorage.iris_db_connection_string` and POSTs it on app boot.
- `tsconfig.node.json` extended to type-check `server/**/*.ts`. Type-check green.
- Smoke verified end-to-end against Scott's real Supabase Session Pooler URI: client console `{status:'connected'}`, `curl /api/health` returns `{ok:true,db:'connected'}` 200.
- Commit `6bb9843`. Pre-commit hook passed.

**Cadence patterns observed:**
- *Mode declaration* — opened with "Build mode declared. Sized to Build-B." Set the rules at the top.
- *Stop-and-verify before action* — paused for credential audit (grep) before staging the commit. Found only abstract examples in cadence-log; no leak.
- *Right-sized scope* — held the Build-B line under auto mode. No drift into schema or real endpoints despite tokens being available. Schema explicitly deferred to Session 2.
- *Joint validation* — Scott's "do this in Chrome, not Island" challenge before pasting. Surfaced the right concern (his real data lives in Chrome; future migration script will run from there). Measure-twice instinct on the platform layer.
- *Same-session ship-to-verify* — the validation-discipline gap. Build-B closed it: scaffold shipped *and* verified against real Postgres in the same session. Not a deferred-verify; a lived one. This is the pattern the dimension is asking for.

**Cadence read for the dimension that matters most this session:**
- *Validation discipline (~65% → directional improvement):* same-session ship-to-verify happened cleanly. Real-Postgres `SELECT 1` round-trip completed before commit. The previous lag pattern (ship now, verify later) did NOT recur. Worth re-grading at next milestone.
- *Scope discipline (~75%):* held under auto mode. Build-B was three files + two endpoints; nothing more.
- *Process discipline (~80%):* commit message references ADR-0002, scope explicitly states "Session 1 of 3," handoff prep started before context burn.

**Net for the session:** The smallest possible end-to-end slice that proves Foundation works. Pool is server-side, client-agnostic, smoke-clean. Sessions 2 + 3 open with a foundation that's already breathing.

### 2026-05-04 late afternoon — Foundation pre-work + partnership-correction self-flag

**Mode:** Audit / handoff prep.

**What landed:**
- Scott completed Supabase pre-work (account, project, Session Pooler URI selected, password rotated, connection string saved locally). Foundation Session 1 (Build-B) is fully unblocked for next session.
- Scott pushed back on a redundant carryover I had listed: I wrote "Teller signup" + "NetBenefits OFX check" as separate items. Scott asked the right question — if Teller covers Fidelity, why maintain a redundant OFX path? OFX is dying. He was correct; the verification consolidates to one 10-min Teller widget check that answers both questions at once.
- Scott deferred the Teller signup itself to next session (his prerogative as project lead). Not blocking — connector work is several sessions out.

**Cadence patterns observed:**
- *Self-flag on partner correction* — Scott caught me listing redundant work. Sharp instinct on consolidating connectors to single source of truth.
- *Anchor return* — explicit "make sure we're following the appropriate paths" before accepting my framing.
- *Stop-and-verify before handoff* — Scott asked for explicit validation pass on database migration status and SimpleFIN→Teller status BEFORE letting me write the handoff. Caught the dimension where I might have implied we'd shipped something we hadn't.
- *Right-sized session length* — recognized 419k/1M token usage and proactively asked whether to switch sessions. Discipline applied to session scope, not just task scope.
- *Process discipline under pressure* — credential rotation was immediate when flagged, no negotiation, no "I'll do it later."

**Cadence read across the day:**
- *Vision discipline:* steady ~85%
- *Scope discipline:* held strong — multiple times where scope could have crept (riff sessions, mid-conversation idea expansion) and Scott self-pulled
- *Process discipline:* notable jump — Scott ran the working-agreement process *for* Claude on the storage-architecture ADR, asked for validation passes, insisted on joint affirmation
- *Validation discipline:* the storage-architecture decision delays the ship-to-verify cycle until Foundation lands; not a regression, just deferred. Real-data DoD #5 + #6 verifications still pending.
- *Decision velocity:* improved — picked Build-B over Build-A, then deferred Build entirely when context budget was the deciding factor. No "let's push through anyway."

**Session count this calendar day:** one long arc with multiple modes (Build → Decision → Audit → handoff). Roughly 7-8 hours of partnership work shipped 6 commits + the cadence framework + security rules + Foundation pre-work. Not a session length to repeat regularly, but the work was scope-clean.

### 2026-05-04 afternoon — security process learning

**Mode:** Build prep (Supabase signup before next session's Foundation work).

**What happened:** Scott pasted his Supabase database connection string into chat while orienting around the dashboard UI — twice in five minutes (once as part of the full URI, once as the password by itself). The DB was empty (no real data exposure), but the credential itself was now multiply-compromised across chat transcript, Anthropic logs, and possibly local Claude Code cache.

**What worked:**
- Claude flagged immediately on the first exposure with a "stop, rotate now" call.
- Scott rotated within minutes without pushback or "I'll do it later."
- Scott explicitly asked the moment be logged as a learning lesson — *self-flag* pattern in real time.
- Scott named the principle himself: "thanks for holding the line on best practice."

**What gets encoded forward:**
- New "Security process (permanent rules)" subsection in this doc — non-negotiable process rules, separate from dimension scoring.
- Specifically: credentials never go in chat; confirm shape, not content; leaked → rotate immediately; storage rule for where secrets live; no re-paste after correction.

**Cadence read:**
- *Validation discipline* doesn't change much — this is a security-process subset, not the same as ship-to-verify validation. Could argue it's a separate "Security discipline" dimension; for now it lives as a hard rule.
- *Process discipline* held strong — rotation happened immediately, no negotiation, no "but...".
- *Self-flag* pattern landed — Scott asking for the learning to be encoded is exactly the trajectory we want.

### 2026-05-04 afternoon — Mode: Riff → Decision → Audit (storage architecture)

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
