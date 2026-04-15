import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute({ children, roles }) {
  const { token, user } = useAuthStore()

  if (!token || !user) return <Navigate to="/login" replace />

  if (roles && !roles.includes(user.role)) {
    if (user.role === 'vendor')  return <Navigate to="/pedido"   replace />
    if (user.role === 'manager') return <Navigate to="/gerencia" replace />
    return <Navigate to="/admin" replace />
  }

  return children
}
