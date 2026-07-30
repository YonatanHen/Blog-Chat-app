import { Link, NavLink, useNavigate } from 'react-router'
import { useLogout, useMe } from '../../hooks/use-auth.js'

const navLink =
  'border-b-[1.5px] border-transparent pb-1 hover:text-[var(--foreground)] aria-[current=page]:border-[var(--primary)] aria-[current=page]:text-[var(--primary)]'

export function PageShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const logout = useLogout()

  return (
    <div className="min-h-screen bg-[var(--background)] px-3 py-4 text-[var(--foreground)] sm:px-6 sm:py-10">
      {/* The content sits on a raised sheet, so the tinted paper reads as a
          surround rather than as the page's own background. */}
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col gap-10 bg-[var(--sheet)] px-5 py-6 shadow-[0_1px_2px_#14161d0a,0_18px_50px_-24px_#14161d3d] sm:gap-14 sm:px-12 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/"
            aria-label="Home"
            className="grid size-8 place-items-center border-[1.5px] border-[var(--foreground)] font-display text-sm tracking-[-0.02em]"
          >
            B
          </Link>

          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-4 font-mono text-xs tracking-[0.11em] text-[var(--muted-foreground)] uppercase sm:gap-7"
          >
            <NavLink to="/" end className={navLink}>
              Blog
            </NavLink>
            {me ? (
              <>
                <NavLink to="/chat" className={navLink}>
                  Chat
                </NavLink>
                <NavLink to="/blog/new" className={navLink}>
                  New post
                </NavLink>
                <span aria-hidden="true" className="h-4 w-px bg-[var(--border)]" />
                <span className="text-[var(--ink-faint)]">{me.username}</span>
                {/* There is no /logout route — logging out is a POST, not a
                    page. Navigating there rendered a dead end. */}
                <button
                  onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
                  disabled={logout.isPending}
                  className="border-b-[1.5px] border-transparent pb-1 uppercase hover:text-[var(--foreground)]"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navLink}>
                  Log in
                </NavLink>
                <NavLink to="/signup" className={navLink}>
                  Sign up
                </NavLink>
              </>
            )}
          </nav>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
