---
name: feedback-no-personal-in-work-drive
description: "Scott's work Google Drive (sdeluke@abnormal.ai) is NOT a home for personal or Iris material — he asked for it cleared out 2026-08-17. Never propose corporate Drive as a backup target for Iris/personal data; use the private GitHub repos. Also: the 14 'Nyx V1' colleague docs in that Drive are employee data under a privacy promise and must stay there."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c5a9072b-f2ba-4779-930c-32f8d1ec07e0
  modified: 2026-08-19T04:02:08.847Z
---

# Keep personal and Iris material out of the work Google Drive

**Scott, 2026-08-17: "I would like to remove any of that in google drive" →
then "if you move it all to the folders above i can delete it all later."**

## Why

`sdeluke@abnormal.ai` Drive is employer-administered — admin access, retention,
DLP. Iris notes carry his net worth, mortgage payment, the $15,800 base, and
Claire's allowances; the `Continuity_Core` file carries a psychological profile
naming Claire, Logan, and Vivian. None of that belongs in a company system.

## How to apply

- **Never offer corporate Drive as a backup/sharing target** for Iris or anything
  personal. Default to the private GitHub repo instead — see
  [[feedback-iris-release-flow]]. **Everything lives in ONE repo,
  `Lonesoul65666/iris`** — code at the root, memory backup under
  `memory-backup/memory/`. (2026-08-17 tried a SEPARATE `iris-context` repo
  first — wrong call: creating a new empty GitHub repo needs either `gh` CLI or a
  logged-in browser, neither reliably available, and it just adds a second thing
  to keep track of. A folder in the repo Claude already has push access to is
  strictly simpler. `C:\Claude\projects\iris-context` is now a dead staging
  path — don't push there again, don't reference it as current.)
- **Copy out, let Scott delete.** He asked to do the deleting himself. Moving a
  file to Drive Trash is reversible and fine when he's asked for removal
  explicitly; emptying Trash is always his.
- `iris-context/rescued/personal/` is **gitignored on purpose** — preserved on
  disk, never pushed, because he never asked for the family/identity profile to be
  published anywhere. Flag before changing that.

## ⛔ The Nyx colleague docs STAY in work Drive — do not "rescue" them

Fourteen ~1.25 MB Google Docs titled `<Name> - Nyx V1` (David Nicholson, Ryan
Jooyan, Ed Perez, Jason Madey, Aaron Orchard, Joseph Crehan, Alex Shinpoch, Ryan
Devendorf, Tyler Briggs) are output of **Nyx - Team Dynamics**, a work exercise
Scott ran on the *work* ChatGPT via Okta. Each profiles a colleague's tone,
**burnout signals, and stress patterns**, and participants were told: *"Only Scott
can export or share your profile. Nothing is saved or shared unless you request
it. This is RBAC-controlled."*

They are other people's sensitive data under an explicit privacy promise, and they
are work property. **Do not copy them to a personal machine or any git repo** as
part of a cleanup sweep. Full reasoning:
`C:\Claude\projects\iris-context\rescued\README-what-was-left-behind.md`.
