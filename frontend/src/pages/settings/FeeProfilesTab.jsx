import { useState } from 'react'

import {
  useDeleteFeeProfile,
  useFeeProfileArchive,
  useFeeProfileFromTemplate,
  useFeeProfiles,
  useFeeTemplates,
  useSaveFeeProfile,
} from '../../api/queries'
import { ApiError } from '../../api/client'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Panel,
  Select,
  Textarea,
} from '../../components'
import {
  blankFeeRow,
  emptyFeeProfileForm,
  feeProfileFormFrom,
  feeProfilePayload,
  validateFeeProfile,
} from '../../lib/settingsForms'
import { trimZeros } from '../../lib/tradeForm'
import { EditorShell } from './EditorShell'
import { EntityList, EntityRow } from './EntityList'
import { useEntityForm } from './useEntityForm'

const BASIS_LABEL = { per_fill: 'per fill', per_contract: 'per contract' }

const summary = (components) =>
  components.map((component) => `${component.name} ${trimZeros(component.amount)} ${BASIS_LABEL[component.basis]}`).join(' · ')

export default function FeeProfilesTab() {
  const profiles = useFeeProfiles(true)
  const templates = useFeeTemplates()
  const archive = useFeeProfileArchive()
  const deleteProfile = useDeleteFeeProfile()
  const fromTemplate = useFeeProfileFromTemplate()
  const [editing, setEditing] = useState(null)
  const [copyError, setCopyError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  if (profiles.isPending) return <LoadingState what="your fee profiles" />
  if (profiles.isError) return <ErrorState what="your fee profiles" error={profiles.error} onRetry={() => void profiles.refetch()} />

  const editingProfile = typeof editing === 'number' ? profiles.data.find((profile) => profile.id === editing) : undefined

  const copy = async (template) => {
    setCopyError(null)
    try {
      const created = await fromTemplate.mutateAsync({ template_id: template.id })
      setEditing(created.id)
    } catch (error) {
      setCopyError(error instanceof ApiError ? error.message : 'Could not copy the template.')
    }
  }

  return (
    <>
      {editing !== null ? (
        <FeeProfileEditor key={editing} profile={editingProfile ?? null} onDone={() => setEditing(null)} />
      ) : null}
      <Panel
        title="Fee profiles"
        note="A fee profile is your broker's tariff. Attach one to an account and every trade on it is priced with it."
        actions={
          editing === null ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add fee profile
            </Button>
          ) : null
        }
      >
        {profiles.data.length === 0 ? (
          <EmptyState title="No fee profiles yet">
            <p>Without one, trades on an account count fees as 0. Add your tariff, or copy an example below and change the amounts.</p>
          </EmptyState>
        ) : (
          <EntityList label="Fee profiles">
            {profiles.data.map((profile) => (
              <EntityRow
                key={profile.id}
                title={profile.name}
                archived={profile.archived_at !== null}
                meta={<p>{profile.components.length === 0 ? 'No fee lines yet.' : summary(profile.components)}</p>}
                actions={
                  <>
                    <Button aria-label={`Edit ${profile.name}`} onClick={() => setEditing(profile.id)}>
                      Edit
                    </Button>
                    <Button
                      aria-label={`${profile.archived_at ? 'Unarchive' : 'Archive'} ${profile.name}`}
                      disabled={archive.isPending}
                      onClick={() => archive.mutate({ id: profile.id, archive: profile.archived_at === null })}
                    >
                      {profile.archived_at ? 'Unarchive' : 'Archive'}
                    </Button>
                    <Button
                      variant="destructive"
                      aria-label={`Delete ${profile.name}`}
                      onClick={() => setPendingDelete(profile.id)}
                    >
                      Delete
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
        {deleteProfile.isError ? (
          <p className="form-error" role="alert">
            {deleteProfile.error.message}
          </p>
        ) : null}
      </Panel>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this fee profile?"
        confirmLabel="Delete fee profile"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => deleteProfile.mutate(pendingDelete, { onSuccess: () => setPendingDelete(null) })}
      >
        <p>This removes the fee profile itself. It only works while no account uses it; otherwise archive it instead.</p>
      </ConfirmDialog>

      <Panel title="Start from an example" note="Example templates are illustrations, not any broker's real rates. Copy one, then replace the amounts with your own tariff.">
        {templates.isPending ? (
          <LoadingState what="the examples" />
        ) : templates.isError ? (
          <ErrorState what="the examples" error={templates.error} onRetry={() => void templates.refetch()} />
        ) : (
          <ul className="entity-list" aria-label="Example templates">
            {templates.data.map((template) => (
              <li key={template.id} className="entity">
                <Card tone="tint" className="entity-main template">
                  <p className="entity-title">{template.name}</p>
                  <p className="entity-meta">{template.description}</p>
                  <p className="entity-meta mono">{summary(template.components)}</p>
                </Card>
                <div className="entity-actions">
                  <Button aria-label={`Copy ${template.name}`} disabled={fromTemplate.isPending} onClick={() => void copy(template)}>
                    Copy template
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {copyError ? (
          <p className="form-error" role="alert">
            {copyError}
          </p>
        ) : null}
      </Panel>
    </>
  )
}

function FeeProfileEditor({ profile, onDone }) {
  const save = useSaveFeeProfile(profile?.id)
  const entity = useEntityForm(
    profile ? feeProfileFormFrom(profile) : emptyFeeProfileForm(),
    validateFeeProfile,
    (form) => save.mutateAsync(feeProfilePayload(form)),
    onDone,
  )
  const { form, patch, errors } = entity

  const changeRow = (index, change) =>
    patch({ components: form.components.map((row, i) => (i === index ? { ...row, ...change } : row)) })

  return (
    <EditorShell
      title={profile ? `Edit ${profile.name}` : 'Add a fee profile'}
      problems={entity.problems}
      focusToken={entity.submitCount}
      saving={entity.saving}
      onSubmit={entity.submit}
      onCancel={onDone}
    >
      <div className="tf-fields">
        <Field label="Name" error={errors.name}>
          {(control) => <Input {...control} value={form.name} onChange={(event) => patch({ name: event.target.value })} />}
        </Field>
        <Field label="Notes" hint="Optional.">
          {(control) => (
            <Textarea {...control} rows={2} value={form.notes} onChange={(event) => patch({ notes: event.target.value })} />
          )}
        </Field>
      </div>

      <fieldset className="fill-group">
        <legend className="fill-legend">Fee lines</legend>
        <p className="field-hint">
          Per fill charges the amount once on every fill. Per contract charges it for each contract on every fill.
        </p>
        {form.components.map((row, index) => {
          const name = `Fee line ${index + 1}`
          return (
            <div key={row.key} className="fee-row" role="group" aria-label={name}>
              <Field label="Name" error={errors[`components.${index}.name`]}>
                {(control) => (
                  <Input {...control} value={row.name} onChange={(event) => changeRow(index, { name: event.target.value })} />
                )}
              </Field>
              <Field label="Amount" error={errors[`components.${index}.amount`]}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.amount}
                    onChange={(event) => changeRow(index, { amount: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Charged">
                {(control) => (
                  <Select
                    {...control}
                    value={row.basis}
                    onChange={(event) => changeRow(index, { basis: event.target.value })}
                  >
                    <option value="per_fill">Per fill</option>
                    <option value="per_contract">Per contract</option>
                  </Select>
                )}
              </Field>
              <Button
                aria-label={`Remove fee line ${index + 1}`}
                onClick={() => patch({ components: form.components.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            </div>
          )
        })}
        <Button onClick={() => patch({ components: [...form.components, blankFeeRow()] })}>+ Add fee line</Button>
      </fieldset>
    </EditorShell>
  )
}
