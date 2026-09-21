import Decimal from 'decimal.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import {
  useAccounts,
  useFeeProfiles,
  useInstruments,
  useSaveTrade,
  useSettings,
  useSetups,
  useTrade,
} from '../api/queries'
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Panel,
  Segmented,
  Select,
  Textarea,
} from '../components'
import { priceDecimals } from '../lib/format'
import {
  buildPayload,
  emptyForm,
  formFromTrade,
  issuesToErrors,
  validateForm,
} from '../lib/tradeForm'
import {
  applyFees,
  computeTrade,
  DEFAULT_BAND_THRESHOLDS,
  executionScore,
  parseApiDecimal,
  parseDecimal,
  scoreBand,
  totalFees,
} from '../lib/tradeMath'
import { readScope, scopeSearch } from '../lib/urlState'
import { useLeaveGuard } from '../lib/useLeaveGuard'
import { ChecklistSection } from './trade-form/ChecklistSection'
import { FillsEditor } from './trade-form/FillsEditor'
import { PreviewPanel } from './trade-form/PreviewPanel'
import { ScreenshotField } from './trade-form/ScreenshotField'

const SIDES = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
]

const FIELD_LABELS = {
  account: 'Account',
  instrument: 'Instrument',
  setup: 'Setup',
  session: 'Session',
  tags: 'Tags',
  stop: 'Stop price',
  target: 'Target price',
  slippage: 'Slippage',
  fills: 'Fills',
}

function fieldLabel(key) {
  const fill = /^(entry|exit)\.(\d+)\.(price|quantity|time|note)$/.exec(key)
  if (fill) return `${fill[1] === 'entry' ? 'Entry' : 'Exit'} ${Number(fill[2]) + 1} ${fill[3]}`
  return FIELD_LABELS[key] ?? key
}

const accountName = (account) => `${account.name}${account.label ? ` ${account.label}` : ''}`

export default function TradeForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const scope = readScope(params)
  const search = scopeSearch(scope)
  const tradeId = id === undefined ? undefined : Number(id)
  const isEdit = tradeId !== undefined

  const accounts = useAccounts(isEdit)
  const instruments = useInstruments(isEdit)
  const feeProfiles = useFeeProfiles(true)
  const setups = useSetups(true)
  const trade = useTrade(tradeId ?? 0)

  if (isEdit && !Number.isInteger(tradeId)) {
    return <ErrorState what="the trade" error={new ApiError(404, 'There is no trade with that number.')} />
  }

  const queries = [accounts, instruments, feeProfiles, setups]
  const failed = queries.find((query) => query.isError) ?? (isEdit && trade.isError ? trade : undefined)
  if (failed) {
    const missing = failed.error instanceof ApiError && failed.error.status === 404
    return (
      <>
        <ErrorState
          what={isEdit ? `trade #${tradeId}` : 'the form data'}
          error={failed.error}
          onRetry={missing ? undefined : () => void failed.refetch()}
        />
        <p>
          <Link to={{ pathname: '/trades', search }}>Back to the ledger</Link>
        </p>
      </>
    )
  }
  const current = trade.data ?? null
  if (!accounts.data || !instruments.data || !feeProfiles.data || !setups.data || (isEdit && current === null)) {
    return <LoadingState what={isEdit ? `trade #${tradeId}` : 'the trade form'} />
  }

  const activeAccounts = accounts.data.filter((account) => !account.archived_at)
  const activeInstruments = instruments.data.filter((instrument) => !instrument.archived_at)
  if (!isEdit && (activeAccounts.length === 0 || activeInstruments.length === 0)) {
    return (
      <Panel title="Log a trade">
        <EmptyState title="Set up an account and an instrument first">
          <p>
            A trade needs the account it belongs to and the instrument it traded, so the ledger can price it. Add
            {activeAccounts.length === 0 ? ' an account' : ''}
            {activeAccounts.length === 0 && activeInstruments.length === 0 ? ' and' : ''}
            {activeInstruments.length === 0 ? ' an instrument' : ''} in Settings, then come back.
          </p>
          <p>
            {activeAccounts.length === 0 ? (
              <Link to={{ pathname: '/settings/accounts', search }}>Add an account</Link>
            ) : null}
            {activeAccounts.length === 0 && activeInstruments.length === 0 ? ' · ' : ''}
            {activeInstruments.length === 0 ? (
              <Link to={{ pathname: '/settings/instruments', search }}>Add an instrument</Link>
            ) : null}
          </p>
        </EmptyState>
      </Panel>
    )
  }

  const scoped = activeAccounts.find((account) => String(account.id) === scope.account)
  return (
    <TradeFormBody
      key={isEdit ? tradeId : 'new'}
      trade={current}
      accounts={accounts.data}
      instruments={instruments.data}
      feeProfiles={feeProfiles.data}
      setups={setups.data}
      defaultAccountId={String((scoped ?? activeAccounts[0])?.id ?? '')}
      search={search}
    />
  )
}

function TradeFormBody({ trade, accounts, instruments, feeProfiles, setups, defaultAccountId, search }) {
  const navigate = useNavigate()
  const isEdit = trade !== null
  const settings = useSettings()
  const save = useSaveTrade(trade?.id)

  const [initial] = useState(() =>
    trade ? formFromTrade(trade, setups.find((setup) => setup.id === trade.setup?.id) ?? null) : emptyForm({ accountId: defaultAccountId }),
  )
  const [form, setForm] = useState(initial)
  const baseline = useMemo(() => JSON.stringify(initial), [initial])
  const dirty = JSON.stringify(form) !== baseline

  const [attempted, setAttempted] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)
  const [apiErrors, setApiErrors] = useState({})
  const [apiSummary, setApiSummary] = useState([])
  const summaryRef = useRef(null)

  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }))

  const instrument = instruments.find((item) => String(item.id) === form.instrumentId) ?? null
  const account = accounts.find((item) => String(item.id) === form.accountId) ?? null
  const profile = feeProfiles.find((item) => item.id === account?.fee_profile_id) ?? null
  const setup = setups.find((item) => String(item.id) === form.setupId) ?? null

  const thresholds = useMemo(
    () =>
      settings.data
        ? {
            elite: settings.data.bands.elite_min,
            solid: settings.data.bands.solid_min,
            sub_optimal: settings.data.bands.sub_optimal_min,
          }
        : DEFAULT_BAND_THRESHOLDS,
    [settings.data],
  )

  const live = useMemo(() => {
    const fills = []
    for (const [type, rows] of [['entry', form.entries], ['exit', form.exits]]) {
      for (const row of rows) {
        const price = parseDecimal(row.price)
        const quantity = parseDecimal(row.quantity)
        if (price?.greaterThan(0) && quantity?.greaterThan(0)) fills.push({ type, price, quantity })
      }
    }
    const tickSize = instrument ? parseApiDecimal(instrument.tick_size) : null
    const tickValue = instrument ? parseApiDecimal(instrument.tick_value) : null
    const feeLines = profile
      ? applyFees(
          profile.components.map((component) => ({
            name: component.name,
            amount: parseApiDecimal(component.amount) ?? new Decimal(0),
            basis: component.basis,
          })),
          fills,
        )
      : []
    const stop = parseDecimal(form.stop)
    const slippage = parseDecimal(form.slippageTicks)
    const result =
      tickSize?.greaterThan(0) && tickValue
        ? computeTrade({
            direction: form.direction,
            fills,
            instrument: { tickSize, tickValue },
            stopPrice: stop?.greaterThan(0) ? stop : null,
            feesTotal: totalFees(feeLines),
            slippageTicks: slippage && !slippage.isNegative() ? slippage : new Decimal(0),
          })
        : null
    const score = setup
      ? executionScore(
          setup.criteria.map((criterion) => ({
            weight: parseApiDecimal(criterion.weight) ?? new Decimal(0),
            checked: form.checks[criterion.id]?.checked ?? false,
          })),
        )
      : null
    return { result, feeLines, score, band: scoreBand(score, thresholds) }
  }, [form, instrument, profile, setup, thresholds])

  const clientErrors = useMemo(() => (attempted ? validateForm(form) : {}), [attempted, form])
  const errors = { ...apiErrors, ...clientErrors }
  const problems = [
    ...Object.entries(errors).map(([key, message]) => `${fieldLabel(key)}: ${message}`),
    ...apiSummary,
  ]

  useEffect(() => {
    if (submitCount > 0) summaryRef.current?.focus()
  }, [submitCount])

  const guard = useLeaveGuard(dirty, 'trade')

  const changeSetup = (setupId) => {
    const next = setups.find((item) => String(item.id) === setupId)
    setForm((current) => {
      const checks = {}
      for (const criterion of next?.criteria ?? []) {
        checks[criterion.id] = current.checks[criterion.id] ?? { checked: false, note: '' }
      }
      return { ...current, setupId, checks }
    })
  }

  const changeCheck = (criterionId, patch) =>
    setForm((current) => ({
      ...current,
      checks: {
        ...current.checks,
        [criterionId]: {
          checked: false,
          note: '',
          ...(current.checks[criterionId]),
          ...patch,
        },
      },
    }))

  const submit = async (event) => {
    event.preventDefault()
    setAttempted(true)
    setApiErrors({})
    setApiSummary([])
    if (Object.keys(validateForm(form)).length > 0) {
      setSubmitCount((count) => count + 1)
      return
    }
    try {
      const saved = await save.mutateAsync(buildPayload(form, setup))
      guard.allowLeave()
      navigate({ pathname: `/trades/${saved.id}`, search })
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const mapped = issuesToErrors(error, form.entries.length)
        setApiErrors(mapped.fields)
        setApiSummary(mapped.form)
      } else {
        setApiSummary([error instanceof ApiError ? error.message : 'The trade could not be saved. Try again.'])
      }
      setSubmitCount((count) => count + 1)
    }
  }

  const feeNote = !account
    ? null
    : !profile
      ? `${accountName(account)} has no fee profile, so fees count as 0. Attach one in Settings.`
      : isEdit
        ? `Fees are recalculated from ${profile.name} when you save.`
        : null

  const visibleAccounts = accounts.filter((item) => !item.archived_at || String(item.id) === form.accountId)
  const visibleInstruments = instruments.filter((item) => !item.archived_at || String(item.id) === form.instrumentId)
  const visibleSetups = setups.filter((item) => !item.archived_at || String(item.id) === form.setupId)

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumbs">
            <Link to={{ pathname: '/trades', search }}>Combat Logs</Link> / {isEdit ? `Trade #${trade.id}` : 'New trade'}
          </p>
          <h1 className="page-title">{isEdit ? 'Edit trade' : 'Log a trade'}</h1>
        </div>
      </div>

      <form onSubmit={submit} noValidate>
        {attempted && problems.length > 0 ? (
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

        <div className="tf">
        <Panel title="Trade" className="tf-trade">
          <div className="tf-fields">
            <Field label="Account" error={errors.account}>
              {(control) => (
                <Select {...control} value={form.accountId} onChange={(event) => set('accountId', event.target.value)}>
                  <option value="">Choose an account</option>
                  {visibleAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {accountName(item)}
                      {item.archived_at ? ' (archived)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Instrument" error={errors.instrument}>
              {(control) => (
                <Select
                  {...control}
                  value={form.instrumentId}
                  onChange={(event) => set('instrumentId', event.target.value)}
                >
                  <option value="">Choose an instrument</option>
                  {visibleInstruments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.symbol}
                      {item.name ? ` ${item.name}` : ''}
                      {item.archived_at ? ' (archived)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="field">
              <span className="field-label">Direction</span>
              <Segmented
                label="Direction"
                options={[...SIDES]}
                value={form.direction}
                onChange={(direction) => set('direction', direction)}
              />
            </div>
            <Field label="Setup" hint="Optional. Choosing one adds its checklist below." error={errors.setup}>
              {(control) => (
                <Select {...control} value={form.setupId} onChange={(event) => changeSetup(event.target.value)}>
                  <option value="">No setup</option>
                  {visibleSetups.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.subtitle ? ` (${item.subtitle})` : ''}
                      {item.archived_at ? ' (archived)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Session" error={errors.session}>
              {(control) => (
                <Input
                  {...control}
                  placeholder="NY open"
                  value={form.session}
                  onChange={(event) => set('session', event.target.value)}
                />
              )}
            </Field>
            <Field label="Tags" hint="Separate with commas." error={errors.tags}>
              {(control) => (
                <Input
                  {...control}
                  placeholder="5m MSS, Runner"
                  value={form.tags}
                  onChange={(event) => set('tags', event.target.value)}
                />
              )}
            </Field>
            <Field label="Stop price" hint="Sets 1R for the R multiple." error={errors.stop}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.stop}
                  onChange={(event) => set('stop', event.target.value)}
                />
              )}
            </Field>
            <Field label="Target price" hint="Optional planned exit." error={errors.target}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.target}
                  onChange={(event) => set('target', event.target.value)}
                />
              )}
            </Field>
            <Field label="Slippage (ticks)" hint="Deducted from net P&L." error={errors.slippage}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={form.slippageTicks}
                  onChange={(event) => set('slippageTicks', event.target.value)}
                />
              )}
            </Field>
          </div>
        </Panel>

        <Panel
          title="Fills"
          className="tf-fills"
          note="Add a row for every fill. Scale-ins and partial exits use the average entry price."
        >
          <FillsEditor
            entries={form.entries}
            exits={form.exits}
            errors={errors}
            onEntries={(rows) => set('entries', rows)}
            onExits={(rows) => set('exits', rows)}
          />
        </Panel>

        <PreviewPanel
          result={live.result}
          feeLines={live.feeLines}
          currency={account?.currency ?? null}
          decimals={instrument ? priceDecimals(instrument.tick_size) : 2}
          score={live.score}
          band={live.band}
          hasSetup={setup !== null}
          feeNote={feeNote}
        />

        {setup ? <ChecklistSection setup={setup} checks={form.checks} search={search} onChange={changeCheck} /> : null}

        <Panel title="Journal" className="tf-journal">
          <div className="tf-notes">
            <Field label="Pre-trade focus">
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  value={form.preTradeFocus}
                  onChange={(event) => set('preTradeFocus', event.target.value)}
                />
              )}
            </Field>
            <Field label="Environment">
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  value={form.environment}
                  onChange={(event) => set('environment', event.target.value)}
                />
              )}
            </Field>
            <Field label="Post-trade debrief">
              {(control) => (
                <Textarea
                  {...control}
                  rows={5}
                  value={form.debriefNotes}
                  onChange={(event) => set('debriefNotes', event.target.value)}
                />
              )}
            </Field>
          </div>
        </Panel>

        <Panel title="Screenshot" className="tf-shot">
          <ScreenshotField
            path={form.screenshotPath}
            savedPath={trade?.screenshot_path ?? null}
            savedUrl={trade?.screenshot_url ?? null}
            onChange={(path) => set('screenshotPath', path)}
          />
        </Panel>

        <div className="tf-actions">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving' : isEdit ? 'Save changes' : 'Save trade'}
          </Button>
          <Link className="btn" to={isEdit ? { pathname: `/trades/${trade.id}`, search } : { pathname: '/trades', search }}>
            Cancel
          </Link>
        </div>
        </div>
      </form>

      {guard.dialog}
    </>
  )
}
