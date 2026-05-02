import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Composant de base — vérifie juste la session
export default function ProtectedRoute() {
  const { session, profile } = useAuth()

  if (session === undefined || (session !== null && profile === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}

// Composant restreignant l'accès à un ou plusieurs rôles
export function RequireRole({ roles }) {
  const { session, profile } = useAuth()

  if (session === undefined || (session !== null && profile === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (!roles.includes(profile?.role)) return <Navigate to="/adhesions" replace />

  return <Outlet />
}
