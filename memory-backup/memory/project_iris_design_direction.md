---
name: project-iris-design-direction
description: "Iris visual direction as of 2026-07-04 — cyberpunk RETIRED, unified Inter, Card-E chrome depth, \"make it ours\""
metadata: 
  node_type: memory
  type: project
  originSessionId: b37e92ff-abd9-4afd-9d8e-5c0a224f5064
---

# Iris design direction (locked 2026-07-04)

**The cyberpunk / terminal aesthetic is DEAD.** Scott: "we're moving away from cyberpunk anyways… don't care about that theme anymore cause Claire doesn't… making it 'ours'." The product's look is now Scott + Claire's — premium, calm, modern-SaaS, NOT hacker-dashboard. Claire's taste is a real input; when in doubt, calmer/cleaner.

**Locked visual decisions (all live in `src/index.css`, Tailwind v4 `@theme`):**
- **Unified typeface: Inter everywhere**, including NUMBERS (`.mono-num` now uses `var(--font-sans)` + `font-feature-settings:'tnum' 1` so columns still align). JetBrains Mono is retired from the UI — kept ONLY for real code (chat code blocks). Killing the code-mono number font was the single biggest premium jump ("$546,645" reads clean, not like a code editor). Scott: "crisp tables are better."
- **Card treatment = "Card E"** (chosen from a 5-way `card-lab.html` bake-off): body `linear-gradient(180deg, surface-3, surface-2)`; **metallic chrome border lit from BOTTOM-RIGHT** (border-box gradient `135deg #31313d→#6a6a78→#eaeaf1`, dark top-left → bright silver bottom-right); soft **up-left** drop shadow (`-6px -6px …`) so the light source reads as below-right; inset highlight bottom-right + inset dark top-left. Applied to `.glass-card`, `.glass-card-sm`, `.stat-card`. Chrome is deliberately subtle now — dials available: brighter chrome, deeper lift, warm(champagne)/cool(silver) metal.
- **Within-card depth** via nested recessed sub-panels (surface-1 inset w/ inner shadow) — fixes Scott's "everything sits on one plane / looks flat" critique.
- **Quiet eyebrow labels:** `.term-label` redefined mono-uppercase-violet-16px → Inter 11px 600 `text-muted` uppercase (recedes; the number is the hero).
- **De-glassed:** removed `backdrop-filter: blur()` from all cards; solid gradient surfaces instead. **Card fill = DEEP DARK `linear-gradient(180deg,#15151d,#0e0e13)`** — NOT lighter-than-canvas. (Tried lightening to surface-3/2 to fake depth; it read as a "grey frost over everything" and killed the pop. Lesson: on dark UI, depth comes from the BORDER + SHADOW, and content pops on a dark fill — do NOT grey the surface.)
- **Layout:** all views centered via one shared wrapper in `AppShell.tsx` — `max-w-[1600px] mx-auto` on the `<main>` content div (removed DashboardView's own `max-w-7xl` which left it lopsided). Balanced gutters on >1600px monitors, full at ≤1600. Scott picked centered-capped over full-bleed ("easier to read").
- **Chips** (`.cyber-chip`): angled `clip-path` → rounded pill, mono → sans.
- **Contrast:** `--color-text-muted` #6b7280 → #8b92a1 (WCAG-AA safe).

**App-wide uniformity DONE (2026-07-04):** `font-mono` utility repointed to Inter (added `--font-code`='JetBrains Mono' for chat code only) → every decorative-mono spot across ~10 views (tickers/dates/PINs/labels) is now Inter; `--color-cyber-cyan/-magenta` repointed to violet accent; the one true-cyan reimbursement badge → teal. All views now share the new look.

**Still-pending cleanup (P2 hygiene, cosmetic — not visually breaking):** dedupe the duplicated `term-label`/`cyber-chip`/`mono-num` blocks in index.css; class names `cyber-chip`/`mono-num`/`term-label`/`--font-mono` are now misnomers (rename someday); **SettingsView content hugs left in a narrow column** (its own inner width w/o mx-auto — center it for balance); decorative emoji still in Settings buttons (📄🪄) + other non-budget views (Scott only asked to strip Budget; Dashboard ☀️🔔 + spending icons left ON PURPOSE). IntelligenceView chart palette has a `bg-cyan-500` category swatch — legit data-viz color, left as-is.

Supersedes the cyan→violet repaint framing in [[project_iris_handoff_2026-07-03]]; extends [[feedback_iris_partnership_model]]. `public/card-lab.html` was the throwaway bake-off (delete when done).

## Rock 3 design polish pass (2026-07-06) — Gemini's spec, reviewed before building
Scott brought a detailed anti-box-monotony spec from Gemini. Reviewed it against this doc BEFORE implementing (not a rubber stamp) — flagged two real conflicts with the locked decisions above: (1) a serif font for Iris's voice vs. "Inter everywhere" — Scott chose to SKIP, Inter stays universal; (2) glow/neon vocabulary ("text-shadow glow", "neon green") vs. cyberpunk being explicitly retired for Claire — Scott chose "very subtle only, I can veto." Implemented (commit `a99df64`): `.well-card`/`.soft-well` (soft gradient bg, no border) for Iris's Take + StashesCard; `.track-well`/`.track-fill-positive` (dark visible progress tracks + a quiet mint→green gradient, NOT neon); sidebar dedup + active-row left indicator; BudgetView top-4 tiles moved from full-ring border to 2px-bottom-only. Skipped the broad `auto-fit minmax(400px)` grid rewrite — existing responsive breakpoint grids already achieve the same effect, rewriting working layout for no clear gain wasn't worth the risk.

**⚠️ Self-caught tension worth watching:** `.well-card`/`.soft-well` use `surface-2`/`surface-1` (LIGHTER than the deep-dark `glass-card` fill) — which sounds like the exact "lighten to surface-3/2 to fake depth" experiment this doc already recorded as REJECTED ("read as a grey frost over everything, killed the pop," line above). The difference this time: it's scoped to ONLY 2 sections (Iris's Take + Have-To/Want-To) specifically so they read as visually DISTINCT from the rest of the still-deep-dark glass-card system — variety, not a universal re-lightening. Browser screenshots looked clean, not frosty. But this is exactly the kind of thing that can drift wrong without someone's eyes on it live — Scott should look at these two sections in his own Chrome and veto/adjust if it starts creeping toward the rejected look.
