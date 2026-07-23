import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { useSignup } from '../hooks/use-auth.js'
import { DEBUG } from '../lib/constants.js'
import { SignupSchema } from '@blog/zod-shared'

export function SignupPage() {
  const navigate = useNavigate()
  const { mutate: signup, isPending, error } = useSignup()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateField = (field: string, value: string) => {
    const schema =
      field === 'username'
        ? SignupSchema.shape.username
        : field === 'email'
          ? SignupSchema.shape.email
          : SignupSchema.shape.password

    const result = schema.safeParse(value)
    if (!result.success) {
      const errorMsg = result.error.errors[0]?.message || 'Invalid input'
      setErrors((prev) => ({ ...prev, [field]: errorMsg }))
    } else {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const isFormValid =
    username.trim().length > 0 &&
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    Object.keys(errors).length === 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid) return
    if (DEBUG) console.log('[SIGNUP_PAGE] Form submitted with:', { username, email, password })
    signup(
      { username, email, password },
      {
        onSuccess: () => {
          if (DEBUG) console.log('[SIGNUP_PAGE] Signup successful, navigating to /')
          navigate('/')
        },
      },
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-6 border border-[var(--border)] rounded-lg">
        <h1 className="text-2xl font-bold">Sign Up</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <p className="text-xs text-[var(--muted-foreground)]">3-30 characters (letters, numbers, hyphens, underscores)</p>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                validateField('username', e.target.value)
              }}
              className={errors.username ? 'border-[var(--destructive)]' : ''}
              required
            />
            {errors.username && <p className="text-xs text-[var(--destructive)]">{errors.username}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <p className="text-xs text-[var(--muted-foreground)]">Valid email address</p>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                validateField('email', e.target.value)
              }}
              className={errors.email ? 'border-[var(--destructive)]' : ''}
              required
            />
            {errors.email && <p className="text-xs text-[var(--destructive)]">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <p className="text-xs text-[var(--muted-foreground)]">At least 8 characters</p>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                validateField('password', e.target.value)
              }}
              className={errors.password ? 'border-[var(--destructive)]' : ''}
              required
            />
            {errors.password && <p className="text-xs text-[var(--destructive)]">{errors.password}</p>}
          </div>

          {error && <p className="text-sm text-[var(--destructive)]">Signup failed. Please try again.</p>}

          <Button type="submit" className="w-full" disabled={isPending || !isFormValid}>
            {isPending ? 'Signing up...' : 'Sign Up'}
          </Button>
        </form>

        <p className="text-sm text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-[var(--primary)] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
