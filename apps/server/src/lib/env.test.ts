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

describe('CLOUDINARY_* credentials', () => {
  const base = {
    MONGODB_URI: 'mongodb://localhost:27017/x',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'a'.repeat(32),
  }
  const full = {
    CLOUDINARY_CLOUD_NAME: 'my-cloud',
    CLOUDINARY_API_KEY: 'my-key',
    CLOUDINARY_API_SECRET: 'my-secret',
  }

  // Compose and Render both render an unset variable as '' rather than dropping
  // it. Before this was handled, an empty value failed validation and the API
  // refused to boot on any deployment without a Cloudinary account.
  it('treats empty strings as unset rather than as invalid values', () => {
    const env = loadEnv({
      ...base,
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '   ',
      CLOUDINARY_API_SECRET: '',
    })
    expect(env.CLOUDINARY_CLOUD_NAME).toBeUndefined()
    expect(env.CLOUDINARY_API_KEY).toBeUndefined()
    expect(env.CLOUDINARY_API_SECRET).toBeUndefined()
  })

  it('accepts all three together', () => {
    expect(loadEnv({ ...base, ...full }).CLOUDINARY_CLOUD_NAME).toBe('my-cloud')
  })

  it('boots fine with none of them — uploads are optional', () => {
    expect(() => loadEnv(base)).not.toThrow()
  })

  // A partial set looks configured and then fails at Cloudinary with an opaque
  // error, so it must be caught at boot instead.
  it('rejects a partial set, naming every missing variable', () => {
    expect(() => loadEnv({ ...base, CLOUDINARY_CLOUD_NAME: 'my-cloud' })).toThrow(
      /CLOUDINARY_API_KEY[\s\S]*CLOUDINARY_API_SECRET|CLOUDINARY_API_SECRET[\s\S]*CLOUDINARY_API_KEY/,
    )
  })

  it('resolves CLOUDINARY_API_SECRET from a _FILE path like SESSION_SECRET', () => {
    expect(loadEnv({ ...base, ...full }).CLOUDINARY_API_SECRET).toBe('my-secret')
  })
})

describe('PUBLIC_ORIGIN resolution', () => {
  const base = {
    MONGODB_URI: 'mongodb://localhost:27017/x',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'a'.repeat(32),
  }

  it('defaults to the dev client origin locally', () => {
    expect(loadEnv(base).PUBLIC_ORIGIN).toBe('http://localhost:5173')
  })

  // Without this, a Render deploy keeps building localhost OAuth callbacks and
  // sign-in is broken for every user with no error at boot to warn you.
  it('falls back to the URL Render injects', () => {
    expect(
      loadEnv({ ...base, RENDER_EXTERNAL_URL: 'https://blogchat.onrender.com' }).PUBLIC_ORIGIN,
    ).toBe('https://blogchat.onrender.com')
  })

  it('lets an explicit PUBLIC_ORIGIN win, for a custom domain', () => {
    expect(
      loadEnv({
        ...base,
        RENDER_EXTERNAL_URL: 'https://blogchat.onrender.com',
        PUBLIC_ORIGIN: 'https://blog.example.com',
      }).PUBLIC_ORIGIN,
    ).toBe('https://blog.example.com')
  })

  it('rejects a non-URL rather than building broken callbacks from it', () => {
    expect(() => loadEnv({ ...base, PUBLIC_ORIGIN: 'not-a-url' })).toThrow(/PUBLIC_ORIGIN/)
  })
})
