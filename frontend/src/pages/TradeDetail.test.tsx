import { screen, within } from '@testing-library/react'

import { account, trade71 } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const routes = { '/trades/71': { body: trade71 }, '/accounts': { body: [account] } }

test('renders trade 71 exactly as the API computed it', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  expect(await screen.findByRole('heading', { name: 'NQ Long' })).toBeInTheDocument()
  expect(screen.getAllByText('+$590.36').length).toBeGreaterThan(0)
  expect(screen.getAllByText('+2.36R').length).toBeGreaterThan(0)
  expect(screen.getAllByText('85%').length).toBeGreaterThan(0)
  expect(screen.getByText('38m 56s')).toBeInTheDocument()
  expect(screen.getByText(/Average entry 20,379.00/)).toBeInTheDocument()
  expect(screen.getByText('20,394.13')).toBeInTheDocument()
})

test('lists fills with per-exit points and P&L', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  const region = await screen.findByRole('region', { name: 'Execution ledger table' })
  const rows = within(region).getAllByRole('row').slice(1)
  expect(rows).toHaveLength(4)
  expect(within(rows[0]).getByText('Entry')).toBeInTheDocument()
  expect(within(rows[1]).getByText('Scale-in')).toBeInTheDocument()
  expect(within(rows[2]).getByText('Exit 1')).toBeInTheDocument()
  expect(within(rows[2]).getByText('+12.00')).toBeInTheDocument()
  expect(within(rows[2]).getByText('+$240.00')).toBeInTheDocument()
  expect(within(rows[3]).getByText('SELL 1')).toBeInTheDocument()
})

test('breaks the fees down and nets them from gross', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  const panel = await screen.findByRole('region', { name: 'Fees and slippage' })
  expect(within(panel).getByText('-$14.64')).toBeInTheDocument()
  expect(within(panel).getByText('-$6.40')).toBeInTheDocument()
  expect(within(panel).getByText('+$605.00')).toBeInTheDocument()
})

test('shows the checklist with points, the missed item, and XP', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  const panel = await screen.findByRole('region', { name: 'Checklist' })
  expect(within(panel).getByText('25 + 25 + 20 + 15 = 85 of 100 points')).toBeInTheDocument()
  expect(within(panel).getByText('Missed -15 pts')).toBeInTheDocument()
  expect(within(panel).getByText('Entered 3 ticks early')).toBeInTheDocument()
  expect(within(panel).getByText(/\+85 XP earned/)).toBeInTheDocument()
})

test('has an empty state when no screenshot is attached', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  expect(await screen.findByText('No screenshot attached')).toBeInTheDocument()
})

test('links to the older trade and disables the missing newer one', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  const older = await screen.findByRole('link', { name: 'Older trade' })
  expect(older).toHaveAttribute('href', '/trades/70')
  expect(screen.getByRole('button', { name: 'Newer trade' })).toBeDisabled()
})

test('explains a missing trade', async () => {
  renderApp('/trades/999', { ...routes, '/trades/999': { status: 404, body: { detail: 'Trade not found' } } }, { signedIn: true })
  expect(await screen.findByRole('alert')).toHaveTextContent('Trade not found')
  expect(screen.getByRole('link', { name: 'Back to the ledger' })).toBeInTheDocument()
})

test('names the fee tariff the trade was priced with', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  expect(await screen.findByText('Tariff: Example tariff')).toBeInTheDocument()
})

test('states the compliance cutoff from the API settings', async () => {
  const settings = {
    compliance_cutoff: 70,
    bands: { elite_min: 85, solid_min: 70, sub_optimal_min: 60 },
    low_sample_threshold: 20,
    elite_setup_min: 90,
  }
  renderApp('/trades/71', { ...routes, '/settings': { body: settings } }, { signedIn: true })
  expect(await screen.findByText(/Compliant: 70% or higher is compliant/)).toBeInTheDocument()
})

test('falls back to the default cutoff when settings cannot be loaded', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  expect(await screen.findByText(/Compliant: 80% or higher is compliant/)).toBeInTheDocument()
})

test('offers to edit the trade', async () => {
  renderApp('/trades/71', routes, { signedIn: true })
  expect(await screen.findByRole('link', { name: 'Edit trade' })).toHaveAttribute('href', expect.stringContaining('/trades/71/edit'))
})
