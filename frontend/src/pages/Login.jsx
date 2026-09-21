import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useLogin, useMe } from '../api/queries'
import { Button, Card, Input } from '../components'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()
  const me = useMe()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from ?? '/'

  if (me.data) return <Navigate to={from} replace />

  const submit = (event) => {
    event.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => navigate(from, { replace: true }) })
  }

  const message =
    login.error instanceof ApiError
      ? login.error.status === 401
        ? 'Email or password is wrong.'
        : login.error.message
      : login.error
        ? 'Sign in failed. Try again.'
        : null

  return (
    <main className="login">
      <Card className="login-card">
        <h1 className="login-brand">ApexLog</h1>
        <p className="login-lede">Sign in to your trading journal.</p>
        <form onSubmit={submit} className="form" noValidate>
          <label className="field">
            <span className="field-label">Email</span>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {message ? (
            <p className="form-error" role="alert">
              {message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={login.isPending || !email || !password}>
            {login.isPending ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
