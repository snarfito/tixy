import { useState, useEffect, useMemo } from 'react'
import {
  getReferencesByCollection, createReference, updateReference, deleteReference,
  getCollections, createCollection, updateCollection, activateCollection, deactivateCollection,
  getUsers, createUser, updateUser, resetUserPassword, copyReferences, bulkUpdateReferences,
  listClients, createClient, updateClient, addStore, updateStore,
} from '../api/admin'
import fmt from '../utils/fmt'

const CATEGORIES = [
  'Vestido corto', 'Vestido largo', 'Conjunto',
  'Blusa', 'Body', 'Camiseta', 'Chaleco', 'Otro',
]

const ROLES = [
  { value: 'admin',   label: 'Administrador' },
  { value: 'manager', label: 'Gerente' },
  { value: 'vendor',  label: 'Vendedor' },
]

const BADGE_CAT = {
  'Vestido corto': 'bg-pink-light text-pink-dark',
  'Vestido largo': 'bg-rose-light text-rose',
  'Conjunto':      'bg-gold-light text-amber-700',
  'Blusa':         'bg-pink-light text-pink-dark',
  'Body':          'bg-rose-light text-rose',
  'Camiseta':      'bg-gold-light text-amber-700',
  'Chaleco':       'bg-gold-light text-amber-700',
  'Otro':          'bg-gray-100 text-gray-500',
}

const BADGE_ROLE = {
  admin:   'bg-pink-light text-pink-dark',
  manager: 'bg-gold-light text-amber-700',
  vendor:  'bg-green-50 text-green-700',
}

// ── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Field ────────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

// ── Botones de acción en tabla ───────────────────────────────────────────────
function ActionBtn({ onClick, title, children, danger }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded-lg text-xs transition-colors
        ${danger
          ? 'text-ink-3 hover:text-red-500 hover:bg-red-50'
          : 'text-ink-3 hover:text-pink-dark hover:bg-pink-light'}`}>
      {children}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// REFERENCIAS
// ════════════════════════════════════════════════════════════════════════════
const EMPTY_REF = { code: '', description: '', category: CATEGORIES[0], price: '' }

function RefsSection() {
  const [collections, setCollections] = useState([])
  const [selColId,    setSelColId]    = useState(null)
  const [refs,        setRefs]        = useState([])
  const [loading,     setLoading]     = useState(false)
  const [modal,       setModal]       = useState(null)
  const [form,        setForm]        = useState(EMPTY_REF)
  const [copyToId,    setCopyToId]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [banner,      setBanner]      = useState(null)
  const [sortBy,      setSortBy]      = useState('code')
  const [sortDir,     setSortDir]     = useState('asc')
  const [filterDesc,   setFilterDesc]   = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected,    setSelected]    = useState(new Set())
  const [bulkAction,  setBulkAction]  = useState('')
  const [bulkPrice,   setBulkPrice]   = useState('')
  const [bulkCatVal,  setBulkCatVal]  = useState('')
  const [bulkCopyCol, setBulkCopyCol] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)

  useEffect(() => {
    getCollections(false).then(cols => {
      setCollections(cols)
      if (cols.length) { setSelColId(cols[0].id); setCopyToId(cols[0].id) }
    })
  }, [])

  useEffect(() => {
    if (!selColId) return
    setLoading(true)
    getReferencesByCollection(selColId).then(setRefs).finally(() => setLoading(false))
  }, [selColId])

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3000) }
  function openCreate() { setForm(EMPTY_REF); setModal('create') }
  function openEdit(ref) {
    setForm({ code: ref.code, description: ref.description, category: ref.category, price: ref.base_price })
    setModal(ref)
  }
  function closeModal() { setModal(null) }

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const filteredRefs = useMemo(() => {
    return refs.filter(r => {
      if (filterDesc) {
        const q = filterDesc.toLowerCase()
        if (!r.description.toLowerCase().includes(q) && !r.code.toLowerCase().includes(q)) return false
      }
      if (filterCat    && r.category !== filterCat)   return false
      if (filterStatus === 'active'   && !r.is_active) return false
      if (filterStatus === 'inactive' &&  r.is_active) return false
      return true
    })
  }, [refs, filterDesc, filterCat, filterStatus])

  const allFilteredSelected = filteredRefs.length > 0 &&
    filteredRefs.every(r => selected.has(r.id))

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredRefs.forEach(r => next.delete(r.id))
      } else {
        filteredRefs.forEach(r => next.add(r.id))
      }
      return next
    })
  }

  async function handleBulkAction() {
    if (!selected.size || !bulkAction) return
    setBulkLoading(true)
    try {
      const ids = [...selected]
      const payload = { ids }
      if (bulkAction === 'activate')   payload.is_active = true
      if (bulkAction === 'deactivate') payload.is_active = false
      if (bulkAction === 'price') {
        const v = parseFloat(bulkPrice)
        if (!v || v <= 0) { flash('err', 'Ingresa un precio válido.'); setBulkLoading(false); return }
        payload.base_price = v
      }
      if (bulkAction === 'category') {
        if (!bulkCatVal) { flash('err', 'Selecciona una categoría.'); setBulkLoading(false); return }
        payload.category = bulkCatVal
      }
      if (bulkAction === 'copy') {
        if (!bulkCopyCol) { flash('err', 'Selecciona una colección destino.'); setBulkLoading(false); return }
        payload.copy_to_collection_id = parseInt(bulkCopyCol)
      }
      const result = await bulkUpdateReferences(payload)
      const omitidos = result.errors.length ? ` (${result.errors.length} omitidos)` : ''
      flash('ok', `✓ ${result.updated} actualizadas, ${result.copied} copiadas${omitidos}.`)
      setSelected(new Set())
      setBulkAction('')
      setBulkPrice('')
      setBulkCatVal('')
      setBulkCopyCol('')
      const updated = await getReferencesByCollection(selColId)
      setRefs(updated)
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al ejecutar la acción masiva.')
    } finally {
      setBulkLoading(false)
    }
  }

  const sortedRefs = [...filteredRefs].sort((a, b) => {
    let va, vb
    if (sortBy === 'status') { va = a.is_active ? 0 : 1; vb = b.is_active ? 0 : 1 }
    else if (sortBy === 'code') { va = a.code; vb = b.code }
    else { va = (a[sortBy] || '').toLowerCase(); vb = (b[sortBy] || '').toLowerCase() }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (modal === 'create') {
        const ref = await createReference({
          code: form.code.trim(), description: form.description.trim(),
          category: form.category, base_price: parseFloat(form.price) || 0,
          collection_id: selColId,
        })
        setRefs(prev => [...prev, ref])
        flash('ok', `✓ Referencia ${ref.code} creada.`)
      } else {
        const ref = await updateReference(modal.id, {
          description: form.description.trim(),
          category:    form.category,
          base_price:  parseFloat(form.price) || 0,
        })
        setRefs(prev => prev.map(r => r.id === ref.id ? ref : r))
        flash('ok', `✓ Referencia ${ref.code} actualizada.`)
      }
      closeModal()
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function handleCopy(e) {
    e.preventDefault()
    if (!copyToId || Number(copyToId) === selColId) {
      flash('err', 'Selecciona una colección destino diferente.'); return
    }
    setSaving(true)
    try {
      const created = await copyReferences(selColId, Number(copyToId))
      flash('ok', `✓ ${created.length} referencias copiadas.`)
      closeModal()
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al copiar.')
    } finally { setSaving(false) }
  }

  async function handleToggle(ref) {
    try {
      if (ref.is_active) {
        await deleteReference(ref.id)
        setRefs(prev => prev.map(r => r.id === ref.id ? { ...r, is_active: false } : r))
      } else {
        const updated = await updateReference(ref.id, { is_active: true })
        setRefs(prev => prev.map(r => r.id === ref.id ? updated : r))
      }
    } catch (err) { flash('err', err.response?.data?.detail || 'Error.') }
  }

  const isEdit = modal && modal !== 'create' && modal !== 'copy'

  function SortTh({ col, children, className = '' }) {
    const active = sortBy === col
    return (
      <th onClick={() => toggleSort(col)}
        className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-pink-dark
          cursor-pointer select-none hover:text-pink ${className}`}>
        {children} {active ? (sortDir === 'asc' ? '↑' : '↓') : <span className="opacity-30">↕</span>}
      </th>
    )
  }

  return (
    <div>
      {banner && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium border
          ${banner.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={selColId || ''} onChange={e => { setSelColId(Number(e.target.value)); setSelected(new Set()) }}
          className="input-base w-auto text-sm">
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-ink-3">
          {filteredRefs.length !== refs.length
            ? `${filteredRefs.length} de ${refs.length} referencias`
            : `${refs.length} referencias`}
        </span>
        <button onClick={() => setModal('copy')} className="btn-secondary text-xs px-3 py-1.5">⎘ Copiar a colección</button>
        <button onClick={openCreate} className="btn-primary text-xs px-3 py-1.5">+ Nueva referencia</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <div className="px-4 py-3 border-b border-line bg-surface flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
          <input
            value={filterDesc}
            onChange={e => setFilterDesc(e.target.value)}
            placeholder="Buscar por código o descripción…"
            className="input-base text-xs py-1.5 w-full sm:w-56"
          />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="input-base w-full sm:w-auto text-xs py-1.5">
            <option value="">Todas las categorías</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="input-base w-full sm:w-auto text-xs py-1.5">
            <option value="">Todos los estados</option>
            <option value="active">Solo activas</option>
            <option value="inactive">Solo inactivas</option>
          </select>
          {(filterDesc || filterCat || filterStatus) && (
            <button
              onClick={() => { setFilterDesc(''); setFilterCat(''); setFilterStatus('') }}
              className="text-xs text-pink-dark hover:underline text-left sm:text-center">
              × Limpiar filtros
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="px-4 py-3 border-b border-pink/30 bg-pink-light flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-pink-dark shrink-0">
              {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
            </span>
            <select
              value={bulkAction}
              onChange={e => { setBulkAction(e.target.value); setBulkPrice(''); setBulkCatVal(''); setBulkCopyCol('') }}
              className="input-base w-auto text-xs py-1.5">
              <option value="">— Acción masiva —</option>
              <option value="activate">✅ Activar</option>
              <option value="deactivate">🚫 Desactivar</option>
              <option value="price">💰 Cambiar precio</option>
              <option value="category">🏷 Cambiar categoría</option>
              <option value="copy">⎘ Copiar a colección</option>
            </select>
            {bulkAction === 'price' && (
              <input type="number" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)}
                placeholder="Nuevo precio (COP)" className="input-base text-xs py-1.5 w-40" min={1} />
            )}
            {bulkAction === 'category' && (
              <select value={bulkCatVal} onChange={e => setBulkCatVal(e.target.value)}
                className="input-base w-auto text-xs py-1.5">
                <option value="">Selecciona categoría</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {bulkAction === 'copy' && (
              <select value={bulkCopyCol} onChange={e => setBulkCopyCol(e.target.value)}
                className="input-base w-auto text-xs py-1.5">
                <option value="">Selecciona colección destino</option>
                {collections
                  .filter(c => c.id !== selColId)
                  .map(c => <option key={c.id} value={c.id}>{c.name}{!c.is_active ? ' (inactiva)' : ''}</option>)}
              </select>
            )}
            <button onClick={handleBulkAction} disabled={bulkLoading || !bulkAction}
              className="btn-primary text-xs py-1.5 px-4 disabled:opacity-50 shrink-0">
              {bulkLoading ? 'Aplicando…' : 'Aplicar'}
            </button>
            <button onClick={() => { setSelected(new Set()); setBulkAction('') }}
              className="text-xs text-ink-3 hover:text-ink-2 ml-1">
              × Cancelar selección
            </button>
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-pink-light border-b border-line">
              <th className="px-3 py-2.5 w-9">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
                  disabled={filteredRefs.length === 0}
                  title={allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  className="accent-pink-dark cursor-pointer" />
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Código</th>
              <SortTh col="description" className="text-left">Descripción</SortTh>
              <SortTh col="category" className="text-left">Categoría</SortTh>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Precio</th>
              <SortTh col="status" className="text-center">Estado</SortTh>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark w-20">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-ink-3 text-sm">Cargando…</td></tr>
            ) : sortedRefs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-ink-3 text-sm">
                {refs.length === 0 ? 'No hay referencias en esta colección.' : 'Ninguna referencia coincide con los filtros.'}
              </td></tr>
            ) : sortedRefs.map(ref => (
              <tr key={ref.id} className={`border-b border-line hover:bg-surface transition-colors
                ${selected.has(ref.id) ? 'bg-pink-light/60' : ''}
                ${!ref.is_active ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={selected.has(ref.id)} onChange={() => toggleOne(ref.id)}
                    className="accent-pink-dark cursor-pointer" />
                </td>
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-pink-dark">{ref.code}</td>
                <td className="px-4 py-2.5 text-sm text-ink">{ref.description}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${BADGE_CAT[ref.category] || 'bg-gray-100 text-gray-500'}`}>
                    {ref.category}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-ink">{fmt(ref.base_price)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium
                    ${ref.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {ref.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <ActionBtn onClick={() => openEdit(ref)} title="Editar">✏️</ActionBtn>
                    <ActionBtn onClick={() => handleToggle(ref)} title={ref.is_active ? 'Desactivar' : 'Activar'} danger={ref.is_active}>
                      {ref.is_active ? '🗑' : '↩'}
                    </ActionBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && modal !== 'copy' && (
        <Modal title={isEdit ? `Editar referencia ${modal.code}` : 'Nueva referencia'} onClose={closeModal}>
          <form onSubmit={handleSave}>
            <Field label="Código">
              <input className={`input-base ${isEdit ? 'bg-surface text-ink-3 cursor-not-allowed' : ''}`}
                value={form.code} readOnly={isEdit}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="ej. 3366" required />
            </Field>
            <Field label="Descripción">
              <input className="input-base" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="ej. Vestido C manga corta" required />
            </Field>
            <Field label="Categoría">
              <select className="input-base" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Precio base (COP)">
              <input className="input-base" type="number" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="22000" required />
            </Field>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={closeModal} className="btn-secondary text-xs">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs disabled:opacity-50">
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear referencia'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'copy' && (
        <Modal title="Copiar referencias a otra colección" onClose={closeModal}>
          <form onSubmit={handleCopy}>
            <div className="mb-4 p-3 rounded-lg bg-surface border border-line text-xs text-ink-3">
              Se copiarán todas las referencias <strong>activas</strong> de
              <span className="text-ink font-medium"> {collections.find(c => c.id === selColId)?.name}</span>
              {' '}a la colección destino. Las que ya existan (mismo código) se omitirán.
            </div>
            <Field label="Colección destino">
              <select className="input-base" value={copyToId}
                onChange={e => setCopyToId(e.target.value)}>
                {collections
                  .filter(c => c.id !== selColId)
                  .map(c => <option key={c.id} value={c.id}>{c.name}{!c.is_active ? ' (inactiva)' : ''}</option>)}
              </select>
            </Field>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={closeModal} className="btn-secondary text-xs">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs disabled:opacity-50">
                {saving ? 'Copiando…' : '⎘ Copiar referencias'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// COLECCIONES
// ════════════════════════════════════════════════════════════════════════════
const EMPTY_COL = { name: '', year: new Date().getFullYear(), season: 1 }

function ColsSection() {
  const [cols,    setCols]    = useState([])
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState(EMPTY_COL)
  const [saving,  setSaving]  = useState(false)
  const [banner,  setBanner]  = useState(null)

  useEffect(() => { getCollections(false).then(setCols) }, [])

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3000) }
  function openCreate() { setForm(EMPTY_COL); setModal('create') }
  function openEdit(col) { setForm({ name: col.name, year: col.year, season: col.season }); setModal(col) }
  function closeModal() { setModal(null) }

  const isEdit = modal && modal !== 'create'

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (isEdit) {
        const updated = await updateCollection(modal.id, {
          name:   form.name.trim(),
          year:   modal.year,
          season: modal.season,
        })
        setCols(prev => prev.map(c => c.id === updated.id ? updated : c))
        flash('ok', `✓ Colección "${updated.name}" actualizada.`)
        closeModal()
      } else {
        const col = await createCollection({
          name: form.name.trim(), year: parseInt(form.year), season: parseInt(form.season),
        })
        setCols(prev => [col, ...prev])
        flash('ok', `✓ Colección "${col.name}" creada.`)
        closeModal()
      }
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error.')
    } finally { setSaving(false) }
  }

  async function handleToggleCol(col) {
    const action = col.is_active ? 'desactivar' : 'activar'
    if (!confirm(`¿Deseas ${action} la colección "${col.name}"?`)) return
    try {
      const updated = col.is_active
        ? await deactivateCollection(col.id)
        : await activateCollection(col.id)
      setCols(prev => prev.map(c => c.id === col.id ? updated : c))
      flash('ok', `Colección "${col.name}" ${col.is_active ? 'desactivada' : 'activada'}.`)
    } catch (err) { flash('err', err.response?.data?.detail || 'Error.') }
  }

  return (
    <div>
      {banner && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium border
          ${banner.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary text-xs px-3 py-1.5">+ Nueva colección</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-pink-light border-b border-line">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Nombre</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Año</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Temporada</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Estado</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark w-20">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cols.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-ink-3 text-sm">No hay colecciones.</td></tr>
            ) : cols.map(col => (
              <tr key={col.id} className={`border-b border-line hover:bg-surface ${!col.is_active ? 'opacity-40' : ''}`}>
                <td className="px-4 py-2.5 text-sm font-medium text-ink">{col.name}</td>
                <td className="px-4 py-2.5 text-center text-sm text-ink-2">{col.year}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-pink-light text-pink-dark">
                    #{col.season}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium
                    ${col.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {col.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <ActionBtn onClick={() => openEdit(col)} title="Editar">✏️</ActionBtn>
                    <ActionBtn onClick={() => handleToggleCol(col)}
                      title={col.is_active ? 'Desactivar' : 'Activar'}
                      danger={col.is_active}>
                      {col.is_active ? '🗑' : '↩'}
                    </ActionBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={isEdit ? 'Editar colección' : 'Nueva colección'} onClose={closeModal}>
          <form onSubmit={handleSave}>
            <Field label="Nombre">
              <input className="input-base" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ej. Colección 2 - 2026" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Año">
                <input
                  className={`input-base ${isEdit ? 'bg-surface text-ink-3 cursor-not-allowed' : ''}`}
                  type="number" value={form.year}
                  onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  readOnly={isEdit}
                  required />
              </Field>
              <Field label="Temporada (1-4)">
                <select className="input-base" value={form.season}
                  onChange={e => setForm(f => ({ ...f, season: e.target.value }))}
                  disabled={isEdit}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>#{n}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={closeModal} className="btn-secondary text-xs">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs disabled:opacity-50">
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear colección'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// USUARIOS
// ════════════════════════════════════════════════════════════════════════════
const EMPTY_USER = { full_name: '', email: '', password: '', role: 'vendor', phone: '', contact_info: '' }

function UsersSection() {
  const [users,      setUsers]      = useState([])
  const [modal,      setModal]      = useState(null)   // null | 'create' | user-object
  const [resetModal, setResetModal] = useState(null)   // null | user-object
  const [form,       setForm]       = useState(EMPTY_USER)
  const [resetPw,    setResetPw]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [banner,     setBanner]     = useState(null)

  useEffect(() => { getUsers().then(setUsers) }, [])

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3000) }
  function openCreate()       { setForm(EMPTY_USER); setModal('create') }
  function openEdit(user)     { setForm({ full_name: user.full_name, email: user.email, password: '', role: user.role, phone: user.phone || '', contact_info: user.contact_info || '' }); setModal(user) }
  function closeModal()       { setModal(null) }
  function openResetModal(u)  { setResetPw(''); setResetModal(u) }
  function closeResetModal()  { setResetModal(null) }

  const isEdit = modal && modal !== 'create'

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (isEdit) {
        const payload = {
          full_name:    form.full_name.trim(),
          role:         form.role,
          phone:        form.phone.trim() || null,
          contact_info: form.contact_info.trim() || null,
        }
        const updated = await updateUser(modal.id, payload)
        setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
        flash('ok', `✓ Usuario ${updated.full_name} actualizado.`)
      } else {
        const user = await createUser({
          full_name:    form.full_name.trim(),
          email:        form.email.trim(),
          password:     form.password,
          role:         form.role,
          phone:        form.phone.trim() || null,
          contact_info: form.contact_info.trim() || null,
        })
        setUsers(prev => [...prev, user])
        flash('ok', `✓ Usuario ${user.full_name} creado.`)
      }
      closeModal()
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    if (!resetPw || resetPw.length < 6) {
      flash('err', 'La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setSaving(true)
    try {
      await resetUserPassword(resetModal.id, resetPw)
      flash('ok', `✓ Contraseña de ${resetModal.full_name} restablecida.`)
      closeResetModal()
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al restablecer contraseña.')
    } finally { setSaving(false) }
  }

  async function handleToggle(user) {
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active })
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u))
      flash('ok', `Usuario ${updated.is_active ? 'activado' : 'desactivado'}.`)
    } catch (err) { flash('err', err.response?.data?.detail || 'Error.') }
  }

  return (
    <div>
      {banner && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium border
          ${banner.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary text-xs px-3 py-1.5">+ Nuevo usuario</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-pink-light border-b border-line">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Nombre</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Email</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Teléfono</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Rol</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Estado</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark w-28">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-ink-3 text-sm">No hay usuarios.</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className={`border-b border-line hover:bg-surface ${!user.is_active ? 'opacity-40' : ''}`}>
                <td className="px-4 py-2.5 text-sm font-medium text-ink">
                  <span>{user.full_name}</span>
                  {user.is_superuser && (
                    <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold
                                     bg-pink-dark text-white tracking-wider" title="Superusuario protegido">
                      SUPER
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-sm text-ink-2">{user.email}</td>
                <td className="px-4 py-2.5 text-sm text-ink-3">{user.phone || '—'}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${BADGE_ROLE[user.role] || 'bg-gray-100'}`}>
                    {ROLES.find(r => r.value === user.role)?.label || user.role}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium
                    ${user.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {user.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <ActionBtn onClick={() => openEdit(user)} title="Editar">✏️</ActionBtn>
                    {!user.is_superuser && (
                      <>
                        <ActionBtn onClick={() => openResetModal(user)} title="Restablecer contraseña">🔑</ActionBtn>
                        <ActionBtn onClick={() => handleToggle(user)} title={user.is_active ? 'Desactivar' : 'Activar'} danger={user.is_active}>
                          {user.is_active ? '🗑' : '↩'}
                        </ActionBtn>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal editar / crear usuario */}
      {modal && (
        <Modal title={isEdit ? 'Editar usuario' : 'Nuevo usuario'} onClose={closeModal}>
          <form onSubmit={handleSave}>
            <Field label="Nombre completo">
              <input className="input-base" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Nombre Apellido" required />
            </Field>
            <Field label="Email">
              <input className={`input-base ${isEdit ? 'bg-surface text-ink-3 cursor-not-allowed' : ''}`}
                type="email" value={form.email} readOnly={isEdit}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="usuario@tixy.co" required />
            </Field>
            {!isEdit && (
              <Field label="Contraseña">
                <input className="input-base" type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres" required minLength={6} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rol">
                <select className="input-base" value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Teléfono">
                <input className="input-base" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="310 000 0000" />
              </Field>
            </div>
            <Field label="Info contacto (aparece en PDF)">
              <input className="input-base" value={form.contact_info}
                onChange={e => setForm(f => ({ ...f, contact_info: e.target.value }))}
                placeholder="319 680 0557" />
            </Field>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={closeModal} className="btn-secondary text-xs">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs disabled:opacity-50">
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal reset de contraseña */}
      {resetModal && (
        <Modal title={`Restablecer contraseña — ${resetModal.full_name}`} onClose={closeResetModal}>
          <form onSubmit={handleResetPassword}>
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              ⚠️ Se asignará una contraseña temporal. Comunícasela al usuario de forma segura.
            </div>
            <Field label="Nueva contraseña temporal">
              <input
                className="input-base"
                type="text"
                value={resetPw}
                onChange={e => setResetPw(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </Field>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={closeResetModal} className="btn-secondary text-xs">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs disabled:opacity-50">
                {saving ? 'Guardando…' : '🔑 Restablecer contraseña'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CLIENTES
// ════════════════════════════════════════════════════════════════════════════
const CITIES = ['La Dorada','Bogotá','Medellín','Cali','Barranquilla','Pereira','Manizales','Bucaramanga','Ibágué']

const EMPTY_CLIENT = { business_name: '', nit: '', phone: '', email: '', notes: '' }
const EMPTY_STORE  = { name: '', address: '', city: 'Bogotá', phone: '', contact: '' }

function StoresPanel({ client, onStoreUpdated, flash }) {
  const [addingStore, setAddingStore] = useState(false)
  const [editStore,   setEditStore]   = useState(null)
  const [form,        setForm]        = useState(EMPTY_STORE)
  const [saving,      setSaving]      = useState(false)

  function openAdd()       { setForm(EMPTY_STORE); setAddingStore(true); setEditStore(null) }
  function openEdit(store) { setForm({ name: store.name, address: store.address || '', city: store.city || 'Bogotá', phone: store.phone || '', contact: store.contact || '' }); setEditStore(store); setAddingStore(false) }
  function cancelForm()    { setAddingStore(false); setEditStore(null) }

  async function handleSaveStore(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editStore) {
        const updated = await updateStore(editStore.id, form)
        onStoreUpdated(client.id, updated, 'edit')
        flash('ok', `✓ Almacén "${updated.name}" actualizado.`)
      } else {
        const created = await addStore(client.id, form)
        onStoreUpdated(client.id, created, 'add')
        flash('ok', `✓ Almacén "${created.name}" agregado.`)
      }
      cancelForm()
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al guardar almacén.')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-surface border-t border-line">
      <div className="px-6 py-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-3">
          Almacenes ({client.stores.length})
        </span>
        <button onClick={openAdd} className="text-[11px] text-pink-dark hover:underline font-medium">
          + Agregar almacén
        </button>
      </div>

      {client.stores.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-line bg-white">
                {['Nombre', 'Ciudad', 'Dirección', 'Teléfono', 'Contacto', ''].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {client.stores.map(store => (
                <tr key={store.id} className="border-b border-line hover:bg-white transition-colors">
                  <td className="px-4 py-2 font-medium text-ink">{store.name}</td>
                  <td className="px-4 py-2 text-ink-2">{store.city || '—'}</td>
                  <td className="px-4 py-2 text-ink-3 max-w-[200px] truncate">{store.address || '—'}</td>
                  <td className="px-4 py-2 text-ink-3">{store.phone || '—'}</td>
                  <td className="px-4 py-2 text-ink-3">{store.contact || '—'}</td>
                  <td className="px-3 py-2">
                    <ActionBtn onClick={() => openEdit(store)} title="Editar almacén">✏️</ActionBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(addingStore || editStore) && (
        <form onSubmit={handleSaveStore} className="px-6 py-4 border-t border-line bg-white">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-pink-dark mb-3">
            {editStore ? `Editando: ${editStore.name}` : 'Nuevo almacén'}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Nombre *</label>
              <input className="input-base text-xs" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre del almacén" required />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Ciudad</label>
              <select className="input-base text-xs" value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Dirección</label>
              <input className="input-base text-xs" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Dirección" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Teléfono</label>
              <input className="input-base text-xs" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="310 000 0000" />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Persona de contacto</label>
            <input className="input-base text-xs" value={form.contact}
              onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
              placeholder="Nombre del responsable del almacén" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancelForm} className="btn-secondary text-xs">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary text-xs disabled:opacity-50">
              {saving ? 'Guardando…' : editStore ? 'Guardar cambios' : 'Agregar almacén'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function ClientRow({ client, onEdit, onStoreUpdated, flash }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr className="border-b border-line hover:bg-surface transition-colors cursor-pointer"
        onClick={() => setExpanded(e => !e)}>
        <td className="px-4 py-3">
          <span className={`text-xs transition-transform inline-block ${expanded ? 'rotate-90' : ''}`}>▶</span>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm font-semibold text-ink">{client.business_name}</div>
          {client.notes && <div className="text-[11px] text-ink-3 mt-0.5 truncate max-w-[200px]">{client.notes}</div>}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-ink-2">{client.nit || '—'}</td>
        <td className="px-4 py-3 text-xs text-ink-3">{client.phone || '—'}</td>
        <td className="px-4 py-3 text-xs text-ink-3">{client.email || '—'}</td>
        <td className="px-4 py-3 text-center">
          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-pink-light text-pink-dark">
            {client.stores.length} almacén{client.stores.length !== 1 ? 'es' : ''}
          </span>
        </td>
        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
          <ActionBtn onClick={() => onEdit(client)} title="Editar cliente">✏️</ActionBtn>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <StoresPanel client={client} onStoreUpdated={onStoreUpdated} flash={flash} />
          </td>
        </tr>
      )}
    </>
  )
}

function ClientsSection() {
  const [clients,  setClients]  = useState([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [modal,    setModal]    = useState(null)
  const [form,     setForm]     = useState(EMPTY_CLIENT)
  const [saving,   setSaving]   = useState(false)
  const [banner,   setBanner]   = useState(null)

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3500) }

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      listClients(search).then(setClients).finally(() => setLoading(false))
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])

  function openCreate()  { setForm(EMPTY_CLIENT); setModal('create') }
  function openEdit(c)   { setForm({ business_name: c.business_name, nit: c.nit || '', phone: c.phone || '', email: c.email || '', notes: c.notes || '' }); setModal(c) }
  function closeModal()  { setModal(null) }
  const isEdit = modal && modal !== 'create'

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        business_name: form.business_name.trim(),
        nit:   form.nit.trim()   || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (isEdit) {
        const updated = await updateClient(modal.id, payload)
        setClients(prev => prev.map(c => c.id === updated.id
          ? { ...updated, stores: c.stores } : c))
        flash('ok', `✓ Cliente "${updated.business_name}" actualizado.`)
      } else {
        const created = await createClient({ ...payload, stores: [] })
        setClients(prev => [created, ...prev])
        flash('ok', `✓ Cliente "${created.business_name}" creado.`)
      }
      closeModal()
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al guardar.')
    } finally { setSaving(false) }
  }

  function handleStoreUpdated(clientId, store, action) {
    setClients(prev => prev.map(c => {
      if (c.id !== clientId) return c
      if (action === 'add')  return { ...c, stores: [...c.stores, store] }
      if (action === 'edit') return { ...c, stores: c.stores.map(s => s.id === store.id ? store : s) }
      return c
    }))
  }

  return (
    <div>
      {banner && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium border
          ${banner.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por razón social o NIT…" className="input-base pl-8 text-sm" />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink text-sm">×</button>
          )}
        </div>
        <span className="text-xs text-ink-3">{clients.length} cliente{clients.length !== 1 ? 's' : ''}</span>
        <button onClick={openCreate} className="btn-primary text-xs px-3 py-1.5">+ Nuevo cliente</button>
      </div>

      <div className="rounded-xl border border-line overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-pink-light border-b border-line">
              <th className="w-8" />
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Razón social</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">NIT / Cédula</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Teléfono</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Email</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Almacenes</th>
              <th className="px-4 py-2.5 w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-ink-3 text-sm">Cargando…</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-ink-3 text-sm">
                {search ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes registrados aún.'}
              </td></tr>
            ) : clients.map(client => (
              <ClientRow key={client.id} client={client} onEdit={openEdit}
                onStoreUpdated={handleStoreUpdated} flash={flash} />
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={isEdit ? `Editar cliente: ${modal.business_name}` : 'Nuevo cliente'} onClose={closeModal}>
          <form onSubmit={handleSave}>
            <Field label="Razón social *">
              <input className="input-base" value={form.business_name}
                onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
                placeholder="Nombre o razón social" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="NIT / Cédula">
                <input className="input-base" value={form.nit}
                  onChange={e => setForm(f => ({ ...f, nit: e.target.value }))}
                  placeholder="900.123.456-7" />
              </Field>
              <Field label="Teléfono">
                <input className="input-base" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="310 000 0000" />
              </Field>
            </div>
            <Field label="Email">
              <input className="input-base" type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="cliente@ejemplo.com" />
            </Field>
            <Field label="Notas internas">
              <textarea className="input-base resize-none" rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observaciones, condiciones especiales…" />
            </Field>
            {!isEdit && (
              <div className="mb-4 p-3 rounded-lg bg-surface border border-line text-xs text-ink-3">
                Podrás agregar almacenes después de crear el cliente, desde la tabla principal.
              </div>
            )}
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={closeModal} className="btn-secondary text-xs">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs disabled:opacity-50">
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'refs',    label: 'Referencias', short: 'Refs',  icon: '≡' },
  { id: 'cols',    label: 'Colecciones', short: 'Cols',  icon: '📦' },
  { id: 'clients', label: 'Clientes',    short: 'Clientes', icon: '🏪' },
  { id: 'users',   label: 'Usuarios',    short: 'Usuarios', icon: '👤' },
]

export default function AdminPage() {
  const [tab, setTab] = useState('refs')

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-ink">Administración</h1>
        <p className="text-ink-3 text-sm">Gestiona referencias, colecciones y usuarios.</p>
      </div>

      <div className="flex gap-0 border-b border-line mb-4 sm:mb-6 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 px-3 sm:px-5 py-2.5 sm:py-3
              text-[11px] sm:text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap flex-1 sm:flex-none justify-center sm:justify-start
              ${tab === t.id ? 'text-pink-dark border-pink bg-pink-light/40 sm:bg-transparent' : 'text-ink-3 border-transparent hover:text-ink-2'}`}>
            <span className="text-sm sm:text-base">{t.icon}</span>
            <span className="hidden xs:inline sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'refs'    && <RefsSection />}
      {tab === 'cols'    && <ColsSection />}
      {tab === 'clients' && <ClientsSection />}
      {tab === 'users'   && <UsersSection />}
    </div>
  )
}
