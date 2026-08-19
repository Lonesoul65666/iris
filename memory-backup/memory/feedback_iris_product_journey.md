---
name: Iris three-phase product journey (SUPERSEDED — historical)
description: SUPERSEDED 2026-05-02. Earlier framing of user lifecycle (Revelation → Steady state → Ambient). Current phase model is Phase 1 (Budget) → Phase 2 (Path A Investments OR Path B Co-op Mechanics) → Phase 3 (Intelligence) — see docs/north-star.md.
type: feedback
originSessionId: d68eadb4-6b24-44ef-88b4-1c734ff4005d
---
**SUPERSEDED 2026-05-02:** This was an earlier framing of the user's *lifecycle* inside the app. The current canonical *phase model* lives in `docs/north-star.md` and is about *what gets built when*, not what the user feels at first session vs. ambient use. The "Revelation" idea (a guided first-run insight reveal) is interesting and may resurface as a v1.0 launch UX feature, but it is not a priority for Phase 1 or Phase 2.

Kept below for historical context.

---

Iris is a product, not a demo. Every feature should map to one of three phases of the user's journey:

1. **Revelation (first real session)** — after onboarding + portfolio load, Iris runs full analysis and walks the user through everything it found: hidden concentrations, cash drag, rebalance opportunities, DCA suggestions, gaps, concentration risks. A sequenced, dismissible flow. Each card = "here's something you didn't know + here's what to do." Runs ONCE — after all dismissed, retires.
2. **Steady state** — dashboard + Intelligence tab + Budget when the user opens the app. The reference surface.
3. **Ambient (days/weeks later)** — nudges fire for milestones, portfolio drift, stale actions, welcome-back. The thing that pulls them back.

**Why:** Scott flagged 2026-04-19 that I kept saying "demo-worthy" and it landed wrong. He's building a product people will use for years, not a one-time pitch. First-impression impact is a *product* virtue (day-1 hook → retention → word of mouth), not a demo-only virtue.

**How to apply:**
- Stop using the word "demo" when ranking features. Use "first-impression hook" / "retention" / "depth" instead.
- When proposing new features, name which phase they serve. Features that hit ≥2 phases are stronger.
- Gap right now: phase 1 (revelation) is missing. After onboarding the user just lands on the dashboard — no guided reveal of what Iris found in their portfolio. This is the next meaningful build.
- Nudges cover phase 3 well. Intelligence tab covers phase 2. Phase 1 needs a new surface: "First Run Insight Report" — run-once, sequenced, dismissible — that uses the same analyzers (X-Ray, gaps, rebalance, etc.) but presents them as a narrative walk-through.
