import { useState } from 'react'

import { useAccountArchive, useAccounts, useFeeProfiles, useSaveAccount } from '../../api/queries'
import { Button, EmptyState, ErrorState, Field, Input, LoadingState, Panel, Select } from '../../components'
import { money } from '../../lib/format'
import {
  accountFormFrom,
  accountPayload,
  emptyAccountForm,
  validateAccount,
} from '../../lib/settingsForms'
import { EditorShell } from './EditorShell'
import { EntityList, EntityRow } from './EntityList'
import { useEntityForm } from './useEntityForm'

export default function AccountsTab() {
  const accounts = useAccounts(true)
  const profiles = useFeeProfiles(true)
  const archive = useAccountArchive()
  const [editing, setEditing] = useState(null)

  if (accounts.isPending || profiles.isPending) return <LoadingState what="your accounts" />
  if (accounts.isError) return <ErrorState what="your accounts" error={accounts.error} onRetry={() => void accounts.refetch()} />
  if (profiles.isError) return <ErrorState what="your fee profiles" error={profiles.error} onRetry={() => void profiles.refetch()} />

  const editingAccount = typeof editing === 'number' ? accounts.data.find((account) => account.id === editing) : undefined

  return (
    <>
      {editing !== null ? (
        <AccountEditor
          key={editing}
          account={editingAccount ?? null}
          profiles={profiles.data}
          onDone={() => setEditing(null)}
        />
      ) : null}
      <Panel
        title="Accounts"
        note="Each trade belongs to one account. Its fee profile prices the fees on every trade you log."
        actions={
          editing === null ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add account
            </Button>
          ) : null
        }
      >
        {accounts.data.length === 0 ? (
          <EmptyState title="No accounts yet">
            <p>Add the account you trade on, with the balance it started with, so the equity curve has a baseline.</p>
          </EmptyState>
        ) : (
          <EntityList label="Accounts">
            {accounts.data.map((account) => (
              <EntityRow
                key={account.id}
                title={`${account.name}${account.label ? ` ${account.label}` : ''}`}
                archived={account.archived_at !== null}
                meta={<AccountMeta account={account} profiles={profiles.data} />}
                actions={
                  <>
                    <Button aria-label={`Edit ${account.name}`} onClick={() => setEditing(account.id)}>
                      Edit
                    </Button>
                    <Button
                      aria-label={`${account.archived_at ? 'Unarchive' : 'Archive'} ${account.name}`}
                      disabled={archive.isPending}
                      onClick={() => archive.mutate({ id: account.id, archive: account.archived_at === null })}
                    >
                      {account.archived_at ? 'Unarchive' : 'Archive'}
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

function AccountMeta({ account, profiles }) {
  const profile = profiles.find((item) => item.id === account.fee_profile_id)
  const source = [account.broker_name, account.route].filter(Boolean).join(' · ')
  return (
    <p>
      {source ? `${source} · ` : ''}
      Starting balance <span className="mono">{money(account.starting_balance, { currency: account.currency })}</span> ·{' '}
      {profile ? `Fee profile ${profile.name}` : 'No fee profile, so fees count as 0'}
    </p>
  )
}

function AccountEditor({ account, profiles, onDone }) {
  const save = useSaveAccount(account?.id)
  const entity = useEntityForm(
    account ? accountFormFrom(account) : emptyAccountForm(),
    validateAccount,
    (form) => save.mutateAsync(accountPayload(form)),
    onDone,
  )
  const { form, patch, errors } = entity

  return (
    <EditorShell
      title={account ? `Edit ${account.name}` : 'Add an account'}
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
        <Field label="Label" hint="Optional, like an account number.">
          {(control) => <Input {...control} value={form.label} onChange={(event) => patch({ label: event.target.value })} />}
        </Field>
        <Field label="Broker">
          {(control) => (
            <Input {...control} value={form.brokerName} onChange={(event) => patch({ brokerName: event.target.value })} />
          )}
        </Field>
        <Field label="Route" hint="Optional, where orders are sent.">
          {(control) => <Input {...control} value={form.route} onChange={(event) => patch({ route: event.target.value })} />}
        </Field>
        <Field
          label="Starting balance"
          hint={account ? 'Changing this moves the equity curve of every trade on the account.' : undefined}
          error={errors.startingBalance}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              autoComplete="off"
              value={form.startingBalance}
              onChange={(event) => patch({ startingBalance: event.target.value })}
            />
          )}
        </Field>
        <Field label="Currency" error={errors.currency}>
          {(control) => (
            <Input {...control} maxLength={3} value={form.currency} onChange={(event) => patch({ currency: event.target.value })} />
          )}
        </Field>
        <Field label="Fee profile" hint="Prices the fees on each trade. Manage profiles in the Fee profiles tab.">
          {(control) => (
            <Select {...control} value={form.feeProfileId} onChange={(event) => patch({ feeProfileId: event.target.value })}>
              <option value="">No fee profile</option>
              {profiles
                .filter((profile) => !profile.archived_at || String(profile.id) === form.feeProfileId)
                .map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.archived_at ? ' (archived)' : ''}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </div>
    </EditorShell>
  )
}
