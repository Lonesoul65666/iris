// Generic executor for ActionTemplate — reads a JSON template and applies its effects.
// Returns Mutation[] for the caller to dispatch to the right stores. Pure function —
// no side effects, no persistence. The caller wires mutations into saveAccount /
// savePaycheck / saveFunMoney / saveEquityProfile etc.

import type { Account, AccountType, EquityProfile, Holding } from '../types/portfolio';
import type { FunMoney, PaycheckBreakdown, SinkingFund } from '../types/budget';
import type {
  AccountRef,
  ActionExecutionResult,
  ActionTemplate,
  Effect,
  InputRef,
  TransactionFilter,
} from '../types/actions';

// ─────────────────────────────────────────────────────────────────────────
// Mutation shapes — one per store target. The caller switch-dispatches on
// `target` and persists to the matching IndexedDB table.
// ─────────────────────────────────────────────────────────────────────────

export type Mutation =
  | { target: 'account'; data: Account }
  | { target: 'paycheck'; patch: Partial<PaycheckBreakdown> }
  | { target: 'fun-money'; data: FunMoney[] }
  | { target: 'sinking-funds'; data: SinkingFund[] }
  | { target: 'profile'; path: string; value: unknown }
  | { target: 'equity'; data: EquityProfile }
  | { target: 'transactions'; filter: TransactionFilter; patch: Record<string, unknown> };

export interface ExecutionContext {
  accounts: Account[];
  equity?: EquityProfile;
  paycheck?: PaycheckBreakdown;
  funMoney?: FunMoney[];
  sinkingFunds?: SinkingFund[];
  profile?: { id: string; displayName?: string } & Record<string, unknown>;
  metrics?: Record<string, number>;
  inputs: Record<string, unknown>;
  now: Date;
}

export interface ExecutionOutput {
  result: ActionExecutionResult;
  mutations: Mutation[];
}

// ─────────────────────────────────────────────────────────────────────────
// Value + reference resolution
// ─────────────────────────────────────────────────────────────────────────

function isInputRef(v: unknown): v is InputRef {
  return typeof v === 'string' && v.startsWith('input:');
}

function resolveValue<T>(value: InputRef | T, inputs: Record<string, unknown>): T {
  if (isInputRef(value)) {
    const key = value.slice('input:'.length);
    return inputs[key] as T;
  }
  return value;
}

export function resolveAccountRef(ref: AccountRef, ctx: ExecutionContext): Account | null {
  const active = (a: Account) => a.status !== 'closed';

  switch (ref.by) {
    case 'id':
      return ctx.accounts.find(a => a.id === ref.id) ?? null;

    case 'input': {
      const id = ctx.inputs[ref.inputKey];
      if (typeof id !== 'string') return null;
      return ctx.accounts.find(a => a.id === id) ?? null;
    }

    case 'type-and-tag': {
      const candidates = ctx.accounts.filter(
        a => a.type === ref.type && active(a)
      );
      if (ref.tag) {
        const tagMatch = candidates.find(a => {
          const tags = (a as Account & { tags?: string[] }).tags;
          return Array.isArray(tags) && tags.includes(ref.tag!);
        });
        return tagMatch ?? null;
      }
      return candidates[0] ?? null;
    }

    case 'type': {
      const candidates = ctx.accounts.filter(
        a => a.type === ref.type && active(a)
      );
      if (ref.pick === 'first') return candidates[0] ?? null;
      if (ref.pick === 'largest') {
        return [...candidates].sort((a, b) => b.totalValue - a.totalValue)[0] ?? null;
      }
      return null; // prompt-user is UI-layer concern
    }

    case 'institution': {
      const target = ref.name.toLowerCase();
      return (
        ctx.accounts.find(
          a => active(a) && a.institution.toLowerCase().includes(target)
        ) ?? null
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Template string renderer — {{path}}, {{path | filter}}, {{calc: expr}}.
// Scope roots: input.*, metrics.*, profile.*.
// ─────────────────────────────────────────────────────────────────────────

type Filter = (value: unknown) => string;

const filters: Record<string, Filter> = {
  currency: v => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  },
  round: v => String(Math.round(Number(v))),
  percent: v => {
    const n = Number(v);
    return Number.isFinite(n) ? `${n}%` : String(v);
  },
  list: v => {
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'string') return v;
    return String(v);
  },
};

function lookupPath(path: string, ctx: ExecutionContext): unknown {
  const [root, ...rest] = path.split('.');
  const source =
    root === 'input' || root === 'inputs'
      ? ctx.inputs
      : root === 'metrics'
        ? ctx.metrics
        : root === 'profile'
          ? ctx.profile
          : undefined;
  if (!source) return undefined;
  let cursor: unknown = source;
  for (const key of rest) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

// Whitelist-validated arithmetic — numbers, decimals, parens, +-*/ only.
// Variables (input.X, metrics.X) substituted to numeric literals before evaluation.
function evaluateCalc(expr: string, ctx: ExecutionContext): number {
  const substituted = expr.replace(
    /([a-z]+)\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    (_, scope, key) => {
      const source =
        scope === 'input' || scope === 'inputs'
          ? ctx.inputs
          : scope === 'metrics'
            ? ctx.metrics
            : undefined;
      if (!source) return '0';
      const raw = (source as Record<string, unknown>)[key];
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : '0';
    }
  );

  if (!/^[-+*/().\d\s]+$/.test(substituted)) {
    throw new Error(`Unsafe calc expression after substitution: "${expr}"`);
  }

  const result = Function(`"use strict"; return (${substituted});`)();
  const n = Number(result);
  if (!Number.isFinite(n)) throw new Error(`Calc did not yield a number: "${expr}"`);
  return n;
}

export function renderTemplate(str: string, ctx: ExecutionContext): string {
  return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw: string) => {
    if (raw.startsWith('calc:')) {
      const expr = raw.slice('calc:'.length);
      const [exprPart, ...filterParts] = expr.split('|').map(s => s.trim());
      let value: unknown = evaluateCalc(exprPart, ctx);
      for (const f of filterParts) {
        const fn = filters[f];
        if (fn) value = fn(value);
      }
      return String(value ?? '');
    }

    const [pathPart, ...filterParts] = raw.split('|').map(s => s.trim());
    let value: unknown;
    if (pathPart.startsWith('input:')) {
      value = ctx.inputs[pathPart.slice('input:'.length)];
    } else {
      value = lookupPath(pathPart, ctx);
    }
    for (const f of filterParts) {
      const fn = filters[f];
      if (fn) value = fn(value);
    }
    return value == null ? '' : String(value);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Effect handlers
// ─────────────────────────────────────────────────────────────────────────

type EffectHandler<T extends Effect> = (effect: T, ctx: ExecutionContext) => Mutation[];

function makeId(prefix: string, now: Date): string {
  return `${prefix}-${now.getTime().toString(36)}`;
}

function isoDate(now: Date): string {
  return now.toISOString().split('T')[0];
}

function reduceAccountByCash(account: Account, amount: number): Account {
  const sorted = [...account.holdings].sort((a, b) => b.currentValue - a.currentValue);
  let remaining = amount;
  const newHoldings: Holding[] = [];

  for (const holding of sorted) {
    if (remaining <= 0) {
      newHoldings.push(holding);
      continue;
    }
    const reduction = Math.min(remaining, holding.currentValue);
    const newValue = holding.currentValue - reduction;
    remaining -= reduction;

    if (newValue <= 0) continue;

    const newShares =
      holding.assetClass === 'cash'
        ? newValue
        : holding.shares * (newValue / holding.currentValue);

    newHoldings.push({
      ...holding,
      currentValue: newValue,
      shares: newShares,
    });
  }

  return {
    ...account,
    holdings: newHoldings,
    totalValue: newHoldings.reduce((s, h) => s + h.currentValue, 0),
  };
}

function buildNewCashAccount(
  template: Partial<Account>,
  amount: number,
  now: Date,
  renderCtx: ExecutionContext
): Account {
  const renderedName = template.name
    ? renderTemplate(template.name, renderCtx)
    : 'New Account';
  const renderedInstitution = template.institution
    ? renderTemplate(template.institution, renderCtx)
    : renderedName.split(' ')[0];

  const accountId = makeId(
    renderedName.toLowerCase().replace(/\s+/g, '-').slice(0, 20),
    now
  );

  const holding: Holding = {
    id: makeId(`${accountId}-cash`, now),
    accountId,
    ticker: 'CASH',
    name: renderedName,
    assetClass: 'cash',
    shares: amount,
    avgCostBasis: 1,
    currentPrice: 1,
    currentValue: amount,
    totalGainLoss: 0,
    totalGainLossPercent: 0,
    status: 'active',
    lastUpdated: isoDate(now),
  };

  return {
    id: accountId,
    name: renderedName,
    institution: renderedInstitution,
    type: (template.type as AccountType) ?? 'bank',
    totalValue: amount,
    lastUpdated: isoDate(now),
    holdings: [holding],
    status: 'active',
  };
}

const transferCashHandler: EffectHandler<Extract<Effect, { op: 'transfer-cash' }>> = (
  effect,
  ctx
) => {
  const amount = Number(resolveValue(effect.amount, ctx.inputs));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('transfer-cash: amount must be a positive number');
  }

  const source = resolveAccountRef(effect.from, ctx);
  if (!source) throw new Error('transfer-cash: source account not found');
  if (source.totalValue < amount) {
    throw new Error(
      `transfer-cash: source has ${source.totalValue}, cannot move ${amount}`
    );
  }

  const reducedSource = reduceAccountByCash(source, amount);

  let destination: Account;
  if (effect.to === 'new-account') {
    const template = effect.newAccountTemplate ?? {};
    destination = buildNewCashAccount(template, amount, ctx.now, ctx);
  } else {
    const existing = resolveAccountRef(effect.to, ctx);
    if (!existing) throw new Error('transfer-cash: destination account not found');
    const inbound: Holding = {
      id: makeId(`${existing.id}-in`, ctx.now),
      accountId: existing.id,
      ticker: 'CASH',
      name: `Inbound transfer ${isoDate(ctx.now)}`,
      assetClass: 'cash',
      shares: amount,
      avgCostBasis: 1,
      currentPrice: 1,
      currentValue: amount,
      totalGainLoss: 0,
      totalGainLossPercent: 0,
      status: 'active',
      lastUpdated: isoDate(ctx.now),
    };
    destination = {
      ...existing,
      holdings: [...existing.holdings, inbound],
      totalValue: existing.totalValue + amount,
      lastUpdated: isoDate(ctx.now),
    };
  }

  return [
    { target: 'account', data: reducedSource },
    { target: 'account', data: destination },
  ];
};

// Resolve `input:X` refs and render `{{...}}` templates inside holding field values.
function resolveField(value: unknown, ctx: ExecutionContext): unknown {
  if (isInputRef(value)) {
    return ctx.inputs[(value as string).slice('input:'.length)];
  }
  if (typeof value === 'string') {
    return renderTemplate(value, ctx);
  }
  return value;
}

function resolveHolding(
  partial: Partial<Holding>,
  ctx: ExecutionContext
): Partial<Holding> {
  const out: Partial<Holding> = {};
  if (partial.id !== undefined) out.id = String(resolveField(partial.id, ctx) ?? '');
  if (partial.ticker !== undefined) out.ticker = String(resolveField(partial.ticker, ctx) ?? '').toUpperCase();
  if (partial.name !== undefined) out.name = String(resolveField(partial.name, ctx) ?? '');
  if (partial.assetClass !== undefined) out.assetClass = partial.assetClass;
  if (partial.shares !== undefined) out.shares = Number(resolveField(partial.shares, ctx));
  if (partial.avgCostBasis !== undefined) out.avgCostBasis = Number(resolveField(partial.avgCostBasis, ctx));
  if (partial.currentPrice !== undefined) out.currentPrice = Number(resolveField(partial.currentPrice, ctx));
  if (partial.currentValue !== undefined) out.currentValue = Number(resolveField(partial.currentValue, ctx));
  if (partial.totalGainLoss !== undefined) out.totalGainLoss = Number(resolveField(partial.totalGainLoss, ctx));
  if (partial.totalGainLossPercent !== undefined) out.totalGainLossPercent = Number(resolveField(partial.totalGainLossPercent, ctx));
  if (partial.status !== undefined) out.status = partial.status;
  if (partial.notes !== undefined) out.notes = String(resolveField(partial.notes, ctx) ?? '');
  return out;
}

const addHoldingHandler: EffectHandler<Extract<Effect, { op: 'add-holding' }>> = (
  effect,
  ctx
) => {
  const account = resolveAccountRef(effect.account, ctx);
  if (!account) throw new Error('add-holding: account not found');

  const partial = resolveHolding(effect.holding, ctx);
  const ticker = partial.ticker?.toUpperCase() ?? 'UNKNOWN';
  const value = Number(partial.currentValue ?? 0);
  const price = Number(partial.currentPrice ?? 0);
  const shares = Number(
    partial.shares ?? (price > 0 ? value / price : 0)
  );

  const holding: Holding = {
    id: partial.id ?? makeId(`${account.id}-${ticker.toLowerCase()}`, ctx.now),
    accountId: account.id,
    ticker,
    name: partial.name ?? ticker,
    assetClass: partial.assetClass ?? 'etf',
    shares,
    avgCostBasis: partial.avgCostBasis ?? price,
    currentPrice: price,
    currentValue: value,
    totalGainLoss: partial.totalGainLoss ?? 0,
    totalGainLossPercent: partial.totalGainLossPercent ?? 0,
    status: partial.status ?? 'active',
    notes: partial.notes,
    lastUpdated: isoDate(ctx.now),
  };

  // Merge with existing holding of same ticker, if any.
  const existingIdx = account.holdings.findIndex(h => h.ticker === ticker);
  let holdings: Holding[];
  if (existingIdx >= 0) {
    const existing = account.holdings[existingIdx];
    const mergedValue = existing.currentValue + value;
    const mergedShares = existing.shares + shares;
    holdings = [...account.holdings];
    holdings[existingIdx] = {
      ...existing,
      currentValue: mergedValue,
      shares: mergedShares,
      lastUpdated: isoDate(ctx.now),
    };
  } else {
    holdings = [...account.holdings, holding];
  }

  const updated: Account = {
    ...account,
    holdings,
    totalValue: holdings.reduce((s, h) => s + h.currentValue, 0),
    lastUpdated: isoDate(ctx.now),
  };

  return [{ target: 'account', data: updated }];
};

const removeHoldingsHandler: EffectHandler<Extract<Effect, { op: 'remove-holdings' }>> = (
  effect,
  ctx
) => {
  const account = resolveAccountRef(effect.account, ctx);
  if (!account) throw new Error('remove-holdings: account not found');

  const { filter } = effect;
  // Resolve tickers list — may be a literal array or an InputRef string.
  let tickers: string[] | undefined;
  if (Array.isArray(filter.tickers)) {
    tickers = filter.tickers.map(t => String(t).toUpperCase());
  } else if (isInputRef(filter.tickers as unknown)) {
    const fromInput = ctx.inputs[(filter.tickers as unknown as string).slice(6)];
    if (Array.isArray(fromInput)) {
      tickers = fromInput.map(t => String(t).toUpperCase());
    } else if (typeof fromInput === 'string') {
      tickers = fromInput
        .split(',')
        .map(t => t.trim().toUpperCase())
        .filter(Boolean);
    }
  }

  const newHoldings = account.holdings.filter(h => {
    if (tickers && tickers.includes(h.ticker.toUpperCase())) return false;
    if (filter.assetClasses && filter.assetClasses.includes(h.assetClass)) return false;
    if (filter.statusNot && h.status === filter.statusNot) return false;
    return true;
  });

  if (newHoldings.length === account.holdings.length) {
    // Nothing matched — no mutation needed, but don't error out.
    return [];
  }

  const updated: Account = {
    ...account,
    holdings: newHoldings,
    totalValue: newHoldings.reduce((s, h) => s + h.currentValue, 0),
    lastUpdated: isoDate(ctx.now),
  };

  return [{ target: 'account', data: updated }];
};

const updateBudgetHandler: EffectHandler<Extract<Effect, { op: 'update-budget' }>> = (
  effect,
  ctx
) => {
  // Resolve any input refs inside the patch object.
  const resolvedPatch: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(effect.patch)) {
    resolvedPatch[key] = isInputRef(rawValue)
      ? ctx.inputs[rawValue.slice('input:'.length)]
      : rawValue;
  }

  switch (effect.target) {
    case 'paycheck': {
      // patch is treated as Partial<PaycheckBreakdown>
      return [{ target: 'paycheck', patch: resolvedPatch as Partial<PaycheckBreakdown> }];
    }
    case 'fun-money': {
      // patch.values is expected to be FunMoney[] OR an input array of {person, monthlyBudget}
      const values = resolvedPatch.values;
      if (!Array.isArray(values)) {
        throw new Error('update-budget fun-money: patch.values must be an array');
      }
      const fm: FunMoney[] = values.map(v => ({
        person: String((v as FunMoney).person),
        monthlyBudget: Number((v as FunMoney).monthlyBudget),
        monthlySpent: Number((v as FunMoney).monthlySpent ?? 0),
      }));
      return [{ target: 'fun-money', data: fm }];
    }
    case 'sinking-funds': {
      const values = resolvedPatch.values;
      if (!Array.isArray(values)) {
        throw new Error('update-budget sinking-funds: patch.values must be an array');
      }
      return [{ target: 'sinking-funds', data: values as SinkingFund[] }];
    }
  }
};

const exerciseEquityHandler: EffectHandler<Extract<Effect, { op: 'exercise-equity' }>> = (
  effect,
  ctx
) => {
  const shares = Number(resolveValue(effect.shares, ctx.inputs));
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new Error('exercise-equity: shares must be a positive number');
  }
  if (!ctx.equity) {
    throw new Error('exercise-equity: no equity profile in context');
  }

  const grant = ctx.equity.grants.find(g => {
    if (effect.grantFilter.grantType && g.type !== effect.grantFilter.grantType) return false;
    if (effect.grantFilter.hasExercisable && g.exercisableShares <= 0) return false;
    return true;
  });
  if (!grant) throw new Error('exercise-equity: no matching grant found');

  const toExercise = Math.min(shares, grant.exercisableShares);
  const updatedGrant = {
    ...grant,
    exercisedShares: grant.exercisedShares + toExercise,
    exercisableShares: grant.exercisableShares - toExercise,
    outstandingShares: grant.outstandingShares - toExercise,
  };

  const updatedGrants = ctx.equity.grants.map(g =>
    g.id === grant.id ? updatedGrant : g
  );
  const totalExerciseCost = updatedGrants.reduce(
    (s, g) => s + g.exercisableShares * g.strikePrice,
    0
  );

  const updatedEquity: EquityProfile = {
    ...ctx.equity,
    grants: updatedGrants,
    totalExerciseCost,
  };

  return [{ target: 'equity', data: updatedEquity }];
};

const effectHandlers: Partial<{
  [K in Effect['op']]: EffectHandler<Extract<Effect, { op: K }>>;
}> = {
  'transfer-cash': transferCashHandler,
  'add-holding': addHoldingHandler,
  'remove-holdings': removeHoldingsHandler,
  'update-budget': updateBudgetHandler,
  'exercise-equity': exerciseEquityHandler,
};

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

export function executeActionTemplate(
  template: ActionTemplate,
  ctx: ExecutionContext
): ExecutionOutput {
  try {
    const allMutations: Mutation[] = [];
    const workingCtx: ExecutionContext = { ...ctx, accounts: [...ctx.accounts] };

    for (const effect of template.effects) {
      const handler = effectHandlers[effect.op] as
        | EffectHandler<typeof effect>
        | undefined;
      if (!handler) {
        return {
          result: {
            success: false,
            message: `Effect not yet implemented: ${effect.op}`,
          },
          mutations: [],
        };
      }
      const mutations = handler(effect, workingCtx);
      allMutations.push(...mutations);

      // Feed account mutations back into workingCtx so later effects see them.
      for (const m of mutations) {
        if (m.target === 'account') {
          const idx = workingCtx.accounts.findIndex(a => a.id === m.data.id);
          if (idx >= 0) workingCtx.accounts[idx] = m.data;
          else workingCtx.accounts.push(m.data);
        } else if (m.target === 'equity') {
          workingCtx.equity = m.data;
        }
      }
    }

    // Render text fields in any follow-up action items so they don't leak raw {{...}}.
    const renderedNewActions = (template.newActionsOnSuccess ?? []).map(a => ({
      ...a,
      text: a.text ? renderTemplate(a.text, workingCtx) : a.text,
      detail: a.detail ? renderTemplate(a.detail, workingCtx) : a.detail,
    }));

    return {
      result: {
        success: true,
        message: renderTemplate(template.successTemplate, workingCtx),
        newActionItems: renderedNewActions.length > 0 ? renderedNewActions : undefined,
      },
      mutations: allMutations,
    };
  } catch (err) {
    return {
      result: {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      },
      mutations: [],
    };
  }
}
