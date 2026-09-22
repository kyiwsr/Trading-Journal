import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { account, dashboard } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

test('signs in and lands on the dashboard', async () => {
  const user = userEvent.setup()
  let signedIn = false
  const { calls } = renderApp('/', {
    '/auth/me': () =>
      signedIn ? { body: { id: 1, email: 'trader@example.com' } } : { status: 401, body: { detail: 'Not authenticated' } },
    '/auth/login': () => {
      signedIn = true
      return { body: { id: 1, email: 'trader@example.com' } }
    },
    '/dashboard': { body: dashboard },
    '/accounts': { body: [account] },
  })
  await user.type(await screen.findByLabelText('Email'), 'trader@example.com')
  await user.type(screen.getByLabelText('Password'), 'not-a-real-password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('heading', { name: 'Command HQ' })).toBeInTheDocument()
  expect(calls).toContain('POST /auth/login')
})

test('shows a clear message for a wrong password', async () => {
  const user = userEvent.setup()
  renderApp('/login', {
    '/auth/me': { status: 401, body: { detail: 'Not authenticated' } },
    '/auth/login': { status: 401, body: { detail: 'Invalid email or password' } },
  })
  await user.type(await screen.findByLabelText('Email'), 'trader@example.com')
  await user.type(screen.getByLabelText('Password'), 'wrong')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong.')
})

test('will not submit an empty form', async () => {
  renderApp('/login', { '/auth/me': { status: 401, body: {} } })
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeDisabled()
})

test('locks out with a live countdown after too many failed attempts', async () => {
  const user = userEvent.setup()
  renderApp('/login', {
    '/auth/me': { status: 401, body: { detail: 'Not authenticated' } },
    '/auth/login': {
      status: 429,
      body: { detail: 'Too many failed sign-in attempts. Try again later.' },
      headers: { 'Retry-After': '2' },
    },
  })
  await user.type(await screen.findByLabelText('Email'), 'trader@example.com')
  await user.type(screen.getByLabelText('Password'), 'wrong')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Too many failed sign-in attempts. Try again later.')
  expect(alert).toHaveTextContent('Try again in 2s.')
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()

  expect(await screen.findByText('Try again in 1s.', {}, { timeout: 1500 })).toBeInTheDocument()
  expect(await screen.findByText('You can try again now.', {}, { timeout: 1500 })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
}, 10000)
