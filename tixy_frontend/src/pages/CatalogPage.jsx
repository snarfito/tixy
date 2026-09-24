import { useState, useEffect, useMemo } from 'react'
import { getAllCollections, getReferences } from '../api/orders'
import { getCatalogCovers, getCatalogImagesByReference } from '../api/catalog'

export default function CatalogPage() {
  const [collections, setCollections] = useState([])
  const [collectionId, setCollectionId] = useState('')
  const [refs, setRefs] = useState([])       // todas las referencias de la colección, ordenadas por código
  const [covers, setCovers] = useState([])   // solo las que tienen imagen (para la grilla)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewerIndex, setViewerIndex] = useState(null)  // índice dentro de `refs`, o null si cerrado
  const [viewerImages, setViewerImages] = useState([])
  const [viewerLoading, setViewerLoading] = useState(false)

  useEffect(() => {
    getAllCollections().then(cols => {
      setCollections(cols)
      if (cols.length) setCollectionId(String(cols[0].id))
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!collectionId) return
    setViewerIndex(null)
    Promise.all([
      getReferences({ collection_id: collectionId }),
      getCatalogCovers(collectionId),
    ]).then(([refsData, coversData]) => {
      setRefs(refsData)
      setCovers(coversData)
    })
  }, [collectionId])

  useEffect(() => {
    if (viewerIndex === null) return
    const ref = refs[viewerIndex]
    if (!ref) return
    setViewerLoading(true)
    getCatalogImagesByReference(ref.id)
      .then(setViewerImages)
      .finally(() => setViewerLoading(false))
  }, [viewerIndex, refs])

  const filteredCovers = useMemo(() => {
    if (!search.trim()) return covers
    const q = search.trim().toLowerCase()
    return covers.filter(c => c.code.toLowerCase().includes(q))
  }, [covers, search])

  function openByReferenceId(referenceId) {
    const idx = refs.findIndex(r => r.id === referenceId)
    if (idx !== -1) setViewerIndex(idx)
  }

  function openBySearch() {
    const q = search.trim().toLowerCase()
    if (!q) return
    const match = refs.find(r => r.code.toLowerCase() === q) || refs.find(r => r.code.toLowerCase().includes(q))
    if (match) openByReferenceId(match.id)
  }

  const currentRef = viewerIndex !== null ? refs[viewerIndex] : null

  if (loading) return <p className="text-ink-3 text-sm">Cargando…</p>

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-ink">Catálogo</h1>
        <p className="text-ink-3 text-sm">Explora las imágenes por colección y referencia.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <select value={collectionId} onChange={e => setCollectionId(e.target.value)}
          className="border border-line rounded-lg px-3 py-2 text-sm">
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex gap-2 flex-1">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && openBySearch()}
            placeholder="Buscar por código (ej. 110)"
            className="border border-line rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button onClick={openBySearch} className="btn-secondary text-xs px-3">Buscar</button>
        </div>
      </div>

      {filteredCovers.length === 0 ? (
        <p className="text-ink-3 text-sm text-center py-10">No hay imágenes en esta colección todavía.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {filteredCovers.map(c => (
            <button key={c.reference_id} onClick={() => openByReferenceId(c.reference_id)}
              className="card overflow-hidden text-left">
              <img src={c.thumb_url} alt={c.code} className="w-full aspect-[2/3] object-cover" />
              <div className="px-2 py-1.5 text-xs font-medium text-ink">{c.code}</div>
            </button>
          ))}
        </div>
      )}

      {currentRef && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-semibold">{currentRef.code}</span>
            <button onClick={() => setViewerIndex(null)} className="text-2xl leading-none">×</button>
          </div>

          <div className="flex-1 flex items-center justify-center relative px-4">
            <button
              onClick={() => setViewerIndex(i => Math.max(0, i - 1))}
              disabled={viewerIndex === 0}
              className="absolute left-2 sm:left-6 text-white text-3xl disabled:opacity-20">‹</button>

            {viewerLoading ? (
              <p className="text-white/60 text-sm">Cargando…</p>
            ) : viewerImages.length === 0 ? (
              <p className="text-white/60 text-sm">Sin imágenes aún.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto max-w-full max-h-full">
                {viewerImages.map(img => (
                  <img key={img.id} src={img.full_url} alt={currentRef.code}
                    className="max-h-[80vh] object-contain rounded-lg" />
                ))}
              </div>
            )}

            <button
              onClick={() => setViewerIndex(i => Math.min(refs.length - 1, i + 1))}
              disabled={viewerIndex === refs.length - 1}
              className="absolute right-2 sm:right-6 text-white text-3xl disabled:opacity-20">›</button>
          </div>
        </div>
      )}
    </div>
  )
}
