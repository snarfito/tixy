import api from './client'

export const getCategories = (activeOnly = true) =>
  api.get('/categories/', { params: { active_only: activeOnly } }).then(r => r.data)

export const viewPdf = async (orderId, showTotal = true) => {
  const token = localStorage.getItem('tixy_token')
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/pdf/${orderId}?show_total=${showTotal}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error('Error generando PDF')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Liberar el objeto URL después de un momento
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// Mantener downloadPdf para compatibilidad (fuerza descarga)
export const downloadPdf = async (orderId, showTotal = true) => {
  const token = localStorage.getItem('tixy_token')
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/pdf/${orderId}?show_total=${showTotal}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error('Error generando PDF')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `tixy-orden-${orderId}-${showTotal ? 'con' : 'sin'}-total.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export const getOrder = (id) =>
  api.get(`/orders/${id}`).then(r => r.data)

export const listOrders = (params) =>
  api.get('/orders/', { params }).then(r => r.data)

export const confirmOrder = (id) =>
  api.post(`/orders/${id}/confirm`).then(r => r.data)

export const cancelOrder = (id) =>
  api.post(`/orders/${id}/cancel`).then(r => r.data)

export const salesByReference = (params) =>
  api.get('/orders/summary/by-reference', { params }).then(r => r.data)

export const salesByVendor = (params) =>
  api.get('/orders/summary/by-vendor', { params }).then(r => r.data)

export const salesByCollection = () =>
  api.get('/orders/summary/by-collection').then(r => r.data)

export const getCollections = () =>
  api.get('/collections/', { params: { active_only: false } }).then(r => r.data)

export const getUsers = () =>
  api.get('/users/').then(r => r.data)

export const downloadExcelReport = async (collectionId, collectionName, reportType) => {
  const token = localStorage.getItem('tixy_token')
  const base  = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const res   = await fetch(
    `${base}/orders/report/excel?collection_id=${collectionId}&report_type=${reportType}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Error generando el reporte')
  }
  const blob     = await res.blob()
  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  const tipo     = reportType === 'unidades' ? 'Unidades' : 'Costos'
  a.download     = `${collectionName} - ${tipo}.xlsx`
  a.href         = url
  a.click()
  URL.revokeObjectURL(url)
}
