import { describe, expect, it } from 'vitest'
import { redactSecrets } from './redact.js'

describe('redactSecrets', () => {
  it('masks a password while keeping the rest of the body readable', () => {
    expect(redactSecrets({ username: 'recruiter', password: 'hunter2' })).toEqual({
      username: 'recruiter',
      password: '[redacted]',
    })
  })

  it('matches the key regardless of case, so Password and PASSWORD are covered too', () => {
    expect(redactSecrets({ Password: 'a', TOKEN: 'b' })).toEqual({
      Password: '[redacted]',
      TOKEN: '[redacted]',
    })
  })

  it('reaches secrets nested inside objects and arrays', () => {
    expect(redactSecrets({ users: [{ name: 'a', password: 'hunter2' }] })).toEqual({
      users: [{ name: 'a', password: '[redacted]' }],
    })
  })

  it('leaves primitives and non-secret values untouched', () => {
    expect(redactSecrets({ n: 1, s: 'x', b: true, nil: null })).toEqual({
      n: 1,
      s: 'x',
      b: true,
      nil: null,
    })
  })

  // A confirmation field holds the same credential as the field it confirms.
  it('masks confirmPassword, not just password', () => {
    expect(redactSecrets({ confirmPassword: 'hunter2' })).toEqual({
      confirmPassword: '[redacted]',
    })
  })
})
