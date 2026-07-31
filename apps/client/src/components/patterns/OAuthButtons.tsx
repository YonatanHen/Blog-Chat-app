import { useQuery } from '@tanstack/react-query'
import { authApi } from '../../api/auth.js'
import { queryKeys } from '../../lib/query-client.js'

/**
 * Federated sign-in, rendered only when this deployment has Google
 * credentials configured — a missing credential pair means no button, rather
 * than a button that leads to a 503.
 *
 * A plain link, not a fetch call: OAuth needs a top-level navigation so the
 * provider can show its own consent screen and set its own cookies.
 */
export function OAuthButtons({ verb = 'Sign in' }: { verb?: string }) {
  const { data: providers } = useQuery({
    queryKey: queryKeys.providers,
    queryFn: authApi.providers,
    // Deployment configuration, not user data — it cannot change mid-session.
    staleTime: Infinity,
  })

  if (!providers?.google) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="font-mono text-[0.68rem] tracking-[0.11em] text-[var(--ink-faint)] uppercase">
          or
        </span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <a
        href="/api/v1/auth/google"
        className="flex h-10 items-center justify-center gap-2 border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)]"
      >
        {verb} with Google
      </a>
    </div>
  )
}
