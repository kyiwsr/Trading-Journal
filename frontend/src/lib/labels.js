import type { Band, Result, Settings, SetupRank } from '../api/types'

export type Bands = Settings['bands']

// Used until GET /settings answers, and if it fails. The API is the source of truth.
export const DEFAULT_BANDS: Bands = { elite_min: 85, solid_min: 70, sub_optimal_min: 60 }
export const DEFAULT_COMPLIANCE_CUTOFF = 80

export const BAND_LABEL: Record<Band, string> = {
  elite: 'Elite',
  solid: 'Solid',
  sub_optimal: 'Sub-optimal',
  rule_breach: 'Rule breach',
}

export function scoreBandList(bands: Bands = DEFAULT_BANDS): { band: Band; label: string; range: string }[] {
  return [
    { band: 'elite', label: BAND_LABEL.elite, range: `${bands.elite_min}% to 100%` },
    { band: 'solid', label: BAND_LABEL.solid, range: `${bands.solid_min}% to ${bands.elite_min - 1}%` },
    { band: 'sub_optimal', label: BAND_LABEL.sub_optimal, range: `${bands.sub_optimal_min}% to ${bands.solid_min - 1}%` },
    { band: 'rule_breach', label: BAND_LABEL.rule_breach, range: `Under ${bands.sub_optimal_min}%` },
  ]
}

export const RANK_LABEL: Record<SetupRank, string> = {
  elite: 'Elite',
  solid: 'Solid',
  negative_edge: 'Negative edge',
}

export const RESULT_LABEL: Record<Result, string> = { win: 'Win', loss: 'Loss', breakeven: 'Breakeven' }
