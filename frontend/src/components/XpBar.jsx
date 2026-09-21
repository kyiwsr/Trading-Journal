
export function XpBar({ value, max, label = 'Discipline XP' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className="xpbar"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className="xpbar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
