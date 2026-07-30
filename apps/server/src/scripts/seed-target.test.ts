import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCAL_URI, isLocalUri, resolveSeedTarget, safeHost } from './seed-target.js'

const ATLAS = 'mongodb+srv://app:pw@blog-app-cluster.mw9fr.mongodb.net/blogchat?retryWrites=true'

describe('resolveSeedTarget — default (local)', () => {
  // The whole point: a developer with production credentials loaded in their
  // shell must not be able to wipe production by typing `npm run seed`.
  it('IGNORES MONGODB_URI entirely when prod is not requested', () => {
    const target = resolveSeedTarget([], { MONGODB_URI: ATLAS })
    expect(target.uri).toBe(DEFAULT_LOCAL_URI)
    expect(target.isProd).toBe(false)
    expect(target.uri).not.toContain('mongodb.net')
  })

  it('needs no environment at all', () => {
    expect(resolveSeedTarget([], {}).uri).toBe(DEFAULT_LOCAL_URI)
  })

  it('honours SEED_LOCAL_URI for a non-default local setup', () => {
    const target = resolveSeedTarget([], { SEED_LOCAL_URI: 'mongodb://mongo:27017/blogchat' })
    expect(target.uri).toBe('mongodb://mongo:27017/blogchat')
    expect(target.isProd).toBe(false)
  })

  it('is not fooled by an unrelated argument', () => {
    expect(resolveSeedTarget(['--verbose'], { MONGODB_URI: ATLAS }).uri).toBe(DEFAULT_LOCAL_URI)
  })
})

describe('resolveSeedTarget — prod', () => {
  it.each(['prod', '--prod'])('uses MONGODB_URI when %s is passed', (flag) => {
    const target = resolveSeedTarget([flag], { MONGODB_URI: ATLAS })
    expect(target.uri).toBe(ATLAS)
    expect(target.isProd).toBe(true)
  })

  it('refuses without MONGODB_URI, and says how to load it', () => {
    expect(() => resolveSeedTarget(['prod'], {})).toThrow(/MONGODB_URI/)
    expect(() => resolveSeedTarget(['prod'], {})).toThrow(/\.env/)
  })

  // Seeding localhost while believing you seeded production looks like success
  // and is the more dangerous of the two mistakes.
  it('refuses when MONGODB_URI still points at a local database', () => {
    expect(() =>
      resolveSeedTarget(['prod'], { MONGODB_URI: 'mongodb://127.0.0.1:27019/blogchat' }),
    ).toThrow(/local database/)
    expect(() =>
      resolveSeedTarget(['prod'], { MONGODB_URI: 'mongodb://mongo:27017/blogchat' }),
    ).toThrow(/local database/)
  })
})

describe('isLocalUri', () => {
  it.each([
    'mongodb://localhost:27017/x',
    'mongodb://127.0.0.1:27019/x',
    'mongodb://mongo:27017/x',
  ])('treats %s as local', (uri) => expect(isLocalUri(uri)).toBe(true))

  it('treats a remote cluster as not local', () => {
    expect(isLocalUri(ATLAS)).toBe(false)
  })

  it('does not classify an unparseable URI as local', () => {
    expect(isLocalUri('not a uri')).toBe(false)
  })
})

describe('safeHost', () => {
  // This string is logged on every run — it must never carry the password.
  it('reports host and database but never credentials', () => {
    const shown = safeHost(ATLAS)
    expect(shown).toContain('blog-app-cluster.mw9fr.mongodb.net')
    expect(shown).toContain('/blogchat')
    expect(shown).not.toContain('pw')
    expect(shown).not.toContain('app:')
  })
})
