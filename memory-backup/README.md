# memory-backup — the reasoning behind Iris

Backup of Claude's persistent memory store for the `C:\Claude` workspace, kept
inside this repo (rather than a separate one) because it's simpler: this repo
already exists and Claude already has push access to it.

Created 2026-08-17, because all 66 files existed on exactly one laptop. If that
machine died, the code survived on GitHub and the thinking did not.

## What's in here

`memory/` — 66 markdown files, one fact or session per file, with YAML
frontmatter (`name`, `description`, `metadata.type`). `MEMORY.md` is the index
that gets loaded into context at the start of every session; every other file is
pointed at from there.

Types: `project` (ongoing work, handoffs), `feedback` (how to work — corrections
and confirmed approaches), `user` (profile), `reference` (external pointers).

Mostly Iris, but not exclusively — the store covers the whole `C:\Claude`
workspace, so the 7-Eleven deck pipeline, the product roadmap, and the tequila
tasting deck are in here too.

`rescued/` — material pulled out of Scott's work Google Drive on 2026-08-17
(financial and Iris-specific notes don't belong in an employer-administered
space). Does NOT include the personal identity/family profile that was also
rescued that day — that one stays gitignored, local-only, at
`C:\Claude\projects\iris-context\rescued\personal\`. See
`rescued/README-what-was-left-behind.md` for the full accounting, including what
was deliberately left in Drive (colleague data under a privacy promise).

### The files that matter most

| File | Why |
|---|---|
| `memory/MEMORY.md` | The index. Read first — it's ordered by what to read first. |
| `memory/project_iris_backlog.md` | The 3-bucket priority list + the Quest Engine design. |
| `memory/project_iris_handoff_2026-08-17.md` | Most recent session state. |
| `memory/feedback_iris_release_flow.md` | Push to GitHub → update the host → bump the version. |
| `memory/feedback_iris_partnership_model.md` | The operating contract for how we work. |
| `memory/project_iris_gamification_roadmap.md` | The locked north-star priority order. |

## ⚠️ Contents

Private by design — this repo (`Lonesoul65666/iris`) must stay private. These
notes discuss real personal finances: net worth, mortgage payment, the $15,800
guaranteed base, per-person allowances, and which bank each account maps to.
There are no credentials, tokens, or raw transaction exports.

## Restoring onto a new machine

Claude derives the memory folder name from the workspace path, so `C:\Claude`
becomes `C--Claude`. Copy `memory-backup/memory/` to:

```
C:\Users\<you>\.claude\projects\C--Claude\memory\
```

If the workspace lives somewhere else on the new machine, the folder name changes
to match that path — check what `.claude\projects\` already contains before
copying, and put the files in the folder matching the workspace you'll actually
open.

## Keeping it current

This is a snapshot, not a live sync — memory files are written during sessions
and won't reach here on their own. Refresh with (from this repo's root):

```bash
cp "$USERPROFILE/.claude/projects/C--Claude/memory/"*.md memory-backup/memory/ && git add memory-backup && git commit -m "Sync memory $(date +%F)" && git push
```
