import { Navigate } from 'react-router'
import { useMe } from '../../hooks/use-auth.js'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: me, isPending } = useMe()
  if (isPending) return <p>Loading...</p>
  if (!me) return <Navigate to="/login" replace />
  return children
}
