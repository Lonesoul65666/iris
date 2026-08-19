---
name: Uber ride work expense rule
description: How to classify Uber rides as work vs personal in Iris expense imports
type: feedback
originSessionId: 69e79cff-b99a-45b0-b350-5aea07fbc8a0
---
Uber rides are generally work travel expenses.

**Exceptions (personal, NOT work):**
- International Uber/taxi rides (Dubai, Abu Dhabi, etc.) — these were personal vacation
- Uber rides during the Fort Lauderdale trip — also personal

**Why:** Scott corrected the default assumption. Most domestic Uber trips are for work travel (airport runs, client meetings). The international trips and FLL trip were personal vacations.

**How to apply:** In guessWorkExpense(), default Uber *TRIP to work=true, but check for international indicators (Dubai, Abu Dhabi, foreign city names) and Fort Lauderdale context to mark those as personal.
