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

### 2026-05-10 — Reset & Reconnect after a 3-week gap (Build-D2b validated, SimpleFIN removed)

**Mode:** Decision/Audit → Build. Scott returned after ~3 weeks (mom's open-heart surgery, job hunt, Hawaii trip) and opened with the hard founder question: "is this a good project to do?"

**What landed:**
- Project decision reaffirmed with an honest assessment (commercial = long shot vs funded competitors; marriage-tool + learning vehicle = genuinely worth it). Win-condition reframed.
- External-service reset: Supabase restored (data survived the auto-pause), SimpleFIN service confirmed dead.
- Swarm review (4 parallel agents) before resuming — surfaced split-brain, cold-start, SimpleFIN-live, no-tests, 14 real react-hooks lint errors.
- Build-D2b validated in Scott's REAL Chrome (Claude-in-Chrome extension) — found + fixed 2 bugs (toLowerCase crash, $NaN from garbage smoke rows) that type-check and server-side curl both missed.
- SimpleFIN fully removed; console now clean. Two clean commits (`1c793ef`, `5548e46`).

**Cadence patterns observed:**
- *Self-flag / stop-and-verify (Scott, strongest of the session):* "before we start building on this again... is this a good project?" — pausing to re-examine the whole premise before sinking more sessions into plumbing. Exactly the right question at exactly the right time (before, not after, more Foundation work).
- *Honest tone held (Claude):* did NOT cheerlead the commercial viability. Separated "good business" (long shot) from "good for Scott's actual goals" (yes). Partnership doc's "straightforward when something is low-impact; push back, don't quietly comply" operating as intended.
- *Anchor return (Scott):* "we are switching to the other one correct?" before letting SimpleFIN be removed — verified the connector strategy was intact before accepting a deletion. Caught a potential "are we stranding ourselves?" risk and resolved it.
- *Real-use feedback over screenshots (both):* Scott insisted on validating in his actual Chrome, not the preview browser. That insistence directly surfaced 2 real bugs. Vindicates the partnership principle hard — "I clicked X and Y happened" beat every automated check we'd run.
- *Continuity-survives-gaps (system working):* a 3-week gap with zero scramble to resume. The handoff/doc discipline paid off exactly as designed. Reframed Scott's apology as "the system is working" rather than accepting fault.

**Cadence read:**
- *Vision discipline (~85%):* steady. The "is this worth it" gut-check is high-order vision discipline, not drift.
- *Scope discipline (~80%):* held — SimpleFIN removal stayed surgical; split-brain explicitly deferred as a decision rather than silently expanded or silently ignored.
- *Process discipline (~85%, up):* swarm-before-resume, validate-in-real-browser, two clean commits with thorough messages, docs updated same session.
- *Validation discipline (~75-80%, continued climb):* real-Chrome validation is now the default, not an afterthought. Bugs caught and fixed same-session.
- *Decision velocity (~80%):* the project-continue decision and the connector-strategy confirm were both made cleanly and quickly once the honest framing was on the table.

**Net:** The strongest validation-discipline session yet — driving the real browser caught two bugs nothing else would have. The project survived a 3-week real-life interruption and resumed clean. Honest assessment delivered without sandbagging or cheerleading. Split-brain remains the one open architectural decision before Foundation can be called fully done.

### 2026-05-05 midday — Build-D2a solo ship (collections table + migration script extension)

**Mode:** Build (declared, solo execution while Scott was away ~1 hour).

**What landed:**
- `0002_budget_config.sql` — generic `collections` table for the eight budget-config stores. One table, not eight; rationale documented in the SQL file + commit message + state.md.
- `server/api-handlers/collections.ts` — list + save (single item or batched in a transaction).
- `server/api-plugin.ts` mounts `/api/collections/:name/{list|save}` with single-name routing.
- `src/lib/migrate-indexeddb-to-postgres.ts` restructured into v1/v2 phases. Each independently flagged + idempotent. v2 attempts batch save, falls back to per-row on batch failure.
- Smoke verified end-to-end: list / single-save / batch-save / cross-collection / invalid-name-400 / unknown-action-404 / upsert. Migration 2 applied on Scott's Supabase via the bootstrap connect.
- Commit `cac6201`. Type-check green.

**Cadence patterns observed:**
- *Solo execution with scope discipline.* Scott declared a 1-hour validation gap; I sized Build-D2a as "purely additive, no UI changes, no risk to running app." Worst case = revert before he returns. Auto mode + 1-hour window + no-human-in-loop is exactly the failure mode the partnership doc names — held the scope cleanly. **First time we've tried solo execution this deliberately. Worked because the scope was bounded *before* I started, not negotiated as I went.**
- *Generic vs specific architectural call.* The schema decision (one collections table vs eight per-resource tables) was a real call. Documented the rationale in three places (SQL leading comment, commit message, state.md entry) so future-Claude (or Scott) can push back if the call ages badly.
- *Synthetic-smoke-before-real-data pattern repeated.* Build-D1 learned that synthetic shapes pass validation that real data doesn't. Build-D2a's smoke proves the wiring; v2's real-data run from Scott's Chrome will prove shape compatibility for the eight budget-config stores. Two separate proof points; neither substitutes for the other.
- *Right-sized stop.* Build-D2b (store-call swap + UI verification + JSON export) explicitly didn't get touched. Auto mode didn't bleed into "while I'm in here, just do the swap."

**Cadence read for the dimensions that mattered:**
- *Scope discipline (~80%):* held under the hardest mode yet (solo + auto + bounded time). The swap was right there; didn't take it.
- *Process discipline (~80%):* commit message references ADR-0002, scope-decisions explicit, real-data validation explicitly deferred to Scott's return.
- *Validation discipline (~70-75%):* synthetic smoke ran before commit; real-data run still to come. Pattern: prove the wiring solo, prove the data with the partner.
- *Decision velocity (~80%):* the generic-vs-specific schema call + the v1/v2 split + the "fall back to per-row on batch failure" robustness pattern were all decided in seconds.

**Net for the session:** Solo execution proven viable for scoped additive work. The partnership rule "Auto mode does NOT mean Claude drops the one-feature-per-session rule or scope locks" held. Build-D2a is the smallest interesting next step from D1; the table is ready, the endpoints work, the migration script is extended. v2 real-data run + store-call swap waits for Scott — the right boundary.

### 2026-05-05 morning — Foundation Build-D1 ship (IndexedDB → Postgres migration)

**Mode:** Build (declared at session open after morning catch-up).

**What landed:**
- `src/lib/migrate-indexeddb-to-postgres.ts` — read-only migration script for `incomeSources` + `expenses`. Idempotent via `migration_v1_complete` settings flag. Per-row errors collected, never fatal.
- Exposed on `window.__irisMigrate` from `main.tsx` for DevTools-console invocation. Not auto-run.
- Real-data shake-out fixed in same session: expenses endpoint patched with `normalizeDate()` (accepts ISO datetime, MM/DD/YYYY, Date.parse fallback) and `normalizeAmount()` (accepts numbers + strings with `$`/commas). Error response now returns `invalidFields` + `seenTypes`.
- Migration ran clean: 22/22 income sources, 638/638 expenses, 0 errors, 51.9s. Postgres counts validated via list endpoints.
- Connector-collision decision logged in `post-phase-1-backlog.md` (three candidate paths: dedupe-on-import / reset-and-replay / tag-the-source). Pre-Foundation-Session-4 gate.

**Cadence patterns observed:**
- *Same-session diagnose-and-fix.* First migration run: 22/22 incomeSources clean, 0/638 expenses (every one rejecting with `invalid_expense_shape`). Root-caused via the 400 response pattern (date format too strict), patched the validator, re-ran with `force: true`, second run completed cleanly. Diagnose → fix → verify in one continuous loop. Validation discipline pattern continues — third consecutive ship-to-verify in three sessions.
- *Real-data over synthetic mocks.* Build-C's smoke tests passed with synthetic shapes that conformed perfectly. Build-D1 used Scott's actual IndexedDB data and immediately surfaced the date-format gap. **Synthetic smoke ≠ real-data validation.** Worth banking permanently.
- *Right-sized split held.* Original Foundation Session 3 was scoped as one big "migration + swap + export." Split into D1 + D2 this morning. D1 stayed at scope (migration only, no swap). Auto mode + the temptation to "just keep going" both declined.
- *Architectural awareness on the connector-collision question.* Scott surfaced "will the new connectors overwrite the migrated data?" — not as a now-problem but as a flag-for-later. Logged in backlog as a deliberate decision point before Foundation Session 4 wires the first connector. Stays-deliberate vs sleepwalking is exactly the partnership-doc "modular decomposition I self-audit" rule operating.
- *Cross-browser validation declined as ritual.* Scott asked whether to test browser-agnostic now. Right call: it's architecturally guaranteed by ADR-0002, automatically surfaces in Build-D2 when store calls swap. No separate ritual needed. **Skipping a validation step that doesn't unblock anything is itself good discipline.**

**Cadence read for the dimensions that mattered:**
- *Validation discipline (~70-75%, holding):* third consecutive same-session ship-to-verify. Real-data shake-out happened during the same session that wrote the script. Pattern is repeating.
- *Scope discipline (~80%):* D1 vs D2 split landed cleanly. The connector-collision question got documented, not silently absorbed.
- *Process discipline (~80%):* commit messages reference scope decisions explicitly. Backlog updated with the decision point before next session even opens.
- *Decision velocity (~75%):* "skip the cross-browser test, it's auto-validated later" was the right call made in seconds.

**Net for the session:** Postgres now holds Scott's actual data — 22 income sources, 638 expenses. The React app still reads from IndexedDB until Build-D2 swaps the store calls. Pattern established: synthetic smoke proves wiring, real data proves shape compatibility. Both matter; neither substitutes for the other.

### 2026-05-05 late evening — Foundation Session 2 (Build-C) ship

**Mode:** Build (declared at session open after the Decision/Audit pause earlier in the day).

**What landed:**
- Schema migration runner with `schema_migrations` + SHA-256 drift detection (`server/schema/runner.ts`).
- `0001_init.sql` creates `users`, `settings`, `income_sources`, `expenses` — every domain table has `user_id` from day one. Hybrid columns + jsonb `data`.
- `db-pool.ts` extended: `connect()` now runs migrations and ensures-single-user, caches the user id for handlers.
- Three resources of typed endpoints across two handler files plus shared http-utils: settings (list/get/save), incomeSources (list/save), expenses (list/save with date range).
- `/api/connect` and `/api/health` surface migration status alongside their existing payloads.
- All eight endpoints smoke-verified against Scott's live Supabase Postgres in the same session as the ship.
- Commit `5e00bd3`. Type-check green. Pre-commit hook passed.

**Cadence patterns observed:**
- *Mode declaration* — Decision/Audit pause earlier in the day → Build mode declared explicitly when shifting. Both modes scoped clean.
- *Same-session ship-to-verify* — schema applied, endpoints written, smoke-tested end-to-end, all in one continuous loop. No "I'll verify next session." This is the validation-discipline pattern landing the way it should.
- *Right-sized scope under auto mode* — three temptations to scope-creep declined: (a) no DELETE endpoints (would have made smoke cleanup trivial but isn't Build-C scope), (b) no migration script (Session 3), (c) no store-call swap (Session 3). Auto mode + token budget didn't override the scope rule.
- *Hybrid schema decision documented* — typed columns + jsonb is a real architectural call, not silent. Logged in commit message + state.md so Session 3 inherits the rationale.
- *Honest cleanup deferral* — three smoke-test rows in live DB acknowledged in commit message + state.md, deferred to Session 3 housekeeping. Not silently left.

**Cadence read for the dimensions that mattered:**
- *Scope discipline (~75-80%):* held cleanly across the day across two mode shifts. Decision/Audit didn't drift into Build; Build didn't drift into Session 3.
- *Process discipline (~80%):* commit messages reference ADRs explicitly, docs got updated *with* the code (not in a follow-on session), handoff prep started before context burn.
- *Validation discipline (~70%, up from ~65%):* second consecutive ship-to-verify in the same session. Build-B yesterday, Build-C tonight. Pattern repeating.
- *Decision velocity (~75%):* hybrid schema was a real call (column-per-field vs full jsonb vs hybrid); picked hybrid in seconds and moved. No analysis-paralysis.

**Net for the day:** Two shifts (Decision/Audit → Build) and two ships (state.md refresh + Build-C). 9 commits total today (`a056293` … `5e00bd3`). Architectural moment: Postgres is now a real participant in Iris, even though the app still reads/writes IndexedDB. Session 3 is the swap — at which point IndexedDB becomes ceremonial fallback and Postgres becomes canonical.

**Partnership-process moment worth banking:** Right after I declared Build-C "shipped," Scott caught the verification gap — paraphrasing: "before continuing, do we need to validate this? Make sure I'm keeping to the partnership piece." Server-side smoke tests had passed but user-side validation hadn't. I gave him four concrete checks (app loads + console clean, `/api/health` returns expected JSON, Supabase Schema Visualizer shows the 5 tables wired correctly, Tables view shows row counts). All four passed; he closed the loop by sharing screenshots. **This is the partnership doc's "verifies before declaring complete; 'I built X' without Scott confirming has zero weight" rule operating exactly as designed.** The pattern to keep: server-side verification is *evidence*, user-side validation is *closure*. Don't conflate.

### 2026-05-05 — Decision/Audit pause: connector verification + competitive refresh + institution map

**Mode:** Build → Decision/Audit transition (declared mid-session). Scott pulled the wheel: "before we move and develop any further, let's understand."

**What landed:**
- Origin + Monarch competitive deep-dive replaced stale state.md notes. Origin is no longer "$200/yr advisor-led, different segment" — it's a $99/yr full platform with three-view Partner Mode, reviewer-rated weak on budgeting. Monarch's "Shared Views" (mine/theirs/ours + per-transaction privacy toggle) is the most mechanically sophisticated couples competitor shipping. Iris's differentiation refined to (privacy + one-time-pay + budget-engine-quality + co-op-as-gameplay).
- Teller real-coverage map locked: BoA + Citibank + Capital One all verified end-to-end (consent → login → `onSuccess` callback → access token). Each handshake completed cleanly via the scratch launcher served at `http://localhost:5173/teller-connect.html`.
- Wells Fargo (mortgage only), Fidelity (401k + investments), Morgan Stanley (equity), Coinbase (crypto) added to the institution inventory. Connector strategy refined: 3 connector types (Teller + OFX + Coinbase API) covering 7 institutions. Morgan Stanley adds an OFX enrollment, not a fourth connector type.
- Five doc commits today (`674704b`, `82caf4d`, `8a0c438`, `7f9ad05`, plus this cadence entry pending). No code changes. Working tree clean.

**Cadence patterns observed:**
- *Anchor return + stop-and-verify (Scott):* explicit mid-session pause — "we are at a crossroads...let's not move further before we understand." Pulled mode from Build to Decision/Audit cleanly.
- *Real-use feedback over screenshots (Scott):* actually went to teller.io, registered the app, ran Teller Connect, hit failures (Citi first try, file:// origin bug), pushed through. Validation discipline lived, not just promised.
- *Self-flag on misread (Scott):* corrected "Orion" → "Origin" mid-thread without ego. Caught his own bad data point.
- *Validation before reassurance (Claude):* corrected the "$1 sale" misconception ("it was a marketing promo, not an abandoned project") with research backing. Did not reflexively agree with Scott's framing.
- *Right-sized scope under auto mode:* multiple chances to spin up code (improve scratch launcher more elaborately, build a full Connect-and-API harness, start Foundation Session 2). Held the line at "no code, finish the audit."
- *Same-session ship-to-verify (Claude + Scott):* `file://` null-origin bug surfaced, diagnosed via DevTools console, fixed via serving through Vite, verified end-to-end — all in one continuous loop. The validation-discipline gap (~65%) keeps closing.
- *Honest scope boundary (Claude):* refused to build connector code today even though Teller was clearly working. "Connector code is several Foundation sessions out — writing it now while IndexedDB is still the canonical store would be throwaway."

**Things to flag:**
- *Cert + token storage hygiene:* Scott has Teller's mTLS certificates downloaded. Treated like the Supabase password — not in chat, not in source. Worth a forward note: when Foundation Session 4 connector code lands, the Vite middleware will need to read those certs from a path-on-disk Scott points it at via localStorage (same pattern as the connection string).
- *Morgan Stanley OFX is a real risk.* Multiple users report failures post-E*Trade migration (OFX Error 16503). Need a Quicken-or-similar smoke before committing Iris connector code to it.

**Cadence read:**
- *Vision discipline:* held steady ~85%. Couples-first thesis stayed centered through the competitive refresh.
- *Scope discipline:* up — auto mode was on, three different "could-build-now" temptations declined. ~80%.
- *Process discipline:* held. Mode declaration explicit, ADR-0001's three-connector architecture preserved (no silent drift to "we need a fourth connector for Morgan Stanley"), commits tight and well-messaged.
- *Validation discipline:* notable continued improvement. The `file://` bug → fix → verify loop happened in real-time. The Teller coverage check was real-data-real-bank, not "I think it should work." ~70%, up from ~65%.
- *Decision velocity:* good. Picked smaller-bounded paths (HTML scratch over full quickstart clone, three-bank verification over exhaustive coverage scan).

**Net for the session:** Honest read on the competitive picture (Origin and Monarch are real; differentiation narrows but holds), connector strategy ground-truthed (Teller works for the bank/CC leg), full institution map locked. No code in Iris source. Foundation Session 2 opens next session with clearer eyes.

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
