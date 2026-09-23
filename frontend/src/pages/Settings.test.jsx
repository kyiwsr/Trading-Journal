import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { account, dashboard } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const settings = {
  compliance_cutoff: 80,
  has_seen_tour: true,
  bands: { elite_min: 85, solid_min: 70, sub_optimal_min: 60 },
  low_sample_threshold: 20,
  elite_setup_min: 90,
}

const template = {
  id: 'example-futures',
  name: 'Example: futures, three fee lines per fill',
  description: 'Exchange, commission and regulatory fee on every fill.',
  components: [
    { name: 'Exchange fee', amount: '1.60', basis: 'per_fill' },
    { name: 'Broker commission', amount: '2.00', basis: 'per_fill' },
  ],
}

const profile = {
  id: 9,
  name: 'Example tariff',
  notes: null,
  archived_at: null,
  created_at: '',
  components: [{ id: 1, name: 'Exchange fee', amount: '1.6000', basis: 'per_fill' }],
}

const nq = { id: 1, symbol: 'NQ', name: 'E-mini Nasdaq', tick_size: '0.25000000', tick_value: '5.00000000', archived_at: null, created_at: '' }

function routes(overrides = {}) {
  return {
    '/accounts': { body: [{ ...account, fee_profile_id: 9 }] },
    '/instruments': { body: [nq] },
    '/fee-profiles': { body: [profile] },
    '/fee-templates': { body: [template] },
    '/setups': { body: [] },
    '/settings': { body: settings },
    '/dashboard': { body: dashboard },
    ...overrides,
  }
}

function jsonBody(init) {
  return JSON.parse(String(init?.body))
}

describe('Settings', () => {
  it('opens on the Accounts tab and keeps the header scope in the address', async () => {
    const { router } = renderApp('/settings?account=1&range=YTD', routes(), { signedIn: true })
    await screen.findByRole('heading', { name: 'Accounts' })
    expect(router.state.location.pathname).toBe('/settings/accounts')
    expect(router.state.location.search).toContain('range=YTD')
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page')
  })

  it('walks the four tabs', async () => {
    const { router } = renderApp('/settings/accounts', routes(), { signedIn: true })
    for (const [name, path] of [
      ['Instruments', '/settings/instruments'],
      ['Fee profiles', '/settings/fee-profiles'],
      ['Preferences', '/settings/preferences'],
    ]) {
      await userEvent.click(await screen.findByRole('link', { name }))
      await waitFor(() => expect(router.state.location.pathname).toBe(path))
    }
  })
})

describe('Accounts tab', () => {
  it('shows what each account starts with and which fee profile prices it', async () => {
    renderApp('/settings/accounts', routes(), { signedIn: true })
    const list = await screen.findByRole('list', { name: 'Accounts' })
    expect(within(list).getByText(/Test account/)).toBeInTheDocument()
    expect(within(list).getByText('$150,000.00')).toBeInTheDocument()
    expect(within(list).getByText(/Fee profile Example tariff/)).toBeInTheDocument()
  })

  it('invites the first account when there are none', async () => {
    renderApp('/settings/accounts', routes({ '/accounts': { body: [] } }), { signedIn: true })
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
  })

  it('shows the minimum threshold when the account has one', async () => {
    renderApp('/settings/accounts', routes({ '/accounts': { body: [{ ...account, minimum_threshold: '24000.0000' }] } }), {
      signedIn: true,
    })
    const list = await screen.findByRole('list', { name: 'Accounts' })
    expect(within(list).getByText(/Minimum threshold/)).toBeInTheDocument()
    expect(within(list).getByText('$24,000.00')).toBeInTheDocument()
  })

  it('adds an account with its fee profile', async () => {
    let posted = {}
    let accounts = []
    renderApp(
      '/settings/accounts',
      routes({
        '/accounts': (_url, init) => {
          if (init?.method === 'POST') {
            posted = jsonBody(init)
            accounts = [{ ...account, id: 2, name: String(posted.name), fee_profile_id: 9 }]
            return { status: 201, body: accounts[0] }
          }
          return { body: accounts }
        },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Apex 150k')
    await userEvent.type(screen.getByLabelText('Starting balance'), '150000')
    await userEvent.selectOptions(screen.getByLabelText('Fee profile'), '9')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(posted).toMatchObject({ name: 'Apex 150k', starting_balance: '150000', currency: 'USD', fee_profile_id: 9, label: null }))
    expect(await screen.findByRole('list', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Add an account' })).not.toBeInTheDocument()
  })

  it('saves a minimum threshold with the account', async () => {
    let posted = {}
    renderApp(
      '/settings/accounts',
      routes({
        '/accounts': (_url, init) => {
          if (init?.method === 'POST') {
            posted = jsonBody(init)
            return { status: 201, body: { ...account, id: 2, minimum_threshold: posted.minimum_threshold } }
          }
          return { body: [] }
        },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Apex 25k')
    await userEvent.type(screen.getByLabelText('Starting balance'), '25000')
    await userEvent.type(screen.getByLabelText('Minimum threshold'), '24000')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(posted).toMatchObject({ minimum_threshold: '24000' }))
  })

  it('rejects a minimum threshold that is not below the starting balance', async () => {
    const { calls } = renderApp('/settings/accounts', routes({ '/accounts': { body: [] } }), { signedIn: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Apex 25k')
    await userEvent.type(screen.getByLabelText('Starting balance'), '25000')
    await userEvent.type(screen.getByLabelText('Minimum threshold'), '25000')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Must be less than the starting balance.')).toBeInTheDocument()
    expect(calls.some((call) => call.startsWith('POST /accounts'))).toBe(false)
  })

  it('lists the problems and does not call the API when the form is incomplete', async () => {
    const { calls } = renderApp('/settings/accounts', routes({ '/accounts': { body: [] } }), { signedIn: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Give the account a name.')).toBeInTheDocument()
    expect(alert).toHaveFocus()
    expect(calls.some((call) => call.startsWith('POST /accounts'))).toBe(false)
  })

  it("shows the API's message when saving fails", async () => {
    renderApp(
      '/settings/accounts',
      routes({
        '/accounts': (_url, init) =>
          init?.method === 'POST' ? { status: 422, body: { detail: 'fee_profile_id does not exist' } } : { body: [] },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }))
    await userEvent.type(screen.getByLabelText('Name'), 'X')
    await userEvent.type(screen.getByLabelText('Starting balance'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('fee_profile_id does not exist')
  })

  it('archives an account', async () => {
    const { calls } = renderApp(
      '/settings/accounts',
      routes({ '/accounts/1/archive': { body: { ...account, archived_at: '2026-06-01T00:00:00Z' } } }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Test account' }))
    await waitFor(() => expect(calls).toContain('POST /accounts/1/archive'))
  })

  it('deletes an account after confirming', async () => {
    let deleted = false
    const { calls } = renderApp(
      '/settings/accounts',
      routes({
        '/accounts': () => ({ body: deleted ? [] : [{ ...account, fee_profile_id: 9 }] }),
        '/accounts/1': (_url, init) => {
          if (init?.method === 'DELETE') {
            deleted = true
            return { status: 204 }
          }
          return { body: { ...account, fee_profile_id: 9 } }
        },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Test account' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(calls).toContain('DELETE /accounts/1'))
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
  })

  it('shows the conflict message when the account still has trades', async () => {
    renderApp(
      '/settings/accounts',
      routes({
        '/accounts/1': { status: 409, body: { detail: 'This account is used by existing records. Archive it instead.' } },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Test account' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This account is used by existing records. Archive it instead.')
    expect(await screen.findByRole('list', { name: 'Accounts' })).toBeInTheDocument()
  })
})

describe('Instruments tab', () => {
  it('shows tick size and value without padded zeros', async () => {
    renderApp('/settings/instruments', routes(), { signedIn: true })
    const list = await screen.findByRole('list', { name: 'Instruments' })
    expect(within(list).getByText('0.25')).toBeInTheDocument()
    expect(within(list).getByText('5')).toBeInTheDocument()
  })

  it('adds an instrument with an upper-case symbol', async () => {
    let posted = {}
    renderApp(
      '/settings/instruments',
      routes({
        '/instruments': (_url, init) => {
          if (init?.method !== 'POST') return { body: [] }
          posted = jsonBody(init)
          return { status: 201, body: nq }
        },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Add instrument' }))
    await userEvent.type(screen.getByLabelText('Symbol'), 'nq')
    await userEvent.type(screen.getByLabelText('Tick size'), '0.25')
    await userEvent.type(screen.getByLabelText('Tick value'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(posted).toEqual({ symbol: 'NQ', name: null, tick_size: '0.25', tick_value: '5' }))
  })

  it('rejects a zero tick size', async () => {
    const { calls } = renderApp('/settings/instruments', routes({ '/instruments': { body: [] } }), { signedIn: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Add instrument' }))
    await userEvent.type(screen.getByLabelText('Symbol'), 'ES')
    await userEvent.type(screen.getByLabelText('Tick size'), '0')
    await userEvent.type(screen.getByLabelText('Tick value'), '12.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findAllByText(/greater than 0/i)).length).toBeGreaterThan(0)
    expect(calls.some((call) => call.startsWith('POST /instruments'))).toBe(false)
  })

  it('fills the form from a known contract template, still editable before saving', async () => {
    let posted = {}
    renderApp(
      '/settings/instruments',
      routes({
        '/instruments': (_url, init) => {
          if (init?.method !== 'POST') return { body: [] }
          posted = jsonBody(init)
          return { status: 201, body: nq }
        },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Add instrument' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fill in ES, E-mini S&P 500' }))
    expect(screen.getByLabelText('Symbol')).toHaveValue('ES')
    expect(screen.getByLabelText('Tick size')).toHaveValue('0.25')
    expect(screen.getByLabelText('Tick value')).toHaveValue('12.50')

    await userEvent.clear(screen.getByLabelText('Tick value'))
    await userEvent.type(screen.getByLabelText('Tick value'), '12.75')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(posted).toEqual({ symbol: 'ES', name: 'E-mini S&P 500', tick_size: '0.25', tick_value: '12.75' }))
  })

  it('does not offer templates when editing an existing instrument', async () => {
    renderApp('/settings/instruments', routes(), { signedIn: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit NQ' }))
    expect(screen.queryByText('Start from a known contract')).not.toBeInTheDocument()
  })
})

describe('Fee profiles tab', () => {
  it('says the example templates are not real broker rates', async () => {
    renderApp('/settings/fee-profiles', routes(), { signedIn: true })
    expect(await screen.findByText(/not any broker's real rates/i)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Fee profiles' })).toHaveTextContent('Exchange fee 1.6 per fill')
  })

  it('copies a template, then lets the amounts be edited and saved', async () => {
    let copied = {}
    let patched = {}
    const created = { ...profile, id: 12, name: template.name, components: template.components.map((c, i) => ({ id: i + 1, ...c })) }
    let profiles = [profile]
    renderApp(
      '/settings/fee-profiles',
      routes({
        '/fee-profiles': () => ({ body: profiles }),
        '/fee-profiles/from-template': (_url, init) => {
          copied = jsonBody(init)
          profiles = [profile, created]
          return { status: 201, body: created }
        },
        '/fee-profiles/12': (_url, init) => {
          if (init?.method === 'PATCH') patched = jsonBody(init)
          return { body: created }
        },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: `Copy ${template.name}` }))
    await screen.findByRole('heading', { name: `Edit ${template.name}` })
    expect(copied).toEqual({ template_id: 'example-futures' })

    const line = within(screen.getByRole('group', { name: 'Fee line 1' }))
    await userEvent.clear(line.getByLabelText('Amount'))
    await userEvent.type(line.getByLabelText('Amount'), '1.25')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patched).toMatchObject({ name: template.name, components: [{ name: 'Exchange fee', amount: '1.25', basis: 'per_fill' }, { name: 'Broker commission' }] }))
  })

  it('adds a fee line charged per contract', async () => {
    let posted = {}
    renderApp(
      '/settings/fee-profiles',
      routes({
        '/fee-profiles': (_url, init) => {
          if (init?.method !== 'POST') return { body: [] }
          posted = jsonBody(init)
          return { status: 201, body: profile }
        },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Add fee profile' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Per contract tariff')
    await userEvent.click(screen.getByRole('button', { name: '+ Add fee line' }))
    const line = within(screen.getByRole('group', { name: 'Fee line 1' }))
    await userEvent.type(line.getByLabelText('Name'), 'Commission')
    await userEvent.type(line.getByLabelText('Amount'), '2.5')
    await userEvent.selectOptions(line.getByLabelText('Charged'), 'per_contract')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(posted.components).toEqual([{ name: 'Commission', amount: '2.5', basis: 'per_contract' }]))
  })

  it('deletes a fee profile after confirming', async () => {
    let deleted = false
    const { calls } = renderApp(
      '/settings/fee-profiles',
      routes({
        '/fee-profiles': () => ({ body: deleted ? [] : [profile] }),
        '/fee-profiles/9': (_url, init) => {
          if (init?.method === 'DELETE') {
            deleted = true
            return { status: 204 }
          }
          return { body: profile }
        },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: `Delete ${profile.name}` }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete fee profile' }))
    await waitFor(() => expect(calls).toContain('DELETE /fee-profiles/9'))
    expect(await screen.findByText('No fee profiles yet')).toBeInTheDocument()
  })

  it('shows the conflict message when the fee profile is still used by an account', async () => {
    renderApp(
      '/settings/fee-profiles',
      routes({
        '/fee-profiles/9': { status: 409, body: { detail: 'This fee profile is used by existing records. Archive it instead.' } },
      }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: `Delete ${profile.name}` }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete fee profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This fee profile is used by existing records. Archive it instead.')
    expect(await screen.findByRole('list', { name: 'Fee profiles' })).toBeInTheDocument()
  })
})

describe('Preferences tab', () => {
  it('saves the compliance cutoff', async () => {
    let put = {}
    renderApp(
      '/settings/preferences',
      routes({
        '/settings': (_url, init) => {
          if (init?.method !== 'PUT') return { body: settings }
          put = jsonBody(init)
          return { body: { ...settings, compliance_cutoff: 75 } }
        },
      }),
      { signedIn: true },
    )
    const input = await screen.findByLabelText('Cutoff (%)')
    expect(input).toHaveValue('80')
    await userEvent.clear(input)
    await userEvent.type(input, '75')
    await userEvent.click(screen.getByRole('button', { name: 'Save cutoff' }))
    expect(await screen.findByRole('status')).toHaveTextContent('75%')
    expect(put).toEqual({ compliance_cutoff: 75 })
  })

  it('refuses a cutoff above 100', async () => {
    const { calls } = renderApp('/settings/preferences', routes(), { signedIn: true })
    const input = await screen.findByLabelText('Cutoff (%)')
    await userEvent.clear(input)
    await userEvent.type(input, '101')
    await userEvent.click(screen.getByRole('button', { name: 'Save cutoff' }))
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(calls.some((call) => call.startsWith('PUT /settings'))).toBe(false)
  })

  it('lists the score bands from the API', async () => {
    renderApp('/settings/preferences', routes(), { signedIn: true })
    expect(await screen.findByText('85% to 100%')).toBeInTheDocument()
    expect(screen.getByText('Under 60%')).toBeInTheDocument()
  })

  it('replays the tour from the start', async () => {
    const { router } = renderApp('/settings/preferences', routes(), { signedIn: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Replay tour' }))
    expect(await screen.findByRole('dialog', { name: 'Take a quick look around?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings/preferences')

    await userEvent.click(screen.getByRole('button', { name: 'Let’s go' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('dialog', { name: 'Your running balance' })).toBeInTheDocument()
  })
})

describe('A brand-new user', () => {
  it('is sent from the trade form to Settings to add an account and an instrument', async () => {
    const { router } = renderApp('/trades/new', routes({ '/accounts': { body: [] }, '/instruments': { body: [] } }), { signedIn: true })
    await screen.findByText('Set up an account and an instrument first')
    await userEvent.click(screen.getByRole('link', { name: 'Add an account' }))
    await screen.findByRole('heading', { name: 'Accounts' })
    expect(router.state.location.pathname).toBe('/settings/accounts')
    await userEvent.click(screen.getByRole('link', { name: 'Instruments' }))
    expect(await screen.findByText('No instruments yet')).toBeInTheDocument()
  })
})
