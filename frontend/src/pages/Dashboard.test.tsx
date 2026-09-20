import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { account, dashboard } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const routes = { '/dashboard': { body: dashboard }, '/accounts': { body: [account] } }

test('shows the headline figures from the API', async () => {
  renderApp('/', routes, { signedIn: true })
  expect(await screen.findByRole('heading', { name: 'Command HQ' })).toBeInTheDocument()
  expect(screen.getAllByText('+$14,280.50').length).toBeGreaterThan(0)
  expect(screen.getByText('63.6%')).toBeInTheDocument()
  expect(screen.getByText('Profits divided by losses, after fees')).toBeInTheDocument()
  expect(screen.getByText('4-win streak')).toBeInTheDocument()
})

test('lists the four discipline bands with saved capital', async () => {
  renderApp('/', routes, { signedIn: true })
  const panel = await screen.findByRole('region', { name: 'Discipline vs win rate' })
  for (const band of ['Elite', 'Solid', 'Sub-optimal', 'Rule breach']) {
    expect(within(panel).getByText(band, { exact: false })).toBeInTheDocument()
  }
  expect(within(panel).getByText('+$2,650.00')).toBeInTheDocument()
})

test('sorts the setups table from its column headers', async () => {
  const user = userEvent.setup()
  renderApp('/', routes, { signedIn: true })
  const region = await screen.findByRole('region', { name: 'Setups playbook table' })
  const netHeader = within(region).getByRole('columnheader', { name: /Net P&L/ })
  expect(netHeader).toHaveAttribute('aria-sort', 'none')
  await user.click(within(netHeader).getByRole('button'))
  expect(netHeader).toHaveAttribute('aria-sort', 'descending')
  expect(within(within(region).getAllByRole('row')[1]).getByText('Sweep scalp')).toBeInTheDocument()
  await user.click(within(netHeader).getByRole('button'))
  expect(netHeader).toHaveAttribute('aria-sort', 'ascending')
  expect(within(within(region).getAllByRole('row')[1]).getByText('Opening fade')).toBeInTheDocument()
  expect(within(region).getByText('Low sample')).toBeInTheDocument()
})

test('explains an empty range instead of showing zeros', async () => {
  const empty = { ...dashboard, summary: { ...dashboard.summary, trade_count: 0 } }
  renderApp('/?range=30D', { ...routes, '/dashboard': { body: empty } }, { signedIn: true })
  expect(await screen.findByText(/No trades for all accounts in the last 30 days/)).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: '+ Log Trade' }).length).toBeGreaterThan(0)
})

test('reports a failed load and offers a retry', async () => {
  renderApp('/', { ...routes, '/dashboard': { status: 500, body: { detail: 'Database is down' } } }, { signedIn: true })
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the dashboard')
  expect(screen.getByRole('alert')).toHaveTextContent('Database is down')
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})
