import api from './client'

/**
 * Login — el backend espera form-urlencoded (OAuth2PasswordRequestForm)
 */
export async function login(email, password) {
  const form = new URLSearchParams()
  form.append('username', email)   // FastAPI OAuth2 usa "username"
  form.append('password', password)

  const { data } = await api.post('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data   // { access_token, token_type, user }
}

export async function getMe() {
  const { data } = await api.get('/auth/me')
  return data
}

/**
 * Solicita el envío del correo de recuperación de contraseña.
 * El backend siempre responde 200 (no revela si el email existe).
 */
export async function forgotPassword(email) {
  const { data } = await api.post('/auth/forgot-password', { email })
  return data   // { message }
}

/**
 * Cambia la contraseña usando el token recibido por correo.
 */
export async function resetPassword(token, new_password) {
  const { data } = await api.post('/auth/reset-password', { token, new_password })
  return data   // { message }
}
