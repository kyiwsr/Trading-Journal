import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useLogin, useMe } from '../api/queries'
import { Button, Card, Input } from '../components'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const login = useLogin()
  const me = useMe()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from ?? '/'

  const lockout = login.error instanceof ApiError && login.error.status === 429

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [secondsLeft])

  if (me.data) return <Navigate to={from} replace />

  const submit = (event) => {
    event.preventDefault()
    login.mutate(
      { email, password },
      {
        onSuccess: () => navigate(from, { replace: true }),
        onError: (error) => {
          if (error instanceof ApiError && error.status === 429) setSecondsLeft(error.retryAfterSeconds ?? 0)
        },
      },
    )
  }

  const message =
    login.error instanceof ApiError
      ? lockout
        ? null
        : login.error.status === 401
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
          {lockout ? (
            <div className="form-error form-error-lockout" role="alert">
              <p className="form-error-lead">{login.error.message}</p>
              <p className="mono">
                {secondsLeft > 0 ? `Try again in ${secondsLeft}s.` : 'You can try again now.'}
              </p>
            </div>
          ) : null}
          {message ? (
            <p className="form-error" role="alert">
              {message}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={login.isPending || !email || !password || secondsLeft > 0}
          >
            {login.isPending ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
