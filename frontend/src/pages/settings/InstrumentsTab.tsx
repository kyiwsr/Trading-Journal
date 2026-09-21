import { useState } from 'react'

import { useInstrumentArchive, useInstruments, useSaveInstrument } from '../../api/queries'
import type { Instrument } from '../../api/types'
import { Button, EmptyState, ErrorState, Field, Input, LoadingState, Panel } from '../../components'
import {
  emptyInstrumentForm,
  instrumentFormFrom,
  instrumentPayload,
  validateInstrument,
  type InstrumentForm,
} from '../../lib/settingsForms'
import { trimZeros } from '../../lib/tradeForm'
import { EditorShell } from './EditorShell'
import { EntityList, EntityRow } from './EntityList'
import { useEntityForm } from './useEntityForm'

type Editing = 'new' | number | null

export default function InstrumentsTab() {
  const instruments = useInstruments(true)
  const archive = useInstrumentArchive()
  const [editing, setEditing] = useState<Editing>(null)

  if (instruments.isPending) return <LoadingState what="your instruments" />
  if (instruments.isError) {
    return <ErrorState what="your instruments" error={instruments.error} onRetry={() => void instruments.refetch()} />
  }

  const editingInstrument = typeof editing === 'number' ? instruments.data.find((item) => item.id === editing) : undefined

  return (
    <>
      {editing !== null ? (
        <InstrumentEditor key={editing} instrument={editingInstrument ?? null} onDone={() => setEditing(null)} />
      ) : null}
      <Panel
        title="Instruments"
        note="What you trade, with the tick size and tick value that turn a price move into money."
        actions={
          editing === null ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add instrument
            </Button>
          ) : null
        }
      >
        {instruments.data.length === 0 ? (
          <EmptyState title="No instruments yet">
            <p>Add the markets you trade. Without one, a trade cannot be priced.</p>
          </EmptyState>
        ) : (
          <EntityList label="Instruments">
            {instruments.data.map((item) => (
              <EntityRow
                key={item.id}
                title={`${item.symbol}${item.name ? ` ${item.name}` : ''}`}
                archived={item.archived_at !== null}
                meta={
                  <p>
                    Tick size <span className="mono">{trimZeros(item.tick_size)}</span> · worth{' '}
                    <span className="mono">{trimZeros(item.tick_value)}</span> per tick, per contract
                  </p>
                }
                actions={
                  <>
                    <Button aria-label={`Edit ${item.symbol}`} onClick={() => setEditing(item.id)}>
                      Edit
                    </Button>
                    <Button
                      aria-label={`${item.archived_at ? 'Unarchive' : 'Archive'} ${item.symbol}`}
                      disabled={archive.isPending}
                      onClick={() => archive.mutate({ id: item.id, archive: item.archived_at === null })}
                    >
                      {item.archived_at ? 'Unarchive' : 'Archive'}
                    </Button>
                  </>
                }
              />
            ))}
          </EntityList>
        )}
        {archive.isError ? (
          <p className="form-error" role="alert">
            {archive.error.message}
          </p>
        ) : null}
      </Panel>
    </>
  )
}

function InstrumentEditor({ instrument, onDone }: { instrument: Instrument | null; onDone: () => void }) {
  const save = useSaveInstrument(instrument?.id)
  const entity = useEntityForm<InstrumentForm>(
    instrument ? instrumentFormFrom(instrument) : emptyInstrumentForm(),
    validateInstrument,
    (form) => save.mutateAsync(instrumentPayload(form)),
    onDone,
  )
  const { form, patch, errors } = entity

  return (
    <EditorShell
      title={instrument ? `Edit ${instrument.symbol}` : 'Add an instrument'}
      problems={entity.problems}
      focusToken={entity.submitCount}
      saving={entity.saving}
      onSubmit={entity.submit}
      onCancel={onDone}
    >
      <div className="tf-fields">
        <Field label="Symbol" error={errors.symbol}>
          {(control) => (
            <Input {...control} placeholder="NQ" value={form.symbol} onChange={(event) => patch({ symbol: event.target.value })} />
          )}
        </Field>
        <Field label="Name" hint="Optional.">
          {(control) => <Input {...control} value={form.name} onChange={(event) => patch({ name: event.target.value })} />}
        </Field>
        <Field label="Tick size" hint="The smallest price step." error={errors.tickSize}>
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.25"
              value={form.tickSize}
              onChange={(event) => patch({ tickSize: event.target.value })}
            />
          )}
        </Field>
        <Field label="Tick value" hint="Money one tick moves for one contract or lot." error={errors.tickValue}>
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              autoComplete="off"
              value={form.tickValue}
              onChange={(event) => patch({ tickValue: event.target.value })}
            />
          )}
        </Field>
      </div>
    </EditorShell>
  )
}
