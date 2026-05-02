import { useEffect, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { getSetting, saveSetting } from '../../stores/portfolioStore';
import {
  generateNudges,
  isNudgeActive,
  dismissSettingKey,
  type Nudge,
  type DismissState,
} from '../../utils/nudgeEngine';
import { listActiveWatchlist, listWatchlist, recordPriceObservation } from '../../stores/watchlistStore';
import { evaluateWatchlist } from '../../utils/watchlistAlerts';
import { fetchPricesForTickers } from '../../services/marketDataApi';
import { fetchNewsForTickers } from '../../services/newsApi';
import { scanNews } from '../../utils/newsScanner';
import NudgeCard from '../Nudge/NudgeCard';

const MAX_VISIBLE = 4;

export default function NudgeCenter() {
  const { accounts, netWorthSnapshots, actionItems, setView } = useAppData();
  const [active, setActive] = useState<Nudge[] | null>(null);

  useEffect(() => {
    (async () => {
      const prevVisitAt = (await getSetting('prev_visit_at')) ?? null;
      const now = new Date();
      const baseCandidates = generateNudges({
        accounts,
        snapshots: netWorthSnapshots,
        actionItems,
        prevVisitAt,
        now,
      });

      // Watchlist alerts — surface hit anchors at the top of the stream so they
      // never get buried behind cadence/milestone nudges. Fetch prices for
      // active watchlist tickers + fall back to portfolio-held currentPrice.
      const watchlistCandidates: Nudge[] = [];
      try {
        const entries = await listActiveWatchlist();
        if (entries.length > 0) {
          const tickers = Array.from(new Set(entries.map((e) => e.ticker)));
          const prices = await fetchPricesForTickers(tickers);
          const priceMap = new Map<string, number>();
          for (const p of prices) priceMap.set(p.ticker.toUpperCase(), p.price);
          // Fall back to the portfolio-held price for tickers the API couldn't find.
          for (const account of accounts) {
            for (const h of account.holdings) {
              const up = h.ticker.toUpperCase();
              if (!priceMap.has(up) && Number.isFinite(h.currentPrice)) priceMap.set(up, h.currentPrice);
            }
          }
          const alerts = evaluateWatchlist(entries, (t) => priceMap.get(t.toUpperCase()) ?? null);
          for (const a of alerts) {
            watchlistCandidates.push(a.nudge);
            const px = priceMap.get(a.entry.ticker.toUpperCase());
            if (px != null) await recordPriceObservation(a.entry.id, px);
          }
        }
      } catch (err) {
        console.warn('[NudgeCenter] watchlist alert evaluation failed', err);
      }

      // Holy-shit News Scanner — tier-1 coverage on user-held/watched tickers,
      // classified by material-event keywords, deduped against already-fired ids.
      const newsCandidates: Nudge[] = [];
      try {
        const allWatch = await listWatchlist();
        const holdingTickers = new Set<string>();
        for (const acc of accounts) {
          for (const h of acc.holdings) holdingTickers.add(h.ticker.toUpperCase());
        }
        const watchTickers = allWatch.filter(e => e.status === 'active').map(e => e.ticker.toUpperCase());
        const tickers = Array.from(new Set([...holdingTickers, ...watchTickers]));

        if (tickers.length > 0) {
          const items = await fetchNewsForTickers(tickers, { maxItemsPerTicker: 6 });
          // Dedup is handled by the canonical dismiss system — no separate
          // fired-ids store. If the user snoozes/dismisses the nudge, the
          // dismiss key suppresses it; otherwise the story keeps showing
          // until it ages out of the 72h window.
          const scan = scanNews({
            accounts,
            watchlist: allWatch,
            newsItems: items,
            firedIds: new Set(),
            windowHours: 72,
            maxAlerts: 3,
            includeInfo: false,
          });

          for (const n of scan.nudges) newsCandidates.push(n);
        }
      } catch (err) {
        console.warn('[NudgeCenter] news scan failed', err);
      }

      // Priority order: watchlist hits → holy-shit news → base candidates.
      // Rationale: watchlist hits are the user's own prior decisions finally
      // firing (highest signal); news is exogenous but material; cadence/
      // milestone nudges round out the stream.
      const candidates: Nudge[] = [...watchlistCandidates, ...newsCandidates, ...baseCandidates];

      const kept: Nudge[] = [];
      for (const n of candidates) {
        const raw = await getSetting(dismissSettingKey(n.id));
        let dismiss: DismissState | null = null;
        if (raw) {
          try { dismiss = JSON.parse(raw) as DismissState; } catch { dismiss = null; }
        }
        if (isNudgeActive(n, dismiss, now)) kept.push(n);
      }
      setActive(kept.slice(0, MAX_VISIBLE));
    })();
  }, [accounts, netWorthSnapshots, actionItems]);

  if (!active || active.length === 0) return null;

  const snooze = async (nudge: Nudge) => {
    const record: DismissState = {
      id: nudge.id,
      dismissedAt: new Date().toISOString(),
      permanent: false,
      title: nudge.title,
      snoozeDays: nudge.snoozeDays ?? 3,
    };
    await saveSetting(dismissSettingKey(nudge.id), JSON.stringify(record));
    setActive(prev => (prev ?? []).filter(n => n.id !== nudge.id));
  };

  const dismissForever = async (nudge: Nudge) => {
    const record: DismissState = {
      id: nudge.id,
      dismissedAt: new Date().toISOString(),
      permanent: true,
      title: nudge.title,
      snoozeDays: nudge.snoozeDays ?? 3,
    };
    await saveSetting(dismissSettingKey(nudge.id), JSON.stringify(record));
    setActive(prev => (prev ?? []).filter(n => n.id !== nudge.id));
  };

  return (
    <div className="space-y-3">
      {active.map((n, i) => (
        <NudgeCard
          key={n.id}
          nudge={n}
          index={i}
          onPrimary={() => {
            if (n.primary?.href) {
              window.open(n.primary.href, '_blank', 'noopener,noreferrer');
            } else if (n.primary?.view) {
              setView(n.primary.view);
            }
            // Primary tap counts as "seen" — snooze it so the same card doesn't re-greet.
            snooze(n);
          }}
          onSnooze={() => snooze(n)}
          onDismissForever={() => dismissForever(n)}
        />
      ))}
    </div>
  );
}

// Visual/layout moved to components/Nudge/NudgeCard.tsx — canonical nudge surface.
