import { useEffect, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { fetchNewsForTickers } from '../../services/newsApi';
import { fetchPricesForTickers } from '../../services/marketDataApi';
import { listActiveWatchlist } from '../../stores/watchlistStore';
import { generateXrayReport } from '../../utils/etfXray';
import { generateIntelligenceReport } from '../../utils/portfolioIntelligence';
import { synthesizeDigest, type SynthesisDigest, type DigestEntry, type DigestTone } from '../../utils/synthesisDigest';
import type { View } from '../../types/views';

/**
 * Synthesis Digest — the "one thing to read today" card.
 *
 * Philosophy: NudgeCenter stacks individual alerts. This renders a single
 * briefing — portfolio pulse + top news + focus action + concentration
 * callout, all in one scannable card. Intended as a 30-second read.
 *
 * Data wiring: pulls snapshots/holdings from AppDataContext, fetches fresh
 * news + watchlist prices, and runs the pure `synthesizeDigest` against the
 * combined inputs. All engines (etfXray, portfolioIntelligence, newsScanner,
 * watchlistAlerts) are reused — no new analysis lives in this component.
 */

function toneClasses(tone: DigestTone): { border: string; bg: string; badge: string; dot: string } {
  switch (tone) {
    case 'positive':
      return {
        border: 'border-positive/30',
        bg: 'from-positive/10 via-positive/[0.03] to-transparent',
        badge: 'bg-positive/20 text-positive',
        dot: 'bg-positive',
      };
    case 'negative':
      return {
        border: 'border-negative/40',
        bg: 'from-negative/10 via-negative/[0.03] to-transparent',
        badge: 'bg-negative/20 text-negative',
        dot: 'bg-negative',
      };
    case 'warning':
      return {
        border: 'border-warning/30',
        bg: 'from-warning/10 via-warning/[0.03] to-transparent',
        badge: 'bg-warning/20 text-warning',
        dot: 'bg-warning',
      };
    case 'info':
      return {
        border: 'border-accent/25',
        bg: 'from-accent/10 via-accent/[0.03] to-transparent',
        badge: 'bg-accent/15 text-accent-light',
        dot: 'bg-accent',
      };
    case 'neutral':
    default:
      return {
        border: 'border-glass-border',
        bg: 'from-white/[0.04] via-white/[0.01] to-transparent',
        badge: 'bg-white/10 text-text-secondary',
        dot: 'bg-text-muted',
      };
  }
}

export default function SynthesisDigestCard() {
  const { accounts, netWorthSnapshots, actionItems, setView, equity, profile, monthlyInv } = useAppData();
  const [digest, setDigest] = useState<SynthesisDigest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Gather every input the synthesizer needs. Failures on any single
        // fetch degrade gracefully — we pass empty arrays and let the
        // synthesizer produce whatever sections it can.
        const watchlist = await listActiveWatchlist().catch(() => []);
        const holdingTickers = new Set<string>();
        for (const acc of accounts) for (const h of acc.holdings) holdingTickers.add(h.ticker.toUpperCase());
        const watchTickers = watchlist.map(e => e.ticker.toUpperCase());
        const tickers = Array.from(new Set([...holdingTickers, ...watchTickers]));

        const [newsItems, watchlistPrices] = await Promise.all([
          tickers.length > 0
            ? fetchNewsForTickers(tickers, { maxItemsPerTicker: 4 }).catch(() => [])
            : Promise.resolve([]),
          watchTickers.length > 0
            ? fetchPricesForTickers(watchTickers).catch(() => [])
            : Promise.resolve([]),
        ]);

        const priceMap = new Map<string, number>();
        for (const p of watchlistPrices) priceMap.set(p.ticker.toUpperCase(), p.price);
        for (const acc of accounts) {
          for (const h of acc.holdings) {
            const up = h.ticker.toUpperCase();
            if (!priceMap.has(up) && Number.isFinite(h.currentPrice)) priceMap.set(up, h.currentPrice);
          }
        }

        const xrayReport = (() => {
          try { return generateXrayReport(accounts); } catch { return null; }
        })();
        const intelReport = (() => {
          try { return generateIntelligenceReport(accounts, equity, profile, monthlyInv); } catch { return null; }
        })();

        const result = synthesizeDigest({
          accounts,
          watchlist,
          snapshots: netWorthSnapshots,
          newsItems,
          actionItems,
          xrayReport,
          intelReport,
          priceLookup: (t) => priceMap.get(t.toUpperCase()) ?? null,
          now: new Date(),
        });
        setDigest(result);
      } catch (err) {
        console.warn('[SynthesisDigest] failed to compose digest', err);
        setDigest(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [accounts, netWorthSnapshots, actionItems]);

  if (loading && !digest) {
    return (
      <div className="glass-card p-5 animate-pulse">
        <div className="h-4 w-40 bg-white/10 rounded mb-3" />
        <div className="h-3 w-72 bg-white/10 rounded" />
      </div>
    );
  }

  if (!digest) return null;

  const overall = toneClasses(digest.tone);

  return (
    <div
      className={`rounded-2xl border ${overall.border} bg-gradient-to-br ${overall.bg} backdrop-blur-sm relative overflow-hidden`}
    >
      {/* Header band */}
      <div className="px-5 pt-5 pb-3 border-b border-glass-border/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs uppercase tracking-[0.2em] text-text-muted font-bold">
              Your Iris digest
            </span>
            <span className={`w-1.5 h-1.5 rounded-full ${overall.dot} shrink-0`} />
            <span className="text-xs text-text-secondary truncate">{digest.dayLabel}</span>
          </div>
          <span className="text-[10px] text-text-muted">
            {new Date(digest.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-base md:text-lg font-semibold text-text-primary mt-2 leading-snug">
          {digest.headline}
        </p>
      </div>

      {/* Entries */}
      <ul className="divide-y divide-glass-border/40">
        {digest.entries.map((entry) => (
          <DigestRow key={entry.id} entry={entry} setView={setView} />
        ))}
      </ul>
    </div>
  );
}

function DigestRow({ entry, setView }: { entry: DigestEntry; setView: (v: View) => void }) {
  const classes = toneClasses(entry.tone);
  const handleCta = () => {
    if (!entry.cta) return;
    if (entry.cta.href) {
      window.open(entry.cta.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (entry.cta.view) setView(entry.cta.view as View);
  };
  return (
    <li className="px-5 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${classes.badge}`}
      >
        {entry.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary">{entry.heading}</div>
        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{entry.body}</p>
        {entry.cta && (
          <button
            onClick={handleCta}
            className="mt-1.5 text-[11px] font-medium text-accent hover:text-accent-light transition-colors"
          >
            {entry.cta.label} →
          </button>
        )}
      </div>
    </li>
  );
}
