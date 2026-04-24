import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { resetPassword } from '../api/auth'

export default function ResetPasswordPage() {
  const [searchParams]              = useSearchParams()
  const navigate                    = useNavigate()
  const token                       = searchParams.get('token') || ''

  const [password,    setPassword]  = useState('')
  const [confirm,     setConfirm]   = useState('')
  const [loading,     setLoading]   = useState(false)
  const [error,       setError]     = useState('')
  const [success,     setSuccess]   = useState(false)

  // Token ausente en la URL
  if (!token) {
    return <CenteredCard>
      <div className="text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-sm text-white/60 mb-6">
          El enlace de recuperación es inválido o está incompleto.
        </p>
        <BackToLoginBtn navigate={navigate} />
      </div>
    </CenteredCard>
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'El enlace es inválido o ya expiró. Solicita uno nuevo desde el login.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center
                    bg-gradient-to-br from-[#1a0d14] via-[#2e0d1e] to-[#1a0d14]">

      {/* Logo */}
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

      <div className="w-full max-w-sm mx-4 bg-white/[0.06] backdrop-blur
                      border border-pink/20 rounded-2xl p-8 shadow-2xl">

        {success ? (
          /* ── Estado: éxito ── */
          <div className="text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-base font-semibold text-white/80 mb-3">
              ¡Contraseña actualizada!
            </h2>
            <p className="text-sm text-white/50 mb-6">
              Tu contraseña fue restablecida correctamente. Ya puedes iniciar sesión.
            </p>
            <BackToLoginBtn navigate={navigate} />
          </div>
        ) : (
          /* ── Estado: formulario ── */
          <>
            <h2 className="text-base font-semibold text-white/80 mb-2 text-center tracking-wide">
              Nueva contraseña
            </h2>
            <p className="text-xs text-white/40 text-center mb-6">
              Elige una contraseña segura de al menos 8 caracteres.
            </p>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10
                              border border-red-500/30 text-red-300 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/40
                                  mb-1.5 tracking-wider uppercase">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10
                             text-white placeholder:text-white/20 text-sm outline-none
                             focus:border-pink-mid focus:ring-2 focus:ring-pink/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/40
                                  mb-1.5 tracking-wider uppercase">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
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
                {loading ? 'Guardando…' : 'Guardar contraseña →'}
              </button>
            </form>

            <button
              onClick={() => navigate('/login')}
              className="mt-5 w-full text-center text-xs text-white/30
                         hover:text-white/60 transition-colors">
              ← Volver al inicio de sesión
            </button>
          </>
        )}
      </div>

      <p className="mt-8 text-white/15 text-xs tracking-widest">TIXY GLAMOUR © 2026</p>
    </div>
  )
}

/* ── Componentes auxiliares ────────────────────────────────────────────────── */

function BackToLoginBtn({ navigate }) {
  return (
    <button
      onClick={() => navigate('/login')}
      className="w-full py-2.5 rounded-lg text-sm font-semibold text-white
                 bg-gradient-to-br from-pink to-pink-dark border border-pink-dark
                 hover:from-pink-dark hover:to-pink-deep transition-all tracking-wide">
      Ir al inicio de sesión
    </button>
  )
}

function CenteredCard({ children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center
                    bg-gradient-to-br from-[#1a0d14] via-[#2e0d1e] to-[#1a0d14]">
      <div className="w-full max-w-sm mx-4 bg-white/[0.06] backdrop-blur
                      border border-pink/20 rounded-2xl p-8 shadow-2xl">
        {children}
      </div>
    </div>
  )
}
