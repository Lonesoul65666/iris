---
name: project-iris-gamification-roadmap
description: "Iris product north-star roadmap (locked 2026-07-06 w/ Scott). 3 tiers: (1) deepen the moat — couples attribution, Iris's Take AI coach, Fun Money game, local-first; (2) THE BIG SWING = adult gamification + Proactive Iris as ONE project (nudge engine IS the game's live announcer); (3) catch up to big apps last — cash-flow calendar, subscription radar, FI projection, debt payoff (deferred not skipped, for other households)."
metadata: 
  node_type: memory
  type: project
  originSessionId: 0a5c9773-fbb7-4a85-9252-6ce8edf0cfde
---

# Iris product roadmap — locked with Scott 2026-07-06

Scott and I did a strategic pass after merging the 137-commit branch to master. This is the agreed priority order for coming sessions. It reframes the flat NEXT-queue in [[project-iris-handoff-2026-07-05]] into a tiered product thesis. Iris is a **distributable local-first app** (Tauri/SQLite direction, NOT SaaS) — so features are scoped for *other households too*, not just Scott/Claire.

## 🥇 TIER 1 — The Moat (deepen what nobody else nails)
These are Iris's real differentiators vs Monarch/Copilot/Rocket Money/YNAB. Keep making them awesome; don't let them go generic.
- **Couples-first attribution** — built into the foundation (Monarch bolts collaboration on; Iris started there).
- **Iris's Take** — AI coach that roasts with REAL numbers and doesn't hallucinate. Competitors' AI is timid/generic. Iris has a voice. ([[project-iris-handoff-2026-07-05]] for how it's grounded.)
- **Fun Money as a game** — dig-out-first ledger + Scott-vs-Claire head-to-head box. Exists nowhere else.
- **Local-first / user owns the Postgres** — privacy differentiator.

## 🥈 TIER 2 — Adult Gamification + Proactive Iris = ONE project (THE BIG SWING)
Core thesis: "money as a hobby." Gamification IS the product, not a side-quest — but it must reward behavior that MATTERS (savings rate, staying in budget, restraint), not just hand out points. **A coach that only talks when you press a button isn't a coach; a game with no live commentary is a spreadsheet** — so Stage 3 proactive nudges and gamification ship TOGETHER: the nudge engine is the game's live announcer.
- **Savings-rate levels / "seasons"** — monthly challenges, personal bests.
- **Net-worth milestone trophies** — the [[project-iris-trophy-room]] is the home for these (archive everything, never delete achievements).
- **Streaks everywhere** — "N months under budget," "N months both banked fun money," etc.
- **Scott-vs-Claire leaderboards beyond fun money** — restraint, categories, savings.
- **Proactive Iris = Stage 3** ([[project-iris-dynamic-action-items]]) — regenerating weekly nudges + dismiss/learning loop ("you ignored this 3×"). Scaffolding exists: insightsEngine, triggerDetector, dynamicActions, action templates.
- Likely architectural spine: an **achievement/event ledger** that trophies, streaks, seasons, leaderboards, and nudges all read from — build once, plug many.
- **⛔ FORWARD-ONLY RULE (Scott, 2026-07-06) — load-bearing.** No milestone/achievement may unlock for a value that was already true at the **start line** (the moment Iris began tracking / data was backfilled). Scott is already at ~$546k net worth, 3/10 months under base, +$8k banked since Sep 2025 — those are the STARTING BASELINE, not wins. A "$500k net worth" or "3 months under base" trophy awarded now would be unearned and hollow. **June and the early setup months = baseline, zero achievements** — the drastic early swings (asset-entry net-worth jump, backfilled banked totals) are data artifacts, not accomplishments; you won't see changes that drastic once things stabilize after the first few months. Milestones fire ONLY when a metric CROSSES a threshold going forward, while actually living in the app. **Exception:** a stash genuinely CRUSHED (saved up + bought → `SinkingFund.achievement` snapshot) is a real completion event, not a setup artifact, so it earns a wall spot. Same principle as the creation-forward stash-card rule (queue item 0): the game counts from now forward, never retroactively on backfilled data. Implementation: persist a baseline (date + starting metric values) at first run / now, and gate every milestone on `crossed threshold AND crossing occurred after baseline`.

## 🎯 Behavioral milestones + Trophy Wall — DESIGN (Scott, 2026-07-06, high enthusiasm)
Scott's favorite piece — "the point of AI." Two distinct surfaces:

**Behavioral milestones (the AI coach loop):** using AI to (1) playfully **fuck with you**, (2) **help you be better / learn from your mistakes**, (3) keep a **healthy balance between saving and having fun**, (4) make it a **team sport that's a little competitive** (Scott vs Claire). Every milestone — *no matter how minor* — fires a hype **"FUCK YEAH, LET'S GO"** moment. Positive reinforcement on every hit is non-negotiable ("we gotta be encouraged to do this stuff"). Emojis off, full-send voice. Scott sees use cases for this pattern ALL OVER the platform, not just one screen.

**Trophy Wall = Xbox-achievements model:** a catalog of ~50 achievements that **grows with app updates** (new ones ship over time, like console achievement packs). Tiered difficulty:
- **Easy/starter** achievements (early, frequent dopamine)
- **Feature-exploration** achievements (using different features of the platform)
- **Pie-in-the-sky / progressively harder** — e.g. the "**3 Million [Mile] Club**" / **$3M in the bank**. Long-horizon prestige goals.
Real completions (crushed stashes via `SinkingFund.achievement`) live here too. Forward-only rule ([[project-iris-gamification-roadmap]] above) still governs metric-crossing milestones.

**Existing bones (verify before building):** Scott thinks he built an "achievement center in the back somewhere — might be garbage or good, no idea." Likely the intelligence/nudge/trigger/action scaffolding (insightsEngine, triggerDetector, nudgeEngine, dynamicActions, actionStore, TriggerCenter, IntelligenceView). Map + reuse rather than duplicate.

**The hidden Iris chat platform:** "Ask Iris" (`src/views/ChatView.tsx`) is a real, built chat view wired in AppShell nav but gated/hidden via `useEnabledModules` ('chat' module). Scott wants an **entry point from the Budget view** (near "Iris's Take" on `MonthlyReviewCard`) to click in and open Iris chat. Low-effort surfacing of something already built.

## 🧑‍🤝‍🧑 Couples achievements — COOPERATIVE-FIRST (Scott, refined 2026-07-06)
**Lean COOPERATIVE, not competitive.** Scott: "working together is the whole point — you BOTH fucking did it, not one person or the other." (He builds the tool, Claire gives input as they go.) So most couples achievements should be **household/"we did it together"**; sprinkle in the OCCASIONAL competitive one to push each other (the fun-money head-to-head we already have is enough of that flavor). This also sidesteps the per-user problem Scott flagged: **not enough per-person data points to compete on** — so don't over-invest in individual scoreboards. Prefer: household achievements (already exist) + new COOP ones (both hit a shared goal, both banked, household savings milestones, "team month") + a few competitive. Per-user individual scores are a maybe-later, low priority. `activeUser`/`activeEarner` exist if needed.

## 🔔 Sync-health as Proactive Iris (Scott 2026-07-06)
Scott wants to never miss data due to rate limits: surface **when a DB/Teller refresh FAILS or hits a RATE LIMIT, what still needs syncing, and when** to retry. Build as a nudge (fits Proactive Iris): read the last sync summary (brokenBanks/failedBanks/partial/rateLimited) + freshness (STALE_HOURS) → warning nudges ("Citi stale 6 days — refresh", "CapOne rate-limited, retry after cooldown"). So-far-it-seems-fine per Scott (not urgent, but wanted).

## 📝 Tooltips + tutorial (Scott 2026-07-06, before "done")
Add **tooltips to the sections** (explain each card/graph) and a **tutorial/walkthrough** before calling it done. Deferred with the visual redesign (near-final polish).

## 🎨 Visual redesign (Scott's diagnosis 2026-07-06) — DEFER to the end
Scott nailed the visual problem: **"everything is in the same style box."** Every section is the same glass-card treatment → monotonous. Needs visual VARIETY across sections. **Deferred to the end**; Scott will likely drive a redesign pass with Gemini. Don't do piecemeal visual work before then.

## 🔀 DIRECTION LOCKED (Scott 2026-07-06 EVENING) — NO investment pivot. Finish the budget side. 5 BIG ROCKS.
**Correction: the earlier "PIVOT READY → Investment" (handoff 2026-07-06) was premature — Scott explicitly pulled it back.** Investments AND equity stay dormant under PHASE_1_LOCK; they get lit up "slowly over time, later," not now. Adding them now = "a whole other layer of complexity" Scott doesn't want. Focus stays entirely on the budget program until the rocks below are done.

**Cost-conscious mode:** Scott pays per usage — **scope each rock together BEFORE writing code**; going back-and-forth to avoid build/rebuild waste is explicitly fine and preferred. Time is NOT a constraint; cost is.

**⛔ ONE PORTAL, COOPERATIVE-ONLY (Scott 2026-07-06 eve) — supersedes the "sprinkle competitive" line above.** Drop competitive scoreboards and per-user/personalized state ENTIRELY. Keep ONLY the existing playful fun-money "our money" head-to-head (already lives in one shared account). Everything is one shared household view — **no per-user rewiring, no identity-switching to build.** This DELETES (not defers) the per-user/h2h-comeback/distinct-scoring achievements from the queue. Also makes multi-machine cheap: PIN is just a lock, not identity.

**THE 5 BIG ROCKS (recommended order 1→5; "everything else fits between"):**
1. **Finish the budget program** (the "worth opening daily" work) — Proactive Iris Stage 3 = **regenerating weekly AI action items** ("do/watch/move money"); meet-in-middle tuning + fun-money flourishes; **cash-flow calendar** (recurring forward 30d) + **subscription radar** (both are BUDGET features, fair game — NOT the deferred investment stuff); mop up functional gaps.
2. **Gamification — finish, simplified** — cooperative-only; **dedicated Achievements view + nav** (still just a dashboard section); keep household/team coop achievements, DROP the competitive/per-user ones.
3. **Visual design — complete it** — kill "everything in the same style box" (variety across sections) + **tooltips on cards/graphs** + **first-run tutorial**.
4. **Update capability** — pull off GitHub / self-update path.
5. **Onto other machines** — bring-up path (now cheap: `git pull` → point `.env.local` at shared DB → PIN lock → go). Concurrent-write conflict resolution = **DEFERRED** (Scott: narrow risk for a 2-person household — last-write-wins silent-overwrite only in a same-record same-few-seconds window; not worth building now).

**Why finish budget before distributing (Scott + Claude agreed):** Iris does NOT depend on this AI platform to RUN (plain Vite/React/Node/Postgres repo; in-app AI is BYOK router). Losing the platform = losing the co-builder, not the product. The insurance policy = get it worth-opening-daily AND self-runnable on any machine. Distribution last, once it's worth carrying to Claire's laptop. Investment bones (portfolioIntelligence, etfXray, nudgeEngine portfolio detectors, IntelligenceView, marketDataApi, watchlist) remain dormant under PHASE_1_LOCK for the eventual, gradual, later reveal.

## 🎨 Achievement icons — DONE 2026-07-06 (49657c7)
Emojis replaced with `src/components/Achievements/Medallion.tsx` — tier-colored gradient coins (bronze/silver/gold/platinum) + clean SVG glyphs (flame/coin/trophy/target/star/heart/shield/crown/trending/medal), mapped per achievement by id+category (`glyphFor`). Locked = greyscaled, light up in tier color when earned. On the wall + celebration cards (NudgeCard `iconOverride`). Scott chose "custom SVG medallions" over emoji/line-icons. Future: could add more glyph variety / per-category distinct glyphs if desired.

## 🥉 TIER 3 — Catch up to the big apps (do LAST)
Table-stakes features competitors have that Iris lacks. Valuable but not the moat.
- **Forward cash-flow calendar** — project recurring detection forward 30 days ("what's hitting when"). Most-requested "aha" in budgeting apps; Iris is ~80% there via existing recurring detection.
- **Subscription creep radar** — frame detected recurring bills as a hit-list ("14 subscriptions, $340/mo, up $60 since March"). Rocket Money's whole business.
- **FI / retirement glide path** — "am I on track" long-horizon projection. Scott's investor wheelhouse; ties into the Trophy Room.
- **Debt payoff (snowball/avalanche)** — DEFERRED not skipped. Scott/Claire carry ZERO debt, so dead-last for them, but other households need it since Iris is distributable.

## Assessment context (why this order)
53-agent audit ([[project-iris-handoff-2026-07-05]] + docs/audits/2026-07-04-swarm-audit.md) found NO money-math/data-loss bugs in steady state — the CORE (budget, sync, net worth, couples) is table-stakes done well, which is correct. Risk was "going down the middle" = building a slightly-quirkier Monarch. The moat is personality + the game, currently only a beachhead (fun money box + one AI card). Tier 2 turns Iris from *functional* into *the thing you open every day for fun*.
