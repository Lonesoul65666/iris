---
name: project-iris-dynamic-action-items
description: "Iris FUTURE vision (Scott 2026-07-04): make budget Action Items dynamic + prescriptive week-over-week ('do this / watch this / change this / you're not spending here, move it there'). Piping deferred — don't build yet."
metadata: 
  node_type: memory
  type: project
  originSessionId: 24007950-2e02-45e6-920d-8fa5c1e9810b
---

# Dynamic, prescriptive budget Action Items (Scott's vision, 2026-07-04)

Scott wants the **Budget Action Items** to become a living, prescriptive coach that regenerates week-over-week, not a static seeded list. The vibe: "Here's something you should be doing with your budget · here's something to watch · here's something to change · you're not spending here, so move that money over there." Right now they're basically static (nothing new pops up).

**Explicitly deferred:** Scott said "we don't have to do the piping for all of that right now" — do NOT build the dynamic engine yet. Captured as a want, not a task.

**How to apply when we build it:**
- The seed already exists: `src/utils/insightsEngine.ts` powers the dashboard "Iris noticed N things" notices (data-driven), and `src/utils/dynamicActions.ts` (`reconcileActionItems`) already reconciles items from data. The gap is wiring genuinely fresh, weekly-cadence, prescriptive budget items into the ActionItem list. The dismiss/accept + weekly cadence is queued in `docs/post-phase-1-backlog.md` (Phase-2 intelligence, currently PAUSED). Related: [[feedback_market_intelligence]] (Phase 3 "always recommend monthly allocation changes"), [[feedback_iris_explain_why]] (every nudge needs a one-sentence why).

**Completed items already archive (done 2026-07-04):** `ActionItemsView` tucks done items behind a collapsed "N **knocked out**" toggle (relabeled from "completed" per Scott), preserving `completedDate` + Undo. Those records are the natural feed for the future trophy wall — see [[project_iris_trophy_room]].
