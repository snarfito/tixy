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

  // Estado del flujo "Olvidé mi contraseña"
  const [showForgot,    setShowForgot]    = useState(false)
  const [forgotEmail,   setForgotEmail]   = useState('')
  const [forgotSent,    setForgotSent]    = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { access_token, user } = await login(email, password)
      localStorage.setItem('tixy_token', access_token)
      localStorage.setItem('tixy_user', JSON.stringify(user))
      setAuth(access_token, user)
      if (user.role === 'vendor')       navigate('/pedido')
      else if (user.role === 'manager') navigate('/gerencia')
      else                              navigate('/admin')
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setForgotLoading(true)
    console.log(`[Tixy] Solicitud de reset de contraseña para: ${forgotEmail}`)
    await new Promise(r => setTimeout(r, 800))
    setForgotLoading(false)
    setForgotSent(true)
  }

  // ── Logo compartido ──────────────────────────────────────────────────────
  const LogoBlock = () => (
    <div className="mb-8 text-center">
      <img
        src="/logo-pink.png"
        alt="Tixy Glamour"
        className="h-16 w-auto mx-auto object-contain"
      />
      <div className="mt-3 text-xs tracking-[5px] uppercase text-white/30 font-light">
        Sistema de Pedidos
      </div>
    </div>
  )

  // ── Vista: Olvidé mi contraseña ──────────────────────────────────────────
  if (showForgot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#1a0d14] via-[#2e0d1e] to-[#1a0d14]">
        <LogoBlock />

        <div className="w-full max-w-sm mx-4 bg-white/[0.06] backdrop-blur border border-pink/20 rounded-2xl p-8 shadow-2xl">
          {forgotSent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📧</div>
              <h2 className="text-base font-semibold text-white/80 mb-3">Solicitud enviada</h2>
              <p className="text-sm text-white/50 mb-6">
                Si el correo <span className="text-pink-mid font-medium">{forgotEmail}</span> está
                registrado, el administrador recibirá la solicitud y te asignará una contraseña temporal.
              </p>
              <button
                onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail('') }}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white
                           bg-gradient-to-br from-pink to-pink-dark border border-pink-dark
                           hover:from-pink-dark hover:to-pink-deep transition-all tracking-wide">
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-white/80 mb-2 text-center tracking-wide">
                Recuperar contraseña
              </h2>
              <p className="text-xs text-white/40 text-center mb-6">
                Ingresa tu correo y notificaremos al administrador para que te asigne una contraseña temporal.
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wider uppercase">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    placeholder="tu@tixy.co"
                    className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10
                               text-white placeholder:text-white/20 text-sm outline-none
                               focus:border-pink-mid focus:ring-2 focus:ring-pink/20 transition-all"
                  />
                </div>
                <button type="submit" disabled={forgotLoading}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white
                             bg-gradient-to-br from-pink to-pink-dark border border-pink-dark
                             hover:from-pink-dark hover:to-pink-deep transition-all
                             disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.98]
                             mt-2 tracking-wide">
                  {forgotLoading ? 'Enviando…' : 'Solicitar reset →'}
                </button>
              </form>

              <button onClick={() => setShowForgot(false)}
                className="mt-5 w-full text-center text-xs text-white/30 hover:text-white/60 transition-colors">
                ← Volver al inicio de sesión
              </button>
            </>
          )}
        </div>

        <p className="mt-8 text-white/15 text-xs tracking-widest">TIXY GLAMOUR © 2026</p>
      </div>
    )
  }

  // ── Vista: Login ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#1a0d14] via-[#2e0d1e] to-[#1a0d14]">
      <LogoBlock />

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

        <button
          onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false) }}
          className="mt-5 w-full text-center text-xs text-white/30 hover:text-white/60 transition-colors">
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      <p className="mt-8 text-white/15 text-xs tracking-widest">TIXY GLAMOUR © 2026</p>
    </div>
  )
}
