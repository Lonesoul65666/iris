# Drive cleanup 2026-08-17 — what was copied out, what was left

Scott asked for personal material to be copied out of his **work** Google Drive
(`sdeluke@abnormal.ai`) so he could delete the Drive originals himself.

## ✅ Copied out

| File | Now at | Drive original |
|---|---|---|
| Untitled doc — Iris punch list (2026-07-03) | `../rescued/2026-07-03-drive-punchlist.md` | **moved to Trash** (recoverable ~30 days) |
| `Continuity_Core_Scott_Deluke_v1.txt` | `personal/` | left in place — Scott deletes |
| `Nyx System Journal v2.6` | `personal/` | left in place — Scott deletes |

`personal/` is **gitignored** — see below.

## ⛔ Deliberately NOT copied — 14 colleague tone portraits

Fourteen ~1.25 MB Google Docs in Drive, each named for an Abnormal colleague and
titled "<Name> - Nyx V1": David Nicholson, Ryan Jooyan, Ed Perez, Jason Madey,
Aaron Orchard, Joseph Crehan, Alex Shinpoch, Ryan Devendorf, Tyler Briggs.

These are the output of **Nyx - Team Dynamics**, a work exercise: participants used
the *work* ChatGPT via Okta, answered ten questions aloud, and Nyx synthesized a
tone portrait covering their tone, **burnout signals, and stress patterns under
pressure**.

The participant instructions (`Nyx - V1 doc`) told them, verbatim:

> "Only Scott can export or share your profile. Nothing is saved or shared unless
> you request it. This is RBAC-controlled."

So these are **other people's sensitive data, collected under an explicit privacy
promise**, and they're work artifacts belonging in the work Drive. Copying them to
a personal machine — let alone into a repo that gets pushed to GitHub — would break
that promise and move employee data outside company control. Left untouched on
purpose.

Also left in Drive as work artifacts: `Nyx - V1 doc` (participant instructions),
`Scotts - Nyx Team doc V1`, and the `Nyx ( 4.0 )` Gemini Gem (a Gem config, not
exportable as a plain file; it lives at gemini.google.com).

If Scott wants any of these pulled out anyway, that's his call to make explicitly —
it just shouldn't happen as a side effect of a cleanup sweep.

## Why `personal/` is gitignored

`iris-context` is intended for a **private GitHub repo**. `personal/` holds a
psychological/identity profile naming Scott's wife and children and describing
marriage dynamics — more sensitive than anything else here, and Scott never asked
for it to be published anywhere. Keeping it gitignored means it's preserved on disk
and out of the work Drive, without silently landing in a hosted git remote.

To include it in the repo later, delete the `rescued/personal/` line from
`.gitignore` and commit — a deliberate act, not an accident.
