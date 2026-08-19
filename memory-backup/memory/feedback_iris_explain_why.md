---
name: Iris "explain the why" for nudges and movements
description: Scott wants every movement alert to include a one-sentence market-context explanation, not just the magnitude
type: feedback
originSessionId: d68eadb4-6b24-44ef-88b4-1c734ff4005d
---
When a portfolio or holding moves meaningfully, Iris should tell the user WHY, not just flag the magnitude. Scott's phrasing: "why is it changing, what news has changed, what things have affected or altered the outcome — it suddenly dropped $10K, now I got to go out and read 27 articles."

**Why:** Scott (and his audience) wants Iris to be the summarizing layer between their portfolio and the news firehose. The reason to open Iris every 3 days instead of Coinbase is that Iris tells you why the number moved. Without the "why," nudges are dumb alerts; with it, they're actual briefings.

**How to apply:**
- Every movement-based nudge (`detectPortfolioMove`, `detectHoldingMove`, future concentration nudges) should enrich with a one-sentence "why" blurb pulled from Gemini (with Google Search grounding — already wired up in `marketIntelligence.ts`).
- Cache the explanation per nudge instance (`nudge_explain::<id>`) so it doesn't regen on every render. Invalidate on nudge dismiss or after ~24h.
- Fall back gracefully when Gemini unavailable — just render the bare nudge without the why.
- Not limited to nudges: a "biggest mover today" card on Dashboard with a one-sentence explanation would hit the same need.
- Target: make the user feel like they opened a personalized newsletter, not a spreadsheet.
