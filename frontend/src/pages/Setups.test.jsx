import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { account, dashboard } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

function makeSetup(overrides = {}) {
  return {
    id: 4,
    name: 'celup kaki',
    subtitle: 'Liquidity Sweep Scalp',
    description: 'Fade the sweep.',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    criteria: [
      { id: 11, label: 'Sweep confirmed', weight: '60.00', display_order: 0 },
      { id: 12, label: 'Stop before entry', weight: '40.00', display_order: 1 },
    ],
    ...overrides,
  }
}

const untraded = makeSetup({ id: 9, name: 'hulur kepala', subtitle: null, criteria: [] })
const archived = makeSetup({ id: 10, name: 'Old idea', subtitle: null, archived_at: '2026-06-01T00:00:00Z', criteria: [] })

function routes(overrides = {}) {
  return {
    '/accounts': { body: [account] },
    '/dashboard': { body: dashboard },
    '/setups': { body: [makeSetup(), untraded, archived] },
    '/setups/4': { body: makeSetup() },
    '/setups/4/criteria': { body: makeSetup() },
    '/setups/4/archive': { body: makeSetup({ archived_at: '2026-06-01T00:00:00Z' }) },
    '/setups/4/unarchive': { body: makeSetup() },
    ...overrides,
  }
}

describe('Skill Playbook list', () => {
  it('lists setups with statistics, rank and low sample, and shows setups with no trades', async () => {
    renderApp('/setups', routes(), { signedIn: true })
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    const sweep = within(rows.find((row) => within(row).queryByText('celup kaki')))
    expect(sweep.getByText('Liquidity Sweep Scalp')).toBeInTheDocument()
    expect(sweep.getByText('2 (100 pts)')).toBeInTheDocument()
    expect(sweep.getByText('76.5%')).toBeInTheDocument()

    const fresh = within(rows.find((row) => within(row).queryByText('hulur kepala')))
    expect(fresh.getByText('No trades yet')).toBeInTheDocument()
    expect(within(table).queryByText('Old idea')).not.toBeInTheDocument()
  })

  it('reveals archived setups on request', async () => {
    renderApp('/setups', routes(), { signedIn: true })
    await userEvent.click(await screen.findByRole('checkbox', { name: /Show archived \(1\)/ }))
    expect(within(screen.getByRole('table')).getByText('Old idea')).toBeInTheDocument()
  })

  it('invites a first setup when there are none', async () => {
    renderApp('/setups', routes({ '/setups': { body: [] } }), { signedIn: true })
    expect(await screen.findByText('No setups yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your first setup' })).toHaveAttribute('href', expect.stringContaining('/setups/new'))
  })

  it('still lists the checklists when the statistics fail to load', async () => {
    renderApp('/setups', routes({ '/dashboard': { status: 500, body: { detail: 'boom' } } }), { signedIn: true })
    expect(await screen.findByText(/statistics could not be loaded/i)).toBeInTheDocument()
    expect(screen.getByText('celup kaki')).toBeInTheDocument()
  })
})

const rule = (name) => within(screen.getByRole('group', { name }))

async function addRule(name, label, points) {
  await userEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
  await userEvent.type(rule(name).getByLabelText('Rule'), label)
  await userEvent.type(rule(name).getByLabelText('Points'), points)
}

describe('Setup editor', () => {
  it('creates a setup with an ordered checklist', async () => {
    let body = {}
    const { router } = renderApp(
      '/setups/new',
      routes({
        '/setups': (_url, init) => {
          if (init?.method !== 'POST') return { body: [] }
          body = JSON.parse(String(init.body))
          return { status: 201, body: makeSetup() }
        },
      }),
      { signedIn: true },
    )
    await screen.findByRole('heading', { name: 'New setup' })
    await userEvent.type(screen.getByLabelText('Name'), 'FVG retest')
    await addRule('Rule 1', 'Gap formed', '60')
    await addRule('Rule 2', 'Waited for retest', '40')
    expect(screen.getByRole('status')).toHaveTextContent('Total: 100 pts')

    await userEvent.click(screen.getByRole('button', { name: 'Create setup' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/setups'))
    expect(body).toMatchObject({
      name: 'FVG retest',
      subtitle: null,
      criteria: [
        { label: 'Gap formed', weight: '60' },
        { label: 'Waited for retest', weight: '40' },
      ],
    })
  })

  it('warns when the points do not add up to 100 but still allows it', async () => {
    renderApp('/setups/new', routes(), { signedIn: true })
    await screen.findByRole('heading', { name: 'New setup' })
    await addRule('Rule 1', 'Gap formed', '30')
    await addRule('Rule 2', 'Waited', '60')
    expect(screen.getByRole('status')).toHaveTextContent(/Total: 90 pts. The rules do not add up to 100/)
    expect(screen.getByRole('button', { name: 'Create setup' })).toBeEnabled()
  })

  it('moves rules up and down with the keyboard-reachable buttons', async () => {
    let body = {}
    renderApp(
      '/setups/new',
      routes({
        '/setups': (_url, init) => {
          if (init?.method !== 'POST') return { body: [] }
          body = JSON.parse(String(init.body))
          return { status: 201, body: makeSetup() }
        },
      }),
      { signedIn: true },
    )
    await screen.findByRole('heading', { name: 'New setup' })
    await userEvent.type(screen.getByLabelText('Name'), 'Order test')
    await addRule('Rule 1', 'First', '10')
    await addRule('Rule 2', 'Second', '10')
    expect(screen.getByRole('button', { name: 'Move rule 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move rule 2 down' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Move rule 2 up' }))
    expect(rule('Rule 1').getByLabelText('Rule')).toHaveValue('Second')
    await userEvent.click(screen.getByRole('button', { name: 'Create setup' }))
    await waitFor(() => expect(body.criteria?.map((c) => c.label)).toEqual(['Second', 'First']))
  })

  it('lists what is wrong instead of saving an incomplete setup', async () => {
    const { calls } = renderApp('/setups/new', routes(), { signedIn: true })
    await screen.findByRole('heading', { name: 'New setup' })
    await userEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create setup' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Give the setup a name.')).toBeInTheDocument()
    expect(within(alert).getByText('Describe the rule.')).toBeInTheDocument()
    expect(alert).toHaveFocus()
    expect(calls.some((call) => call.startsWith('POST /setups'))).toBe(false)
  })

  it('saves edits with PATCH for the details and PUT for the checklist', async () => {
    const { calls, router } = renderApp('/setups/4', routes(), { signedIn: true })
    await screen.findByRole('heading', { name: 'Edit setup' })
    expect(screen.getByLabelText('Name')).toHaveValue('celup kaki')
    expect(rule('Rule 2').getByLabelText('Points')).toHaveValue('40')

    await userEvent.clear(screen.getByLabelText('Subtitle'))
    await userEvent.type(screen.getByLabelText('Subtitle'), 'Sweep scalp')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/setups'))
    expect(calls).toContain('PATCH /setups/4')
    expect(calls).toContain('PUT /setups/4/criteria')
  })

  it("shows the API's 409 when a rule that logged trades use is removed", async () => {
    const message = 'A criterion you removed is used by logged trades. Keep it, or archive the setup instead.'
    renderApp(
      '/setups/4',
      routes({ '/setups/4/criteria': { status: 409, body: { detail: message } } }),
      { signedIn: true },
    )
    await screen.findByRole('heading', { name: 'Edit setup' })
    await userEvent.click(screen.getByRole('button', { name: 'Remove rule 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('archives and unarchives a setup', async () => {
    const { calls, router } = renderApp('/setups/4', routes(), { signedIn: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Archive setup' }))
    await waitFor(() => expect(calls).toContain('POST /setups/4/archive'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/setups'))
  })

  it('offers to unarchive an archived setup', async () => {
    const { calls } = renderApp(
      '/setups/4',
      routes({ '/setups/4': { body: makeSetup({ archived_at: '2026-06-01T00:00:00Z' }) } }),
      { signedIn: true },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Unarchive setup' }))
    await waitFor(() => expect(calls).toContain('POST /setups/4/unarchive'))
  })

  it('asks before discarding unsaved changes', async () => {
    const { router } = renderApp('/setups/new', routes(), { signedIn: true })
    await screen.findByRole('heading', { name: 'New setup' })
    await userEvent.type(screen.getByLabelText('Name'), 'Half done')
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/setups'))
  })
})
