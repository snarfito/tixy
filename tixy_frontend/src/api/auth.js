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
