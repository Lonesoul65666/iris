import { useEffect, useState } from 'react';
import { useAppData, formatCurrency, clearChatHistory, clearAllAccounts, clearAllPortfolioData, clearAllBudgetData, clearAllActionData, clearAllExpenses, clearExpensesBySource, saveUserProfile, saveMonthlyInvestment, saveSetting, saveAccount } from '../context/AppDataContext';
import { Icons } from '../components/ui/Icons';
import DataBackup from '../components/Settings/DataBackup';
import ConnectorsPanel from '../components/Settings/ConnectorsPanel';
import NudgeManagementPanel from '../components/Settings/NudgeManagementPanel';
import LLMBudgetPanel from '../components/Settings/LLMBudgetPanel';
import HouseholdEarners from '../components/Settings/HouseholdEarners';
import AccountOwners from '../components/Settings/AccountOwners';
import PaycheckPanel from '../components/Settings/PaycheckPanel';
import NotificationSettings from '../components/Settings/NotificationSettings';
import SampleDataPanel from '../components/Settings/SampleDataPanel';
import UserManagementPanel from '../components/Settings/UserManagementPanel';
import { ChangePasswordForm } from '../components/Auth/AuthScreens';
import type { UserProfile } from '../types/portfolio';
import { getSetting } from '../stores/portfolioStore';
import { APP_VERSION } from '../updates';
import { setupLLMRouter, listInstalledOllamaModels } from '../services/llm';
import type { LLMRoutingPreference } from '../types/llm';

export default function SettingsView() {
  const {
    apiKey, apiKeyInput, setApiKeyInput, saveApiKey,
    priceRefreshing, lastPriceRefresh, handleRefreshPrices,
    profile, setProfile, monthlyInv, setMonthlyInv,
    setChatMessages, llmReady, refreshLlmReady, setView,
    accounts, setAccounts,
    soundEnabled, setSoundEnabled,
  } = useAppData();

  const [claudeKey, setClaudeKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [ollamaModel, setOllamaModel] = useState('gemma4:e4b');
  const [ollamaInstalled, setOllamaInstalled] = useState<string[] | null>(null);
  const [llmPref, setLlmPref] = useState<LLMRoutingPreference>('cloud-preferred');
  const [preferredProvider, setPreferredProvider] = useState<'auto' | 'gemini' | 'claude' | 'openai' | 'ollama'>('auto');
  const [llmSavedMsg, setLlmSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [ck, ok, om, pref, preferred, installed] = await Promise.all([
        getSetting('claude_api_key'),
        getSetting('openai_api_key'),
        getSetting('ollama_model'),
        getSetting('llm_preference'),
        getSetting('preferred_provider'),
        listInstalledOllamaModels(),
      ]);
      if (ck) setClaudeKey(ck);
      if (ok) setOpenaiKey(ok);
      if (om) setOllamaModel(om);
      if (pref === 'auto' || pref === 'cloud-preferred' || pref === 'local-only') setLlmPref(pref);
      if (preferred === 'auto' || preferred === 'gemini' || preferred === 'claude' || preferred === 'openai' || preferred === 'ollama') {
        setPreferredProvider(preferred);
      }
      setOllamaInstalled(installed);
    })();
  }, []);

  const saveLLMSettings = async () => {
    await Promise.all([
      saveSetting('claude_api_key', claudeKey),
      saveSetting('openai_api_key', openaiKey),
      saveSetting('ollama_model', ollamaModel),
      saveSetting('llm_preference', llmPref),
      saveSetting('preferred_provider', preferredProvider),
    ]);
    await setupLLMRouter({ preference: llmPref, ollamaModel });
    await refreshLlmReady();
    setLlmSavedMsg('Saved. Router refreshed.');
    setTimeout(() => setLlmSavedMsg(null), 2500);
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="term-label mb-1">Configuration</div>
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <p className="text-text-secondary text-sm mt-1">Configure Iris</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={async () => {
              await saveSetting('first_report_complete', '');
              setView('first-report');
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass-border text-xs text-text-secondary hover:text-accent transition-colors whitespace-nowrap"
            title="Re-run the guided walkthrough of your portfolio"
          >
            📋 Re-run first report
          </button>
          <button
            onClick={async () => {
              await saveSetting('onboarding_complete', '');
              setView('onboarding');
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass-border text-xs text-text-secondary hover:text-accent transition-colors whitespace-nowrap"
            title="Walk through the setup wizard again"
          >
            🧭 Replay setup wizard
          </button>
        </div>
      </div>

      <UpdatePanel />

      <SecurityPanel />

      {/* Preferences — small app-wide toggles. Sound is Iris's first (celebration
          chime on milestone unlocks / trophy replays). */}
      <div className="glass-card p-6">
        <h3 className="font-semibold text-text-primary mb-2">Preferences</h3>
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm text-text-primary font-medium">Celebration sound</div>
            <div className="text-xs text-text-muted">A short chime when you unlock a milestone or replay a trophy.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              soundEnabled ? 'bg-accent' : 'bg-white/15'
            }`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              soundEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </label>
      </div>

      {/* Getting Started */}
      {!llmReady && (
        <div className="glass-card p-6 border border-accent/30">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🚀</div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-1">Getting started</h3>
              <p className="text-xs text-text-secondary mb-3">
                Iris needs at least one AI provider to answer questions about your portfolio. Pick whichever fits — you can always swap later.
              </p>
              <ul className="text-xs text-text-secondary space-y-1.5 mb-3">
                <li><span className="text-accent-light font-medium">Gemini</span> — free tier, web-grounded answers. Best default for market questions. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent hover:underline">Get a key</a></li>
                <li><span className="text-accent-light font-medium">Claude</span> — strong reasoning. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">Get a key</a></li>
                <li><span className="text-accent-light font-medium">OpenAI</span> — pay-as-you-go. <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">Get a key</a></li>
                <li><span className="text-accent-light font-medium">Ollama</span> — fully local, no key needed. Set preference to <em>local-only</em>.</li>
              </ul>
              <p className="text-xs text-text-muted">Keys are stored in your own private database. Nothing leaves it except calls to the provider you chose.</p>
            </div>
          </div>
        </div>
      )}

      {/* API Key */}
      <div className="glass-card p-6">
        <h3 className="font-semibold text-text-primary mb-2">Gemini API Key</h3>
        <p className="text-xs text-text-muted mb-4">
          Get a free API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent hover:underline">Google AI Studio</a>.
          Your key is stored locally and never sent anywhere except Google's API.
          <span className="text-positive"> · Generous free tier — most personal use stays within it.</span>
        </p>
        <div className="flex gap-2">
          <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
            placeholder="Enter your Gemini API key"
            className="flex-1 bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50" />
          <button onClick={saveApiKey}
            className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors">
            {apiKey ? 'Update' : 'Save'}
          </button>
        </div>
        {apiKey && <p className="mt-2 flex items-center gap-1"><span className="cyber-chip text-positive">{Icons.check} Connected</span></p>}
      </div>

      {/* LLM Providers — pick your weapon */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-text-primary mb-1">LLM Providers</h3>
          <p className="text-xs text-text-muted">
            Add keys for any provider you want. The router falls back automatically when one fails.
            Gemini stays the default for portfolio chat (Google Search grounding).
          </p>
          <p className="text-[10px] text-text-muted mt-2 p-2 rounded bg-white/[0.03] border border-glass-border leading-relaxed">
            💡 <span className="text-text-secondary font-medium">Your data stays yours.</span> All Iris data
            (accounts, holdings, chats) lives in your own private database and never leaves it
            except when you query an LLM provider. Iris never proxies your calls — each provider charges
            your key directly. Each provider has its own data-retention policy, so review their links
            before saving. <span className="text-positive">For absolute privacy, use Ollama (below) — runs
            entirely on your machine, nothing leaves your device.</span>
          </p>
        </div>

        <div>
          <label className="term-label mb-1 block">Anthropic Claude API Key</label>
          <input
            type="password"
            value={claudeKey}
            onChange={e => setClaudeKey(e.target.value)}
            placeholder="sk-ant-…"
            className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
          />
          <p className="text-[10px] text-text-muted mt-1">
            Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">console.anthropic.com</a>
            · <span className="text-warning">Paid API — no free tier, pay-per-token</span>
          </p>
        </div>

        <div>
          <label className="term-label mb-1 block">OpenAI API Key</label>
          <input
            type="password"
            value={openaiKey}
            onChange={e => setOpenaiKey(e.target.value)}
            placeholder="sk-…"
            className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
          />
          <p className="text-[10px] text-text-muted mt-1">
            Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">platform.openai.com</a>
            · <span className="text-warning">Paid API — trial credits then pay-per-token</span>
          </p>
        </div>

        <div>
          <label className="term-label mb-1 block">
            Ollama (local) model
            {ollamaInstalled !== null && ollamaInstalled.length > 0 && (
              <span className="cyber-chip ml-2 text-positive">Connected</span>
            )}
            {ollamaInstalled !== null && ollamaInstalled.length === 0 && (
              <span className="cyber-chip ml-2">Offline</span>
            )}
          </label>
          {ollamaInstalled && ollamaInstalled.length > 0 ? (
            <select
              value={ollamaModel}
              onChange={e => setOllamaModel(e.target.value)}
              className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
            >
              {!ollamaInstalled.includes(ollamaModel) && (
                <option value={ollamaModel}>{ollamaModel} (not installed)</option>
              )}
              {ollamaInstalled.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={ollamaModel}
              onChange={e => setOllamaModel(e.target.value)}
              placeholder="gemma4:e4b"
              className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
            />
          )}
          <p className="text-[10px] text-text-muted mt-1">
            {ollamaInstalled && ollamaInstalled.length > 0
              ? <>Pick any model you've installed. Pull more with <code className="text-accent">ollama pull &lt;name&gt;</code>. See <a href="https://ollama.com/library" target="_blank" rel="noreferrer" className="text-accent hover:underline">ollama.com/library</a>.</>
              : <>Install Ollama at <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-accent hover:underline">ollama.com</a>, then <code className="text-accent">ollama pull {ollamaModel}</code>. Local is the offline fallback — router prefers cloud by default.</>
            }
          </p>
        </div>

        <div>
          <label className="term-label mb-1 block">Preferred provider</label>
          <select
            value={preferredProvider}
            onChange={e => setPreferredProvider(e.target.value as typeof preferredProvider)}
            className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
          >
            <option value="auto">Auto — Gemini default for chat (keeps Google Search grounding)</option>
            <option value="gemini">Gemini (Google Search grounded)</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama (local)</option>
          </select>
          <p className="text-[10px] text-text-muted mt-1">
            Picks which provider answers your Ask Iris questions. If the chosen provider is unavailable, the router falls back using the order below.
          </p>
        </div>

        <div>
          <label className="term-label mb-1 block">Fallback order (when preferred is unavailable)</label>
          <select
            value={llmPref}
            onChange={e => setLlmPref(e.target.value as LLMRoutingPreference)}
            className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
          >
            <option value="cloud-preferred">Cloud preferred (Gemini → Claude → OpenAI → Ollama)</option>
            <option value="auto">Auto (light tasks local, heavy tasks cloud)</option>
            <option value="local-only">Local only (Ollama)</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveLLMSettings}
            className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors"
          >
            Save LLM Settings
          </button>
          {llmSavedMsg && <span className="text-xs text-positive">{llmSavedMsg}</span>}
        </div>
      </div>

      {/* LLM Daily Budget — cap + live usage */}
      <LLMBudgetPanel />

      {/* Price Refresh */}
      <div className="glass-card p-6">
        <h3 className="font-semibold text-text-primary mb-2">Live Price Refresh</h3>
        <p className="text-xs text-text-muted mb-4">
          Stocks & ETFs via Yahoo Finance, crypto via CoinGecko — both free, no keys needed.
          Hit "Refresh Prices" on the Invest page to pull the latest.
        </p>
        <div className="flex items-center gap-4">
          <button onClick={handleRefreshPrices} disabled={priceRefreshing}
            className="px-4 py-2 bg-accent hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2">
            {priceRefreshing ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            )}
            {priceRefreshing ? 'Refreshing Prices...' : 'Refresh All Prices'}
          </button>
          {lastPriceRefresh && (
            <span className="text-xs text-text-muted">
              Last refreshed: {new Date(lastPriceRefresh).toLocaleDateString()} at {new Date(lastPriceRefresh).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* User Profile — Editable */}
      {profile && (
        <div className="glass-card p-6">
          <h3 className="font-semibold text-text-primary mb-4">Your Profile</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {([
              { label: 'Name', key: 'name', type: 'text' },
              { label: 'Age', key: 'age', type: 'number' },
              { label: 'Spouse Name', key: 'spouseName', type: 'text' },
              { label: 'Spouse Age', key: 'spouseAge', type: 'number' },
              { label: 'Annual Income', key: 'annualIncome', type: 'dollar' },
              { label: 'Tax Bracket (%)', key: 'taxBracket', type: 'number' },
              { label: 'State', key: 'state', type: 'text' },
              { label: 'Retirement Age', key: 'retirementAge', type: 'number' },
              { label: 'Monthly Investment', key: 'monthlyInvestment', type: 'dollar' },
            ] as const).map((field) => (
              <div key={field.key}>
                <label className="term-label block mb-1">{field.label}</label>
                <input
                  type={field.type === 'dollar' ? 'number' : field.type}
                  step={field.type === 'dollar' ? '0.01' : undefined}
                  value={(profile as any)[field.key] ?? ''}
                  onChange={async (e) => {
                    const val = field.type === 'dollar'
                      ? (parseFloat(e.target.value) || 0)
                      : field.type === 'number'
                        ? (parseInt(e.target.value, 10) || 0)
                        : e.target.value;
                    const updated = { ...profile, [field.key]: val };
                    setProfile(updated);
                    await saveUserProfile(updated);
                    // Keep the Monthly Auto-Investment store in sync with profile.monthlyInvestment.
                    // Same number lives in two places historically — write both so editing
                    // either field doesn't strand a stale value in the other.
                    if (field.key === 'monthlyInvestment' && monthlyInv) {
                      const synced = { ...monthlyInv, amount: val as number, lastUpdated: new Date().toISOString().split('T')[0] };
                      setMonthlyInv(synced);
                      await saveMonthlyInvestment(synced);
                    }
                  }}
                  className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
                />
              </div>
            ))}
            <div>
              <label className="term-label block mb-1">Risk Tolerance</label>
              <select
                value={profile.riskTolerance}
                onChange={async (e) => {
                  const updated = { ...profile, riskTolerance: e.target.value as UserProfile['riskTolerance'] };
                  setProfile(updated);
                  await saveUserProfile(updated);
                }}
                className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
                <option value="very_aggressive">Very Aggressive</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Users + PIN management (add/remove users at any time) */}
      <UserManagementPanel />

      {/* Household earners — multi-earner cold-start profile (5 questions per earner) */}
      <HouseholdEarners />

      {/* Account owners — attribution defaults for the couples model */}
      <AccountOwners />

      {/* Paycheck & watermark — net take-home, gross, 401k/HSA + re-derive */}
      <PaycheckPanel />

      {/* Notification tier preferences */}
      <NotificationSettings />

      {/* Sample data — load/clear bundled dataset */}
      <SampleDataPanel onDataChanged={() => window.location.reload()} />

      {/* Real Assets — Home, Mortgage, Cars */}
      {profile && (
        <div className="glass-card p-6">
          <h3 className="font-semibold text-text-primary mb-2">Real Assets</h3>
          <p className="text-xs text-text-muted mb-4">Non-liquid assets used to calculate net worth</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {([
              { label: 'Home Value', key: 'homeValue' as const },
              { label: 'Mortgage Balance', key: 'mortgageBalance' as const },
              { label: 'Total Car Value', key: 'carValue' as const },
            ]).map((field) => (
              <div key={field.key}>
                <label className="term-label block mb-1">{field.label}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={profile[field.key] ?? 0}
                    onChange={async (e) => {
                      const updated = { ...profile, [field.key]: parseFloat(e.target.value) || 0 };
                      setProfile(updated);
                      await saveUserProfile(updated);
                    }}
                    className="w-full bg-surface-2 border border-glass-border rounded-lg pl-7 pr-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-white/[0.03] border border-glass-border">
            <div className="flex justify-between text-xs">
              <span className="term-label">Home Equity</span>
              <span className="text-text-primary font-medium mono-num">{formatCurrency((profile.homeValue ?? 0) - (profile.mortgageBalance ?? 0))}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="term-label">Total Real Assets</span>
              <span className="text-text-primary font-medium mono-num">{formatCurrency((profile.homeValue ?? 0) - (profile.mortgageBalance ?? 0) + (profile.carValue ?? 0))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Auto-Investment — Editable */}
      {monthlyInv && (
        <div className="glass-card p-6">
          <h3 className="font-semibold text-text-primary mb-2">Monthly Auto-Investment</h3>
          <div className="flex items-center gap-2 mb-4">
            <span className="term-label">Amount</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
              <input type="number" step="0.01" value={monthlyInv.amount}
                onChange={async (e) => {
                  const amt = parseFloat(e.target.value) || 0;
                  const updated = { ...monthlyInv, amount: amt, lastUpdated: new Date().toISOString().split('T')[0] };
                  setMonthlyInv(updated);
                  await saveMonthlyInvestment(updated);
                  // Mirror the value into profile.monthlyInvestment so the Profile
                  // field above and downstream calculators see the same number.
                  if (profile && profile.monthlyInvestment !== amt) {
                    const updatedProfile = { ...profile, monthlyInvestment: amt };
                    setProfile(updatedProfile);
                    await saveUserProfile(updatedProfile);
                  }
                }}
                className="w-32 bg-surface-2 border border-glass-border rounded-lg pl-7 pr-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
              />
            </div>
            <span className="text-xs text-text-muted">/month</span>
          </div>
          <div className="space-y-2">
            {monthlyInv.allocations.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02]">
                <span className="text-sm text-text-primary font-mono w-16">{a.ticker}</span>
                <span className="text-sm text-text-secondary flex-1">{a.name}</span>
                <input type="number" value={a.percentage} min={0} max={100}
                  onChange={async (e) => {
                    const allocs = [...monthlyInv.allocations];
                    allocs[i] = { ...allocs[i], percentage: Number(e.target.value) };
                    const updated = { ...monthlyInv, allocations: allocs, lastUpdated: new Date().toISOString().split('T')[0] };
                    setMonthlyInv(updated);
                    await saveMonthlyInvestment(updated);
                  }}
                  className="w-16 bg-surface-2 border border-glass-border rounded-lg px-2 py-1 text-sm text-accent font-medium text-right outline-none focus:border-accent/50"
                />
                <span className="text-xs text-text-muted">%</span>
              </div>
            ))}
          </div>
          {monthlyInv.allocations.reduce((s, a) => s + a.percentage, 0) !== 100 && (
            <p className="text-xs text-warning mt-2 flex items-center gap-1">{Icons.alert} Allocations should total 100% (currently {monthlyInv.allocations.reduce((s, a) => s + a.percentage, 0)}%)</p>
          )}
          <p className="text-xs text-warning mt-3 flex items-center gap-1">{Icons.alert} Iris recommends diversifying beyond SOXQ + XLK. Use "Ask Iris" for personalized allocation suggestions.</p>
        </div>
      )}

      <ConvictionHoldsPanel accounts={accounts} setAccounts={setAccounts} />

      <NudgeManagementPanel />

      {/* Data Management */}
      <div className="glass-card p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-text-primary mb-1">Data Management</h3>
          <p className="text-xs text-text-muted">All data is stored in your own private database that only you control. Nothing leaves it except Gemini API queries.</p>
        </div>

        {/* Transactions / Expenses */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-glass-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Imported Transactions</div>
              <div className="text-xs text-text-muted">Credit card and bank statement data</div>
            </div>
            <button onClick={async () => {
              if (!confirm('Clear ALL imported transactions? This cannot be undone.')) return;
              const count = await clearAllExpenses();
              alert(`Cleared ${count} transactions.`);
              window.location.reload();
            }} className="px-3 py-1.5 bg-negative/10 hover:bg-negative/20 text-negative rounded-lg text-xs font-medium transition-colors">
              Clear All Transactions
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {['bofa_checking', 'bofa_savings', 'bofa_joint', 'credit_card_1', 'credit_card_2', 'credit_card_3'].map(src => (
              <button key={src} onClick={async () => {
                const labels: Record<string, string> = { bofa_checking: 'BofA Checking', bofa_savings: 'BofA Savings', bofa_joint: 'BofA Joint', credit_card_1: 'Citi Card', credit_card_2: 'Capital One', credit_card_3: 'Card 3' };
                if (!confirm(`Clear all ${labels[src] || src} transactions?`)) return;
                const count = await clearExpensesBySource(src);
                alert(`Cleared ${count} transactions from ${labels[src] || src}.`);
                window.location.reload();
              }} className="px-2.5 py-1 bg-surface-3 hover:bg-surface-4 rounded text-[10px] text-text-muted transition-colors">
                Clear {({ bofa_checking: 'BofA Checking', bofa_savings: 'BofA Savings', bofa_joint: 'BofA Joint', credit_card_1: 'Citi Card', credit_card_2: 'Capital One', credit_card_3: 'Card 3' } as Record<string, string>)[src]}
              </button>
            ))}
          </div>
        </div>

        {/* Portfolio */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-glass-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Portfolio Data</div>
              <div className="text-xs text-text-muted">Accounts, holdings, equity grants — resets to defaults on reload</div>
            </div>
            <button onClick={async () => {
              if (!confirm('Reset all portfolio data to defaults? Your edits will be lost.')) return;
              await clearAllAccounts();
              alert('Portfolio reset. Reload to see defaults.');
              window.location.reload();
            }} className="px-3 py-1.5 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-secondary transition-colors">
              Reset to Defaults
            </button>
          </div>
        </div>

        {/* Budget */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-glass-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Budget Settings</div>
              <div className="text-xs text-text-muted">Buckets, stashes, fun money — resets to defaults on reload</div>
            </div>
            <button onClick={async () => {
              if (!confirm('Reset all budget settings to defaults?')) return;
              await clearAllBudgetData();
              alert('Budget data reset. Reload to see defaults.');
              window.location.reload();
            }} className="px-3 py-1.5 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-secondary transition-colors">
              Reset to Defaults
            </button>
          </div>
        </div>

        {/* Connectors (Build-T2) */}
        <ConnectorsPanel />

        {/* Data Backup */}
        <DataBackup />

        {/* Chat + Other */}
        <div className="flex gap-2">
          <button onClick={async () => { await clearChatHistory(); setChatMessages([]); }}
            className="px-3 py-1.5 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-secondary transition-colors">
            Clear Chat History
          </button>
          <button onClick={async () => {
            if (!confirm('⚠️ NUCLEAR OPTION: Clear ALL data in Iris? Everything resets to defaults. This cannot be undone.')) return;
            if (!confirm('Are you sure? This deletes all portfolio, budget, transactions, equity, profile, and chat data.')) return;
            await clearAllPortfolioData();
            await clearAllBudgetData();
            await clearAllActionData();
            alert('All data cleared. Reloading...');
            window.location.reload();
          }} className="px-3 py-1.5 bg-negative/10 hover:bg-negative/20 text-negative rounded-lg text-xs font-medium transition-colors">
            ☢️ Reset Everything
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvictionHoldsPanel({ accounts, setAccounts }: {
  accounts: import('../types/portfolio').Account[];
  setAccounts: React.Dispatch<React.SetStateAction<import('../types/portfolio').Account[]>>;
}) {
  // Collapse conviction holdings by ticker across accounts.
  const rows = (() => {
    const map = new Map<string, { ticker: string; name: string; value: number; accounts: string[]; note?: string }>();
    for (const a of accounts) {
      if (a.status === 'closed') continue;
      for (const h of a.holdings) {
        if (!h.conviction) continue;
        const entry = map.get(h.ticker);
        if (entry) {
          entry.value += h.currentValue;
          if (!entry.accounts.includes(a.name)) entry.accounts.push(a.name);
          if (!entry.note && h.convictionNote) entry.note = h.convictionNote;
        } else {
          map.set(h.ticker, {
            ticker: h.ticker,
            name: h.name || h.ticker,
            value: h.currentValue,
            accounts: [a.name],
            note: h.convictionNote,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  })();

  const unmark = async (ticker: string) => {
    const today = new Date().toISOString().split('T')[0];
    for (const acct of accounts) {
      if (!acct.holdings.some(h => h.ticker === ticker && h.conviction)) continue;
      const updatedHoldings = acct.holdings.map(hh =>
        hh.ticker === ticker && hh.conviction
          ? { ...hh, conviction: false, convictionNote: undefined, lastUpdated: today }
          : hh
      );
      const updatedAcct = { ...acct, holdings: updatedHoldings, lastUpdated: today };
      setAccounts(prev => prev.map(a => a.id === acct.id ? updatedAcct : a));
      await saveAccount(updatedAcct);
    }
  };

  return (
    <div className="glass-card p-6 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <span>⭐</span>
            <span>Conviction Holds</span>
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Holdings you want to keep regardless of rebalance math. Excluded from trim suggestions and auto-DCA targeting — still shown in X-Ray with a ⭐ so you stay aware of the concentration.
          </p>
        </div>
        <div className="text-xs text-text-muted whitespace-nowrap">
          {rows.length} {rows.length === 1 ? 'hold' : 'holds'}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-text-muted bg-white/[0.02] border border-glass-border rounded-lg p-3">
          No conviction holds yet. Open any holding in the Portfolio view and mark it as a conviction hold to exempt it from rebalance suggestions.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.ticker} className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{r.ticker}</span>
                  <span className="text-xs text-text-muted truncate">· {r.name}</span>
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {formatCurrency(r.value)} across {r.accounts.join(', ')}
                </div>
                {r.note && (
                  <div className="text-[11px] text-amber-300/80 mt-1 italic">"{r.note}"</div>
                )}
              </div>
              <button
                onClick={() => unmark(r.ticker)}
                className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 text-text-muted hover:bg-white/10 hover:text-text-secondary transition-colors flex-shrink-0"
                title="Remove conviction flag"
              >
                Unmark
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Security / password ────────────────────────────────────────────────────
// Change the logged-in account's password. Collapsed by default so it stays out
// of the way; expands to the shared current → new → confirm form.
function SecurityPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-text-primary mb-1">Security</h3>
          <p className="text-xs text-text-secondary">Change your login password. You'll confirm the new one to avoid a typo locking you out.</p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass-border text-xs text-text-secondary hover:text-accent transition-colors whitespace-nowrap">
            Change password
          </button>
        )}
      </div>
      {open && (
        <div className="mt-4 max-w-sm">
          <ChangePasswordForm onCancel={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

// ── In-app updater ───────────────────────────────────────────────────────────
// Click → the host git-pulls the latest, reinstalls, and rebuilds. Frontend
// changes go live on refresh; server changes want a host restart (reported).
function UpdatePanel() {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [restart, setRestart] = useState(false);

  const run = async () => {
    setState('working'); setMsg(''); setRestart(false);
    try {
      const res = await fetch('/api/update', { method: 'POST' });
      const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string; restartNeeded?: boolean };
      if (body.ok) { setState('done'); setMsg(body.message ?? 'Done.'); setRestart(!!body.restartNeeded); }
      else { setState('error'); setMsg(body.message ?? 'Update failed.'); }
    } catch {
      setState('error'); setMsg('Could not reach the server.');
    }
  };

  return (
    <div className="glass-card p-6">
      <h3 className="font-semibold text-text-primary mb-1">Updates</h3>
      <p className="text-xs text-text-secondary mb-3">
        You're on version <span className="font-semibold text-text-primary">{APP_VERSION}</span>. Pull the
        latest from GitHub and rebuild — right here, no terminal.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={run} disabled={state === 'working'}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait">
          {state === 'working' ? 'Updating…' : 'Check for updates'}
        </button>
        {state === 'done' && !restart && (
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass-border text-sm text-text-secondary transition-colors">
            Refresh now
          </button>
        )}
      </div>
      {state === 'working' && <p className="text-xs text-text-muted mt-3">Pulling, installing, and rebuilding — this can take a minute.</p>}
      {msg && <p className={`text-xs mt-3 ${state === 'error' ? 'text-negative' : 'text-positive'}`}>{msg}</p>}
    </div>
  );
}
