import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { account, dashboard, setups, tradeList } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const routes = {
  '/trades': { body: tradeList },
  '/dashboard': { body: dashboard },
  '/accounts': { body: [account] },
  '/setups': { body: setups },
}

test('renders the ledger rows with sign-coloured money and result labels', async () => {
  renderApp('/trades', routes, { signedIn: true })
  const table = await screen.findByRole('table')
  const rows = within(table).getAllByRole('row').slice(1)
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByText('+$590.36')).toBeInTheDocument()
  expect(within(rows[0]).getByText('+2.36R')).toBeInTheDocument()
  expect(within(rows[1]).getByText('-$250.00')).toBeInTheDocument()
  expect(within(rows[1]).getByText('Loss')).toBeInTheDocument()
  expect(screen.getByText('Trades 1 to 50 of 88')).toBeInTheDocument()
})

test('a filter click reaches the API and shows a removable chip', async () => {
  const user = userEvent.setup()
  const { calls } = renderApp('/trades', routes, { signedIn: true })
  await screen.findByRole('table')
  await user.click(screen.getByRole('button', { name: 'Wins' }))
  await waitFor(() => expect(calls.some((c) => c.includes('/trades?') && c.includes('result=win'))).toBe(true))
  const chip = await screen.findByRole('button', { name: 'Remove filter Result: Win' })
  await user.click(chip)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove filter Result: Win' })).toBeNull())
})

test('clear filters resets every filter at once', async () => {
  const user = userEvent.setup()
  renderApp('/trades?side=short&result=loss&q=fomc', routes, { signedIn: true })
  await screen.findByRole('table')
  expect(screen.getAllByRole('button', { name: /^Remove filter/ })).toHaveLength(3)
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(screen.queryAllByRole('button', { name: /^Remove filter/ })).toHaveLength(0))
})

test('sorting a column header flips the requested order', async () => {
  const user = userEvent.setup()
  const { calls } = renderApp('/trades', routes, { signedIn: true })
  await screen.findByRole('table')
  await user.click(screen.getByRole('button', { name: /Net P&L/ }))
  await waitFor(() => expect(calls.some((c) => c.includes('sort_by=net_pnl') && c.includes('order=desc'))).toBe(true))
  await user.click(screen.getByRole('button', { name: /Net P&L/ }))
  await waitFor(() => expect(calls.some((c) => c.includes('sort_by=net_pnl') && c.includes('order=asc'))).toBe(true))
})

test('says why the ledger is empty when filters match nothing', async () => {
  renderApp('/trades?side=long', { ...routes, '/trades': { body: { ...tradeList, items: [], total: 0 } } }, { signedIn: true })
  expect(await screen.findByText('No trades match these filters')).toBeInTheDocument()
})

test('exports with the active filters', async () => {
  renderApp('/trades?side=long&page=2', routes, { signedIn: true })
  const link = await screen.findByRole('link', { name: 'Export CSV' })
  expect(link.getAttribute('href')).toContain('/trades/export.csv?')
  expect(link.getAttribute('href')).toContain('side=long')
  expect(link.getAttribute('href')).not.toContain('page=')
})

test('typing in the search box filters after a short pause and can be cleared', async () => {
  const user = userEvent.setup()
  const { calls } = renderApp('/trades', routes, { signedIn: true })
  await screen.findByRole('table')
  const box = screen.getByPlaceholderText('Symbol, setup, tag or note')
  await user.type(box, 'nq')
  await waitFor(() => expect(calls.some((c) => c.includes('/trades?') && c.includes('q=nq'))).toBe(true))
  expect(box).toHaveValue('nq')
  await user.clear(box)
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Remove filter Search/ })).toBeNull())
  expect(box).toHaveValue('')
})

test('the summary strip shows totals for the whole filtered set, not the header scope', async () => {
  renderApp('/trades?result=win', routes, { signedIn: true })
  const strip = await screen.findByLabelText('Summary of the trades matching the filters')
  expect(within(strip).getByText('+$14,280.50')).toBeInTheDocument()
  expect(within(strip).getByText('Fees -$1,412.00')).toBeInTheDocument()
  expect(within(strip).getByText('63.6%')).toBeInTheDocument()
  expect(within(strip).getByText('2.78')).toBeInTheDocument()
  expect(within(strip).getByText('42 of 88 scored at 85% or higher')).toBeInTheDocument()
  expect(within(strip).getByText('14m 28s')).toBeInTheDocument()
})

test('the strip follows the API elite threshold when it is not 85', async () => {
  const settings = {
    compliance_cutoff: 80,
    bands: { elite_min: 90, solid_min: 75, sub_optimal_min: 60 },
    low_sample_threshold: 20,
    elite_setup_min: 90,
  }
  renderApp('/trades', { ...routes, '/settings': { body: settings } }, { signedIn: true })
  expect(await screen.findByText('42 of 88 scored at 90% or higher')).toBeInTheDocument()
})

test('relies on the header’s persistent + Log Trade link, not a second page-local one', async () => {
  renderApp('/trades', routes, { signedIn: true })
  await screen.findByRole('table')
  expect(screen.getAllByRole('link', { name: '+ Log Trade' })).toHaveLength(1)
  expect(screen.queryByRole('link', { name: 'Log Trade' })).not.toBeInTheDocument()
})
