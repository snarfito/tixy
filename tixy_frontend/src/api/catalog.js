import api from './client'

export const getCatalogCovers = (collectionId) =>
  api.get('/catalog-images/covers', { params: { collection_id: collectionId } }).then(r => r.data)

export const getCatalogImagesByReference = (referenceId) =>
  api.get(`/catalog-images/by-reference/${referenceId}`).then(r => r.data)

export const getCatalogImagesByCollection = (collectionId) =>
  api.get(`/catalog-images/by-collection/${collectionId}`).then(r => r.data)

export const uploadCatalogImage = ({ file, collectionId, referenceIds = [] }) => {
  const form = new FormData()
  form.append('file', file)
  form.append('collection_id', collectionId)
  form.append('reference_ids', referenceIds.join(','))
  return api.post('/catalog-images/', form).then(r => r.data)
}

export const updateCatalogImageReferences = (imageId, referenceIds) =>
  api.patch(`/catalog-images/${imageId}/references`, { reference_ids: referenceIds }).then(r => r.data)

export const replaceCatalogImage = (imageId, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.put(`/catalog-images/${imageId}`, form).then(r => r.data)
}

export const deleteCatalogImage = (imageId) =>
  api.delete(`/catalog-images/${imageId}`)

export const clearCollectionCatalog = (collectionId) =>
  api.delete(`/collections/${collectionId}/catalog-images`)
