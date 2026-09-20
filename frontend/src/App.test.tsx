import { screen } from '@testing-library/react'

import { renderApp } from './test/renderApp'

test('sends a signed-out visitor to the login form', async () => {
  renderApp('/', { '/auth/me': { status: 401, body: { detail: 'Not authenticated' } } })
  expect(await screen.findByRole('heading', { name: 'ApexLog' })).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
  expect(screen.getByLabelText('Password')).toBeInTheDocument()
})
