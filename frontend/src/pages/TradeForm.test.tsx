import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { FeeProfile, Instrument, Settings, Setup } from '../api/types'
import { account, dashboard, tradeList, trade71 } from '../test/fixtures'
import { renderApp, type Routes } from '../test/renderApp'

const nq: Instrument = {
  id: 1,
  symbol: 'NQ',
  name: 'E-mini Nasdaq',
  tick_size: '0.25',
  tick_value: '5',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

const perFillTariff: FeeProfile = {
  id: 9,
  name: 'Example tariff',
  notes: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  components: [
    { id: 1, name: 'Exchange fee', amount: '1.60', basis: 'per_fill' },
    { id: 2, name: 'Broker commission', amount: '2.00', basis: 'per_fill' },
    { id: 3, name: 'Regulatory fee', amount: '0.06', basis: 'per_fill' },
  ],
}

const exchangeOnly: FeeProfile = { ...perFillTariff, components: [perFillTariff.components[0]] }

const sweepScalp: Setup = {
  id: 4,
  name: 'Sweep scalp',
  subtitle: 'Liquidity sweep',
  description: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  criteria: trade71.criteria.map((c, order) => ({ id: c.criterion_id, label: c.label, weight: c.weight, display_order: order })),
}

const settings: Settings = {
  compliance_cutoff: 80,
  bands: { elite_min: 85, solid_min: 70, sub_optimal_min: 60 },
  low_sample_threshold: 20,
  elite_setup_min: 90,
}

function routes(overrides: Routes = {}, tariff: FeeProfile = perFillTariff): Routes {
  return {
    '/accounts': { body: [{ ...account, fee_profile_id: tariff.id }] },
    '/instruments': { body: [nq] },
    '/fee-profiles': { body: [tariff] },
    '/setups': { body: [sweepScalp] },
    '/settings': { body: settings },
    '/dashboard': { body: dashboard },
    '/trades': (_url, init) => (init?.method === 'POST' ? { status: 201, body: trade71 } : { body: tradeList }),
    '/trades/71': { body: trade71 },
    ...overrides,
  }
}

const fill = (group: string) => within(screen.getByRole('group', { name: group }))

function enterFill(group: string, values: { price: string; quantity: string; time: string; note?: string }) {
  const row = fill(group)
  fireEvent.change(row.getByLabelText('Price'), { target: { value: values.price } })
  fireEvent.change(row.getByLabelText('Quantity'), { target: { value: values.quantity } })
  fireEvent.change(row.getByLabelText('Time'), { target: { value: values.time } })
  if (values.note) fireEvent.change(row.getByLabelText('Note'), { target: { value: values.note } })
}

async function openNewTrade(overrides?: Routes, tariff?: FeeProfile) {
  const view = renderApp('/trades/new', routes(overrides, tariff), { signedIn: true })
  await screen.findByRole('heading', { name: 'Log a trade' })
  await userEvent.selectOptions(screen.getByLabelText('Instrument'), '1')
  return view
}

async function enterTrade71() {
  await userEvent.selectOptions(screen.getByLabelText('Setup'), '4')
  fireEvent.change(screen.getByLabelText('Stop price'), { target: { value: '20372.75' } })
  enterFill('Entry 1', { price: '20380.25', quantity: '1', time: '2026-09-08T09:35:12', note: 'Initial probe' })
  await userEvent.click(screen.getByRole('button', { name: '+ Add entry' }))
  enterFill('Entry 2', { price: '20377.75', quantity: '1', time: '2026-09-08T09:38:40' })
  enterFill('Exit 1', { price: '20391.00', quantity: '1', time: '2026-09-08T09:52:10', note: 'TP1' })
  await userEvent.click(screen.getByRole('button', { name: '+ Add exit' }))
  enterFill('Exit 2', { price: '20397.25', quantity: '1', time: '2026-09-08T10:14:08' })
}

const preview = () => within(screen.getByRole('region', { name: 'Live result' }))

describe('Log a trade', () => {
  it('shows the API numbers for Trade #71 while it is typed in by hand', async () => {
    await openNewTrade()
    await enterTrade71()
    for (const label of [trade71.criteria[0], trade71.criteria[1], trade71.criteria[2], trade71.criteria[4]]) {
      await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(label.label) }))
    }

    const live = preview()
    expect(live.getByText('+$590.36')).toBeInTheDocument()
    expect(live.getByText('20,379.00')).toBeInTheDocument()
    expect(live.getByText('20,394.13')).toBeInTheDocument()
    expect(live.getByText('+$605.00')).toBeInTheDocument()
    expect(live.getByText('-$6.40')).toBeInTheDocument()
    expect(live.getByText('-$8.00')).toBeInTheDocument()
    expect(live.getByText('-$0.24')).toBeInTheDocument()
    expect(live.getByText('$250.00')).toBeInTheDocument()
    expect(live.getByText('+2.36R')).toBeInTheDocument()
    expect(live.getByText('85%')).toBeInTheDocument()
    expect(live.getByText('Elite')).toBeInTheDocument()
  })

  it('saves the payload the API expects and opens the saved trade', async () => {
    let body: Record<string, unknown> = {}
    const { router } = await openNewTrade({
      '/trades': (_url, init) => {
        if (init?.method !== 'POST') return { body: tradeList }
        body = JSON.parse(String(init.body))
        return { status: 201, body: trade71 }
      },
    })
    await enterTrade71()
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(trade71.criteria[0].label) }))
    await userEvent.click(screen.getByRole('button', { name: 'Save trade' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/trades/71'))
    expect(body).toMatchObject({
      account_id: 1,
      instrument_id: 1,
      setup_id: 4,
      direction: 'long',
      stop_price: '20372.75',
      slippage_ticks: '0',
    })
    expect((body.fills as unknown[]).length).toBe(4)
    expect((body.criteria_checks as { checked: boolean }[]).filter((check) => check.checked)).toHaveLength(1)
    expect((body.criteria_checks as unknown[]).length).toBe(5)
  })

  it('prices a scale-in with a single exit, and counts fees per fill', async () => {
    await openNewTrade({}, exchangeOnly)
    enterFill('Entry 1', { price: '20000', quantity: '1', time: '2026-09-08T09:00:00' })
    await userEvent.click(screen.getByRole('button', { name: '+ Add entry' }))
    enterFill('Entry 2', { price: '20010', quantity: '1', time: '2026-09-08T09:05:00' })
    enterFill('Exit 1', { price: '20020', quantity: '2', time: '2026-09-08T09:30:00' })

    expect(preview().getByText('+$600.00')).toBeInTheDocument()
    expect(preview().getByText('20,005.00')).toBeInTheDocument()
    expect(preview().getByText('-$4.80')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '+ Add exit' }))
    enterFill('Exit 1', { price: '20020', quantity: '1', time: '2026-09-08T09:30:00' })
    enterFill('Exit 2', { price: '20020', quantity: '1', time: '2026-09-08T09:31:00' })
    expect(preview().getByText('-$6.40')).toBeInTheDocument()
    expect(preview().getAllByText('+$600.00').length).toBeGreaterThan(0)
  })

  it('updates the score as checklist items are ticked and unticked', async () => {
    await openNewTrade()
    await userEvent.selectOptions(screen.getByLabelText('Setup'), '4')
    expect(preview().getByText('0%')).toBeInTheDocument()

    const first = screen.getByRole('checkbox', { name: new RegExp(trade71.criteria[0].label) })
    await userEvent.click(first)
    expect(preview().getByText('25%')).toBeInTheDocument()
    await userEvent.click(first)
    expect(preview().getByText('0%')).toBeInTheDocument()
  })

  it('keeps a note when a box is ticked and unticked', async () => {
    await openNewTrade()
    await userEvent.selectOptions(screen.getByLabelText('Setup'), '4')
    const evidence = screen.getByLabelText(`Evidence for ${trade71.criteria[0].label}`)
    await userEvent.type(evidence, 'Swept at 09:32')
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(trade71.criteria[0].label) }))
    expect(evidence).toHaveValue('Swept at 09:32')
    expect(screen.getByRole('checkbox', { name: new RegExp(trade71.criteria[0].label) })).toBeChecked()
  })

  it('lists every problem when an empty form is submitted, and does not call the API', async () => {
    const { calls } = await openNewTrade()
    await userEvent.click(screen.getByRole('button', { name: 'Save trade' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/problems to fix/i)).toBeInTheDocument()
    expect(within(alert).getByText(/Entry 1 price/)).toBeInTheDocument()
    expect(alert).toHaveFocus()
    expect(calls.some((call) => call.startsWith('POST /trades'))).toBe(false)
  })

  it('rejects entry and exit quantities that differ', async () => {
    await openNewTrade()
    enterFill('Entry 1', { price: '100', quantity: '2', time: '2026-09-08T09:00:00' })
    enterFill('Exit 1', { price: '101', quantity: '1', time: '2026-09-08T09:30:00' })
    await userEvent.click(screen.getByRole('button', { name: 'Save trade' }))
    expect(await screen.findAllByText(/must match/i)).not.toHaveLength(0)
  })

  it('shows the API 422 message beside the row it belongs to', async () => {
    await openNewTrade({
      '/trades': (_url, init) =>
        init?.method === 'POST'
          ? {
              status: 422,
              body: { detail: [{ loc: ['body', 'fills', 0, 'price'], msg: 'Input should be greater than 0', type: 'x' }] },
            }
          : { body: tradeList },
    })
    await enterTrade71()
    await userEvent.click(screen.getByRole('button', { name: 'Save trade' }))
    expect(await within(fill('Entry 1').getByLabelText('Price').closest('.field') as HTMLElement).findByText(/greater than 0/)).toBeInTheDocument()
  })

  it('asks before discarding unsaved changes', async () => {
    const { router } = await openNewTrade()
    await userEvent.type(screen.getByLabelText('Session'), 'NY open')
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }))

    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/trades/new')

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/trades'))
  })

  it('leaves without asking when nothing changed', async () => {
    const { router } = renderApp('/trades/new', routes(), { signedIn: true })
    await screen.findByRole('heading', { name: 'Log a trade' })
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/trades'))
  })

  it('points a brand-new user to Settings when there is no account or instrument', async () => {
    renderApp('/trades/new', routes({ '/accounts': { body: [] }, '/instruments': { body: [] } }), { signedIn: true })
    expect(await screen.findByText('Set up an account and an instrument first')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an account' })).toHaveAttribute('href', expect.stringContaining('/settings/accounts'))
    expect(screen.getByRole('link', { name: 'Add an instrument' })).toHaveAttribute('href', expect.stringContaining('/settings/instruments'))
  })

  it('warns when the account has no fee profile', async () => {
    renderApp('/trades/new', routes({ '/accounts': { body: [{ ...account, fee_profile_id: null }] } }), { signedIn: true })
    await screen.findByRole('heading', { name: 'Log a trade' })
    await userEvent.selectOptions(screen.getByLabelText('Instrument'), '1')
    enterFill('Entry 1', { price: '100', quantity: '1', time: '2026-09-08T09:00:00' })
    enterFill('Exit 1', { price: '101', quantity: '1', time: '2026-09-08T09:30:00' })
    expect(preview().getByText(/has no fee profile/i)).toBeInTheDocument()
  })
})

describe('Edit trade', () => {
  it('loads the saved trade and saves changes with PUT', async () => {
    const methods: string[] = []
    const { router } = renderApp(
      '/trades/71/edit',
      routes({
        '/trades/71': (_url, init) => {
          methods.push(init?.method ?? 'GET')
          return { body: trade71 }
        },
      }),
      { signedIn: true },
    )
    await screen.findByRole('heading', { name: 'Edit trade' })
    expect(screen.getByLabelText('Stop price')).toHaveValue('20372.75')
    expect(fill('Entry 1').getByLabelText('Price')).toHaveValue('20380.25')
    expect(fill('Exit 2').getByLabelText('Price')).toHaveValue('20397.25')
    expect(screen.getByRole('checkbox', { name: new RegExp(trade71.criteria[3].label) })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: new RegExp(trade71.criteria[0].label) })).toBeChecked()
    expect(preview().getByText('+$590.36')).toBeInTheDocument()
    expect(screen.getByText(/recalculated from Example tariff/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(methods).toContain('PUT'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/trades/71'))
  })
})
