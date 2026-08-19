---
name: Always use port 5173
description: Dev server must always run on port 5173 — IndexedDB data is per-origin, so switching ports loses all data
type: feedback
originSessionId: 057d3cc4-3d54-4f93-af05-38b4662a5fb7
---
Always run the Iris dev server on port 5173.

**Why:** IndexedDB is scoped per origin (host:port). All of Scott's financial data lives in the 5173 origin. Starting on a different port means empty state.

**How to apply:** Before starting the dev server, kill any process already on 5173. Never let Vite auto-pick a different port. If port is busy, free it first.
