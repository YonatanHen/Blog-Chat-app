import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router'
import { OAuthButtons } from '../components/patterns/OAuthButtons.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { useLogin } from '../hooks/use-auth.js'

export function LoginPage() {
  const navigate = useNavigate()
  const { mutate: login, isPending, error } = useLogin()
  const [searchParams] = useSearchParams()
  // The OAuth callback redirects here with ?error=<reason> rather than rendering
  // a raw 500, so the reason has to be surfaced. 'oauth' is the generic case the
  // provider itself bounced.
  const rawOauthError = searchParams.get('error')
  const oauthError =
    rawOauthError === 'oauth' ? 'Could not sign you in with that account.' : rawOauthError
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login(
      { username, password },
      {
        onSuccess: () => navigate('/'),
      },
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md space-y-6 border border-[var(--border)] p-8">
        <h1 className="text-2xl font-bold">Login</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-[var(--destructive)]">Login failed. Please try again.</p>}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        {oauthError && <p className="text-sm text-[var(--destructive)]">{oauthError}</p>}

        <OAuthButtons verb="Sign in" />

        <p className="text-sm text-center">
          Don't have an account?{' '}
          <Link to="/signup" className="text-[var(--primary)] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
