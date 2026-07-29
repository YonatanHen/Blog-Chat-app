// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/AutoForm.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mocked at the API boundary rather than at `useSignup`, so the assertion on the
// outgoing payload is about what actually reaches the wire.
vi.mock('../api/auth.js', () => ({
  authApi: { signup: vi.fn(), login: vi.fn(), logout: vi.fn(), me: vi.fn() },
}))

const { authApi } = await import('../api/auth.js')
const { SignupPage } = await import('./SignupPage.js')

function renderSignup(Page: typeof SignupPage = SignupPage) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))

function fillValidForm({ confirmWith }: { confirmWith?: string } = {}) {
  fill('Username', 'recruiter')
  fill('Email', 'recruiter@example.com')
  fill('Password', 'a-valid-password')
  fill('Confirm password', confirmWith ?? 'a-valid-password')
}

describe('SignupPage password confirmation', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  // The regression this closes (spec §14): the legacy app compared the
  // confirmation only after the request had already been sent.
  it('does not send the request when the confirmation does not match', () => {
    renderSignup()
    fillValidForm({ confirmWith: 'a-valid-passwerd' })
    submit()

    expect(authApi.signup).not.toHaveBeenCalled()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  // confirmPassword is a client-only field. Sending it would imply the API
  // validates something it has no schema for.
  it('sends only the API schema fields — never confirmPassword', async () => {
    vi.mocked(authApi.signup).mockResolvedValue({ id: 'u1', username: 'recruiter', email: 'recruiter@example.com' })
    renderSignup()
    fillValidForm()
    submit()

    await waitFor(() => expect(authApi.signup).toHaveBeenCalledTimes(1))
    // An exact object: an extra key fails this assertion.
    expect(authApi.signup).toHaveBeenCalledWith({
      username: 'recruiter',
      email: 'recruiter@example.com',
      password: 'a-valid-password',
    })
  })

  // Confirming and then editing the password above it must not leave the
  // earlier "matched" state standing.
  it('re-flags the mismatch when the password is edited after confirming', () => {
    renderSignup()
    fill('Password', 'a-valid-password')
    fill('Confirm password', 'a-valid-password')
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument()

    fill('Password', 'a-different-password')

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })
})

describe('SignupPage debug logging', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
    cleanup()
  })

  // This repo leaked a credential once already (2026-07-16) and the hardening
  // pass forbids a plaintext password reaching ANY log sink — a developer's
  // console included. DEBUG is read at module load, so the env is stubbed and
  // the module re-imported before rendering.
  it('never logs the plaintext password, even with DEBUG on', async () => {
    vi.stubEnv('VITE_DEBUG', 'true')
    vi.resetModules()
    const { authApi: api } = await import('../api/auth.js')
    const { SignupPage: Page } = await import('./SignupPage.js')
    vi.mocked(api.signup).mockResolvedValue({ id: 'u1', username: 'recruiter', email: 'recruiter@example.com' })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    renderSignup(Page)
    fillValidForm()
    submit()

    await waitFor(() => expect(api.signup).toHaveBeenCalled())
    // Without this the test passes vacuously whenever DEBUG resolves false.
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('a-valid-password')
  })
})
