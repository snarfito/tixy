import { useState, useEffect } from 'react'
import {
  getReferencesByCollection, createReference, updateReference, deleteReference,
  getCollections, createCollection, updateCollection, activateCollection, deactivateCollection,
  getUsers, createUser, updateUser, copyReferences,
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

// columnas ordenables
const SORT_OPTS = [
  { value: 'code',        label: 'Código' },
  { value: 'description', label: 'Descripción' },
  { value: 'category',    label: 'Categoría' },
  { value: 'status',      label: 'Estado' },
]

function RefsSection() {
  const [collections, setCollections] = useState([])
  const [selColId,    setSelColId]    = useState(null)
  const [refs,        setRefs]        = useState([])
  const [loading,     setLoading]     = useState(false)
  const [modal,       setModal]       = useState(null)   // null | 'create' | 'copy' | ref-object
  const [form,        setForm]        = useState(EMPTY_REF)
  const [copyToId,    setCopyToId]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [banner,      setBanner]      = useState(null)
  const [sortBy,      setSortBy]      = useState('code')
  const [sortDir,     setSortDir]     = useState('asc')

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

  const sortedRefs = [...refs].sort((a, b) => {
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

  // cabecera ordenable
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
        <select value={selColId || ''} onChange={e => setSelColId(Number(e.target.value))}
          className="input-base w-auto text-sm">
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-ink-3">{refs.length} referencias</span>
        <button onClick={() => setModal('copy')} className="btn-secondary text-xs px-3 py-1.5">⎘ Copiar a colección</button>
        <button onClick={openCreate} className="btn-primary text-xs px-3 py-1.5">+ Nueva referencia</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-pink-light border-b border-line">
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
              <tr><td colSpan={6} className="text-center py-10 text-ink-3 text-sm">Cargando…</td></tr>
            ) : sortedRefs.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-ink-3 text-sm">No hay referencias en esta colección.</td></tr>
            ) : sortedRefs.map(ref => (
              <tr key={ref.id} className={`border-b border-line hover:bg-surface transition-colors ${!ref.is_active ? 'opacity-40' : ''}`}>
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

      {/* Modal crear / editar */}
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

      {/* Modal copiar referencias */}
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
  const [modal,   setModal]   = useState(null)   // null | 'create' | col-object
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
        <Modal title={isEdit ? `Editar colección` : 'Nueva colección'} onClose={closeModal}>
          <form onSubmit={handleSave}>
            <Field label="Nombre">
              <input className="input-base" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ej. Colección 2 - 2026" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Año">
                <input className="input-base" type="number" value={form.year}
                  onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  readOnly={isEdit} className={`input-base ${isEdit ? 'bg-surface text-ink-3 cursor-not-allowed' : ''}`}
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
  const [users,   setUsers]   = useState([])
  const [modal,   setModal]   = useState(null)   // null | 'create' | user-object
  const [form,    setForm]    = useState(EMPTY_USER)
  const [saving,  setSaving]  = useState(false)
  const [banner,  setBanner]  = useState(null)

  useEffect(() => { getUsers().then(setUsers) }, [])

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3000) }
  function openCreate() { setForm(EMPTY_USER); setModal('create') }
  function openEdit(user) {
    setForm({ full_name: user.full_name, email: user.email, password: '', role: user.role, phone: user.phone || '', contact_info: user.contact_info || '' })
    setModal(user)
  }
  function closeModal() { setModal(null) }

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
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark w-20">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-ink-3 text-sm">No hay usuarios.</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className={`border-b border-line hover:bg-surface ${!user.is_active ? 'opacity-40' : ''}`}>
                <td className="px-4 py-2.5 text-sm font-medium text-ink">{user.full_name}</td>
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
                    <ActionBtn onClick={() => handleToggle(user)} title={user.is_active ? 'Desactivar' : 'Activar'} danger={user.is_active}>
                      {user.is_active ? '🗑' : '↩'}
                    </ActionBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={isEdit ? `Editar usuario` : 'Nuevo usuario'} onClose={closeModal}>
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
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'refs',  label: 'Referencias', icon: '≡' },
  { id: 'cols',  label: 'Colecciones', icon: '📦' },
  { id: 'users', label: 'Usuarios',    icon: '👤' },
]

export default function AdminPage() {
  const [tab, setTab] = useState('refs')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Administración</h1>
        <p className="text-ink-3 text-sm">Gestiona referencias, colecciones y usuarios.</p>
      </div>

      <div className="flex gap-1 border-b border-line mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 transition-colors
              ${tab === t.id ? 'text-pink-dark border-pink' : 'text-ink-3 border-transparent hover:text-ink-2'}`}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === 'refs'  && <RefsSection />}
      {tab === 'cols'  && <ColsSection />}
      {tab === 'users' && <UsersSection />}
    </div>
  )
}
