import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.js'

function secretFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'secret-'))
  const path = join(dir, 'secret.txt')
  writeFileSync(path, contents)
  return path
}

const BASE_ENV = {
  MONGODB_URI: 'mongodb://plain/blogchat',
  REDIS_URL: 'redis://plain:6379',
  SESSION_SECRET: 'a'.repeat(32),
}

describe('loadEnv', () => {
  it('reads plain env vars when no _FILE variant is set', () => {
    const env = loadEnv(BASE_ENV)
    expect(env.SESSION_SECRET).toBe('a'.repeat(32))
  })

  it('reads a Docker-secret-mounted value via SESSION_SECRET_FILE', () => {
    const filePath = secretFile('s'.repeat(40))
    const env = loadEnv({ ...BASE_ENV, SESSION_SECRET_FILE: filePath })
    expect(env.SESSION_SECRET).toBe('s'.repeat(40))
  })

  it('trims trailing newlines from the mounted secret file', () => {
    const filePath = secretFile(`${'s'.repeat(40)}\n`)
    const env = loadEnv({ ...BASE_ENV, SESSION_SECRET_FILE: filePath })
    expect(env.SESSION_SECRET).toBe('s'.repeat(40))
  })

  it('prefers the _FILE variant over a plain var when both are set', () => {
    const filePath = secretFile('f'.repeat(40))
    const env = loadEnv({ ...BASE_ENV, SESSION_SECRET: 'p'.repeat(40), SESSION_SECRET_FILE: filePath })
    expect(env.SESSION_SECRET).toBe('f'.repeat(40))
  })

  it('still throws with a clear message when a required var is missing entirely', () => {
    expect(() => loadEnv({})).toThrow(/MONGODB_URI/)
  })
})
