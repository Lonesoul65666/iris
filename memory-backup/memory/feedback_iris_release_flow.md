---
name: feedback-iris-release-flow
description: "STANDING CONVENTION (Scott, 2026-08-13): every Iris change ships push-to-GitHub → then update the SERVER to a new version. EVERY markdown note/handoff I write must state this flow explicitly and record where the change currently sits (pushed? host updated?). Includes the shared-Postgres ordering trap: data edits go live instantly, code does not. ALSO (2026-08-17): every landing update MUST bump the version in src/updates.ts to a NEW YYYY.MM.DD.vN string with user-facing release notes — I stopped doing this for a month and Scott caught it."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 8ecf5ce7-c2fd-4f6b-8b9e-475084d971f3
  modified: 2026-08-17T21:21:52.718Z
---

# Iris release flow — always state it in the notes

**Scott's instruction (2026-08-13): "mark in all future markdown notes that the
updates will always be pushed to GitHub and then the server updated to a new
version."**

## The flow — this is always the shape

1. **Commit + push to GitHub** (`origin/master`, repo `Lonesoul65666/iris`, private).
   Master is the deploy target — the host pulls it — so work lands on master rather
   than a feature branch when a deploy is the goal. Push still needs Scott's
   explicit in-session OK.
2. **Update the SERVER to a new version.** The host is a **separate always-on
   machine** at `C:\ProjectIris\iris` — NOT the dev laptop (confirmed absent there
   2026-08-13), so I can't drive it. Scott does it via **Settings → Updates →
   "Update Iris"**, or from the host's app root:
   `git pull --ff-only && npm install && npm run build`.
3. Frontend-only changes need a **hard refresh** (Ctrl+Shift+R) or the cached bundle
   sticks. Server changes need a restart — and the standalone server MUST launch from
   the app root or `--env-file=.env.local` misses (see [[project-iris-backlog]]).

## 🔢 Every landing update gets a NEW version (Scott, 2026-08-17)

**"Every time that we do an update and it lands, I'd like to see a different
version. The date nomenclature is fine, but you're gonna need to do v1, v2, v3
after the actual date."** I had let versioning lapse from `2026.07.13` through
four ship days, so Settings → Updates claimed a month-old build and the one-time
"What's New" card never fired — meaning **Claire was never told anything
changed.** That card is the only channel that tells her; a missed bump silently
costs it.

- **Format: `YYYY.MM.DD.vN`.** N starts at 1 per day, increments for a second
  update the same day. Entries before 2026.08 predate the suffix; nothing
  compares versions for ordering, so mixed formats are safe.
- **Owned entirely by `src/updates.ts`** — add an entry to the TOP of `UPDATES`.
  `package.json` stays `0.0.0` (unused). `UPDATES[0]` is what Settings displays
  and what gates the card.
- **`whatsNewNudge` gates on EXACT string equality** vs the stored
  `last_seen_update_version` setting. Reusing a version = the card never shows.
  That's the whole reason for the `vN` counter.
- **Notes are written for CLAIRE, not for a changelog** — plain benefit language,
  "you" voice, no jargon, no file names, no commit shas. Match the existing
  entries' tone.
- **One entry per ship day, written even if the host deploy lags.** The array
  records what was cut, not what's running.
- ⚠️ **Older `UPDATES` entries render NOWHERE** — only `UPDATES[0]` is read
  (verified 2026-08-17). Backfilled history is honest bookkeeping, invisible to
  the user. A "release history" panel, or making the card show everything since
  `lastSeenVersion`, is an unbuilt improvement Scott has been offered.

## Why: nothing is "done" until the server has it

The dev server on 5173 is Scott's *preview*; the host is where he and Claire actually
live. A change verified only on 5173 is unshipped. So **never report a change as done
without saying where it sits** in the two steps above.

## ⚠️ The ordering trap — say this whenever data is touched

The dev checkout and the host share **one Postgres**. So:
- **DATA edits (openingBalance, commits, buckets…) go live on the host INSTANTLY** —
  no deploy required.
- **CODE does not** — the host keeps running the old logic until step 2.

That combination means the host can show **new data through old math** and report
different numbers than the preview. When a change touches both, the note must say
**"update the host BEFORE acting on these numbers."** (Hit exactly this on
2026-08-13: opening balances were live on the host while it still computed the old
inflated stash asks.)

## How to apply

Every handoff / markdown note gets an explicit line — ideally near the top — of the
form: **"Pushed to GitHub as `<sha>`; version `<YYYY.MM.DD.vN>`; host update PENDING /
DONE."** If a note describes work that isn't pushed yet, say so plainly rather than
implying it shipped. **Before telling Scott a batch is ready to deploy, check that
`src/updates.ts` has an entry covering it** — that's the step I forgot.
Related: [[feedback-iris-deployment-model]] (hosting topology),
[[project-iris-handoff-2026-08-13]] (first note written under this convention).
