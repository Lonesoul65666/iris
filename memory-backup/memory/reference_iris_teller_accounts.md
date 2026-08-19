---
name: reference-iris-teller-accounts
description: Iris Teller account → source mapping (which physical card/bank maps to credit_card_1 etc.) + sync endpoints
metadata: 
  node_type: memory
  type: reference
  originSessionId: 982e17aa-44b9-4cdf-a876-24c795a943d7
---

Iris's 5 connected Teller accounts across 3 enrollments (verified live 2026-07-04, all healthy, 0 errors). The `data->>'source'` value in the `expenses` table maps to a physical account like this:

- `credit_card_1` = **Citibank …3306** (AAdvantage Executive Mastercard) — the MAIN card, ~300 txns/2mo. **NTTA/HCTRA toll autocharges land here** (all 12 historical tolls were on it), categorized `transportation` (= "Transportation / Gas" bucket).
- `credit_card_2` = **CapitalOne …0114** (Quicksilver)
- `bofa_checking` = **BofA …8256** ("Deluke Main Checking") — mortgage/utilities/Fidelity investing autopay
- `bofa_joint` = **BofA …1006** ("Our stuffs") — VERY low activity (occasional big transfers only). Looks "stale" but is NOT broken — it just rarely has transactions.
- `bofa_savings` = **BofA …3784** ("Super Savings")

**Tolls are PREPAID top-ups, not monthly bills:** NTTA/HCTRA only recharge ~$80 to the Citi card when the prepaid balance depletes (irregular, ~every 5-7 weeks) — so gaps between toll charges are normal, not a data problem.

**Sync/diagnostic endpoints** (single-user server, no auth header needed; hit `http://localhost:5173`): `GET /api/teller/status` (certs), `GET /api/teller/accounts` (live per-connector, flags dead tokens), `GET /api/teller/probe` (read-only full-history depth — expensive), `POST /api/teller/import?since=YYYY-MM-DD` + `POST /api/teller/import-income?since=…` (the real resync; idempotent + edit-preserving). Certs at `C:\Claude\projects\Teller\`. See [[project_iris_handoff_2026-06-08]] for connector build. Probe scripts: `scripts/probe-toll*.mjs`.
