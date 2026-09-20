import type { Band, Result, SetupRank } from '../api/types'

// Mirrors backend/app/services/constants.py; the API does not expose these yet.
export const SCORE_BANDS: { band: Band; label: string; range: string }[] = [
  { band: 'elite', label: 'Elite', range: '85% to 100%' },
  { band: 'solid', label: 'Solid', range: '70% to 84%' },
  { band: 'sub_optimal', label: 'Sub-optimal', range: '60% to 69%' },
  { band: 'rule_breach', label: 'Rule breach', range: 'Under 60%' },
]
export const COMPLIANCE_CUTOFF = 80

export const BAND_LABEL: Record<Band, string> = Object.fromEntries(
  SCORE_BANDS.map((b) => [b.band, b.label]),
) as Record<Band, string>

export const BAND_RANGE: Record<Band, string> = Object.fromEntries(
  SCORE_BANDS.map((b) => [b.band, b.range]),
) as Record<Band, string>

export const RANK_LABEL: Record<SetupRank, string> = {
  elite: 'Elite',
  solid: 'Solid',
  negative_edge: 'Negative edge',
}

export const RESULT_LABEL: Record<Result, string> = { win: 'Win', loss: 'Loss', breakeven: 'Breakeven' }
