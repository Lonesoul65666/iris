# Iris punch list — rescued from Google Drive (2026-08-17)

Recovered from an untitled Google Doc in Scott's **work** Drive
(`sdeluke@abnormal.ai`), created 2026-07-03, last edited 2026-07-06. Saved here
and the Drive copy moved to Trash, because Iris notes — including the $15,800
base figure — don't belong in an employer-administered space.

Content verbatim below. Mostly a dashboard/budget punch list from the 2026-07-03
→ 07-06 sessions (most items marked done at the time), followed by a list of
audit findings that overlaps `docs/audits/2026-07-04-swarm-audit.md`.

---

Make update int button on dashboard - done

Logic behind net worth - done

Iris notifications - are they working? Move them? - pause

Tutorial hover overs

Cash flow…scrap it - done

Fix action item on bottom

Budget -

Safe to spend · 29 days left this month  - make text easier to read - done

## Where your $15,800 went - tie to monthly spend

Should = 15,004 - done

Gas and transportation - tolls - said ti cannot find…track these down - not done

- Fix Pie Chart on spending this month - dashboard - **done**
- Add OTE counter for the year with maybe a fun target counter - DONE
- Goal Tracker should be Have To/Want To and have fun encouragements etc - done
- Header in Spend by Account is small - DONE
- Major tabs on budget screen - budget - DONE
- Move translation counts to the transitions expanded view - DONE
- Maybe move month selector to Overview - DONE
- Title in Hows teh month going - DONE
- Budget status be like a hype man. Let's Fucking gooo…nothign over budget!!!:
- work float collapsable and done by default
- Do we need monthly spend?
- Do we need Income sources? Verify some of them
- Ask and fix recurring bills
- what happens to budget related action items….2 completed but will there be more and can we dismiss?

Can you give me a full bullet point list of features that we have in this product
so far and then a full bullet list of features of things that we are going to
build and then a full bullet list of fixes we have to do and then a full bullet
list of enhancements we have to do?

Cold-start reload race — hard reload throws useAppData must be used within
AppDataProvider (App.tsx boot() has no try/catch; ErrorBoundary recovers).
Wrap boot().

- Audit resilience (PLAUSIBLE) — dynamicActions equity.grants guard,
  IntelligenceView as any toUpperCase, SyncStatus uncancellable reload,
  db-pool ensureSingleUser oldest-wins, saveFunMoney dedup
- Display — format.ts sign placement ($-2.5M), duplicate/divergent currency
  formatters, key={i} bar glitches on re-sort
- Yahoo proxy — allow-list endpoints (forwards attacker-controlled path)
- ChatView welcome copy is portfolio-framed — reads off from a budget entry point
- Full-history Teller re-pull — older transfers/card-payments not backfilled

---

## Still-open items worth carrying forward

Most of the list was done by 2026-07-06, but these were never marked done and
don't appear in the current backlog:

- **Tolls under Gas & transportation** — "said it cannot find…track these down"
  (marked NOT done). Related note in [[reference_iris_teller_accounts]] says
  tolls are prepaid.
- **Tutorial hover-overs** — never marked done.
- **Iris notifications** — explicitly "pause"d.
- **Work float** — collapsible + collapsed by default.
- **"Do we need Monthly Spend?"** — still live; the 2026-08-17 review found the
  Monthly Spend tile shows a different "spent" than the Pulse.
- **Yahoo proxy endpoint allow-list** — a security item; unclear if ever fixed.
