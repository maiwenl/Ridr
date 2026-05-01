import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute() {
  const { session, profile } = useAuth()

  // Attendre uniquement que la session soit résolue
  // profile peut être null (pas de ligne en base) → on laisse passer
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
