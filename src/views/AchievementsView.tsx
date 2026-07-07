import { useAppData } from '../context/AppDataContext';
import TrophyWall from '../components/Achievements/TrophyWall';
import InfoTooltip from '../components/ui/InfoTooltip';

/**
 * Dedicated Achievements destination — the Trophy Room moved off the dashboard
 * scroll and into its own page (Rock 2, 2026-07-06). The dashboard keeps a
 * compact teaser card that links here; celebration nudges for fresh unlocks
 * still surface on the dashboard regardless of where you're standing.
 */
export default function AchievementsView() {
  const { achievementStates } = useAppData();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          Achievements
          <InfoTooltip text="Everything here is forward-only: a milestone only unlocks for progress made AFTER you started using Iris. Whatever you'd already done — months under budget, money already banked — was your start line, not a freebie trophy." />
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          The trophy wall — earned, in progress, and what's still a secret. Money as a hobby.
        </p>
      </div>

      {achievementStates.length > 0 ? (
        <TrophyWall states={achievementStates} bare defaultOpen />
      ) : (
        <div className="glass-card p-6 text-sm text-text-muted">
          Achievements light up once Iris has some real activity to grade — connect data and start using
          the budget to see your first trophies.
        </div>
      )}
    </div>
  );
}
