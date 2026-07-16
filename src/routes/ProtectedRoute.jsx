import { useAuth } from '../context/AuthContext'
import Login from './Login'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <p className="status-text">Loading…</p>
  if (!session) return <Login />
  if (adminOnly && profile?.role !== 'admin') {
    return <p className="status-text">You don't have access to this page.</p>
  }

  return children
}
