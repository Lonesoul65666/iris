---
name: Iris conviction holds
description: Some positions are sacred — Iris must respect user intent over textbook optimization for rebalance/deposit/nudge behavior
type: feedback
originSessionId: d68eadb4-6b24-44ef-88b4-1c734ff4005d
---
Some portfolio holdings exist because the user believes in the thesis, not because they fit a target allocation. Scott's example: BTC. He sold crypto early once and regrets it ("would've had $70M"). He's holding forever regardless of what rebalance math says. Other users will have their own: TSLA, concentrated employer stock, inherited positions, ESPP lockups, crypto generally.

**Rule:** Iris must let users flag holdings as "conviction" and then honor that across the entire intelligence pipeline.

**Why:** A tool that keeps nagging "trim your BTC" will annoy the user into ignoring ALL its advice — even the legitimate stuff. Respecting user intent is a precondition for the user trusting anything else Iris says. This is the difference between an advisor and a spreadsheet.

**How to apply:**
- Rebalance engine (`portfolioIntelligence.ts`): exclude conviction holdings from rebalance moves entirely
- Deposit advisor (`depositAdvisor.ts`): don't auto-suggest adding to conviction holdings unless user put them in target allocation
- Concentrations (X-Ray): still surface ("NVDA stacked across 5 funds") — information is valuable — but shift copy from "consider trimming" to informational/FYI
- Movement nudges (`nudgeEngine.ts`): fire as normal ("BTC +12% this week") but frame as context, not action
- Target allocation: carve out a fixed "conviction sleeve" — other targets apply to the rest of the portfolio, so gaps/rebalance don't chase a percentage they can never reach
- UI: ⭐ toggle on each holding in Portfolio view + Settings panel listing all conviction holds
- Consider an optional "note" field per conviction hold so the user can record their reasoning ("long-term thesis, not trimming") and not have to re-litigate with themselves later

Generalize beyond holdings eventually: there's a family of "user-intent overrides" that should override the default engine — target overrides, account-level exclusions (e.g., 401k that can't be touched), tax-lot-aware no-sell flags for high-basis positions, etc. Conviction holds are the first one.
