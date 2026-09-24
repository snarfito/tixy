import { useState, useEffect, useCallback } from 'react'
import { getCollections, getReferencesByCollection } from '../../api/admin'
import {
  getCatalogImagesByCollection, uploadCatalogImage, updateCatalogImageReferences,
  replaceCatalogImage, deleteCatalogImage, clearCollectionCatalog,
} from '../../api/catalog'
import ReferenceCodesInput from './ReferenceCodesInput'

export default function CatalogSection() {
  const [collections,  setCollections]  = useState([])
  const [collectionId, setCollectionId] = useState('')
  const [refs,         setRefs]         = useState([])   // referencias de la coleccion, para el autocompletado
  const [images,       setImages]       = useState([])
  const [pendingFiles, setPendingFiles] = useState([])   // [{ id, file, previewUrl, referenceIds }] — antes de subir
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

  // ── selección de archivos → modal de asociación previa ──────────────────
  function stageFiles(fileList) {
    const files = Array.from(fileList)
    if (!files.length) return
    setPendingFiles(files.map((file, idx) => ({
      id: `${Date.now()}_${idx}`,
      file,
      previewUrl: URL.createObjectURL(file),
      referenceIds: [],
    })))
  }

  function handleDrop(e) {
    e.preventDefault()
    stageFiles(e.dataTransfer.files)
  }

  function updatePendingRefs(id, referenceIds) {
    setPendingFiles(prev => prev.map(pf => pf.id === id ? { ...pf, referenceIds } : pf))
  }

  function cancelUpload() {
    pendingFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl))
    setPendingFiles([])
  }

  async function confirmUpload() {
    const count = pendingFiles.length
    setUploading(true)
    const CONCURRENCY = 3
    for (let i = 0; i < pendingFiles.length; i += CONCURRENCY) {
      const batch = pendingFiles.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        batch.map(pf => uploadCatalogImage({ file: pf.file, collectionId, referenceIds: pf.referenceIds }))
      )
    }
    pendingFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl))
    setPendingFiles([])
    setUploading(false)
    flash('ok', `✓ ${count} imagen(es) subida(s).`)
    refresh()
  }

  async function handleAssociate(imageId, referenceIds) {
    await updateCatalogImageReferences(imageId, referenceIds)
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
        Arrastra imágenes aquí, o haz clic para elegirlas
        <input type="file" accept="image/*" multiple className="hidden"
          onChange={e => stageFiles(e.target.files)} />
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {images.map(img => (
          <div key={img.id} className="card overflow-hidden">
            <img src={withCacheBust(img.thumb_url, img.id)} alt="" className="w-full aspect-[2/3] object-cover" />
            <div className="p-2 space-y-1.5">
              <ReferenceCodesInput
                refs={refs}
                value={img.reference_ids}
                onChange={ids => handleAssociate(img.id, ids)}
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

      {/* Modal: asociar referencias antes de subir */}
      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
              <h3 className="text-sm font-semibold text-ink">Asociar referencias ({pendingFiles.length})</h3>
              <button onClick={cancelUpload} className="text-ink-3 hover:text-ink text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {pendingFiles.map(pf => (
                <div key={pf.id} className="flex gap-3 items-start">
                  <img src={pf.previewUrl} alt="" className="w-16 h-20 object-cover rounded border border-line flex-shrink-0" />
                  <div className="flex-1">
                    <ReferenceCodesInput
                      refs={refs}
                      value={pf.referenceIds}
                      onChange={ids => updatePendingRefs(pf.id, ids)}
                      placeholder="Código(s), opcional"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-5 py-3.5 border-t border-line">
              <button onClick={cancelUpload} disabled={uploading} className="btn-secondary text-xs px-3 py-1.5 flex-1">
                Cancelar
              </button>
              <button onClick={confirmUpload} disabled={uploading} className="btn-primary text-xs px-3 py-1.5 flex-1">
                {uploading ? 'Subiendo…' : `Subir ${pendingFiles.length} imagen(es)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
