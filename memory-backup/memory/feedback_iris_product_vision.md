---
name: Iris product vision (partial — data-path section superseded)
description: Local-first ZIP + BYOK API keys, never SaaS — architect personal-first with product-grade discipline. Most still valid. SimpleFIN data-path section is SUPERSEDED — current plan is Teller dev tier (free) for BoA/Citi/Cap One, Coinbase official API for crypto, Fidelity OFX (pending plan check). See [project_iris_handoff_2026-05-01.md](project_iris_handoff_2026-05-01.md) for the deprecation context.
type: feedback
originSessionId: 02b40c59-4863-4465-85db-30511f2a7b9b
---
**Status note (2026-05-02):** Mostly still operative. Two things changed:
1. **SimpleFIN deprecated** — connector plan is now Teller dev tier (BoA/Citi/Cap One) + Coinbase API + Fidelity OFX. Per the 2026-05-01 reset.
2. **"Single shared profile" framing partially superseded** — the partner-mode requirement (couples-first) means the data model needs multi-user awareness from day one even if Phase 1 only renders Scott's view. See `docs/north-star.md` Working Principles #5.

The local-first / BYOK / no-SaaS / Tauri+SQLite packaging direction is unchanged.

---

Iris is NOT a hosted SaaS. Decided 2026-04-18.

**Distribution model:** ZIP download, users run locally, IndexedDB for data, bring-your-own Gemini/Claude API key. No auth, no hosting, no subscription, no backend proxy. Obsidian / Tailscale / desktop-Linear style. 30+ people have asked for it and interest is real, but none would pay $20/mo for another budget app — they'll download a ZIP and run it locally.

**Architectural discipline — "personal-first, product-grade":** Scott stays customer #1 and the only profile in the DB is his. But new code must be written as if for a generic user:
- No more hardcoded IDs like `'bofa-bank'`, `'mimecast-401k'`, `'fidelity-brokerage'`. Use type+tag lookups.
- No hardcoded names ("Scott", "Claire", "Blackwing"). Pull from user profile.
- New action items go into JSON/data schema, not new `case` branches in the `executeAction` switch.
- Every change asks "would this work for customer #2 after running onboarding?"

**Why:** Scott wants to ship a ZIP to interested people soon. He doesn't want a 90% rebuild after building the perfect Scott-only tool. He also explicitly doesn't want to run a business — the tool is the product, not the service. Hosted/subscription model is off the table for now; revisit only if Iris becomes something like a breakout app where marketing+hosting would be warranted.

**How to apply:**
- When touching `dynamicActions.ts`, `defaultData.ts`, or `AppDataContext`, refactor toward data-driven before adding new functionality
- First productization move is extracting `defaultData.ts` into an onboarding wizard — do this BEFORE porting action rules to JSON schema
- Wait on extraction until Scott finishes real-data cleanup (account balances still in flux, moving cash between accounts)
- Do NOT build: auth, multi-tenancy, backend API proxy, billing, hosted sync, PIN-as-real-auth
- Time-aware action items is a planned feature direction — `createdAt`, `staleAfter`, `recurring` ('annual'|'quarterly'|null), `urgencyByAge` (e.g., AMT 2022 gets MORE urgent over time, not less)
- Refactor + visual/UX upgrades happen in the same pass per page, not as separate phases (avoids paying for work twice)
- Scott & Claire remain a single shared profile, not separate logins (PIN is just a light lock screen, not user separation)

**Financial data integration — revised 2026-04-19 after verifying OFX landscape:**

OFX Direct Connect is effectively dying industry-wide, not just at BoA. Verified dead/deprecated at BoA (killed Sept 30, 2025 — fully dead, not paid-Quicken), Schwab (discontinued Direct Connect server), Amex (migrated to Yodlee/Direct Access), Capital One (never supported Direct Connect, EWC+/Yodlee only). Vanguard technically still supports but only through one specific app (Banktivity). Industry is moving to proprietary APIs + Yodlee/Plaid aggregation layers. **Do not architect Iris around OFX as a primary data path.**

**Chosen 2026-04-19 (updated same-day):** User picks at onboarding — no opinionated default. Both paths are first-class.

**Scott personally chose:** SimpleFIN with yearly billing ($15/yr upfront, saves $3 vs monthly), with full awareness he can drop to monthly or cancel entirely at any time. Data: "I need EASY" — $15/yr is nothing vs manual CSV pulls every 3-5 days.

**For the ZIP distribution, the onboarding presents both options side-by-side with no default bias:**
- "Manual CSV uploads (free) — import every 1-2 weeks from your bank's export page"
- "Automatic refresh via SimpleFIN ($15/yr paid directly to SimpleFIN, not to Iris) — token-paste once, data flows automatically"

User can switch between paths later in Settings. Dropping SimpleFIN doesn't break the app — it just reverts to manual CSV.

SimpleFIN facts: flat $1.50/mo OR $15/yr for up to 25 institutions AND 25 apps on a single subscription (NOT per-account). One sub covers BoA, Fidelity, Cap One, Chase, Amex, Coinbase, everything. User pays SimpleFIN directly, not Iris — Scott is NOT a reseller, not holding tokens for users, not in the money-transfer business. Token lives in user's IndexedDB.

**Path A (CSV polish) gets full first-class investment** — not a fallback afterthought. It's half the user base by design.

**Emerging commerce model (directional, not locked):** Scott is exploring a **one-time purchase for Iris itself** (manual CSV included in base price) with SimpleFIN as an optional user-paid add-on layered on top. This is a shift from the earlier "free ZIP" model. Non-blocking for architecture — doesn't change the code, just the distribution page. Pricing, payment processor (Gumroad / Stripe / Lemon Squeezy), licensing mechanism all TBD. Revisit when core productization is closer to ship-ready. Key invariant: Iris itself is never a subscription — either free or one-time. The $15/yr is a data-service cost the user pays to SimpleFIN, not to Scott.

**Still off the table: Plaid.** Requires server-side API key proxy, breaks local-first, adds per-user monthly cost, contradicts no-hosting principle. SimpleFIN is architecturally different (token flow, user controls their own token, designed for local apps).

**Do not recommend switching banks purely to get OFX working.** OFX is dying everywhere, so no bank switch solves that.

**BoA relationship context (important for future portfolio suggestions):** Scott does NOT use a BoA credit card — his primary card is the Citi AAdvantage Executive Platinum, because he flies American Airlines ~200 flights/year and the AAdvantage miles earning + Admirals Club access beat BoA Preferred Rewards for his use case. This means **BoA Preferred Rewards tier (credit card multiplier) is NOT load-bearing for him** — he has ~$158k sitting at BoA for pure inertia/branch/Zelle reasons, not for the Preferred Rewards boost. Yield opportunity cost is real: $158k × ~3.5% APY delta = ~$5,500/yr in foregone interest. Worth reconsidering the BoA position at some point, but non-blocking for Iris productization. Capital One 360 Performance Savings is 3.20% APY as of April 2026 — still below market (Varo 5%, Axos 4.21%, Newtek 4.20%), so Cap One isn't the right destination either.

**AI model:** Primary plan is local LLMs. Default model is **Gemma 4 E2B** (2.3B active, ~1.5GB on disk Q4, Apache 2.0, multimodal). E4B (~2.5GB Q4) is the "higher quality, slower" opt-in. Power-user opt-in for 26B MoE (requires 16GB+ VRAM). **Do not build around 31B dense** — Scott has a 4090 but most coworkers don't, and building for the dev's hardware is a product trap.

Default chosen as E2B (not E4B) based on Scott's actual dev hardware: Surface Laptop 5, Intel i7-1265U (15W U-series), Intel Iris Xe integrated graphics (no discrete GPU), 32GB RAM. E2B gets ~15-25 tok/s on CPU-only; E4B gets ~8-15 tok/s. If E2B feels snappy on Scott's mid-tier hardware, it'll feel fine on coworkers' machines too.

Cloud API (Gemini or Claude) stays as an optional fallback — user brings their own key. Claude migration deferred while on work account. Model-agnostic improvements (sanitize `dangerouslySetInnerHTML`, prompt structure, caching) apply to whatever provider is active.

Architecture: `LLMProvider` interface abstracts Ollama/WebLLM/Gemini/Claude behind one call signature; user picks in Settings with capability badges (size, speed, whether install needed).

**Distribution model — Scott hosts NOTHING beyond a tiny ZIP:**
- ZIP contains only the compiled web app (~5-10MB). GitHub Releases or a shared Dropbox link is plenty.
- Model weights are never bundled. First-launch wizard asks the user to pick: (a) bring-your-own cloud API key, (b) download local model (fetched from HuggingFace CDN on first use), or (c) auto-detect existing Ollama install on `localhost:11434`.
- HuggingFace hosts the model weights. Scott's bandwidth cost is zero regardless of how many users.
- First-run needs internet (for model download); subsequent use is fully offline.

**Development happens on Scott's work PC (Surface Laptop 5), not his gaming rig.** Deliberate product discipline — if E2B runs snappy on his integrated-graphics laptop, it'll run on coworkers' laptops too. Building on the 4090 and shipping to mid-tier laptops is the "works on my machine" trap. Do not suggest migrating dev to personal PC until core productization is complete.
