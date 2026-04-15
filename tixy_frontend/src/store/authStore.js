import { create } from 'zustand'

const stored = () => {
  try {
    const u = localStorage.getItem('tixy_user')
    return u ? JSON.parse(u) : null
  } catch { return null }
}

export const useAuthStore = create((set) => ({
  token: localStorage.getItem('tixy_token') || null,
  user:  stored(),

  setAuth: (token, user) => {
    localStorage.setItem('tixy_token', token)
    localStorage.setItem('tixy_user', JSON.stringify(user))
    set({ token, user })
  },

  logout: () => {
    localStorage.removeItem('tixy_token')
    localStorage.removeItem('tixy_user')
    set({ token: null, user: null })
  },
}))
