---
name: project-iris-offline-architecture
description: "Iris data-architecture direction (decided 2026-06-14, NOT YET BUILT): keep Supabase cloud as the single source of truth; add a local CACHE layer for offline resilience + instant loads. Refines ADR-0002 / the local-first framing."
metadata: 
  node_type: memory
  type: project
  originSessionId: d39b9d1a-4b4d-47b2-ab70-ee9477148a27
---

# Iris offline / data architecture — direction (decided 2026-06-14, not yet built)

Triggered by Scott feeling the connectivity lockout on a plane (localhost app loads, but data lives in Supabase cloud → bad wifi = locked out of his own budget). Decision after discussion:

**Cloud stays canonical. Local cache is a disposable mirror on top.**
- **Keep 100% Supabase / cloud DB** as the single source of truth — Scott explicitly loves it; it's what makes Iris device-agnostic + partner-mode (Scott + Claire) + future **mobile** ("interesting once we nail down the bones"). NOT moving to local-first SQLite-as-canonical (that makes sync scary).
- **Add a local cache layer** for resilience + speed, three moves:
  1. Reads = stale-while-revalidate (paint from cache instantly, revalidate from Supabase in background).
  2. Writes = optimistic (land in cache immediately).
  3. Sync queue = flush queued writes to Supabase when back online.
- **Conflict resolution = last-write-wins + `updated_at`.** A 2-person household does NOT need CRDTs.
- **Feasibility: additive, not a rewrite** — all data already flows through one thin seam (`src/lib/collectionsClient.ts` + the `api()` wrapper in budgetStore). The cache slots in there. Likely TanStack Query (persisted) at the read seam + a write queue.
- **Principle:** viewing/editing your own money should NEVER need the internet; only external fetches (Teller bank sync, Gemini AI, market prices) require connectivity.
- **Mobile angle:** this pattern IS one of "the bones" — once cache+queue exists, mobile is just another client on the same Supabase, not a rebuild.

**Status: NOT building yet** (Scott: "NOT TODAY"). When back on solid ground, formalize as an ADR (effectively an update to ADR-0002, which moved storage to user-owned cloud DB). Relates to [[project_iris_target]] (downloadable local-first vision) + [[feedback_iris_deployment_model]] — this refines that framing toward cloud-primary + local-cache rather than local-primary + sync.

Also fixed this session (the plane trigger): Google Fonts was render-blocking in index.html → made non-blocking (preload+swap, system-ui fallback) so the app paints instantly offline (commit 703c692). The deeper "Vite dev is heavy" problem → real fix is a production build (bundled, offline-capable); parked.

**⚠️ DEV-TIME CLOBBER HAZARD (seen live 2026-07-05):** `saveSinkingFunds`/`saveBuckets`/`saveFunMoney` call `replaceCollection` (budgetStore.ts ~L82) which is REPLACE semantics — upserts present rows AND **deletes rows whose keys are gone**. So when TWO clients edit the same collection against the one shared Postgres (e.g. Claude's preview browser on :5173 AND Scott's real Chrome), it's last-write-wins on the WHOLE collection: a client with a stale in-memory list silently wipes the other's newer rows on its next save. Witnessed: Scott rebuilt his stashes in Chrome while Claude's preview held the old set; only careful reload-before-edit + a targeted SQL delete avoided data loss. **Rule: don't have two browsers editing collections at once; reload to pull latest before mutating; prefer targeted SQL (single-key DELETE with backup) for cleanup.** This is the concrete pain the (still-unbuilt) local-cache + `updated_at` conflict layer above would fix.
