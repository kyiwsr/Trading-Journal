import { Button, Field, Input } from '../../components'
import { blankRow, type FillRow, type FormErrors } from '../../lib/tradeForm'

type GroupProps = {
  kind: 'entry' | 'exit'
  rows: FillRow[]
  errors: FormErrors
  onChange: (rows: FillRow[]) => void
}

const NOUN = { entry: 'Entry', exit: 'Exit' } as const

function FillGroup({ kind, rows, errors, onChange }: GroupProps) {
  const update = (index: number, patch: Partial<FillRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <fieldset className="fill-group">
      <legend className="fill-legend">{kind === 'entry' ? 'Entries' : 'Exits'}</legend>
      {rows.map((row, index) => {
        const name = `${kind}.${index}`
        const label = `${NOUN[kind]} ${index + 1}`
        return (
          <div key={row.key} className="fill-row" role="group" aria-label={label}>
            <Field label="Price" error={errors[`${name}.price`]}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.price}
                  onChange={(event) => update(index, { price: event.target.value })}
                />
              )}
            </Field>
            <Field label="Quantity" error={errors[`${name}.quantity`]}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.quantity}
                  onChange={(event) => update(index, { quantity: event.target.value })}
                />
              )}
            </Field>
            <Field label="Time" error={errors[`${name}.time`]}>
              {(control) => (
                <Input
                  {...control}
                  type="datetime-local"
                  step={1}
                  value={row.time}
                  onChange={(event) => update(index, { time: event.target.value })}
                />
              )}
            </Field>
            <Field label="Note" error={errors[`${name}.note`]} className="fill-note">
              {(control) => (
                <Input
                  {...control}
                  placeholder="Optional"
                  value={row.note}
                  onChange={(event) => update(index, { note: event.target.value })}
                />
              )}
            </Field>
            <Button
              className="fill-remove"
              aria-label={`Remove ${label.toLowerCase()}`}
              disabled={rows.length === 1}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        )
      })}
      <Button onClick={() => onChange([...rows, blankRow()])}>+ Add {kind}</Button>
    </fieldset>
  )
}

type Props = {
  entries: FillRow[]
  exits: FillRow[]
  errors: FormErrors
  onEntries: (rows: FillRow[]) => void
  onExits: (rows: FillRow[]) => void
}

export function FillsEditor({ entries, exits, errors, onEntries, onExits }: Props) {
  return (
    <div className="fills">
      <FillGroup kind="entry" rows={entries} errors={errors} onChange={onEntries} />
      <FillGroup kind="exit" rows={exits} errors={errors} onChange={onExits} />
      {errors.fills ? <p className="field-error">{errors.fills}</p> : null}
    </div>
  )
}
