# Iris Target Architecture — Sketch

**Status:** Draft for review (not implementation). Written 2026-04-18.

## What Scott asked

1. Am I doing things in the right order?
2. Is this architecture the right one to commit to long-term?
3. Sketch the data-driven action items engine before we build it.
4. What's the safe way to pull input logs from banks/brokerages without full write access?

---

## 1. Ordering — slight reorder from the priority stack

The previous stack had Ollama install at #2 and action items refactor at #5. That's **feature order**, not **dependency order**. If we build onboarding wizard (#4) before settling the action schema (#5), the wizard will seed data that doesn't fit the new schema and we rebuild.

### Revised order

**Phase 0 — Foundation schemas (locks the shapes nothing else can break later):**

1. **`UserProfile` schema** — what does a generic user look like, not Scott-shaped? Includes `id`, `displayName`, `household` (array of people), `accountTags`, `preferences`. No more hardcoded "Scott" or "Claire" anywhere.
2. **`ActionTemplate` schema** — data-driven JSON spec (sketched below).
3. **`LLMProvider` interface** — `chat(messages, opts) → stream`, `explain(data) → text`, same signature regardless of Ollama / WebLLM / Gemini / Claude.

**Phase 1 — One vertical slice end-to-end:**

4. Pick ONE existing action (HYSA move is the cleanest). Rewrite it as an `ActionTemplate`. Build the generic executor that reads the template and mutates state. Validate the shape.
5. Wire LLMProvider to Ollama on localhost:11434. Gemini stays as fallback behind the same interface. Fixes the 75% failure pain today.

**Phase 2 — Port + onboard:**

6. Port the remaining 5 actions to templates. Delete the switch statement.
7. Extract `defaultData.ts` into an onboarding wizard that writes a clean `UserProfile`.

**Phase 3 — Data refresh:**

8. CSV polish (dedupe, new-since-last-import, merchant mappings).
9. OFX Direct Connect for Fidelity + credit cards.
10. Optional: SimpleFIN Bridge for non-OFX banks.

**Why this order works:** every phase produces a working app. Scott can keep using it. No "everything is broken until we finish the big refactor" phase. Phase 0 locks the contracts, Phase 1 proves them, Phase 2+ is mechanical port-work.

---

## 2. Is this the right architecture?

**Yes, with two commitments:**

**Commitment A — Data-driven over code-driven.** Every new action is a JSON object, not a `case` branch. Every new account-lookup goes through `AccountRef` resolution, not `accounts.find(a => a.id === '...')`. Every user-visible name comes from profile templating, not string literals. This is the thing that lets coworker #2 run onboarding and have a working app without Scott-isms.

**Commitment B — Providers are interfaces, not imports.** LLM, financial-data source, storage backend — all three are pluggable behind interfaces. User picks in Settings. One code path doesn't care which is active. This is the "plug in different APIs" capability Scott described.

If we hold both commitments, we don't rebuild again. New features are net-new JSON + net-new effect handlers, not refactors.

---

## 3. Action items schema — sketch

### `ActionTemplate` shape

```ts
interface ActionTemplate {
  id: string;              // stable slug, e.g. "move-cash-to-hysa"
  version: 1;
  category: 'cash' | 'tax' | 'investment' | 'budget' | 'general';

  // When should this surface?
  trigger: {
    type: 'portfolio-condition' | 'manual' | 'recurring';
    condition?: RuleExpression;              // data predicate over portfolio state
    recurring?: 'annual' | 'quarterly' | 'monthly';
    createdAt?: string;                      // ISO date
    staleAfter?: number;                     // days before auto-expire
    urgencyByAge?: 'increasing' | 'decreasing' | 'static';
  };

  // How does it appear?
  text: string;            // supports {{profile.displayName}}, {{metrics.*}}
  detail?: string;
  priority: 'high' | 'medium' | 'low';

  // What does the user type when executing?
  inputs: InputField[];

  // What mutations happen on execute?
  effects: Effect[];

  // Success/error messaging
  successTemplate: string;
  newActionsOnSuccess?: Partial<ActionTemplate>[];
}

type AccountRef =
  | { by: 'id'; id: string }
  | { by: 'type-and-tag'; type: AccountType; tag?: string }
  | { by: 'type'; type: AccountType; pick: 'first' | 'largest' | 'prompt-user' }
  | { by: 'institution'; name: string };

type Effect =
  | { op: 'transfer-cash'; from: AccountRef; to: AccountRef | 'new-account';
      amount: 'input:amount' | number; newAccountTemplate?: Partial<Account> }
  | { op: 'add-holding'; account: AccountRef; holding: Partial<Holding> }
  | { op: 'remove-holdings'; account: AccountRef; filter: HoldingFilter }
  | { op: 'update-profile'; path: string; value: unknown }
  | { op: 'update-account'; account: AccountRef; patch: Partial<Account> }
  | { op: 'update-budget'; target: 'paycheck' | 'fun-money' | 'sinking-funds';
      patch: Record<string, unknown> }
  | { op: 'exercise-equity'; grantFilter: EquityFilter; shares: 'input:shares' | number }
  | { op: 'update-transactions'; filter: TransactionFilter; patch: Partial<Transaction> }
  | { op: 'spawn-action'; template: Partial<ActionTemplate> };

// 9 ops total. Cross-checked against current switch statement (6 actions, all map cleanly)
// and next ~8 planned actions (tax-loss harvest, emergency-fund top-up, rebalance,
// subscription cleanup, monthly DCA, backdoor Roth, I-Bond, HSA) — nothing forces a new op.
// Deferred until actually needed: computed-amount expressions, scheduled/recurring ops,
// external price-refresh ops (those live in a sync service, not action templates).
```

### Example — HYSA move as a template (replaces `executeHYSAMove` in [actionStore.ts:110-188](src/stores/actionStore.ts))

```json
{
  "id": "move-cash-to-hysa",
  "version": 1,
  "category": "cash",
  "trigger": {
    "type": "portfolio-condition",
    "condition": {
      "all": [
        { "metric": "low-yield-cash", "op": ">", "value": 50000 },
        { "metric": "hysa-cash", "op": "<", "value": 50000 }
      ]
    },
    "urgencyByAge": "static"
  },
  "text": "You have {{metrics.low-yield-cash | currency}} earning <1% in a checking/savings account. Move some to a HYSA earning 4%+.",
  "priority": "high",
  "inputs": [
    { "key": "source", "label": "Source account", "type": "account-picker",
      "filter": { "type": "bank", "tag": "low-yield" } },
    { "key": "amount", "label": "Amount moved", "type": "currency", "required": true },
    { "key": "destination", "label": "HYSA destination", "type": "string", "default": "High-Yield Savings" },
    { "key": "apy", "label": "APY %", "type": "number", "default": 4.25 }
  ],
  "effects": [
    {
      "op": "transfer-cash",
      "from": { "by": "id", "id": "input:source" },
      "to": "new-account",
      "amount": "input:amount",
      "newAccountTemplate": {
        "name": "{{input:destination}}",
        "type": "bank",
        "tags": ["hysa"]
      }
    }
  ],
  "successTemplate": "Moved {{input:amount | currency}} to {{input:destination}}. Now earning ~${{calc: input.amount * input.apy / 100 | round}}/year at {{input:apy}}% APY."
}
```

### Generic executor (replaces the switch statement)

```ts
async function executeAction(
  template: ActionTemplate,
  inputs: Record<string, unknown>,
  ctx: { accounts, profile, paycheck }
): Promise<ActionResult> {
  const resolvedEffects = template.effects.map(e => resolveRefs(e, inputs, ctx));
  const results = [];
  for (const effect of resolvedEffects) {
    const handler = effectHandlers[effect.op];
    if (!handler) return { success: false, message: `Unknown op: ${effect.op}` };
    results.push(await handler(effect, ctx));
  }
  return {
    success: true,
    message: renderTemplate(template.successTemplate, { inputs, results, ctx }),
    newActionItems: template.newActionsOnSuccess,
  };
}
```

**Adding a new action becomes:** write one JSON object. No code change, no re-deploy. Users can even add their own through a UI builder later.

### Where templates live

```
src/data/actions/
  cash.json          # HYSA, transfers, emergency fund
  tax.json           # ISO exercise, 401k increase, tax-loss harvest
  investment.json    # rebalance, sell-X-buy-Y, dollar-cost-averaging
  budget.json        # fun money, subscription cleanup
```

Loaded at startup, merged with user-added custom actions from IndexedDB. The `defaultActionItems` constant in ActionItems.tsx dies.

---

## 4. Financial institution data access

Scott asked for something safer than screenshots and more reliable than CSV export. Real-time or queued-real-time pull, read-only.

### Option ranking for Iris's local-first model

| Method | Read-only? | Local? | Coverage | Effort |
|---|---|---|---|---|
| **OFX Direct Connect** | Yes (protocol-enforced) | Yes (browser→bank direct) | Fidelity, Chase, Amex, Vanguard, most brokerages. BofA dropped it. | Medium |
| **SimpleFIN Bridge** | Yes | Yes (token-only) | ~80% of US banks | Low, but $1.50/mo/user |
| **CSV polish + auto-download** | Yes | Yes | Universal | Low |
| **PDF statement parse** | Yes | Yes (local LLM extracts) | Universal fallback | Medium |
| **Email parse (Gmail API)** | Yes | Semi (OAuth token) | Transaction confirmations only | Medium |
| **Plaid** | Yes | **No — requires server** | ~95% | Off the table |
| **Screen scraping** | Usually ToS-violating, brittle | Yes | Varies | Do not do |

### Recommendation

**Primary path — OFX Direct Connect:**
- Protocol is 20+ years old, standardized, read-only by design (no trading/transfers over OFX)
- Browser makes a POST to the bank's OFX endpoint with user's login credentials
- Credentials stored in IndexedDB (encrypted with a user-set passphrase)
- Response is structured XML — parsed into transactions + holdings
- Fully local, no middleman, no server

**Covers:** Fidelity (holdings + transactions), Chase (credit cards + bank), Amex, Vanguard, Schwab, most credit unions.

**Doesn't cover:** Bank of America (killed free OFX in 2022), most neobanks, Coinbase.

**Secondary path — CSV polish:**
- For BofA and anything without OFX
- Auto-open the bank's export page, user clicks download, drops the file
- Dedupe on re-import (hash the row), show "new since last import" diff
- Persistent merchant mappings (the `merchantMappings` IndexedDB table already exists and is under-used)

**Fallback — PDF statement parse:**
- User drops a monthly statement PDF
- Local LLM extracts transactions
- Works for any bank, slower and less real-time

**Crypto** — Coinbase has a read-only API key option. Account→API Keys→read-only scope. Same local pattern: key in IndexedDB, browser→Coinbase API direct.

### What NOT to build

- **No Plaid.** Requires server-side API key, breaks local-first, costs per user. Contradicts the vision.
- **No screen scraping.** ToS-violating for most banks, brittle to any HTML change, makes it look like a bot → account lockout risk.
- **No "AI reads my screenshots."** Lossy, manual, doesn't scale. The moment we have OFX for Fidelity, screenshots are dead.

---

## 5. Methodology — how we build this without re-doing it

1. **Lock schemas first, code second.** Phase 0 produces TypeScript interfaces + one JSON example per template category. Scott reviews before a line of implementation lands.
2. **One vertical slice, then port.** HYSA move goes end-to-end on the new schema. If the shape is wrong, we find out with 1 action rewritten, not 6.
3. **Both commitments hold or nothing ships.** Every PR after Phase 0 passes a grep check: no new `accounts.find(a => a.id === '...')`, no new hardcoded names, no new `case` in the action switch. If it fails, the PR doesn't merge.
4. **LLM stays provider-agnostic.** Every LLM call goes through `LLMProvider`. If Gemini fails, the UI shows a one-click switch to whatever other provider is configured. No more dead-end errors.
5. **Revisit when ready to ship to coworkers, not before.** Scott is still customer #1. Finish real-data cleanup, get onboarding wizard working, then cut a ZIP.

---

## Open questions for Scott

1. **Does the `ActionTemplate` JSON feel readable** when you look at the HYSA example? Or too much ceremony?
2. **Are the 8 `Effect.op` types enough** to cover everything in your current switch statement? Cross-check: HYSA (transfer-cash), ISO exercise (exercise-equity), rotation (remove-holdings + add-holding), memecoin sell (remove-holdings), 401k (update-paycheck), fun money (update-fun-money). All covered.
3. **OK with OFX credentials in IndexedDB** (encrypted with user passphrase)? This is the standard local-first pattern but worth flagging — it means "lose your laptop, worry about your laptop". A hardware-level passphrase at load time is reasonable.
4. **How strict on the `ActionTemplate` schema version?** v1 today. If we later realize we need a v2 shape, do we migrate the JSON files in-place, or support both side-by-side? (My vote: migrate in-place, keep the migration script in repo.)
