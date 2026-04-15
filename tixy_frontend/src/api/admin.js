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

export const updateUser = (id, payload) =>
  api.patch(`/users/${id}`, payload).then(r => r.data)
