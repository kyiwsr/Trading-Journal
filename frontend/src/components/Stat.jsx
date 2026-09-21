

export function Stat({ label, value, detail, hint, featured = false }) {
  return (
    <div className={`stat ${featured ? 'stat-featured' : ''}`.trim()}>
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {detail ? <div className="stat-detail mono">{detail}</div> : null}
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  )
}
