import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// Lee el token fresco de localStorage en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tixy_token')
  if (token) {
    config.headers = config.headers || {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
}, (error) => Promise.reject(error))

// Redirige al login ante cualquier 401 (sesión vencida o token inválido)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('tixy_token')
      localStorage.removeItem('tixy_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
