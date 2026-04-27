import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../api/client'

/**
 * Página de activación de cuenta.
 * El usuario llega aquí desde el link de invitación recibido por email.
 * Permite crear su contraseña personal por primera vez (o restablecerla si el admin lo reenvió).
 */
export default function ActivateAccountPage() {
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
    return (
      <CenteredCard>
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-sm text-white/60 mb-6">
            El enlace de activación es inválido o está incompleto.<br />
            Solicita un nuevo acceso al administrador.
          </p>
          <BackToLoginBtn navigate={navigate} />
        </div>
      </CenteredCard>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (!/\d/.test(password)) {
      setError('La contraseña debe contener al menos un número.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/activate', { token, new_password: password })
      setSuccess(true)
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'El enlace es inválido o ya expiró. Solicita un nuevo acceso al administrador.'
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
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-base font-semibold text-white/80 mb-3">
              ¡Cuenta activada!
            </h2>
            <p className="text-sm text-white/50 mb-6">
              Tu contraseña fue creada correctamente.<br />
              Ya puedes iniciar sesión en el sistema.
            </p>
            <BackToLoginBtn navigate={navigate} />
          </div>
        ) : (
          /* ── Estado: formulario ── */
          <>
            <h2 className="text-base font-semibold text-white/80 mb-2 text-center tracking-wide">
              Crea tu contraseña
            </h2>
            <p className="text-xs text-white/40 text-center mb-6">
              Elige una contraseña segura: mínimo 8 caracteres y al menos 1 número.
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
                  autoComplete="new-password"
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
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10
                             text-white placeholder:text-white/20 text-sm outline-none
                             focus:border-pink-mid focus:ring-2 focus:ring-pink/20 transition-all"
                />
              </div>

              {/* Indicador visual de fortaleza */}
              {password.length > 0 && (
                <PasswordStrength password={password} />
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white
                           bg-gradient-to-br from-pink to-pink-dark border border-pink-dark
                           hover:from-pink-dark hover:to-pink-deep transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.98]
                           mt-2 tracking-wide">
                {loading ? 'Activando cuenta…' : 'Activar mi cuenta →'}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="mt-8 text-white/15 text-xs tracking-widest">TIXY GLAMOUR © 2026</p>
    </div>
  )
}

/* ── Indicador de fortaleza de contraseña ─────────────────────────────────── */
function PasswordStrength({ password }) {
  const checks = [
    { ok: password.length >= 8,          label: 'Mínimo 8 caracteres' },
    { ok: /\d/.test(password),           label: 'Al menos 1 número'   },
    { ok: /[A-Z]/.test(password),        label: 'Una mayúscula'        },
    { ok: /[^A-Za-z0-9]/.test(password), label: 'Un carácter especial' },
  ]
  const score = checks.filter(c => c.ok).length

  const colors = ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-green-500']
  const labels = ['', 'Débil', 'Regular', 'Buena', 'Fuerte']

  return (
    <div className="space-y-2">
      {/* Barra de progreso */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300
              ${i < score ? colors[score] : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {checks.map(c => (
            <span key={c.label}
              className={`text-[10px] transition-colors ${c.ok ? 'text-green-400' : 'text-white/30'}`}>
              {c.ok ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
        {score > 0 && (
          <span className={`text-[10px] font-semibold ${colors[score].replace('bg-', 'text-')}`}>
            {labels[score]}
          </span>
        )}
      </div>
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
