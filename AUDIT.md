# Iris Platform Audit — April 15, 2026

## Top 10 Priority Items

1. **P0 FIXED**: Chat scrolling broken — height calc fixed
2. **P0 FIXED**: "Continue response" button dead — role check fixed
3. **P0 IN PROGRESS**: Mobile responsive — agent adding bottom nav + hamburger sidebar
4. **P1**: App.tsx is 2,130 lines — extract into view components (deferred)
5. **P1 FIXED**: Transaction search/filtering — search bar + category + date range added
6. **P1 FIXED**: Error boundaries — ErrorBoundary component created + wired into main.tsx
7. **P1**: Stale data across views — needs shared state management (deferred)
8. **P1**: Budget page empty before first import (deferred)
9. **P1**: Bulk category reassignment during import (deferred)
10. **P1**: `dangerouslySetInnerHTML` — needs react-markdown or DOMPurify (deferred)

## Also completed this session:
- **P1 FIXED**: Chat streaming — responses now stream token-by-token instead of waiting for full response
- **P1 FIXED**: Data backup/restore — Export + Import JSON in Settings
- **P2 FIXED**: Chat textarea — auto-growing multiline input replaces single-line
- **P2 FIXED**: Chat suggested prompts auto-submit on click
- **P2 FIXED**: Mobile CSS utilities added (table overflow, grid stacking)

## Missing Features (competitors have these)
- Recurring transaction detection (P1)
- Bill calendar / upcoming bills (P1)
- Transaction search & filtering (P1)
- Multi-month trend chart on dashboard (P2)
- Claire's income support (P2)
- Transaction splitting (P2)
- Investment benchmark comparison (P2)
- Spending threshold alerts (P3)
- Plaid integration for auto-sync (P2, complex)

## UX Friction
- PINs hardcoded in source, not changeable (P1)
- Mobile completely broken (P0)
- DashSection — too many defaultOpen, should persist open/close state (P2)
- Budget page empty before first import (P1)
- No deep-linking from insights to relevant data (P2)
- Action item completion forms too heavy for simple tasks (P2)
- No undo for transaction import (P1)
- Can't edit saved transactions (P2)

## Visual/Design
- Duplicate ScoreRing implementations (P3)
- Duplicate formatCurrency functions across 6 files (P2)
- Dark-only theme (P3)
- No loading skeletons (P3)
- Portfolio tables not mobile-friendly (P1)
- Emoji icons inconsistent, not accessible (P2)
- Pulse animation on critical badge is distracting (P3)

## Data Flow
- Massive data reload on every dashboard visit (P1)
- Budget view loads own copy of data independently (P1)
- Action items duplicated in two places (P2)
- Net worth snapshot only captures once per day (P3)
- Savings rate includes 401k but doesn't explain that (P2)

## Simplification
- App.tsx needs to be split into view components (P1)
- "Put Your Money to Work" cards are non-interactive (P3)
- Progress milestones grid too crowded — show next achievable only (P2)
- Budget scenarios data exists but UI is incomplete (P2)
- Work expenses toggle is easy to miss (P3)

## Quality of Life
- No keyboard shortcuts (P3)
- Chat input should be textarea, not single-line (P2)
- Pre-seed common merchant mappings for auto-categorization (P1)
- Bulk category reassignment during import (P1)
- Chat suggested prompts should auto-submit on click (P2)
- Price refresh should use free financial APIs instead of Gemini (P2)
- No data export to CSV (P2)

## Productization
- No empty states for most views (P1)
- No error boundaries (P1)
- Chat uses dangerouslySetInnerHTML without sanitization (P1)
- No interactive onboarding wizard (P2)
- No PWA/offline support (P3)
- No data backup/restore (P1)
- Hardcoded personal data in defaults (P1 if shipping)
- No privacy notice about Gemini data (P2)

## Chat/Iris AI
- Chat scrolling broken — FIXED
- Continue button broken — FIXED
- No streaming responses — user waits 10-30s staring at dots (P1)
- No message copy button (P2)
- Chat scroll position resets on view change (P2)
- No @ mentions for portfolio data (P3)
- Token-aware context window management needed (P2)
- No suggested follow-up questions (P2)
- Image upload has no preview (P3)
