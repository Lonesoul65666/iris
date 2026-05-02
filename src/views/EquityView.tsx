import { useAppData } from '../context/AppDataContext';
import EquitySection from '../components/Equity/EquitySection';

export default function EquityView() {
  const { equity } = useAppData();

  if (!equity) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Company Equity</h1>
          <p className="term-label mt-1">ISOs · RSUs · IPO Scenario Planning</p>
        </div>
        <div className="glass-card p-8 text-center">
          <p className="text-text-secondary">No equity grants tracked yet. Add your company equity in Settings → Equity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{equity.company} Equity</h1>
        <p className="term-label mt-1">ISOs · RSUs · IPO Scenario Planning</p>
      </div>
      <EquitySection equity={equity} variant="full" />
    </div>
  );
}
