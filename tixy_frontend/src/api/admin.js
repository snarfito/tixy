import api from './client'

// Referencias
export const copyReferences = (fromId, toId) =>
  api.post('/references/copy', null, { params: { from_collection_id: fromId, to_collection_id: toId } }).then(r => r.data)

export const getReferencesByCollection = (collectionId) =>
  api.get('/references/', { params: { collection_id: collectionId, active_only: false } }).then(r => r.data)

export const createReference = (payload) =>
  api.post('/references/', payload).then(r => r.data)

export const updateReference = (id, payload) =>
  api.patch(`/references/${id}`, payload).then(r => r.data)

export const deleteReference = (id) =>
  api.delete(`/references/${id}`)

/**
 * Actualización / copia masiva de referencias.
 * @param {{ ids: number[], is_active?: boolean, base_price?: number,
 *           category?: string, copy_to_collection_id?: number }} payload
 * @returns {{ updated: number, copied: number, errors: string[] }}
 */
export const bulkUpdateReferences = (payload) =>
  api.patch('/references/bulk', payload).then(r => r.data)

// Colecciones
export const getCollections = (activeOnly = false) =>
  api.get('/collections/', { params: { active_only: activeOnly } }).then(r => r.data)

export const createCollection = (payload) =>
  api.post('/collections/', payload).then(r => r.data)

export const updateCollection = (id, payload) =>
  api.patch(`/collections/${id}`, payload).then(r => r.data)

export const activateCollection = (id) =>
  api.patch(`/collections/${id}/activate`).then(r => r.data)

export const deactivateCollection = (id) =>
  api.patch(`/collections/${id}/deactivate`).then(r => r.data)

// Usuarios
export const getUsers = () =>
  api.get('/users/').then(r => r.data)

export const createUser = (payload) =>
  api.post('/users/', payload).then(r => r.data)

export const resetUserPassword = (id, newPassword) =>
  api.patch(`/users/${id}/reset-password`, { new_password: newPassword }).then(r => r.data)

export const updateUser = (id, payload) =>
  api.patch(`/users/${id}`, payload).then(r => r.data)

// Clientes
export const listClients = (search = '') =>
  api.get('/clients/', { params: search ? { search } : {} }).then(r => r.data)

export const createClient = (payload) =>
  api.post('/clients/', payload).then(r => r.data)

export const updateClient = (id, payload) =>
  api.patch(`/clients/${id}`, payload).then(r => r.data)

// Almacenes
export const addStore = (clientId, payload) =>
  api.post(`/clients/${clientId}/stores`, payload).then(r => r.data)

export const updateStore = (storeId, payload) =>
  api.patch(`/clients/stores/${storeId}`, payload).then(r => r.data)
