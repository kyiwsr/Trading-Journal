import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { account, dashboard, tradeList } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const routes = { '/dashboard': { body: dashboard }, '/accounts': { body: [account] }, '/trades': { body: tradeList } }

test('mobile menu toggle opens and closes, and reports its state', async () => {
  const user = userEvent.setup()
  renderApp('/', routes, { signedIn: true })
  const toggle = await screen.findByRole('button', { name: 'Menu' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Close menu' })).toBe(toggle)

  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('Escape closes the open menu', async () => {
  const user = userEvent.setup()
  renderApp('/', routes, { signedIn: true })
  const toggle = await screen.findByRole('button', { name: 'Menu' })
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await user.keyboard('{Escape}')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('navigating closes an open menu', async () => {
  const user = userEvent.setup()
  renderApp('/', routes, { signedIn: true })
  const toggle = await screen.findByRole('button', { name: 'Menu' })
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await user.click(screen.getByRole('link', { name: 'Combat Logs' }))
  expect(await screen.findByRole('table')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
})
