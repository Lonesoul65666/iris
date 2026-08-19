---
name: Iris deployment model — desktop-hosted, LAN-accessible (still valid; refined)
description: Scott runs Iris on his gaming desktop, accesses from other devices over LAN. The 2026-05-02 vision widening makes this MORE important — partner-mode requires both partners to access the same canonical data from different devices. The "Claire's view diverging" problem is now the partner-mode-parallel-views problem to solve.
type: feedback
originSessionId: ab3880cf-d0b1-4774-9ee9-5fdbbd57f650
---
**Status note (2026-05-02):** Still operative. The partner-mode requirement (couples-first positioning) makes the LAN-accessible architecture load-bearing rather than nice-to-have. The "two partners, one canonical dataset, parallel views" pattern is captured in `docs/north-star.md` Working Principles #3 and #4. SQLite-on-server-side migration is still the right path; mobile-glance is now an explicit secondary mode (not "out of scope" — just deferred to v3+).

---

Scott clarified on 2026-04-20 that mobile/phone access is out of scope for now. "Shelf the PWA piece."

**Current deployment target:**
- Primary: installed/running on Scott's gaming desktop 24/7
- Secondary: accessible from other machines on the same home LAN (e.g. laptop at kitchen table) via a URL like `http://gaming-pc:5173`
- No phones, no PWA service workers for mobile, no remote access outside the house
- Scott & Claire both use it — sometimes simultaneously from different devices

**Why:** Scott's primary workstation is the gaming desktop, but he wants freedom to sit anywhere in the house and check/update the budget. Phones are overkill for now. This also keeps it truly local (data never leaves the house) while solving the dual-user problem.

**Architectural implication this creates:**
- IndexedDB is per-browser-per-origin. If laptop hits `http://gaming-pc:5173`, the IndexedDB lives in the LAPTOP's browser, separate from the desktop's IndexedDB. **Claire's view would be empty / diverge from Scott's.**
- To share data across LAN clients, storage must move to a server-side store on the gaming PC (SQLite file + small HTTP API, or Tauri backend exposing IPC over the network).
- Pure-browser IndexedDB local-first only works for single-device use.

**How to apply:**
- When designing storage/sync, assume data must be canonical on the gaming PC and fetched by clients over LAN. Don't design browser-only persistence that can't roll up to a server.
- When proposing packaging (Tauri, Electron, etc.), ensure the chosen path supports LAN exposure — Tauri's default webview is *desktop-only-local*; we'd need to spawn an additional HTTP server sidecar bound to 0.0.0.0.
- Don't waste effort on PWA manifests, iOS install prompts, mobile-responsive budget-entry flows. Desktop-browser-first UX.
- Still no SaaS plumbing — no cloud, no auth, no accounts. Just LAN trust (home network = trusted).
- Keep the "one URL to the page" simplicity Scott described — don't make Claire install anything on the laptop.

**Migration path for current IndexedDB code:**
- Near-term: keep IndexedDB as-is; ship SimpleFIN sync + budget features against it (gaming PC only). Functional single-device.
- Medium-term: replace `portfolioStore` / `budgetStore` idb calls with HTTP fetches to a local API served by a small Node/Bun backend (or Tauri sidecar) that owns a SQLite file.
- Keep the `getAllAccounts()` / `saveExpense()` function signatures; only swap the implementation. Minimizes churn in 100+ call sites.
