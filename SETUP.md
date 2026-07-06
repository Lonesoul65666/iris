# Iris — Setup & Multi-Machine Guide

Iris is a plain Vite + React + Node + Postgres app. It runs on its own — no AI
builder required at runtime. The in-app AI features (Iris's Take, etc.) call an
LLM with your own key (BYOK); everything else is local code + your database.

**Your data is NOT on this laptop.** It lives in your cloud Supabase Postgres.
Every machine that points at the same `DATABASE_URL` sees the same data, live.
So "getting Iris onto another laptop" is really just: get the *code* there and
point it at the *same database*.

---

## Prerequisites (each machine)

- **Node ≥ 22.6** (uses `--env-file`). Check: `node -v`.
- **git**.
- Your **Supabase connection string** (the `DATABASE_URL` from your current
  `.env.local`).
- *Optional:* Teller mTLS cert/key files (for bank sync) and a Gemini API key
  (for AI features). Iris runs fine without these — sync + AI just stay off.

---

## One-time: push the code to GitHub (do this on THIS laptop)

Secrets are safe to push: `.env.local`, the Teller certs, and all keys are
gitignored and have **never** been committed (audited — only `.env.example` is
tracked, and it's empty placeholders). Verify anytime with:

```bash
git ls-files | grep -iE '\.env|\.pem|\.key|token'   # should show ONLY .env.example
```

Then create the repo and push. Use a **private** repo — the code is yours.

```bash
# with GitHub CLI (install: https://cli.github.com), from the repo root:
gh auth login
gh repo create iris --private --source=. --remote=origin --push

# — or — manually: create an empty private repo on github.com, then:
git remote add origin https://github.com/<you>/iris.git
git push -u origin master
```

That's your backup + the source every other machine pulls from.

---

## Bring Iris up on another laptop (your 2nd laptop, Claire's, etc.)

```bash
git clone https://github.com/<you>/iris.git
cd iris/signal-app          # (this folder)
npm install

cp .env.example .env.local
# edit .env.local — set DATABASE_URL to the SAME value as your main machine.
# (Teller/Gemini optional; leave blank to run without sync/AI.)

npm run server              # standalone Node server, auto-connects + migrates
```

Open the printed URL. The database schema **auto-applies on first connect**
(idempotent — a machine hitting the already-set-up shared DB just no-ops), so
there's no manual migration step. Because it's the same `DATABASE_URL`, all your
budgets, transactions, stashes, and achievements are already there. Log in with
your **PIN**; pick who you are (Scott / Claire) — that's a per-device identity
lock, not a separate data set.

> Dev mode alternative: `npm run dev` (Vite on :5173) instead of `npm run
> server`. Same data either way.

---

## Keeping machines updated

After you push new work from your main laptop, update any other machine with:

```bash
npm run update    # = git pull --ff-only && npm install
```

The schema migrates automatically on the next server start. When Iris detects a
new version it shows a one-time **"What's New"** card so you (or Claire) see what
changed — see `src/updates.ts`, where release notes live. Bump the newest
entry's `version` there whenever you want that card to re-appear.

---

## Backing up your data

Your data lives in Supabase, which keeps its own automatic backups. For a
belt-and-suspenders local copy, use **Settings → Data & Backup** in the app to
export a full JSON snapshot (and restore is non-destructive).

---

## Known limitation (deferred, low risk)

Two people editing the **same record within a few seconds** = last-write-wins
(one edit silently overwrites the other). For a two-person household this window
is rare, so real-time conflict resolution is deliberately not built yet. Nothing
is corrupted; at most one simultaneous edit gets stepped on.
