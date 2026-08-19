---
name: project-iris-handoff-2026-06-30
description: Iris handoff 2026-06-30 — worked the 2026-06-14 audit fix queue (all 12) + ran a feature-by-feature QA pass of the budget page + a big DESIGN conversation (zero-based Money Map / gamified surplus engine / deploy-validation) + shipped Money Map v1 + fixed brokerage transfers importing as investment. Branch now 46 commits over master. READ FIRST.
metadata: 
  node_type: memory
  type: project
  originSessionId: 3040834d-062e-4e41-9a02-a8f465f51451
---

# Iris handoff — 2026-06-30 (audit fix queue → QA pass → Money Map v1)

**MOST RECENT. Read first.** Branch `overnight-polish-2026-06-11`, repo `C:\Claude\projects\signal\signal-app`, dev server detached vite on :5173. **46 commits over master, unmerged** (Scott reviews/merges). `npx tsc -b` clean · `npm test` 126/126 (pre-commit). Long single session; Scott drove, reacting in his real Chrome (HMR-live).

## ⏰ THE DEADLINE (reframes everything)
Scott is **leaving Abnormal in ~2 months (~Aug 2026)** and **loses Claude Code access** then. So the scarcest resource is **Claude time** — spend it ONLY on what dies without me (engineering: logic/connectors), NOT on data-entry (Scott can do anytime) or the visual redesign (needs Fable, redoable). **#1 deadline item = PORTABILITY**: get Iris running on Scott's phone / personal laptop, OFF the work machine, before he leaves. Data is already device-agnostic (his Supabase) — it's a "serve it somewhere reachable" problem, not a migration. Sequence agreed: **finish the guts → portability → (if time) equity/Fidelity → redesign last (Fable)**.

## Shipped this session (commits 17245cb → 054c316)
1. **Audit fix queue DONE** (the 2026-06-14 `docs/audits/2026-06-14-numbers-audit.md`, all 12): savings-rate one shared helper + honesty guard; investing $20→$1,000 fat-finger (code + data); reserve constant $1,500→$1,000; Treasury mapping→taxes; stash "Trips" name; reimbursement + recent-activity guards; cash-flow time-axis. Data patches applied to live DB w/ backups (`scripts/*-backup.json`).
2. **⭐ Scorecard saga — landed on OPTION A.** Built B (base − set-aside − operating); Scott reviewed live, called it "bullshit" (hid the $24-26k months). **Switched to A: `surplusVsBase = base − TOTAL spend (everyday + reserve)`** — blunt, the big tax/travel months tower red, green only when truly under. Lives at 3/9. (`savingsScorecard.ts`, Option A; the setAside param is GONE.)
3. **Three "money left" numbers → distinct jobs** (Scott flagged the juxtaposition): **Safe to Spend = THE "can I spend now?" number**; the tile = **"On Pace to Save"** (in-progress projection) / "Saved This Month" (complete) + month-over-month line; cash-flow bar = **pacing** ("$X spent so far · on pace to save $Y"), segment "Left"→"Surplus".
4. **401k/HSA entered** (manual, his real numbers): 401k **$812/mo** (YTD $4,468.52 ÷ 5.5mo avg — it's 3% of net, varies), HSA **$360/mo** (YTD $1,980 ÷ 5.5). Savings rate now real ~9.9% (was false "critical 5%"). Savings-rate tile shows "Green at 20% — ~$X/mo more (fixed savings; variable sweep not counted)".
5. **QA pass STARTED** — durable checklist `BUDGET_QA.md` (top→bottom of budget page; survives context resets — KEEP USING IT). Done: 7-day prompt (parseLocalDate off-by-one + spending-only count), Safe to Spend ✅, Savings Rate target/gap, tile reorder + MoM, **Budget Pulse lane fix** (its header was mixing reserve into "spent / budgeted" → looked over budget; now operating-only). UI notes parked in a redesign lot.
6. **Inline reclassify from the category drilldown** (`BudgetView`): each txn gets a "Move" button → category select + "apply to all [merchant]" checkbox (one-off default) + work toggle. Reuses saveExpense + saveMerchantMapping. Keeps categorization clean post-Claude.
7. **⭐ Brokerage transfers now import as `investment`** (`server/teller-map.ts`) — were being DROPPED (FID BKG SVG LLC → NON_SPEND_PAYEE → discarded). Now `transactionType='investment'`: real investing, out of spend, feed-validatable. **Confirmed Scott's real Fidelity transfer is $1,000/mo (matches budget).** Only June's imported (incremental sync); history needs a deeper re-pull (rate-limited). Server-side change → needed restart (done).
8. **⭐ Money Map v1** (`src/components/Budget/MoneyMap.tsx`, top of budget overview) — Scott's "track the whole $15,800." Stacked bar Everyday + Investing + Reserves + **Free**, summing to base income. **Awaiting Scott's redline** (3 open calls in the design doc).

## ⭐ THE BIG DESIGN (full spec: `docs/money-map-design.md` — READ IT)
Reconcile-not-allocate: base $15,800 → lanes + **Free (the win to deploy)**; trim Everyday over time → Free grows. Variable = System 2 (winnings). Gamified "beat the budget, deploy the winnings" + AI suggestions (rule-based v1 + impact math; LLM-rich later) — **logic now, shell waits for Fable.** Deployments = planned→confirmed lifecycle, **manual-confirm first** then feed-detect-suggest; transaction feed = validator (savings + now investments). Work = separate float (out of the $15,800). **Month in Review = the Money Map frozen at month-end** (`computeMonthComparison` exists, consumed by nothing — wire it; "realized ~3rd–4th" = in-app banner, no push/email).

## NEXT (when Scott says "continue Iris")
1. **Money Map v1 redline** — allocation-vs-actual framing? "Reserves" slice vs a separate "savings" slice? placement?
2. **Continue the QA pass** (`BUDGET_QA.md`): Budget Health + housing ratio → Spending Breakdown → Fun Money. (Variable/overage ✅, Stashes 💬.)
3. **Stashes interconnection rework** (the 5 still-pending decisions — see the 2026-06-30 conversation / earlier handoff): surface forward calc + due date on the Stashes card (the GoalTracker math EXISTS but is hidden/on the dashboard), recurring-vs-one-time-goal type, base-funded + variable top-up, visible "set aside this month" line, scorecard "covered by [stash]" annotation. NOTE the model collision: `Stash = SinkingFund`; GoalTracker (dashboard) has the forward calc on derived balances but is hidden (no targets set).
4. **Build the deploy/gamification engine + Month in Review** (per `docs/money-map-design.md`).
5. **PORTABILITY** (#1 deadline item) — run Iris off the work machine / phone / personal laptop.
6. **FID history backfill** (deeper Teller pull, spaced) + reconcile investing figure to real transfers.

## Standing facts / gotchas
- **Dev server = detached vite** (`Start-Process cmd /c "... node_modules\.bin\vite.cmd --port 5173 --host > vite-dev.log"`). Survives across turns/sessions independently of Claude. If down: relaunch via Start-Process (NOT the Bash run_in_background tool — those get reaped). HTTP 200 on localhost:5173 = up. **Background Bash tasks start from `C:\Claude` (primary cwd), not the project — cd explicitly.**
- **Sync = Scott's ↻ button** (never auto-poll Teller; rate-limited; incremental window — won't re-fetch previously-dropped history). Server-side `teller-map.ts` changes need a server restart before the next sync uses them.
- Data: user Supabase Postgres; `expenses`/`income_sources` are TYPED TABLES (not the `collections` k/v table). `collections` holds buckets/stashes(`sinkingFunds`)/paycheck/merchantMappings/etc. Scripts connect via `DATABASE_URL` in `.env.local`, back up before mutating.
- Scott reacts in his real Chrome (HMR). He's a VISUAL reactor — ship a v1, he redlines. He separates UI (park for Fable) from substance (fix now) well.
- Net worth still INCOMPLETE (no RSU/401k balances — Phase 2). Equity = $0.
