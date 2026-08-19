---
name: project-iris-trophy-room
description: "Iris future feature — a 'trophy room' of achievements + a trophy wall of every goal crushed over the years. Archive EVERYTHING (never delete achievements). Foundation shipped 2026-07-04."
metadata: 
  node_type: memory
  type: project
  originSessionId: 24007950-2e02-45e6-920d-8fa5c1e9810b
---

# Iris trophy room (Scott's vision, 2026-07-04)

Scott wants, eventually, a **trophy room**: scaling achievements (simple → very hard) plus a **trophy wall** of everything he & Claire have "killed / knocked off the board" over the years — to look back and see how much they've truly achieved. It's the emotional payoff of the whole Have-To/Want-To system.

**Why:** the money app is about motivation, not just tracking. Crushing a Want-To should feel like something, and the accumulated wins should be visible and satisfying over time.

**How to apply:**
- **Archive everything, never delete.** Retired/achieved goals must persist. Deletion is only for mistakes.
- **Foundation already shipped (2026-07-04):** retiring a Want-To sets `SinkingFund.achievedAt` and captures a durable `achievement` snapshot `{ savedAmount, targetAmount, startMonth, achievedAt, monthsSaving }` — captured AT retire because the live fields get zeroed to go inert. Retired goals live on the **"Crushed · bought & done"** trophy shelf in `StashesCard` (with undo) and drop out of active tracking + the $15,800 plan. See [[project_iris_handoff_2026-07-04_v2]] area / the Make-Every-Dolla arc.
- The `achievement` blob is the seed of the trophy-room data model — read all stashes with `achievedAt` set to build the wall. Preserve/extend it as more goal types complete (debts paid, milestones hit).
- Future build (NOT now — "at the end of all this"): the actual trophy room UI, scaling/tiered achievements, the wall/timeline. Relates to the encouragement/gamification layer just added to the dashboard [[project_iris_design_direction]].

Tone for achievements = Scott's full-send voice (he chose R-rated for the encouragement copy: "HELL YES — you crushed it", "one less thing to sweat"). Emojis OFF per Scott (2026-07-04) — clean text only.
