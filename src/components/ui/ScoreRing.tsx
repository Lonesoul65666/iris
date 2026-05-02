/** Unified score ring — used on Dashboard and Budget views */
export default function ScoreRing({ score, size = 100, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill={color}
          fontSize={size * 0.25} fontWeight="700" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
          {score}
        </text>
      </svg>
      {label && <span className="text-xs text-text-secondary">{label}</span>}
    </div>
  );
}
