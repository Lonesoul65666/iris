---
name: project-iris-handoff-2026-07-03
description: "Iris handoff 2026-07-03 — UI REPAINT direction locked + shipped (cyan→Iris violet, aurora heroes), ALL decorative animations + cyber gridding stripped, Budget Pulse now reflects the whole $15,800. Coat-of-paint ONLY (no restructure) pending Scott+Claire review. READ FIRST."
metadata: 
  node_type: memory
  type: project
  originSessionId: b068b670-813b-4a1f-a59f-c1e26868e1e2
---

# Iris handoff — 2026-07-03 (UI repaint: violet + aurora, decoration stripped, Pulse on full base)

**MOST RECENT. Read first** (supersedes 2026-07-01 as read-first; that one's budget-engine decisions still valid). Branch `overnight-polish-2026-06-11`, repo `C:\Claude\projects\signal\signal-app`, detached vite on :5173. **~62 commits over master, unmerged.** `npx tsc -b` clean · 126/126 tests. Validated live in Scott's real Chrome (Claude-in-Chrome; I drive). Deadline watermark still ~Sept 1; portability LATER.

## THE DESIGN DIRECTION (locked this session)
- **Coat of paint ONLY — do NOT restructure yet.** Scott: keep every layout/field/module exactly where it is, just make it look "finished." He + Claire review the repainted REAL app → do ONE final keep/cut pass (kill the redundant/overlapping numbers THEN) → live with it 1–2 months w/ small changes → **then bring the rest of the financial side in.** (Restructuring now = premature.)
- **Palette: cyan → Iris violet.** `--color-cyber-cyan` #00e5ff → **#8b6dff** (dim #7a5cf0) in `src/index.css`. `--color-accent` was ALREADY violet (#8b5cf6) — cyan was the thing fighting the purple Iris logo/flower. One token flip + hardcoded `rgba(0,229,255,..)`→violet recolored EVERY view at once. Near-black base (`--color-surface-0 #0a0a0f`) kept.
- **Aurora heroes** = the "bubble fade" (from NeuroBank ref's glowing AI-Insights panel). Animated CSS drift (violet/magenta + faint green) behind the **Dashboard net-worth hero** and **Budget Safe-to-Spend hero**. Classes `.aurora-blob/.aurora-a/.aurora-b` + `@keyframes aurora-drift` in index.css. This is the ONE intentional motion left.
- **References Scott gave (grounding, NOT invented worlds — that was the old mistake):** two AI-gen dashboards. **Image 2 = the chosen architecture for LATER** (clean near-black neon CARDS: each tile owns a color + icon + mini-chart; ONE progress ring `72%`; aurora hero; category-color system à la an Oct-2025 budget-planner). **Image 1 = flowing "cash-flow ribbon"** — a beautiful trap as a full page (legibility/mobile), but its ribbon could be the **Money Map treatment** specifically (boxed = readable). Scott: no blue (PayFinance ref rejected), cooler feel, MUST be fun/dopamine, Claire likes circle graphs but sparingly.
- **Throwaway mockup:** `public/fusion-mockup.html` → `localhost:5173/fusion-mockup.html` = the Image-2 fusion (aurora hero + recolored Money Map clean-bar AND ribbon variant + category tiles). Reference only; safe to delete.

## Shipped this session (4 commits: 9985cca → dbc30ff)
1. **9985cca** — killed cyber-grid + scanline sweep on the net-worth hero + Net Take Home tile (the original "motion means nothing" complaint).
2. **cab9391** — repaint: cyan→violet everywhere + aurora on the two heroes.
3. **3d2e1d4** — per Scott: **strip ALL decorative animation + gridding/decoration.** Removed cyber-grid/scanlines/corners/divider/glow (CSS + usages across Dashboard/Budget/Health/Portfolio/Intelligence/Pulse); deleted dead/decorative keyframes (fadeIn/animate-fadeIn, fadeInUp/stagger, pulse-glow, shimmer, borderGlow, float1/2, countPulse, navGlow); **killed the net-worth count-up** (`useAnimatedCounter` returns value as-is). **KEPT: aurora + functional indicators** (loading spinners, chat typing dots, skeleton/sync pulses = state, not decoration). `animate-fadeIn` class left inert in markup (no CSS → renders static). NudgeCard still has an inert `stagger-${n}` (harmless).
4. **dbc30ff** — **Budget Pulse now reflects the WHOLE $15,800** (closes the last $15,800-unification holdout from 2026-07-01). Header was `spent / operating-cap` ($3,330 / $13,227 — a number appearing nowhere else, hid reserves). Now `$3,330 / $15,800` + sub-line **"$2,000 reserved · $10,470 still free"** (3,330+2,000+10,470=15,800; reconciles to Money Map Free + Budget Health cash-flow). Prop `reserveSetAside` added to BudgetPulse; `base = watermark||totalBudget`, `freeOfBase = watermark − totalActual − reserveSetAside`.

## PAUSED HERE — Scott + Claire reviewing Dashboard + Budget together (2026-07-03)
Waiting for their keep/cut/tweak list. Open threads to resume on:
- **Aurora:** keep drifting vs freeze static? And pull the glow BEHIND the numbers (currently pools right; Scott's Image-2 had it behind the number).
- **Pulse reserves:** currently a header LUMP ("$2,000 reserved"). Scott asked whether to instead show Taxes/Travel/stashes as their own ROWS (styled no-pace-bar, "set aside" only). Reserve buckets = $0 budget + lumpy → as pace rows they'd misfire red (why they were excluded). Awaiting his call.
- After review: the "one final pass" to cut redundant/overlapping numbers, then possibly move toward Image-2's card architecture surface-by-surface (responsive-first for the eventual PWA/Claire's phone).

## Gotchas (unchanged)
- Bash cwd resets to `C:\Claude` — `cd /c/Claude/projects/signal/signal-app &&` first.
- Chrome MCP: server id churns; reload tools via ToolSearch each session. Sidebar nav click flaky — `find` the "Budget" button → click by ref; verify via screenshot.
- Pre-commit runs tsc -b + vitest (126). Commits show "Scott Deluke" committer (git identity not set) — cosmetic.
- Expenses = JSONB; DATABASE_URL in `.env.local`; back up before mutating.
