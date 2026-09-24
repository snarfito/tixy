import { useState, useEffect, useCallback } from 'react'
import { getCollections, getReferencesByCollection } from '../../api/admin'
import {
  getCatalogImagesByCollection, uploadCatalogImage, updateCatalogImageReferences,
  replaceCatalogImage, deleteCatalogImage, clearCollectionCatalog,
} from '../../api/catalog'

export default function CatalogSection() {
  const [collections,  setCollections]  = useState([])
  const [collectionId, setCollectionId] = useState('')
  const [refs,         setRefs]         = useState([])   // referencias de la coleccion, para resolver codigo -> id
  const [images,       setImages]       = useState([])
  const [uploading,    setUploading]    = useState(false)
  const [banner,       setBanner]       = useState(null)
  const [cacheBust,    setCacheBust]    = useState({})   // imageId -> contador, evita servir la foto vieja tras un reemplazo

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3000) }

  const refresh = useCallback(() => {
    if (!collectionId) return
    Promise.all([
      getReferencesByCollection(collectionId),
      getCatalogImagesByCollection(collectionId),
    ]).then(([refsData, imagesData]) => {
      setRefs(refsData)
      setImages(imagesData)
    })
  }, [collectionId])

  useEffect(() => {
    getCollections().then(cols => {
      setCollections(cols)
      if (cols.length) setCollectionId(String(cols[0].id))
    })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  function codesToIds(text) {
    const codes = text.split(/[\s,]+/).map(c => c.trim()).filter(Boolean)
    const ids = []
    const unknown = []
    for (const code of codes) {
      const ref = refs.find(r => r.code.toLowerCase() === code.toLowerCase())
      if (ref) ids.push(ref.id)
      else unknown.push(code)
    }
    return { ids, unknown }
  }

  function idsToCodes(ids) {
    return ids.map(id => refs.find(r => r.id === id)?.code).filter(Boolean).join(' ')
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList)
    if (!files.length) return
    setUploading(true)
    const CONCURRENCY = 3
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        batch.map(file => uploadCatalogImage({ file, collectionId, referenceIds: [] }))
      )
    }
    setUploading(false)
    flash('ok', `✓ ${files.length} imagen(es) subida(s).`)
    refresh()
  }

  function handleDrop(e) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  async function handleAssociate(imageId, text) {
    const { ids, unknown } = codesToIds(text)
    if (unknown.length) {
      flash('err', `Código(s) no encontrado(s) en esta colección: ${unknown.join(', ')}`)
      return
    }
    await updateCatalogImageReferences(imageId, ids)
    flash('ok', '✓ Asociación actualizada.')
    refresh()
  }

  async function handleReplace(imageId, file) {
    await replaceCatalogImage(imageId, file)
    setCacheBust(prev => ({ ...prev, [imageId]: (prev[imageId] || 0) + 1 }))
    flash('ok', '✓ Imagen reemplazada.')
  }

  async function handleDelete(imageId) {
    if (!confirm('¿Eliminar esta imagen? Esta acción no se puede deshacer.')) return
    await deleteCatalogImage(imageId)
    flash('ok', '✓ Imagen eliminada.')
    refresh()
  }

  async function handleClearCollection() {
    const col = collections.find(c => String(c.id) === collectionId)
    if (!confirm(`¿Vaciar TODO el catálogo de "${col?.name}"? Se eliminarán ${images.length} imagen(es). Esta acción no se puede deshacer.`)) return
    await clearCollectionCatalog(collectionId)
    flash('ok', '✓ Catálogo vaciado.')
    refresh()
  }

  function withCacheBust(url, imageId) {
    const v = cacheBust[imageId]
    if (!v) return url
    return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
  }

  return (
    <div>
      {banner && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${banner.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {banner.msg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={collectionId} onChange={e => setCollectionId(e.target.value)}
          className="border border-line rounded-lg px-3 py-2 text-sm">
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={handleClearCollection} className="btn-secondary text-xs px-3 py-1.5 text-red-600">
          🗑 Vaciar catálogo de esta colección
        </button>
      </div>

      <label
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        className="block border-2 border-dashed border-line rounded-xl p-8 text-center text-sm text-ink-3 cursor-pointer hover:border-pink mb-6"
      >
        {uploading ? 'Subiendo…' : 'Arrastra imágenes aquí, o haz clic para elegirlas'}
        <input type="file" accept="image/*" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {images.map(img => (
          <div key={img.id} className="card overflow-hidden">
            <img src={withCacheBust(img.thumb_url, img.id)} alt="" className="w-full aspect-[2/3] object-cover" />
            <div className="p-2 space-y-1.5">
              <input
                defaultValue={idsToCodes(img.reference_ids)}
                placeholder="códigos, ej. 110 111"
                onBlur={e => handleAssociate(img.id, e.target.value)}
                className="w-full border border-line rounded px-2 py-1 text-xs"
              />
              <div className="flex gap-1.5">
                <label className="btn-secondary text-[11px] px-2 py-1 flex-1 text-center cursor-pointer">
                  Reemplazar
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files[0] && handleReplace(img.id, e.target.files[0])} />
                </label>
                <button onClick={() => handleDelete(img.id)}
                  className="btn-secondary text-[11px] px-2 py-1 text-red-600">Eliminar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {images.length === 0 && (
        <p className="text-ink-3 text-sm text-center py-10">Esta colección todavía no tiene imágenes.</p>
      )}
    </div>
  )
}
