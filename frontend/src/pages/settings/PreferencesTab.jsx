import { useState } from 'react'

import { ApiError } from '../../api/client'
import { useSaveSettings, useSettings } from '../../api/queries'
import { Button, ErrorState, Field, Input, LoadingState, Panel } from '../../components'
import { scoreBandList } from '../../lib/labels'
import { validateCutoff } from '../../lib/settingsForms'

export default function PreferencesTab() {
  const settings = useSettings()
  if (settings.isPending) return <LoadingState what="your preferences" />
  if (settings.isError) return <ErrorState what="your preferences" error={settings.error} onRetry={() => void settings.refetch()} />
  return <PreferencesForm settings={settings.data} />
}

function PreferencesForm({ settings }) {
  const save = useSaveSettings()
  const [cutoff, setCutoff] = useState(String(settings.compliance_cutoff))
  const [attempted, setAttempted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState(null)

  const error = attempted ? validateCutoff(cutoff) : undefined

  const submit = async (event) => {
    event.preventDefault()
    setAttempted(true)
    setSaved(false)
    setFailure(null)
    if (validateCutoff(cutoff)) return
    try {
      await save.mutateAsync({ compliance_cutoff: Number(cutoff) })
      setSaved(true)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'Could not save. Try again.')
    }
  }

  return (
    <>
      <Panel
        title="Compliance cutoff"
        note="A trade counts as compliant when its checklist score is at or above this percentage."
      >
        <form onSubmit={submit} noValidate className="entity-form">
          <div className="tf-fields">
            <Field label="Cutoff (%)" hint="A whole number from 0 to 100." error={error}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  autoComplete="off"
                  value={cutoff}
                  onChange={(event) => {
                    setCutoff(event.target.value)
                    setSaved(false)
                  }}
                />
              )}
            </Field>
          </div>
          {failure ? (
            <p className="form-error" role="alert">
              {failure}
            </p>
          ) : null}
          <div className="tf-actions">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving' : 'Save cutoff'}
            </Button>
            {saved ? (
              <p role="status" className="saved-note">
                Saved. Compliance on your trades now uses {cutoff}%.
              </p>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title="Score bands" note="Fixed for now. They group each trade's checklist score in the ledger and the discipline panel.">
        <ul className="band-list">
          {scoreBandList(settings.bands).map((item) => (
            <li key={item.band}>
              <strong>{item.label}</strong> <span className="mono">{item.range}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
