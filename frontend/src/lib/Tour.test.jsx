import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { account, dashboard, setups, tradeList } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const SETTINGS = { compliance_cutoff: 80, has_seen_tour: true, bands: { elite_min: 85, solid_min: 70, sub_optimal_min: 60 }, low_sample_threshold: 20, elite_setup_min: 90 }

// Records every PUT /settings body in `put` and answers GET with `has_seen_tour: false`,
// so the tour arms itself the way a genuinely fresh account would see it.
function freshAccountRoutes(put) {
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

  await user.click(screen.getByRole('button', { name: 'Next step' }))
  expect(await screen.findByRole('dialog', { name: 'Discipline vs. win rate' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Next step' }))
  expect(await screen.findByRole('dialog', { name: 'Log a trade' })).toBeInTheDocument()

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

test('a returning account never sees the tour on its own', async () => {
  renderApp('/', routes(), { signedIn: true })
  expect(await screen.findByRole('heading', { name: 'Command HQ' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
