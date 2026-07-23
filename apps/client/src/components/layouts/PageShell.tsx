import { Link, useNavigate } from 'react-router'
import { useMe } from '../../hooks/use-auth.js'

export function PageShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4">
          <Link to="/" className="text-lg font-semibold">
            Blog
          </Link>
          <nav className="flex gap-4">
            {me ? (
              <>
                <span className="text-sm">Welcome, {me.username}</span>
                <Link to="/blog/new" className="text-sm hover:underline">
                  New Post
                </Link>
                <button
                  onClick={() => navigate('/logout')}
                  className="text-sm hover:underline"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm hover:underline">
                  Login
                </Link>
                <Link to="/signup" className="text-sm hover:underline">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  )
}
