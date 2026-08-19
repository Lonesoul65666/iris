---
name: Iris distribution target (revised 2026-04-21)
description: Iris is a downloadable local-first app sold for a small fee, not SaaS. Shapes scope and what NOT to build.
type: project
originSessionId: d68eadb4-6b24-44ef-88b4-1c734ff4005d
---
**Ordering decision (2026-04-21):** FINISH the "whole point" (Monarch-parity budget features + investment/equity intel) BEFORE starting the packaging/SQLite migration. Scott does not want the storage rug pulled mid-dev. Packaging is its own dedicated sprint that comes after budget feature set is complete — it will include IndexedDB → SQLite one-time importer so existing data isn't lost.

**Packaging direction (2026-04-21 conversation):**
- Tauri (Rust-based, ~10MB shell, native webview) — the planned wrapper. Mac + PC from one codebase.
- SQLite bundled inside the installer, opens `iris.db` in app data dir. Single-file DB = portable, backup-able, resellable.
- Bundled Ollama is acceptable to Scott even at ~400MB — do NOT assume installer size is a dealbreaker. Local-LLM parity is worth the bytes.
- First-run wizard: "cloud LLM (paste API key)" OR "local LLM (Ollama)" — router already supports both.
- LAN multi-device access is de-scoped unless Scott raises it again. Each install owns its own DB; family sync via file-copy or future optional cloud sync.
- **Current storage reality:** IndexedDB per-browser-per-origin — brittle (Edge ≠ Chrome, `localhost:5173` ≠ `gaming-pc:5173`, clear-browsing-data can wipe, incognito = fresh every time). Fine for Scott's single-user dev, wrong foundation for a product. SQLite swap happens as part of packaging sprint.

---


Iris is being built as a **downloadable, local-first app** that Scott and Claire use daily, and that friends/colleagues can download for a small one-time/light fee. SaaS is explicitly off the table for now — Scott has a full-time job and doesn't want to take Iris that far yet.

**Why:** Scott clarified 2026-04-19 that SaaS was "pie in the sky" and that the realistic near-term targets are (1) Scott + Claire daily use and (2) paid downloadable app for their network. SaaS may revisit later but is NOT the current destination.

**How to apply:**
- **Build:** local-first everything (IndexedDB is the right primitive), electron/tauri packaging later, lightweight license check rather than account system, onboarding that works for any portfolio not just Scott's defaults
- **Don't build:** multi-tenant backend, cloud sync infrastructure, billing subscription system, observability/analytics pipelines, marketing site / SEO, privacy policy / ToS for SaaS
- **Revisit when triggered:** "should this be a hosted service?" conversations — answer is "not now, keep it local-first." If SaaS is ever revisited, Scott has said it would require a business partner for security (SOC 2 / incident response) and money handling (PCI / fraud) since those are full-time roles. Don't build toward SaaS solo.
- **Distribution model Scott favors:** cheap landing site + download link + license-key checkout (Gumroad/Stripe Payment Links level of infra). User installs locally; their portfolio never leaves their machine; no "where's my money" or breach questions for Scott to answer. Possibly a mobile install down the road.
- **Auto-updater is in scope (Scott flagged 2026-04-19):** when packaging lands, include an update channel so Scott can ship patches/features to his own machine AND friends without asking them to re-download. Electron → `electron-updater` w/ signed releases on GitHub Releases or S3; Tauri → built-in updater w/ signed manifest. Keep it user-initiated ("check for updates" button) first, auto-check-on-launch later. Needed for per-user customizations Scott may want to push down too.
- **Completion scoring:** use the "friends/colleagues pay and use it" bar as the primary target. At 2026-04-19 we're roughly 60-70% against that target. Remaining work: conviction holds, tax-aware basics, onboarding that works for any portfolio, packaging, product polish (no more SaaS plumbing)
