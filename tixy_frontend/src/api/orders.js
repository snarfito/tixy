import api from './client'

export const getReferences = (params) =>
  api.get('/references/', { params }).then(r => r.data)

export const getCollections = () =>
  api.get('/collections/').then(r => r.data)

export const searchClients = (search) =>
  api.get('/clients/', { params: { search } }).then(r => r.data)

export const createClient = (payload) =>
  api.post('/clients/', payload).then(r => r.data)

export const createOrder = (payload) =>
  api.post('/orders/', payload).then(r => r.data)

export const sendOrder = (orderId) =>
  api.post(`/orders/${orderId}/send`).then(r => r.data)

export const downloadPdfVendor = async (orderId) => {
  const token = localStorage.getItem('tixy_token')
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/pdf/${orderId}?show_total=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error('Error generando PDF')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export const listOrders = (params) =>
  api.get('/orders/', { params }).then(r => r.data)
