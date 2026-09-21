import { useMemo } from 'react'

import { useSettings } from '../api/queries'
import { DEFAULT_BANDS, DEFAULT_COMPLIANCE_CUTOFF, scoreBandList } from './labels'

// Score bands and the compliance cutoff come from GET /settings; the defaults stand in until it answers or if it fails.
export function useScoring() {
  const { data } = useSettings()
  return useMemo(() => {
    const bands = data?.bands ?? DEFAULT_BANDS
    return {
      bands,
      cutoff: data?.compliance_cutoff ?? DEFAULT_COMPLIANCE_CUTOFF,
      bandList: scoreBandList(bands),
    }
  }, [data])
}
