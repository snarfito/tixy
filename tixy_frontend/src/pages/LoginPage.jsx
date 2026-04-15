import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/auth'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const navigate   = useNavigate()
  const setAuth    = useAuthStore((s) => s.setAuth)
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { access_token, user } = await login(email, password)

      // Guardar en localStorage PRIMERO, antes de cualquier navegación
      localStorage.setItem('tixy_token', access_token)
      localStorage.setItem('tixy_user', JSON.stringify(user))

      // Luego actualizar el store
      setAuth(access_token, user)

      // Navegar después de que todo esté guardado
      if (user.role === 'vendor')       navigate('/pedido')
      else if (user.role === 'manager') navigate('/gerencia')
      else                              navigate('/admin')

    } catch (err) {
      setError(err.response?.data?.detail || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#1a0d14] via-[#2e0d1e] to-[#1a0d14]">
      <div className="mb-8 text-center">
        <div className="font-script text-7xl leading-none"
          style={{
            background: 'linear-gradient(135deg,#f5c0d8 0%,#e8a0c0 30%,#d4608c 60%,#c9907a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.5))',
          }}>
          Tixy
        </div>
        <div className="mt-1 text-xs tracking-[5px] uppercase text-white/30 font-light">
          Glamour · Sistema de Pedidos
        </div>
      </div>

      <div className="w-full max-w-sm mx-4 bg-white/[0.06] backdrop-blur border border-pink/20 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-base font-semibold text-white/80 mb-6 text-center tracking-wide">
          Iniciar sesión
        </h2>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wider uppercase">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="vendedor@tixy.co"
              className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10
                         text-white placeholder:text-white/20 text-sm outline-none
                         focus:border-pink-mid focus:ring-2 focus:ring-pink/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wider uppercase">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10
                         text-white placeholder:text-white/20 text-sm outline-none
                         focus:border-pink-mid focus:ring-2 focus:ring-pink/20 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white
                       bg-gradient-to-br from-pink to-pink-dark border border-pink-dark
                       hover:from-pink-dark hover:to-pink-deep transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.98]
                       mt-2 tracking-wide">
            {loading ? 'Ingresando…' : 'Ingresar →'}
          </button>
        </form>
      </div>

      <p className="mt-8 text-white/15 text-xs tracking-widest">TIXY GLAMOUR © 2026</p>
    </div>
  )
}
