import { Link } from 'react-router-dom'

import type { Setup } from '../../api/types'
import { Checkbox, EmptyState, Input, Panel } from '../../components'
import { number } from '../../lib/format'
import type { CheckState } from '../../lib/tradeForm'

type Props = {
  setup: Setup
  checks: Record<number, CheckState>
  search: string
  onChange: (criterionId: number, patch: Partial<CheckState>) => void
}

export function ChecklistSection({ setup, checks, search, onChange }: Props) {
  const criteria = [...setup.criteria].sort((a, b) => a.display_order - b.display_order)

  return (
    <Panel title="Checklist" className="checklist-panel" note={`Tick each rule you followed on ${setup.name}. Unticked rules count against the score.`}>
      {criteria.length === 0 ? (
        <EmptyState title="This setup has no checklist yet">
          <p>
            Without criteria the trade cannot be scored.{' '}
            <Link to={{ pathname: `/setups/${setup.id}`, search }}>Add criteria to {setup.name}</Link>.
          </p>
        </EmptyState>
      ) : (
        <ul className="checklist checklist-edit">
          {criteria.map((criterion) => {
            const state = checks[criterion.id] ?? { checked: false, note: '' }
            return (
              <li key={criterion.id} className="check-edit">
                <Checkbox
                  label={
                    <>
                      <span>{criterion.label}</span> <span className="mono check-weight">{number(criterion.weight)} pts</span>
                    </>
                  }
                  checked={state.checked}
                  onChange={(event) => onChange(criterion.id, { checked: event.target.checked })}
                />
                <Input
                  aria-label={`Evidence for ${criterion.label}`}
                  placeholder="Evidence (optional)"
                  value={state.note}
                  onChange={(event) => onChange(criterion.id, { note: event.target.value })}
                />
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
