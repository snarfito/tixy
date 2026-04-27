import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage            from './pages/LoginPage'
import ResetPasswordPage    from './pages/ResetPasswordPage'
import ActivateAccountPage  from './pages/ActivateAccountPage'
import AdminPage            from './pages/AdminPage'
import ManagerPage        from './pages/ManagerPage'
import VendorPage         from './pages/VendorPage'
import AppLayout          from './components/AppLayout'
import ProtectedRoute     from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Públicas */}
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/activate"       element={<ActivateAccountPage />} />

        {/* Protegidas — comparten layout */}
        <Route element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route path="/admin" element={
            <ProtectedRoute roles={['admin']}>
              <AdminPage />
            </ProtectedRoute>
          }/>
          <Route path="/gerencia" element={
            <ProtectedRoute roles={['admin','manager']}>
              <ManagerPage />
            </ProtectedRoute>
          }/>
          <Route path="/pedido" element={
            <ProtectedRoute roles={['admin','vendor','manager']}>
              <VendorPage />
            </ProtectedRoute>
          }/>
        </Route>

        {/* Default */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
