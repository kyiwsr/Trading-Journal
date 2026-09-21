import { BAND_LABEL } from '../lib/labels'
import { Badge } from './Badge'

const TONE = { elite: 'win', solid: 'solid', sub_optimal: 'sub', rule_breach: 'loss' }

export function ScoreBadge({ score, band }) {
  if (score === null || band === null) return <span className="muted">no score</span>
  return (
    <Badge tone={TONE[band]}>
      <span className="mono">{score}%</span> {BAND_LABEL[band]}
    </Badge>
  )
}
