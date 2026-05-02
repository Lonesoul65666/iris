import { useEffect, useState } from 'react';
import { useAppData, saveUserProfile, saveSetting } from '../context/AppDataContext';
import { setupLLMRouter, testProvider, type TestResult } from '../services/llm';
import SimpleFinPanel from '../components/Settings/SimpleFinPanel';
import { getAllAccounts, getSetting } from '../stores/portfolioStore';
import { saveEarner } from '../stores/budgetStore';
import { loadSampleData } from '../services/sampleData';
import type { Earner } from '../types/budget';
import type { UserProfile } from '../types/portfolio';
import { getFederalBracket, isNoIncomeTaxState, TAX_YEAR } from '../utils/taxBrackets';
import { sanitizeMoneyInput } from '../utils/format';

// Final wizard order (numbered constants instead of magic numbers).
// Some steps are conditionally shown based on the user's module selections —
// see `visibleStepsFor(modules)` below.
const STEP_WELCOME = 0;
const STEP_USER = 1;
const STEP_MODULES = 2;
const STEP_ABOUT = 3;
const STEP_RISK = 4;       // gated: investments
const STEP_EARNERS = 5;    // always (budget is always on)
const STEP_WEALTH = 6;     // gated: wealth
const STEP_AI = 7;
const STEP_PORTFOLIO = 8;  // gated: investments
const STEP_DONE = 9;
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

function visibleStepsFor(modules: Set<'investments' | 'equity' | 'wealth'>): Step[] {
  const steps: Step[] = [
    STEP_WELCOME, STEP_USER, STEP_MODULES, STEP_ABOUT,
  ];
  if (modules.has('investments')) steps.push(STEP_RISK);
  steps.push(STEP_EARNERS);
  if (modules.has('wealth')) steps.push(STEP_WEALTH);
  steps.push(STEP_AI);
  if (modules.has('investments')) steps.push(STEP_PORTFOLIO);
  steps.push(STEP_DONE);
  return steps;
}

// Module selection — what the user is using Iris for. Budget is mandatory
// (the foundational use case). Investments / Equity / Wealth are opt-in so
// people who don't have those don't get pushed "rebalance!" prompts they
// can't act on.
type ModuleId = 'investments' | 'equity' | 'wealth';
const MODULE_OPTIONS: { id: ModuleId; emoji: string; title: string; tagline: string; vibe: string }[] = [
  { id: 'investments', emoji: '📈', title: 'Investments',
    tagline: 'Stocks, ETFs, crypto, retirement accounts',
    vibe: 'Track holdings, get a portfolio grade, see rebalance moves and gap analysis' },
  { id: 'equity',      emoji: '🏢', title: 'Company equity',
    tagline: 'RSUs, ISOs, options, private-company shares',
    vibe: 'Track grants, vesting schedules, and what your equity is actually worth' },
  { id: 'wealth',      emoji: '🏠', title: 'Wealth & assets',
    tagline: 'Home, vehicles, other property',
    vibe: 'Net-worth tracking with depreciating assets handled honestly' },
];

export default function OnboardingView() {
  const { profile, setProfile, setView, refreshLlmReady, setApiKeyInput, fileInputRef, handleImageUpload, accounts, setAccounts } = useAppData();
  const [step, setStep] = useState<Step>(0);
  // If a user already exists (auth_users populated or profile.name set from a
  // prior incomplete onboarding), skip the user-creation step. They'll still
  // see the welcome screen; "Let's go" jumps straight to module selection.
  const [userAlreadyExists, setUserAlreadyExists] = useState(false);
  useEffect(() => {
    (async () => {
      const authUsers = (await getSetting<Record<string, string>>('auth_users')) || {};
      const hasAuthUser = Object.keys(authUsers).length > 0;
      const hasProfileName = !!profile?.name?.trim();
      if (hasAuthUser || hasProfileName) {
        setUserAlreadyExists(true);
        // If they somehow landed on step 1 (refresh, etc.), bump them forward.
        setStep(prev => (prev === 1 ? 2 : prev));
      }
    })();
  }, [profile]);
  const [name, setName] = useState('');
  const [spouseName, setSpouseName] = useState('');

  // Module selection state — Budget is locked-on, the rest are opt-in.
  // Pre-load any existing selection so a returning user sees their prior choice.
  const [selectedModules, setSelectedModules] = useState<Set<ModuleId>>(new Set());
  useEffect(() => {
    (async () => {
      const stored = await getSetting<string[]>('enabled_modules');
      if (Array.isArray(stored)) {
        setSelectedModules(new Set(stored.filter((m): m is ModuleId =>
          m === 'investments' || m === 'equity' || m === 'wealth'
        )));
      }
    })();
  }, []);
  const toggleModule = (id: ModuleId) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const saveModulesAndContinue = async () => {
    // Always include 'budget' in the persisted list — the hook treats it as
    // mandatory but persisting it keeps the data readable on its own.
    const list = ['budget', ...Array.from(selectedModules)];
    await saveSetting('enabled_modules', list);
    setStep(STEP_ABOUT);
  };

  // Navigation helpers — derive next/prev step from the visible-steps list,
  // which is itself derived from the user's enabled modules.
  const visibleSteps = visibleStepsFor(selectedModules);
  const totalVisible = visibleSteps.length;
  const currentVisiblePos = Math.max(visibleSteps.indexOf(step), 0) + 1;
  const goNext = () => {
    const idx = visibleSteps.indexOf(step);
    if (idx >= 0 && idx < visibleSteps.length - 1) setStep(visibleSteps[idx + 1]);
  };
  const goPrev = () => {
    const idx = visibleSteps.indexOf(step);
    if (idx > 0) setStep(visibleSteps[idx - 1]);
  };

  // About You step state. Strings so empty inputs render cleanly; parsed on save.
  const [aboutAge, setAboutAge] = useState('');
  const [aboutSpouseAge, setAboutSpouseAge] = useState('');
  const [aboutState, setAboutState] = useState('');
  const [aboutTaxBracket, setAboutTaxBracket] = useState('');
  const [aboutRetirementAge, setAboutRetirementAge] = useState('65');
  const [aboutAnnualIncome, setAboutAnnualIncome] = useState('');
  // Once the user manually edits the bracket field, stop auto-overriding it.
  // They might be in HoH, MFS, or a special situation our auto-fill misses.
  const [bracketTouched, setBracketTouched] = useState(false);

  // Auto-derive federal bracket from income + filing status (married = has spouseName).
  // Lives in a useEffect so it re-runs on every income/spouse change, but only
  // overwrites if the user hasn't manually edited the bracket yet.
  useEffect(() => {
    if (bracketTouched) return;
    const income = parseFloat(aboutAnnualIncome) || 0;
    if (income <= 0) { setAboutTaxBracket(''); return; }
    const filing = profile?.spouseName?.trim() ? 'mfj' : 'single';
    const bracket = getFederalBracket(income, filing);
    setAboutTaxBracket(bracket > 0 ? String(bracket) : '');
  }, [aboutAnnualIncome, profile?.spouseName, bracketTouched]);

  const saveAboutYouAndContinue = async (skip = false) => {
    if (!skip && profile) {
      const updated = {
        ...profile,
        age: parseInt(aboutAge) || 0,
        spouseAge: parseInt(aboutSpouseAge) || 0,
        state: aboutState.trim().toUpperCase().slice(0, 2),
        taxBracket: parseInt(aboutTaxBracket) || 0,
        retirementAge: parseInt(aboutRetirementAge) || 65,
        annualIncome: parseFloat(aboutAnnualIncome) || 0,
      };
      setProfile(updated);
      await saveUserProfile(updated);
    }
    goNext();
  };

  // ── Risk Tolerance step state ──────────────────────────────────────────────
  const [riskChoice, setRiskChoice] = useState<UserProfile['riskTolerance'] | null>(null);
  const saveRiskAndContinue = async (skip = false) => {
    if (!skip && riskChoice && profile) {
      const updated = { ...profile, riskTolerance: riskChoice };
      setProfile(updated);
      await saveUserProfile(updated);
    }
    goNext();
  };

  // ── Earners step state ─────────────────────────────────────────────────────
  // Pre-seed earner cards from profile. User can toggle "currently working"
  // and pick a pay shape per earner. No more silent auto-creation of biweekly
  // salaried earners — those assumptions burned us in QA.
  type EarnerDraft = { id: string; name: string; isWorking: boolean; payShape: Earner['payShape']; cadence: Earner['seedCheckCadence']; takeHome: string };
  const [earnerDrafts, setEarnerDrafts] = useState<EarnerDraft[]>([]);
  useEffect(() => {
    // Seed once when profile is first available + we hit this step.
    if (earnerDrafts.length > 0) return;
    if (!profile?.name?.trim()) return;
    const seed: EarnerDraft[] = [
      { id: 'self', name: profile.name.trim(), isWorking: true, payShape: 'salary', cadence: 'biweekly', takeHome: '' },
    ];
    if (profile.spouseName?.trim()) {
      seed.push({ id: 'spouse', name: profile.spouseName.trim(), isWorking: true, payShape: 'salary', cadence: 'biweekly', takeHome: '' });
    }
    setEarnerDrafts(seed);
  }, [profile, earnerDrafts.length]);
  const updateEarnerDraft = (id: string, patch: Partial<EarnerDraft>) => {
    setEarnerDrafts(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };
  const saveEarnersAndContinue = async (skip = false) => {
    if (!skip) {
      for (const d of earnerDrafts) {
        const earner: Earner = {
          id: `earner-${d.name.toLowerCase().replace(/\s+/g, '-')}`,
          name: d.name,
          isWorking: d.isWorking,
          payShape: d.payShape,
          seedCheckCadence: d.cadence,
          ...(d.takeHome && d.isWorking ? { seedTakeHomePerCheck: parseFloat(d.takeHome) || 0 } : {}),
        };
        await saveEarner(earner);
      }
    }
    goNext();
  };

  // ── Wealth step state ──────────────────────────────────────────────────────
  const [wealthHomeValue, setWealthHomeValue] = useState('');
  const [wealthMortgage, setWealthMortgage] = useState('');
  const [wealthCarValue, setWealthCarValue] = useState('');
  const saveWealthAndContinue = async (skip = false) => {
    if (!skip && profile) {
      const updated = {
        ...profile,
        homeValue: parseFloat(wealthHomeValue) || 0,
        mortgageBalance: parseFloat(wealthMortgage) || 0,
        carValue: parseFloat(wealthCarValue) || 0,
      };
      setProfile(updated);
      await saveUserProfile(updated);
    }
    goNext();
  };
  // Optional 4-digit PIN auth (per locked architecture: opt-in, never required).
  const [usePin, setUsePin] = useState(false);
  const [namePin, setNamePin] = useState('');
  const [spousePin, setSpousePin] = useState('');
  const [pinError, setPinError] = useState('');
  const [providerChoice, setProviderChoice] = useState<'gemini' | 'claude' | 'openai' | 'ollama' | null>(null);
  // Local input state — starts empty regardless of any pre-existing keys.
  // The shared `apiKeyInput` from AppDataContext loads any saved Gemini key
  // (used by the Settings panel). In onboarding we want a fresh blank field.
  const [geminiKey, setGeminiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [providerSaved, setProviderSaved] = useState(false);
  // Verification result from the most recent attempt. Reset to null when the user
  // edits a key (so the stale red error goes away once they try a new value).
  const [verifyResult, setVerifyResult] = useState<TestResult | null>(null);

  /**
   * Verify the chosen provider's connection, then either advance (success) or
   * surface the error inline for retry/continue-anyway (failure).
   * Mirrors the macOS Wi-Fi join / Stripe API key validation pattern.
   */
  const runVerifyAndSave = async () => {
    if (!providerChoice) { goNext(); return; }
    setSaving(true);
    setVerifyResult(null);
    try {
      const apiKey =
        providerChoice === 'gemini' ? geminiKey :
        providerChoice === 'claude' ? claudeKey :
        providerChoice === 'openai' ? openaiKey :
        undefined;
      // Test the provider before persisting.
      const result = await testProvider(providerChoice, { apiKey });
      setVerifyResult(result);

      if (!result.ok) {
        // Don't save the key, don't advance. User decides retry vs continue-anyway.
        setSaving(false);
        return;
      }

      // Verified — persist + advance.
      await persistProviderChoice();
      setProviderSaved(true);
      // Brief pause so the user sees the green "✓ Connected" state, then advance.
      setTimeout(() => goNext(), 700);
    } catch (err) {
      console.error('[onboarding] verify failed', err);
      setVerifyResult({ ok: false, provider: providerChoice, error: err instanceof Error ? err.message : String(err) });
      setSaving(false);
    }
  };

  /**
   * Continue without verifying. Saves the key as-is (in case the failure is
   * transient), advances, and flags `provider_unverified` so the dashboard can
   * surface a yellow toast: "⚠ Your AI provider isn't verified — check Settings."
   */
  const continueAnyway = async () => {
    if (!providerChoice) { goNext(); return; }
    setSaving(true);
    try {
      await persistProviderChoice();
      await saveSetting('provider_unverified', 'true');
    } catch (err) {
      console.error('[onboarding] continueAnyway save failed', err);
    } finally {
      setSaving(false);
      goNext();
    }
  };

  /** Persist the chosen provider's key + preference to settings.
   *  Note: we save directly via saveSetting and re-init the router rather than
   *  calling saveApiKey() — saveApiKey reads the shared apiKeyInput state which
   *  is stale right after a setApiKeyInput call (React state updates are async). */
  const persistProviderChoice = async () => {
    if (!providerChoice) return;
    if (providerChoice === 'gemini' && geminiKey.trim()) {
      await saveSetting('gemini_api_key', geminiKey.trim());
      setApiKeyInput(geminiKey.trim());
      await setupLLMRouter();
    } else if (providerChoice === 'claude' && claudeKey.trim()) {
      await saveSetting('claude_api_key', claudeKey.trim());
      await saveSetting('preferred_provider', 'claude');
      await setupLLMRouter();
    } else if (providerChoice === 'openai' && openaiKey.trim()) {
      await saveSetting('openai_api_key', openaiKey.trim());
      await saveSetting('preferred_provider', 'openai');
      await setupLLMRouter();
    } else if (providerChoice === 'ollama') {
      await saveSetting('preferred_provider', 'ollama');
      await saveSetting('llm_preference', 'local-only');
      await setupLLMRouter({ preference: 'local-only' });
    }
    await refreshLlmReady();
    // Clear any stale "unverified" flag from a prior continueAnyway.
    await saveSetting('provider_unverified', '');
  };

  const finish = async () => {
    await saveSetting('onboarding_complete', 'true');
    setView('dashboard');
  };

  const saveName = async () => {
    setPinError('');
    // Primary user name is required — this is the user-creation step.
    if (!name?.trim()) {
      setPinError('Your name is required to continue.');
      return;
    }
    // Validate PINs if user opted into PIN auth.
    if (usePin) {
      if (!/^\d{4}$/.test(namePin)) {
        setPinError(`PIN for ${name} must be exactly 4 digits.`);
        return;
      }
      if (spouseName?.trim() && !/^\d{4}$/.test(spousePin)) {
        setPinError(`PIN for ${spouseName} must be exactly 4 digits.`);
        return;
      }
    }

    if (!profile) { setStep(2); return; }
    const updated = { ...profile, name: name.trim(), spouseName: spouseName?.trim() || '' };
    setProfile(updated);
    await saveUserProfile(updated);

    // Earner profiles are NOT auto-created here. The dedicated "Who's earning?"
    // wizard step (gated on Budget module, which is always on) collects who
    // actually works, how they're paid, and at what cadence — the prior
    // assumption that everyone is a biweekly salaried employee was misleading.

    // If PIN auth enabled, persist the PIN map. The lock screen reads from this
    // setting on launch; if it's empty (or feature not enabled here), the app skips it.
    if (usePin) {
      const authUsers: Record<string, string> = { [name.trim()]: namePin };
      if (spouseName?.trim()) authUsers[spouseName.trim()] = spousePin;
      await saveSetting('auth_users', authUsers);
    } else {
      // Explicitly clear so this user is recognized as PIN-free.
      await saveSetting('auth_users', {});
    }

    setStep(2);
  };

  const exploreSample = async () => {
    setSaving(true);
    try {
      await loadSampleData();
      await saveSetting('onboarding_complete', 'true');
      setView('dashboard');
    } catch (err) {
      console.error('[onboarding] sample load failed', err);
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="min-h-screen w-full bg-surface-0 flex items-center justify-center p-6 animate-fadeIn">
      <div className="w-full max-w-6xl">
        {/* Brand + Progress header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {/* Iris brand mark */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent via-indigo-500 to-pink-500 flex items-center justify-center shadow-lg shadow-accent/30">
              <span className="text-white font-black text-lg tracking-tight">i</span>
            </div>
            <div>
              <div className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-accent-light to-indigo-300 bg-clip-text text-transparent leading-none">Iris</div>
              <div className="text-[11px] text-text-muted mt-0.5">Step {currentVisiblePos} of {totalVisible}</div>
            </div>
          </div>
          <button onClick={finish} className="text-sm text-text-muted hover:text-accent transition-colors">
            Skip setup &rarr;
          </button>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-6">
          <div className="h-full bg-gradient-to-r from-accent to-indigo-500 transition-all" style={{ width: `${(currentVisiblePos / totalVisible) * 100}%` }} />
        </div>

        {/* Step 0 — Welcome */}
        {step === 0 && (
          <div className="glass-card p-8 md:p-10">
            {/* Hero + preview tiles in a 2-column layout on wide screens —
                keeps the welcome card short enough to fit on a laptop without
                scrolling. Below md it stacks. */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr,1fr] gap-8 items-center">
              {/* Left: hero copy */}
              <div>
                <div className="text-5xl mb-3">👋</div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-text-primary mb-3 tracking-tight leading-[1.05]">
                  Hey, I'm <span className="bg-gradient-to-r from-accent via-indigo-400 to-pink-400 bg-clip-text text-transparent">Iris</span>. Money's <span className="bg-gradient-to-r from-accent to-pink-400 bg-clip-text text-transparent">stressful enough</span>.
                </h1>
                <p className="text-base md:text-lg text-text-secondary mb-2 leading-relaxed">
                  Most finance apps make you feel like you're failing. I just show you what's actually going on — no shame, no jargon, no 11 PM "you spent $7 at Starbucks" guilt trips.
                </p>
                <p className="text-sm text-text-muted italic mb-4">
                  Setup takes about 90 seconds. Pinky promise.
                </p>
                <div className="text-xs text-text-muted p-3 rounded-lg bg-white/[0.03] border border-glass-border">
                  <span className="text-accent-light font-semibold">🔒 Private by default.</span> Everything lives in your browser. We literally can't see your data — even if we wanted to. (We don't.)
                </div>
              </div>

              {/* Right: preview tiles stacked */}
              <div className="space-y-3">
                <PreviewTile
                  title="Dashboard"
                  emoji="📊"
                  caption="Your money at a glance. Without the spreadsheet war crime."
                />
                <PreviewTile
                  title="Intelligence"
                  emoji="🧠"
                  caption="AI that actually reads your portfolio, not just shows you ads."
                />
                <PreviewTile
                  title="Ask Iris"
                  emoji="💬"
                  caption="Like a finance-nerd friend, minus the awkward small talk."
                />
              </div>
            </div>

            {userAlreadyExists && (
              <div className="text-xs text-text-muted mt-5 p-3 rounded-lg bg-accent/5 border border-accent/20">
                <span className="text-accent-light font-semibold">Welcome back.</span> Picking up where you left off — you'll skip user creation since you already have a profile.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <button onClick={() => setStep(userAlreadyExists ? 2 : 1)}
                className="px-7 py-3.5 rounded-xl bg-accent hover:bg-accent-dim text-white text-base font-semibold transition-colors shadow-lg shadow-accent/20">
                Let&apos;s go &rarr;
              </button>
              <button
                onClick={exploreSample}
                disabled={saving}
                className="px-5 py-3.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-glass-border text-sm text-text-secondary hover:text-accent transition-colors disabled:opacity-50"
                title="Skip setup and explore Iris with a fully-populated sample dataset. You can clear it later from Settings."
              >
                {saving ? 'Loading…' : '🧪 Just exploring?'}
              </button>
            </div>
          </div>
        )}

        {/* Step 1 — Create user(s). Modeled after macOS/Windows new-user setup. */}
        {step === 1 && (
          <div className="glass-card p-10 md:p-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-3 tracking-tight">Create your user</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              Iris supports multiple users in one household — each gets their own view and PIN. You can add more users later in Settings. 'Cause we all matter, right?
            </p>

            {/* Primary user */}
            <div className="bg-surface-2 rounded-xl p-5 border border-glass-border mb-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">👤</span>
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">User 1 (you) — required</span>
              </div>
              <label className="text-xs text-text-muted block mb-1">First name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your first name"
                autoFocus
                className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 mb-3"
              />
              {usePin && (
                <>
                  <label className="text-xs text-text-muted block mb-1">4-digit PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={namePin}
                    onChange={e => setNamePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-32 bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-base text-text-primary outline-none focus:border-accent/50 font-mono tracking-widest"
                  />
                </>
              )}
            </div>

            {/* Partner (optional) */}
            <div className="bg-surface-2/50 rounded-xl p-5 border border-dashed border-glass-border mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">👥</span>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">User 2 — optional partner</span>
              </div>
              <label className="text-xs text-text-muted block mb-1">First name (leave blank to skip)</label>
              <input
                value={spouseName}
                onChange={e => setSpouseName(e.target.value)}
                placeholder="Their first name"
                className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 mb-3"
              />
              {usePin && spouseName?.trim() && (
                <>
                  <label className="text-xs text-text-muted block mb-1">4-digit PIN for {spouseName.trim()}</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={spousePin}
                    onChange={e => setSpousePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-32 bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-base text-text-primary outline-none focus:border-accent/50 font-mono tracking-widest"
                  />
                </>
              )}
            </div>

            {/* PIN toggle */}
            <label className="flex items-start gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={usePin}
                onChange={e => setUsePin(e.target.checked)}
                className="mt-0.5 rounded border-glass-border bg-surface-3 text-accent w-4 h-4"
              />
              <div className="flex-1">
                <div className={`text-sm ${usePin ? 'text-text-primary' : 'text-text-secondary'}`}>Protect with a PIN</div>
                <div className="text-[11px] text-text-muted">Require a 4-digit PIN at launch. Each user has their own. Can be added/removed later in Settings.</div>
              </div>
            </label>

            {pinError && (
              <div className="mb-4 text-[11px] text-negative p-2.5 rounded-lg bg-negative/10 border border-negative/20">
                ⚠ {pinError}
              </div>
            )}

            <div className="flex items-center gap-3 mt-6">
              <button onClick={() => setStep(0)} className="text-sm text-text-muted hover:text-accent transition-colors">&larr; Back</button>
              <div className="flex-1" />
              <button onClick={saveName} className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors">
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — What are you using Iris for? (module selection) */}
        {step === 2 && (
          <div className="glass-card p-10 md:p-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-3 tracking-tight">What are you using Iris for?</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              Iris does a lot — pick what's relevant to you and we'll only show those parts. You can change this anytime in Settings.
            </p>

            {/* Budget — always on, presented as locked */}
            <div className="bg-accent/10 border border-accent/30 rounded-xl p-5 mb-3 flex items-start gap-3">
              <div className="text-2xl">💵</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-text-primary">Budget</div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent-light font-bold">Always on</span>
                </div>
                <div className="text-xs text-text-muted mt-0.5">Spending breakdown, paycheck flow, "where every dollar goes"</div>
                <div className="text-[11px] text-text-secondary mt-2 italic">Everyone spends money. This is the foundation — even if you skip everything else, Iris helps you blame the budget.</div>
              </div>
              <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
            </div>

            {/* Optional modules */}
            <div className="space-y-3">
              {MODULE_OPTIONS.map(opt => {
                const checked = selectedModules.has(opt.id);
                return (
                  <div key={opt.id} onClick={() => toggleModule(opt.id)}
                    className={`rounded-xl p-5 flex items-start gap-3 cursor-pointer transition-all ${
                      checked
                        ? 'bg-accent/10 border border-accent/40'
                        : 'bg-surface-2 border border-glass-border hover:border-accent/30'
                    }`}>
                    <div className="text-2xl">{opt.emoji}</div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-text-primary">{opt.title}</div>
                      <div className="text-xs text-text-muted mt-0.5">{opt.tagline}</div>
                      <div className="text-[11px] text-text-secondary mt-2 italic">{opt.vibe}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
                      checked ? 'bg-accent' : 'bg-surface-3 border border-glass-border'
                    }`}>
                      {checked && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-[11px] text-text-muted mt-4 p-3 rounded-lg bg-white/[0.03] border border-glass-border">
              <span className="text-accent-light font-semibold">Heads up:</span> nothing's locked in. Add or drop modules later from Settings — your data stays put.
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button onClick={() => setStep(1)} className="text-sm text-text-muted hover:text-accent transition-colors">&larr; Back</button>
              <div className="flex-1" />
              <button onClick={saveModulesAndContinue} className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors">
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — About You */}
        {step === 3 && (
          <div className="glass-card p-10 md:p-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-3 tracking-tight">Tell us a bit about you</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              Quick stuff so the math actually means something. Skip anything you don't feel like sharing — you can fill it in later.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="text-xs text-text-muted block mb-1">Your age</label>
                <input
                  type="number" inputMode="numeric" value={aboutAge}
                  onChange={e => setAboutAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="e.g. 38"
                  className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50"
                />
              </div>
              {profile?.spouseName?.trim() && (
                <div>
                  <label className="text-xs text-text-muted block mb-1">{profile.spouseName.trim()}'s age</label>
                  <input
                    type="number" inputMode="numeric" value={aboutSpouseAge}
                    onChange={e => setAboutSpouseAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="e.g. 35"
                    className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-text-muted block mb-1">State (2 letters)</label>
                <input
                  type="text" value={aboutState}
                  onChange={e => setAboutState(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase())}
                  placeholder="TX"
                  className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 uppercase"
                />
                {aboutState.length === 2 && isNoIncomeTaxState(aboutState) && (
                  <div className="text-[10px] text-positive mt-1">🎉 No state income tax. Sweet.</div>
                )}
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Household annual income (gross)</label>
                <input
                  type="text" inputMode="decimal" value={aboutAnnualIncome}
                  onChange={e => setAboutAnnualIncome(sanitizeMoneyInput(e.target.value))}
                  placeholder="e.g. 145000"
                  className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Federal tax bracket %</label>
                <input
                  type="number" inputMode="numeric" value={aboutTaxBracket}
                  onChange={e => { setBracketTouched(true); setAboutTaxBracket(e.target.value.replace(/\D/g, '').slice(0, 2)); }}
                  placeholder="22"
                  className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50"
                />
                <div className="text-[10px] text-text-muted mt-1">
                  {aboutTaxBracket && !bracketTouched
                    ? <>Auto-set from your income ({TAX_YEAR} {profile?.spouseName?.trim() ? 'married joint' : 'single'} brackets). Tweak it if your situation's different.</>
                    : bracketTouched
                    ? <>Manually set. Clear the field to fall back to the auto-pick.</>
                    : <>Pop in your income above and we'll guess the bracket for you.</>
                  }
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">When do you want to retire?</label>
                <input
                  type="number" inputMode="numeric" value={aboutRetirementAge}
                  onChange={e => setAboutRetirementAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="65"
                  className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50"
                />
                <div className="text-[10px] text-text-muted mt-1">No judgment — 55, 65, "never", whatever feels right.</div>
              </div>
            </div>

            <div className="text-[11px] text-text-muted mb-5 p-3 rounded-lg bg-white/[0.03] border border-glass-border">
              <span className="text-accent-light font-semibold">Why we ask:</span> tax bracket changes the value of 401k contributions, retirement age drives every projection, and state matters for income tax. Garbage in = garbage out.
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep(2)} className="text-sm text-text-muted hover:text-accent transition-colors">&larr; Back</button>
              <div className="flex-1" />
              <button onClick={() => saveAboutYouAndContinue(true)} className="px-3 py-2 text-xs text-text-muted hover:text-text-secondary underline transition-colors">
                Skip for now
              </button>
              <button onClick={() => saveAboutYouAndContinue(false)} className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors">
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Risk Tolerance (only shown if Investments module selected) */}
        {step === STEP_RISK && (
          <div className="glass-card p-10 md:p-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-3 tracking-tight">How do you sleep at night?</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              When the market drops 30%, are you doom-scrolling at 2 AM or pouring another coffee? No wrong answer — just helps me tune the advice.
            </p>

            <div className="space-y-3">
              {[
                { id: 'conservative' as const,    emoji: '🛡️', title: 'Conservative',     blurb: `"I'd panic. Keep me mostly in bonds and cash."` },
                { id: 'moderate' as const,        emoji: '⚖️', title: 'Moderate',         blurb: `"I can stomach some swings. Mix me up."` },
                { id: 'aggressive' as const,      emoji: '🎢', title: 'Aggressive',       blurb: `"Volatility is fine. Heavy on stocks."` },
                { id: 'very_aggressive' as const, emoji: '🚀', title: 'Very Aggressive',  blurb: `"Bring it on. Tech, growth, crypto — I'm here for the ride."` },
              ].map(opt => {
                const checked = riskChoice === opt.id;
                return (
                  <div key={opt.id} onClick={() => setRiskChoice(opt.id)}
                    className={`rounded-xl p-5 flex items-start gap-4 cursor-pointer transition-all ${
                      checked ? 'bg-accent/10 border border-accent/40' : 'bg-surface-2 border border-glass-border hover:border-accent/30'
                    }`}>
                    <div className="text-3xl flex-shrink-0">{opt.emoji}</div>
                    <div className="flex-1">
                      <div className="text-lg font-bold text-text-primary tracking-tight">{opt.title}</div>
                      <div className="text-sm text-text-secondary italic mt-1">{opt.blurb}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-1 ${checked ? 'border-accent bg-accent' : 'border-text-muted'}`}>
                      {checked && <div className="w-full h-full rounded-full bg-white scale-[0.4]" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-text-muted mt-5 p-3 rounded-lg bg-white/[0.03] border border-glass-border">
              <span className="text-accent-light font-semibold">Heads up:</span> change your mind whenever. This isn't a tattoo.
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button onClick={goPrev} className="text-sm text-text-muted hover:text-accent transition-colors">&larr; Back</button>
              <div className="flex-1" />
              <button onClick={() => saveRiskAndContinue(true)} className="px-3 py-2 text-xs text-text-muted hover:text-text-secondary underline transition-colors">
                Skip for now
              </button>
              <button onClick={() => saveRiskAndContinue(false)} disabled={!riskChoice} className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors disabled:opacity-50">
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 5 — Earners (always shown, Budget is always-on) */}
        {step === STEP_EARNERS && (
          <div className="glass-card p-10 md:p-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-3 tracking-tight">Who's bringing home the bacon?</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              Quick question per household member. This shapes how I categorize your paychecks vs. side cash vs. bonuses.
            </p>

            <div className="space-y-4">
              {earnerDrafts.map((d, i) => (
                <div key={d.id} className="bg-surface-2 rounded-xl p-5 border border-glass-border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{i === 0 ? '🧑' : '🧑‍🤝‍🧑'}</span>
                      <span className="text-base font-bold text-text-primary">{d.name}</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={d.isWorking}
                        onChange={e => updateEarnerDraft(d.id, { isWorking: e.target.checked })}
                        className="rounded border-glass-border bg-surface-3 text-accent w-4 h-4" />
                      <span className="text-sm text-text-secondary">Currently working</span>
                    </label>
                  </div>

                  {d.isWorking && (
                    <>
                      <label className="text-xs text-text-muted block mb-2">How are they paid?</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                        {([
                          { id: 'salary' as const, label: 'Salary', sub: 'Same check every time' },
                          { id: 'salary_bonus' as const, label: 'Salary + bonus', sub: 'Steady plus annual lump' },
                          { id: 'salary_commission' as const, label: 'Salary + commission', sub: 'Base + variable on top' },
                          { id: 'hourly' as const, label: 'Hourly', sub: 'Hours × rate' },
                          { id: 'self_employed' as const, label: 'Self-employed', sub: 'You pay your own taxes' },
                          { id: 'mix' as const, label: 'Mix of stuff', sub: 'Multiple sources' },
                        ]).map(opt => (
                          <button key={opt.id} type="button" onClick={() => updateEarnerDraft(d.id, { payShape: opt.id })}
                            className={`text-left p-3 rounded-lg border transition-colors ${
                              d.payShape === opt.id
                                ? 'bg-accent/15 border-accent/50 text-text-primary'
                                : 'bg-surface-3 border-glass-border text-text-secondary hover:border-accent/30'
                            }`}>
                            <div className="text-sm font-semibold">{opt.label}</div>
                            <div className="text-[11px] text-text-muted mt-0.5">{opt.sub}</div>
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-text-muted block mb-1">Typical take-home per check</label>
                          <input type="text" inputMode="decimal" value={d.takeHome}
                            onChange={e => updateEarnerDraft(d.id, { takeHome: sanitizeMoneyInput(e.target.value) })}
                            placeholder="$ (e.g. 2,847.50)"
                            className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50" />
                          <div className="text-[10px] text-text-muted mt-1">Rough is fine — actual paychecks override this once data flows in.</div>
                        </div>
                        <div>
                          <label className="text-xs text-text-muted block mb-1">Pay cadence</label>
                          <select value={d.cadence}
                            onChange={e => updateEarnerDraft(d.id, { cadence: e.target.value as Earner['seedCheckCadence'] })}
                            className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50">
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Biweekly (every 2 weeks)</option>
                            <option value="semimonthly">Twice a month</option>
                            <option value="monthly">Monthly</option>
                            <option value="irregular">Irregular</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button onClick={goPrev} className="text-sm text-text-muted hover:text-accent transition-colors">&larr; Back</button>
              <div className="flex-1" />
              <button onClick={() => saveEarnersAndContinue(true)} className="px-3 py-2 text-xs text-text-muted hover:text-text-secondary underline transition-colors">
                Skip for now
              </button>
              <button onClick={() => saveEarnersAndContinue(false)} className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors">
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 6 — Wealth basics (only shown if Wealth module selected) */}
        {step === STEP_WEALTH && (
          <div className="glass-card p-10 md:p-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-3 tracking-tight">What else do you own?</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              Big stuff that adds up to net worth. Honest numbers in, honest numbers out — cars depreciate, and I'll show that math truthfully.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-surface-2 rounded-xl p-5 border border-glass-border">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🏠</span>
                  <span className="text-base font-bold text-text-primary">Home</span>
                </div>
                <label className="text-xs text-text-muted block mb-1">Estimated value</label>
                <input type="text" inputMode="decimal" value={wealthHomeValue}
                  onChange={e => setWealthHomeValue(sanitizeMoneyInput(e.target.value))}
                  placeholder="$"
                  className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 mb-3" />
                <label className="text-xs text-text-muted block mb-1">Mortgage balance (if any)</label>
                <input type="text" inputMode="decimal" value={wealthMortgage}
                  onChange={e => setWealthMortgage(sanitizeMoneyInput(e.target.value))}
                  placeholder="$"
                  className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50" />
              </div>

              <div className="bg-surface-2 rounded-xl p-5 border border-glass-border">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🚗</span>
                  <span className="text-base font-bold text-text-primary">Vehicles</span>
                </div>
                <label className="text-xs text-text-muted block mb-1">Combined value</label>
                <input type="text" inputMode="decimal" value={wealthCarValue}
                  onChange={e => setWealthCarValue(sanitizeMoneyInput(e.target.value))}
                  placeholder="$"
                  className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50" />
                <div className="text-[11px] text-text-muted mt-2 italic">Cars are depreciating assets — I'll auto-adjust the book value over time, not pretend they hold their sticker.</div>
              </div>
            </div>

            <div className="text-xs text-text-muted mt-5 p-3 rounded-lg bg-white/[0.03] border border-glass-border">
              <span className="text-accent-light font-semibold">Other big stuff?</span> Boats, jewelry, that signed Tom Brady jersey — add it later in Settings → Profile.
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button onClick={goPrev} className="text-sm text-text-muted hover:text-accent transition-colors">&larr; Back</button>
              <div className="flex-1" />
              <button onClick={() => saveWealthAndContinue(true)} className="px-3 py-2 text-xs text-text-muted hover:text-text-secondary underline transition-colors">
                Skip for now
              </button>
              <button onClick={() => saveWealthAndContinue(false)} className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors">
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 7 — AI Provider */}
        {step === STEP_AI && (
          <div className="glass-card p-10 md:p-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-3 tracking-tight">Connect an AI provider</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              Iris uses an AI to analyze your portfolio and answer questions. Pick one — you can swap or add more later.
            </p>
            <div className="space-y-3 mb-5">
              <ProviderCard
                id="gemini"
                title="Gemini"
                subtitle="Free tier · web-grounded market data · recommended"
                selected={providerChoice === 'gemini'}
                onSelect={() => setProviderChoice('gemini')}
              >
                {providerChoice === 'gemini' && (
                  <>
                    <input type="password" value={geminiKey} onChange={e => { setGeminiKey(e.target.value); setVerifyResult(null); }}
                      placeholder="Paste your Gemini API key"
                      autoComplete="off" autoCorrect="off" spellCheck={false}
                      className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 mt-3" />
                    <p className="text-[11px] text-text-muted mt-2">
                      Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent hover:underline">aistudio.google.com/apikey</a>. Generous free tier.
                    </p>
                  </>
                )}
              </ProviderCard>

              <ProviderCard
                id="claude"
                title="Claude"
                subtitle="Best-in-class reasoning · paid API"
                selected={providerChoice === 'claude'}
                onSelect={() => setProviderChoice('claude')}
              >
                {providerChoice === 'claude' && (
                  <>
                    <input type="password" value={claudeKey} onChange={e => { setClaudeKey(e.target.value); setVerifyResult(null); }}
                      placeholder="sk-ant-…"
                      autoComplete="off" autoCorrect="off" spellCheck={false}
                      className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 mt-3" />
                    <p className="text-[11px] text-text-muted mt-2">
                      Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">console.anthropic.com</a>.
                    </p>
                  </>
                )}
              </ProviderCard>

              <ProviderCard
                id="openai"
                title="OpenAI"
                subtitle="GPT models · pay-as-you-go"
                selected={providerChoice === 'openai'}
                onSelect={() => setProviderChoice('openai')}
              >
                {providerChoice === 'openai' && (
                  <>
                    <input type="password" value={openaiKey} onChange={e => { setOpenaiKey(e.target.value); setVerifyResult(null); }}
                      placeholder="sk-…"
                      autoComplete="off" autoCorrect="off" spellCheck={false}
                      className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 mt-3" />
                    <p className="text-[11px] text-text-muted mt-2">
                      Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">platform.openai.com</a>.
                    </p>
                  </>
                )}
              </ProviderCard>

              <ProviderCard
                id="ollama"
                title="Ollama (local)"
                subtitle="Runs on your machine · 100% private · no key needed"
                selected={providerChoice === 'ollama'}
                onSelect={() => setProviderChoice('ollama')}
              >
                {providerChoice === 'ollama' && (
                  <p className="text-[11px] text-text-muted mt-3">
                    Install Ollama at <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-accent hover:underline">ollama.com</a>, then <code className="text-accent">ollama pull gemma2:2b</code> (or any model). You can pick the exact model in Settings later.
                  </p>
                )}
              </ProviderCard>
            </div>

            {/* Inline verification status panel — hidden until first attempt */}
            {verifyResult && (
              <div className={`mb-4 p-3 rounded-lg border text-sm ${
                verifyResult.ok
                  ? 'bg-positive/10 border-positive/30 text-positive'
                  : 'bg-negative/10 border-negative/30 text-negative'
              }`}>
                {verifyResult.ok ? (
                  <span>✓ Connected to <strong>{verifyResult.model}</strong> — saving and continuing…</span>
                ) : (
                  <>
                    <div className="font-semibold">⚠ Couldn't verify connection</div>
                    <div className="text-xs mt-1 text-text-secondary">{verifyResult.error}</div>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => setStep(2)} className="text-sm text-text-muted hover:text-accent transition-colors">&larr; Back</button>
              <div className="flex-1" />

              {/* Failure state: retry primary, continue-anyway secondary */}
              {verifyResult && !verifyResult.ok ? (
                <>
                  <button onClick={continueAnyway}
                    className="px-3 py-2 text-xs text-text-muted hover:text-text-secondary underline transition-colors">
                    Continue anyway →
                  </button>
                  <button onClick={runVerifyAndSave} disabled={saving}
                    className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors disabled:opacity-50">
                    {saving ? 'Retrying…' : '🔄 Retry'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={goNext} className="px-4 py-2 text-sm text-text-muted hover:text-accent transition-colors">Skip for now</button>
                  <button onClick={runVerifyAndSave} disabled={saving || !providerChoice}
                    className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors disabled:opacity-50">
                    {saving ? 'Verifying…' : 'Verify & continue'} &rarr;
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 8 — Portfolio */}
        {step === STEP_PORTFOLIO && (
          <div className="glass-card p-10 md:p-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-3 tracking-tight">Load your portfolio</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              Four ways to get your holdings into Iris. The first is easiest and keeps itself fresh.
            </p>

            <div className="mb-5">
              <SimpleFinPanel
                compact
                onSynced={async () => {
                  const fresh = await getAllAccounts();
                  setAccounts(fresh);
                }}
              />
            </div>

            <div className="text-center text-[11px] uppercase tracking-wider text-text-muted mb-4">
              or, do it yourself (free)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <ImportOption
                emoji="📸"
                title="Screenshot"
                subtitle="Snap your brokerage page. Gemini extracts the holdings."
                disabled={!providerSaved && !geminiKey.trim() && providerChoice !== 'gemini'}
                onClick={() => fileInputRef.current?.click()}
              />
              <ImportOption
                emoji="📋"
                title="CSV"
                subtitle="Export from Fidelity / Schwab / E*TRADE, upload on the Investments tab."
                onClick={() => { saveSetting('onboarding_complete', 'true'); setView('portfolio'); }}
              />
              <ImportOption
                emoji="✏️"
                title="Manual"
                subtitle="Add accounts and holdings yourself in the Investments tab."
                onClick={() => { saveSetting('onboarding_complete', 'true'); setView('portfolio'); }}
              />
            </div>

            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />

            {accounts.length > 0 && (
              <div className="text-xs text-positive mb-4 p-3 rounded-lg bg-positive/10 border border-positive/20">
                ✓ You have {accounts.length} account{accounts.length === 1 ? '' : 's'} loaded. You can import more anytime from the Investments tab.
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={goPrev} className="text-sm text-text-muted hover:text-accent transition-colors">&larr; Back</button>
              <div className="flex-1" />
              <button onClick={goNext} className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors">
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 9 — Done */}
        {step === STEP_DONE && (
          <div className="glass-card p-10 md:p-12 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-text-primary mb-3 tracking-tight">You're all set 🎉</h2>
            <p className="text-base md:text-lg text-text-secondary mb-6 leading-relaxed">
              Head to the Dashboard to see your overview. Next time you launch Iris, it'll remind you about anything you skipped.
            </p>
            <div className="text-xs text-text-muted mb-6 p-3 rounded-lg bg-white/[0.03] border border-glass-border text-left">
              <span className="text-accent-light font-semibold">Tip:</span> Try the <span className="text-accent">Intelligence → Market</span> tab to generate your first AI market report, or <span className="text-accent">Ask Iris</span> a question like "what should I do with my next $2k?"
            </div>
            <button onClick={finish}
              className="px-8 py-3 rounded-xl bg-accent hover:bg-accent-dim text-white font-semibold transition-colors">
              Open Iris &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewTile({ title, emoji, caption }: { title: string; emoji: string; caption: string }) {
  return (
    <div className="p-4 rounded-xl bg-surface-1 border border-glass-border hover:border-accent/30 transition-colors flex items-start gap-4">
      <div className="text-3xl flex-shrink-0">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="text-lg font-bold text-text-primary mb-1 tracking-tight">{title}</div>
        <div className="text-sm text-text-secondary leading-relaxed">{caption}</div>
      </div>
    </div>
  );
}

function ProviderCard({ title, subtitle, selected, onSelect, children }: {
  /** Stable id for the provider — accepted by the type for callers but not currently rendered. */
  id: string; title: string; subtitle: string; selected: boolean; onSelect: () => void; children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        selected ? 'bg-accent/10 border-accent/50' : 'bg-surface-1 border-glass-border hover:border-accent/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-4 h-4 rounded-full border-2 mt-1 flex-shrink-0 ${selected ? 'border-accent bg-accent' : 'border-text-muted'}`}>
          {selected && <div className="w-full h-full rounded-full bg-white scale-[0.4]" />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-text-primary">{title}</div>
          <div className="text-xs text-text-muted">{subtitle}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function ImportOption({ emoji, title, subtitle, onClick, disabled }: {
  emoji: string; title: string; subtitle: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-4 rounded-xl border text-left transition-all ${
        disabled
          ? 'bg-surface-1 border-glass-border opacity-40 cursor-not-allowed'
          : 'bg-surface-1 border-glass-border hover:border-accent/50 hover:bg-accent/5 cursor-pointer'
      }`}
    >
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-sm font-semibold text-text-primary mb-1">{title}</div>
      <div className="text-xs text-text-muted leading-relaxed">{subtitle}</div>
      {disabled && <div className="text-[10px] text-warning mt-2">Needs Gemini key</div>}
    </button>
  );
}
