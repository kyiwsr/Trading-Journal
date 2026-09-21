import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useCreateSetup, useSetup, useSetupArchive, useUpdateSetup } from '../api/queries'
import type { Setup } from '../api/types'
import { Button, Card, ErrorState, Field, Input, LoadingState, Panel, Textarea } from '../components'
import {
  blankCriterion,
  criteriaPayload,
  emptySetupForm,
  moveCriterion,
  setupFormFromApi,
  textOrNull,
  validateSetupForm,
  weightTotal,
  type SetupFormState,
} from '../lib/setupForm'
import type { FormErrors } from '../lib/tradeForm'
import { readScope, scopeSearch } from '../lib/urlState'
import { useLeaveGuard } from '../lib/useLeaveGuard'

export default function SetupEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const search = scopeSearch(readScope(params))
  const setupId = id === undefined ? undefined : Number(id)
  const isEdit = setupId !== undefined
  const setup = useSetup(setupId ?? 0)

  if (isEdit && !Number.isInteger(setupId)) {
    return <ErrorState what="the setup" error={new ApiError(404, 'There is no setup with that number.')} />
  }
  if (isEdit && setup.isError) {
    const missing = setup.error instanceof ApiError && setup.error.status === 404
    return (
      <>
        <ErrorState what="the setup" error={setup.error} onRetry={missing ? undefined : () => void setup.refetch()} />
        <p>
          <Link to={{ pathname: '/setups', search }}>Back to the playbook</Link>
        </p>
      </>
    )
  }
  if (isEdit && !setup.data) return <LoadingState what="the setup" />

  return <SetupEditorBody key={setupId ?? 'new'} setup={setup.data ?? null} search={search} />
}

const criterionKey = (index: number, field: 'label' | 'weight') => `criteria.${index}.${field}`

function SetupEditorBody({ setup, search }: { setup: Setup | null; search: string }) {
  const navigate = useNavigate()
  const isEdit = setup !== null
  const create = useCreateSetup()
  const update = useUpdateSetup(setup?.id ?? 0)
  const archive = useSetupArchive()

  const [initial] = useState<SetupFormState>(() => (setup ? setupFormFromApi(setup) : emptySetupForm()))
  const [form, setForm] = useState(initial)
  const baseline = useMemo(() => JSON.stringify(initial), [initial])
  const dirty = JSON.stringify(form) !== baseline
  const guard = useLeaveGuard(dirty, 'setup')

  const [attempted, setAttempted] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)
  const [apiProblems, setApiProblems] = useState<string[]>([])
  const summaryRef = useRef<HTMLDivElement>(null)

  const errors: FormErrors = attempted ? validateSetupForm(form) : {}
  const problems = [...Object.values(errors), ...apiProblems]
  const total = weightTotal(form.criteria)
  const busy = create.isPending || update.isPending || archive.isPending

  useEffect(() => {
    if (submitCount > 0) summaryRef.current?.focus()
  }, [submitCount])

  const patch = (change: Partial<SetupFormState>) => setForm((current) => ({ ...current, ...change }))
  const changeRow = (index: number, change: { label?: string; weight?: string }) =>
    patch({ criteria: form.criteria.map((row, i) => (i === index ? { ...row, ...change } : row)) })

  const leaveTo = (pathname: string) => {
    guard.allowLeave()
    navigate({ pathname, search })
  }

  const fail = (error: unknown) => {
    setApiProblems([error instanceof ApiError ? error.message : 'The setup could not be saved. Try again.'])
    setSubmitCount((count) => count + 1)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setApiProblems([])
    if (Object.keys(validateSetupForm(form)).length > 0) {
      setSubmitCount((count) => count + 1)
      return
    }
    const fields = { name: form.name.trim(), subtitle: textOrNull(form.subtitle), description: textOrNull(form.description) }
    try {
      if (setup) await update.mutateAsync({ fields, criteria: criteriaPayload(form) })
      else await create.mutateAsync({ ...fields, criteria: criteriaPayload(form) })
      leaveTo('/setups')
    } catch (error) {
      fail(error)
    }
  }

  const toggleArchive = async (archived: boolean) => {
    if (!setup) return
    setApiProblems([])
    try {
      await archive.mutateAsync({ id: setup.id, archive: !archived })
      leaveTo('/setups')
    } catch (error) {
      fail(error)
    }
  }

  const archived = setup?.archived_at != null

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumbs">
            <Link to={{ pathname: '/setups', search }}>Skill Playbook</Link> / {isEdit ? setup.name : 'New setup'}
          </p>
          <h1 className="page-title">{isEdit ? 'Edit setup' : 'New setup'}</h1>
        </div>
      </div>

      {archived ? (
        <Card tone="quest" className="setup-archived">
          <p>
            <strong>This setup is archived.</strong> Trades that used it keep it, but it is hidden from the trade form.
          </p>
          <Button disabled={busy} onClick={() => void toggleArchive(true)}>
            Unarchive setup
          </Button>
        </Card>
      ) : null}

      <form onSubmit={submit} noValidate className="setup-form">
        {(attempted || apiProblems.length > 0) && problems.length > 0 ? (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="form-error tf-summary">
            <p className="tf-summary-title">
              {problems.length === 1 ? 'One problem to fix before saving' : `${problems.length} problems to fix before saving`}
            </p>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Panel title="Setup">
          <div className="tf-fields">
            <Field label="Name" hint="Use your own words." error={errors.name}>
              {(control) => (
                <Input {...control} value={form.name} onChange={(event) => patch({ name: event.target.value })} />
              )}
            </Field>
            <Field label="Subtitle" hint="Optional, shown under the name.">
              {(control) => (
                <Input {...control} value={form.subtitle} onChange={(event) => patch({ subtitle: event.target.value })} />
              )}
            </Field>
          </div>
          <Field label="Description" className="setup-description">
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
              />
            )}
          </Field>
        </Panel>

        <Panel
          title="Checklist"
          note="Each rule is worth points. A trade's score is the points of the rules you ticked, as a share of all the points."
        >
          {form.criteria.length === 0 ? (
            <p className="muted">No rules yet. Trades on this setup cannot be scored until you add some.</p>
          ) : (
            <ol className="builder">
              {form.criteria.map((row, index) => {
                const name = `Rule ${index + 1}`
                return (
                  <li key={row.key} className="builder-row" role="group" aria-label={name}>
                    <div className="builder-move">
                      <Button
                        aria-label={`Move rule ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => patch({ criteria: moveCriterion(form.criteria, index, -1) })}
                      >
                        Up
                      </Button>
                      <Button
                        aria-label={`Move rule ${index + 1} down`}
                        disabled={index === form.criteria.length - 1}
                        onClick={() => patch({ criteria: moveCriterion(form.criteria, index, 1) })}
                      >
                        Down
                      </Button>
                    </div>
                    <Field label="Rule" error={errors[criterionKey(index, 'label')]} className="builder-label">
                      {(control) => (
                        <Input
                          {...control}
                          placeholder="Waited for the retest"
                          value={row.label}
                          onChange={(event) => changeRow(index, { label: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Points" error={errors[criterionKey(index, 'weight')]} className="builder-weight">
                      {(control) => (
                        <Input
                          {...control}
                          inputMode="decimal"
                          autoComplete="off"
                          value={row.weight}
                          onChange={(event) => changeRow(index, { weight: event.target.value })}
                        />
                      )}
                    </Field>
                    <Button
                      aria-label={`Remove rule ${index + 1}`}
                      onClick={() => patch({ criteria: form.criteria.filter((_, i) => i !== index) })}
                    >
                      Remove
                    </Button>
                  </li>
                )
              })}
            </ol>
          )}

          <div className="builder-foot">
            <Button onClick={() => patch({ criteria: [...form.criteria, blankCriterion()] })}>+ Add rule</Button>
            <p role="status" className={total.equals(100) || total.isZero() ? 'weight-total' : 'weight-total weight-total-off'}>
              {total.isZero()
                ? 'Total: 0 pts'
                : total.equals(100)
                  ? 'Total: 100 pts'
                  : `Total: ${total.toString()} pts. The rules do not add up to 100. That is allowed; each rule's share of the total sets the score.`}
            </p>
          </div>
        </Panel>

        <div className="tf-actions">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving' : isEdit ? 'Save changes' : 'Create setup'}
          </Button>
          <Link className="btn" to={{ pathname: '/setups', search }}>
            Cancel
          </Link>
          {isEdit && !archived ? (
            <Button disabled={busy} onClick={() => void toggleArchive(false)}>
              Archive setup
            </Button>
          ) : null}
        </div>
        {isEdit && !archived ? (
          <p className="field-hint">
            Archive a setup instead of deleting it: trades that used it keep their history, and it disappears from the
            trade form.
          </p>
        ) : null}
      </form>

      {guard.dialog}
    </>
  )
}
