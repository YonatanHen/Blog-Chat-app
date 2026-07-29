import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client.js', () => ({ request: vi.fn() }))

describe('authApi debug logging', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  // The page-level guard in SignupPage.test.tsx cannot see this: it mocks
  // authApi wholesale, so a leak inside authApi itself passes straight through.
  // This is the layer that actually holds the credential on its way to the wire.
  it('never logs the plaintext password when tracing a signup', async () => {
    vi.stubEnv('VITE_DEBUG', 'true')
    vi.resetModules()
    const { request } = await import('./client.js')
    const { authApi } = await import('./auth.js')
    vi.mocked(request).mockResolvedValue({
      id: 'u1',
      username: 'recruiter',
      email: 'recruiter@example.com',
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await authApi.signup({
      username: 'recruiter',
      email: 'recruiter@example.com',
      password: 'a-valid-password',
    })

    // Without this the test passes vacuously whenever DEBUG resolves false.
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('a-valid-password')
  })
})
