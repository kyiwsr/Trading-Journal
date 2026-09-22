import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { account, dashboard, setups, tradeList } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const SETTINGS = { compliance_cutoff: 80, has_seen_tour: true, bands: { elite_min: 85, solid_min: 70, sub_optimal_min: 60 }, low_sample_threshold: 20, elite_setup_min: 90 }

// Records every PUT /settings body in `put` and answers GET with `has_seen_tour: false`,
// so the tour arms itself the way a genuinely fresh account would see it.
function freshAccountRoutes(put, overrides = {}) {
  return {
    '/accounts': { body: [account] },
    '/dashboard': { body: dashboard },
    '/trades': { body: tradeList },
    '/setups': { body: setups },
    '/settings': (_url, init) => {
      if (init?.method !== 'PUT') return { body: { ...SETTINGS, has_seen_tour: false } }
      put.value = JSON.parse(String(init.body))
      return { body: put.value }
    },
    ...overrides,
  }
}

const routes = (overrides = {}) => ({
  '/accounts': { body: [account] },
  '/dashboard': { body: dashboard },
  '/trades': { body: tradeList },
  '/setups': { body: setups },
  '/settings': { body: SETTINGS },
  ...overrides,
})

test('starts on the Dashboard for a fresh account and walks through every step', async () => {
  const user = userEvent.setup()
  const put = { value: null }
  const { router } = renderApp('/', freshAccountRoutes(put), { signedIn: true })

  expect(await screen.findByRole('dialog', { name: 'Your running balance' })).toBeInTheDocument()
  expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
  expect(screen.getByText('Example, not your real data')).toBeInTheDocument()
  expect(screen.getByText('+$1,240.50')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Next step' }))
  expect(await screen.findByRole('dialog', { name: 'Discipline vs. win rate' })).toBeInTheDocument()
  expect(screen.getByText('79% win rate')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Next step' }))
  expect(await screen.findByRole('dialog', { name: 'Log a trade' })).toBeInTheDocument()
  expect(screen.queryByText('Example, not your real data')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Next step' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/trades'))
  expect(await screen.findByRole('dialog', { name: 'The ledger' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Next step' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/setups'))
  expect(await screen.findByRole('dialog', { name: 'Setups' })).toBeInTheDocument()
  expect(screen.getByText('Step 5 of 5')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(put.value).toEqual({ compliance_cutoff: 80, has_seen_tour: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
}, 15000)

test('skipping marks it seen and closes it immediately', async () => {
  const user = userEvent.setup()
  const put = { value: null }
  renderApp('/', freshAccountRoutes(put), { signedIn: true })

  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Skip tour' }))
  await waitFor(() => expect(put.value).toEqual({ compliance_cutoff: 80, has_seen_tour: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('Escape skips the tour', async () => {
  const user = userEvent.setup()
  const put = { value: null }
  renderApp('/', freshAccountRoutes(put), { signedIn: true })

  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(put.value).toEqual({ compliance_cutoff: 80, has_seen_tour: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('finds the target after Replay navigates into a page whose data is still loading', async () => {
  // Reproduces the real bug: clicking Replay from Settings sends you to a
  // freshly-mounted Dashboard whose data has not arrived yet. The spotlight
  // must wait for it, not give up because the target was not there instantly.
  const user = userEvent.setup()
  // Longer than the old fixed poll budget (2s) this bug shipped with, well
  // inside the new 10s safety net.
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  renderApp(
    '/settings/preferences',
    routes({
      '/dashboard': async () => {
        await delay(2500)
        return { body: dashboard }
      },
    }),
    { signedIn: true },
  )

  await user.click(await screen.findByRole('button', { name: 'Replay tour' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByRole('dialog', { name: 'Your running balance' }, { timeout: 6000 })).toBeInTheDocument()
}, 10000)

test('finds something to highlight on a genuinely empty dashboard (zero trades logged)', async () => {
  // The real bug report: a fresh account with no trades yet renders Dashboard's
  // empty state instead of the normal KPI panels, which had no data-tour markers.
  const put = { value: null }
  renderApp(
    '/',
    freshAccountRoutes(put, { '/dashboard': { body: { ...dashboard, summary: { ...dashboard.summary, trade_count: 0 } } } }),
    { signedIn: true },
  )

  const dialog = await screen.findByRole('dialog', { name: 'Your running balance' })
  expect(dialog).toBeInTheDocument()
  expect(await screen.findByText('Nothing logged yet')).toBeInTheDocument()
})

test('a returning account never sees the tour on its own', async () => {
  renderApp('/', routes(), { signedIn: true })
  expect(await screen.findByRole('heading', { name: 'Command HQ' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
