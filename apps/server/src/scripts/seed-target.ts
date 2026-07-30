/**
 * Chooses which database `seed` writes to. Seeding is destructive, so the
 * default must never be able to reach production — even with a production
 * MONGODB_URI sitting in the shell.
 */

/** Where a local seed goes. MONGODB_URI is deliberately not consulted. */
export const DEFAULT_LOCAL_URI = 'mongodb://127.0.0.1:27019/blogchat'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'mongo', 'host.docker.internal'])

/** Host-only check: `mongodb+srv://` has no port and may resolve anywhere. */
export function isLocalUri(uri: string): boolean {
  try {
    const host = new URL(uri).hostname.toLowerCase()
    return LOCAL_HOSTS.has(host)
  } catch {
    return false
  }
}

export type SeedTarget = { uri: string; isProd: boolean; host: string }

/**
 * `prod` (or `--prod`) is the only way to reach a remote database. Without it
 * the local URI is used regardless of the environment, so a stray `npm run
 * seed` on a machine configured for production wipes nothing that matters.
 */
export function resolveSeedTarget(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): SeedTarget {
  const wantsProd = argv.some((a) => a === 'prod' || a === '--prod')
  const uri = wantsProd ? env.MONGODB_URI?.trim() : (env.SEED_LOCAL_URI?.trim() || DEFAULT_LOCAL_URI)

  if (!uri) {
    throw new Error(
      'seed prod needs MONGODB_URI. Load it from your gitignored .env:\n' +
        '  set -a && . ./.env && set +a && npm run seed:prod',
    )
  }

  // A prod run pointing at localhost means the URI was never switched over —
  // silently seeding the local database would look like success.
  if (wantsProd && isLocalUri(uri)) {
    throw new Error(
      `seed prod was given a local database (${new URL(uri).hostname}). ` +
        'Point MONGODB_URI at the production cluster, or drop the prod argument.',
    )
  }

  return { uri, isProd: wantsProd, host: safeHost(uri) }
}

/** Host only — a connection string carries a password. */
export function safeHost(uri: string): string {
  try {
    const u = new URL(uri)
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`
  } catch {
    return '(unparseable URI)'
  }
}
