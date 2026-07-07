import { useState, useEffect, useCallback } from 'react';
import { saveSetting, getSetting } from '../../stores/portfolioStore';

interface TutorialProps {
  userName: string;
  onComplete: () => void;
}

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

function getSteps(userName: string): TutorialStep[] {
  return [
    {
      title: `Welcome to Iris, ${userName}!`,
      description:
        "Iris is a budget you'll actually want to open. It tracks what you spend, coaches you on it in a voice with real opinions, and turns staying disciplined into a game you play together. Let's take a quick tour.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      ),
    },
    {
      title: 'Your Dashboard',
      description:
        'This is home base. "This Week’s Focus" up top surfaces the 1–3 money moves that actually matter right now, and it holds steady all week instead of shuffling every time you open the app. Below that: net worth, safe-to-spend, and how you’re tracking against your guaranteed base.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      title: "Have-To's, Want-To's & Fun Money",
      description:
        "Fund the bills you HAVE to cover (taxes, insurance) and the things you WANT (a trip, the remodel) as separate pots that grow every month. Fun Money is the guilt-free part — a head-to-head game where restraint banks real savings. Small wins here earn real trophies on the Achievements wall.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
    {
      title: 'Import Your Statements',
      description:
        "Head to Budget, then open the Transactions tab to import your bank and credit card statements. Iris auto-categorizes every transaction and spots your recurring bills automatically — that's what powers the cash-flow calendar and subscription radar on your dashboard.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      ),
    },
    {
      title: 'Ask Iris Anything',
      description:
        'Look for "Ask Iris anything →" under Iris’s Take on the Budget page — that’s the door into a full conversation with Iris about your actual numbers. She’ll tell you where you crushed it and where you didn’t. No hallucinated advice, just your real spending, straight talk.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ];
}

export default function Tutorial({ userName, onComplete }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [visible, setVisible] = useState(false);

  const steps = getSteps(userName);
  const totalSteps = steps.length;
  const isLastStep = currentStep === totalSteps - 1;
  const step = steps[currentStep];

  // Fade in on mount
  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timeout);
  }, []);

  const handleComplete = useCallback(async () => {
    if (dontShowAgain) {
      await saveSetting(`tutorial_completed_${userName}`, 'true');
    }
    setVisible(false);
    // Wait for fade-out animation before calling onComplete
    setTimeout(() => onComplete(), 250);
  }, [dontShowAgain, userName, onComplete]);

  const handleSkip = useCallback(() => {
    void handleComplete();
  }, [handleComplete]);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      void handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [isLastStep, handleComplete]);

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handleBack();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSkip, handleNext, handleBack]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-250 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleSkip} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-lg mx-4">
        <div className="glass-card border border-glass-border bg-surface-1 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-white/5">
            <div
              className="h-full bg-accent transition-all duration-500 ease-out rounded-r-full"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Icon */}
            <div className="mb-5 flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/15 border border-accent/20 flex items-center justify-center text-accent">
                {step.icon}
              </div>
            </div>

            {/* Step indicator */}
            <div className="text-center mb-2">
              <span className="text-xs font-medium text-text-muted tracking-wider uppercase">
                Step {currentStep + 1} of {totalSteps}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-text-primary text-center mb-3">
              {step.title}
            </h2>

            {/* Description */}
            <p className="text-sm text-text-secondary leading-relaxed text-center mb-6">
              {step.description}
            </p>

            {/* Step dots */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? 'w-6 bg-accent'
                      : i < currentStep
                        ? 'w-2 bg-accent/40'
                        : 'w-2 bg-white/10'
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {/* Don't show again — only on last step */}
            {isLastStep && (
              <label className="flex items-center justify-center gap-2 mb-5 cursor-pointer group">
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    dontShowAgain
                      ? 'bg-accent border-accent'
                      : 'border-glass-border group-hover:border-white/20'
                  }`}
                  onClick={() => setDontShowAgain((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') setDontShowAgain((v) => !v);
                  }}
                  role="checkbox"
                  aria-checked={dontShowAgain}
                  tabIndex={0}
                >
                  {dontShowAgain && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-text-muted select-none">Don't show this again</span>
                {/* hidden native checkbox for accessibility */}
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="sr-only"
                  tabIndex={-1}
                />
              </label>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-xs text-text-muted hover:text-text-secondary transition-colors rounded-lg"
              >
                Skip tour
              </button>

              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 text-sm font-medium text-text-secondary bg-white/5 hover:bg-white/10 border border-glass-border rounded-xl transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="px-6 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent/80 rounded-xl transition-colors shadow-lg shadow-accent/20"
                >
                  {isLastStep ? 'Get Started' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper hook: check whether the tutorial has already been completed for a user.
 * Usage in App.tsx:
 *   const showTutorial = useTutorialStatus(activeUser);
 *   {showTutorial && <Tutorial userName={activeUser} onComplete={() => ...} />}
 */
export function useTutorialStatus(userName: string | null): boolean | null {
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userName) {
      setShow(null);
      return;
    }
    let cancelled = false;
    getSetting(`tutorial_completed_${userName}`).then((val) => {
      if (!cancelled) {
        setShow(val !== 'true');
      }
    });
    return () => { cancelled = true; };
  }, [userName]);

  return show;
}
