import type { Band } from '../../api/types'
import { Amount, EmptyState, Panel, ScoreBadge } from '../../components'
import { money, price, quantity, points } from '../../lib/format'
import type { FeeLine, TradeResult } from '../../lib/tradeMath'

type Props = {
  result: TradeResult | null
  feeLines: FeeLine[]
  currency: string | null
  decimals: number
  score: number | null
  band: Band | null
  hasSetup: boolean
  feeNote: string | null
}

// Figures come from lib/tradeMath, the same formulas and rounding as the API, so the saved trade shows these numbers.
export function PreviewPanel({ result, feeLines, currency, decimals, score, band, hasSetup, feeNote }: Props) {
  return (
    <Panel title="Live result" tone="tint" className="preview" note="Calculated as you type. The saved trade uses the same figures.">
      {result === null ? (
        <EmptyState title="Nothing to calculate yet">
          <p>Choose an instrument, then enter at least one entry and one exit with the same total quantity.</p>
        </EmptyState>
      ) : (
        <>
          <p className="preview-net">
            <span className="preview-net-label">Net P&L</span>
            <Amount value={result.netPnl.toFixed(2)} currency={currency} />
          </p>
          <dl className="facts facts-rows">
            <Row label="Quantity" value={quantity(result.quantity.toString())} />
            <Row label="Avg entry" value={price(result.avgEntry.toString(), decimals)} />
            <Row label="Avg exit" value={price(result.avgExit.toString(), decimals)} />
            <Row label="Points" value={points(result.points.toString())} />
            <Row label="Gross P&L" value={<Amount value={result.grossPnl.toFixed(2)} currency={currency} />} />
            {feeLines.map((line) => (
              <Row key={line.name} label={line.name} value={money(line.amount.negated().toFixed(2), { currency })} />
            ))}
            {result.slippageCost.greaterThan(0) ? (
              <Row label="Slippage" value={money(result.slippageCost.negated().toFixed(2), { currency })} />
            ) : null}
            <Row
              label="Risk (1R)"
              value={result.riskAmount === null ? 'No stop set' : money(result.riskAmount.toFixed(2), { currency })}
            />
            <Row
              label="R multiple"
              value={result.rMultiple === null ? 'n/a' : <Amount value={result.rMultiple.toFixed(2)} kind="r" />}
            />
          </dl>
        </>
      )}
      {feeNote ? <p className="preview-note">{feeNote}</p> : null}
      <div className="preview-score">
        <span className="preview-net-label">Checklist score</span>
        {hasSetup ? <ScoreBadge score={score} band={band} /> : <span className="muted">Choose a setup to score it.</span>}
      </div>
    </Panel>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  )
}
