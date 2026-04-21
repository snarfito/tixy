import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { getReferences, getCollections, searchClients, createClient, createOrder, sendOrder, downloadPdfVendor } from '../api/orders'
import fmt from '../utils/fmt'

function today() {
  const d = new Date()
  return {
    day: String(d.getDate()).padStart(2, '0'),
    mon: String(d.getMonth() + 1).padStart(2, '0'),
    yr:  String(d.getFullYear()).slice(2),
  }
}

const CITIES = ['La Dorada','Bogotá','Medellín','Cali','Barranquilla','Pereira','Manizales','Bucaramanga','Ibagué']

export default function VendorPage() {
  const { user, token } = useAuthStore()
  const date = today()

  const [collections,   setCollections]   = useState([])
  const [collectionId,  setCollectionId]  = useState(null)
  const [orderNum,      setOrderNum]      = useState('____')

  const [clientName,  setClientName]  = useState('')
  const [storeName,   setStoreName]   = useState('')
  const [address,     setAddress]     = useState('')
  const [nit,         setNit]         = useState('')
  const [tel,         setTel]         = useState('')
  const [cel,         setCel]         = useState('')
  const [city,        setCity]        = useState(CITIES[0])

  const [clientSearch,  setClientSearch]  = useState('')
  const [clientResults, setClientResults] = useState([])
  const [selectedStore, setSelectedStore] = useState(null)
  const [showClientDD,  setShowClientDD]  = useState(false)

  const [refSearch,  setRefSearch]  = useState('')
  const [refResults, setRefResults] = useState([])
  const [showRefDD,  setShowRefDD]  = useState(false)

  const [lines, setLines] = useState([])

  const [submitting,  setSubmitting]  = useState(false)
  const [banner,      setBanner]      = useState(null)
  const [lastOrderId, setLastOrderId] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const refSearchRef = useRef(null)

  // ── cargar colecciones — solo cuando el token ya existe ──────────────────
  useEffect(() => {
    const t = localStorage.getItem('tixy_token')
    if (!t) return
    getCollections()
      .then(cols => {
        if (cols.length) {
          setCollections(cols)
          setCollectionId(cols[0].id)
        }
      })
      .catch(err => console.error('Error cargando colecciones:', err))
  }, [token])   // se re-ejecuta cuando el token cambia

  // ── búsqueda de referencias ──────────────────────────────────────────────
  useEffect(() => {
    if (!refSearch.trim()) { setRefResults([]); setShowRefDD(false); return }
    const t = setTimeout(() => {
      getReferences({ search: refSearch })   // busca en todas las colecciones activas
        .then(data => { setRefResults(data); setShowRefDD(data.length > 0) })
        .catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [refSearch])

  // ── búsqueda de clientes ─────────────────────────────────────────────────
  useEffect(() => {
    if (!clientSearch.trim()) { setClientResults([]); setShowClientDD(false); return }
    const t = setTimeout(() => {
      searchClients(clientSearch)
        .then(data => { setClientResults(data); setShowClientDD(data.length > 0) })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  function selectRef(ref) {
    if (lines.find(l => l.refId === ref.id)) {
      flash('err', 'Esa referencia ya está en el pedido.')
      return
    }
    setLines(prev => [...prev, {
      refId: ref.id, code: ref.code,
      desc:  ref.description, cat: ref.category,
      qty:   12, price: ref.base_price,
    }])
    setRefSearch('')
    setShowRefDD(false)
  }

  function selectStore(client, store) {
    setSelectedStore({ id: store.id, clientId: client.id, name: store.name, city: store.city, address: store.address })
    setClientName(client.business_name)
    setStoreName(store.name)
    setNit(client.nit || '')
    setTel(client.phone || '')
    setAddress(store.address || '')
    setCity(store.city || CITIES[0])
    setClientSearch('')
    setShowClientDD(false)
  }

  function updateLine(idx, field, val) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: Number(val) || 0 } : l))
  }
  function removeLine(idx) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0)

  function flash(type, msg) {
    setBanner({ type, msg })
    setTimeout(() => setBanner(null), 3500)
  }

  async function handleSubmit() {
    if (!lines.length)    { flash('err', 'Agrega al menos una referencia al pedido.'); return }
    if (!collectionId)    { flash('err', 'No hay una colección activa.'); return }

    setSubmitting(true)
    try {
      let storeId = selectedStore?.id

      if (!storeId) {
        if (!clientName.trim() || !storeName.trim()) {
          flash('err', 'Completa el nombre del cliente y del almacén.')
          setSubmitting(false)
          return
        }
        const newClient = await createClient({
          business_name: clientName.trim(),
          nit:   nit.trim() || null,
          phone: tel.trim() || null,
          stores: [{
            name:    storeName.trim(),
            address: address.trim() || null,
            city:    city,
            phone:   cel.trim() || null,
          }],
        })
        storeId = newClient.stores[0].id
      }

      const order = await createOrder({
        store_id:      storeId,
        collection_id: collectionId,
        lines: lines.map(l => ({
          reference_id: l.refId,
          quantity:     l.qty,
          unit_price:   l.price,
        })),
      })

      await sendOrder(order.id)
      setLastOrderId(order.id)
      flash('ok', `✓ Orden #${order.order_number} enviada. Puedes descargarla abajo.`)
      setOrderNum(String(Number(order.order_number) + 1).padStart(4, '0'))

      setLines([])
      setClientName(''); setStoreName(''); setAddress('')
      setNit(''); setTel(''); setCel('')
      setSelectedStore(null); setClientSearch('')

    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al enviar el pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDownload() {
    if (!lastOrderId) return
    setDownloading(true)
    try { await downloadPdfVendor(lastOrderId) }
    catch { flash('err', 'Error generando el PDF.') }
    finally { setDownloading(false) }
  }

  function handleClear() {
    setLines([])
    setClientName(''); setStoreName(''); setAddress('')
    setNit(''); setTel(''); setCel('')
    setSelectedStore(null); setClientSearch(''); setRefSearch('')
  }

  return (
    <div className="max-w-3xl mx-auto">

      {banner && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border
          ${banner.type === 'ok'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}

      <div className="bg-white border border-line rounded-xl shadow-md overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between
                        bg-gradient-to-r from-[#1a0d14] via-[#2e0d1e] to-[#1a0d14]">
          <div className="flex items-center gap-4">
            <span className="font-script text-5xl leading-none"
              style={{
                background: 'linear-gradient(135deg,#f5c0d8 0%,#e8a0c0 30%,#d4608c 60%,#c9907a 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.5))',
              }}>Tixy</span>
            <div className="border-l border-pink/30 pl-4 flex flex-col gap-0.5">
              <span className="text-[9px] tracking-[5px] text-white/40 uppercase font-light">es moda · Glamour</span>
              <span className="text-[10px] text-white/40 font-light leading-tight">
                Transversal 49c #59 62 · 4to piso<br />
                Centro Mundial De La Moda<br />
                319 680 0557 · 313 623 1499
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-[3px] uppercase text-white/40 font-light">Orden de Pedido</div>
            <div className="font-mono text-3xl font-medium tracking-widest"
              style={{
                background: 'linear-gradient(135deg,#f5c0d8,#c9907a)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
              #{orderNum}
            </div>
          </div>
        </div>

        {/* Datos del cliente */}
        <div className="px-6 py-4 bg-surface border-b border-line">

          {/* Buscador cliente existente */}
          <div className="relative mb-4">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">
              Buscar cliente existente
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-base pointer-events-none">⌕</span>
              <input
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Buscar por razón social o NIT…"
                className="input-base pl-9"
              />
              {showClientDD && clientResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line
                                rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
                  {clientResults.map(client =>
                    client.stores.map(store => (
                      <div key={store.id}
                        onClick={() => selectStore(client, store)}
                        className="px-4 py-2.5 hover:bg-pink-light cursor-pointer border-b border-line last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-pink-dark font-mono">{client.nit || '—'}</span>
                          <span className="text-sm text-ink font-medium">{client.business_name}</span>
                        </div>
                        <div className="text-xs text-ink-3 mt-0.5">{store.name} · {store.city}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-line" />
            <span className="text-[10px] uppercase tracking-wider text-ink-3">o ingresa manualmente</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Cliente</div>
              <input className="input-base uppercase" value={clientName}
                onChange={e => setClientName(e.target.value.toUpperCase())} placeholder="NOMBRE O RAZÓN SOCIAL" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Nombre del almacén</div>
              <input className="input-base uppercase" value={storeName}
                onChange={e => setStoreName(e.target.value.toUpperCase())} placeholder="NOMBRE DEL ALMACÉN" />
            </div>
          </div>

          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Dirección</div>
            <input className="input-base" value={address}
              onChange={e => setAddress(e.target.value)} placeholder="Dirección del almacén" />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">C.C o NIT</div>
              <input className="input-base" value={nit} onChange={e => setNit(e.target.value)} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Tel.</div>
              <input className="input-base" value={tel} onChange={e => setTel(e.target.value)} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Cel.</div>
              <input className="input-base" value={cel} onChange={e => setCel(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Vendedor</div>
              <input className="input-base bg-surface" value={user?.full_name || ''} readOnly />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Ciudad</div>
              <select className="input-base" value={city} onChange={e => setCity(e.target.value)}>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <div className="flex border border-line rounded-lg overflow-hidden text-center">
              {[['Día', date.day], ['Mes', date.mon], ['Año', date.yr]].map(([lbl, val]) => (
                <div key={lbl} className="border-r border-line last:border-0">
                  <div className="text-[9px] uppercase tracking-wider font-semibold text-ink-3 px-4 py-1 border-b border-line">{lbl}</div>
                  <div className="text-base font-mono font-medium px-4 py-1 text-ink">{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Buscador de referencias */}
        <div className="px-6 py-3 bg-pink-light border-b border-line">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-base pointer-events-none">⌕</span>
            <input
              ref={refSearchRef}
              value={refSearch}
              onChange={e => setRefSearch(e.target.value)}
              placeholder="Buscar referencia por código o descripción…"
              className="input-base pl-9"
            />
            {showRefDD && refResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line
                              rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {refResults.map(ref => (
                  <div key={ref.id}
                    onClick={() => selectRef(ref)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-pink-light
                               cursor-pointer border-b border-line last:border-0">
                    <span className="font-mono text-xs font-semibold text-pink-dark w-14 shrink-0">{ref.code}</span>
                    <span className="text-sm text-ink-2 flex-1">{ref.description}</span>
                    <span className="text-xs text-ink-3">{fmt(ref.base_price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabla de líneas */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-pink-light border-b-2 border-pink-mid">
                {[['Referencia','text-left w-24'],['Descripción','text-left'],
                  ['Cantidad','text-center w-24'],['Valor unit.','text-right w-32'],
                  ['Total','text-right w-32'],['','w-9']].map(([h, cls]) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-pink-dark ${cls}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-ink-3 py-10 text-sm">
                    Usa el buscador para agregar referencias al pedido.
                  </td>
                </tr>
              ) : lines.map((l, i) => (
                <tr key={i} className="border-b border-line hover:bg-surface">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-semibold text-pink-dark">{l.code}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-ink">{l.desc}</div>
                    <div className="text-[11px] text-ink-3">{l.cat}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input type="number" min="1" value={l.qty}
                      onChange={e => updateLine(i, 'qty', e.target.value)}
                      className="w-16 text-center border border-line rounded-md px-2 py-1
                                 text-sm bg-surface outline-none focus:border-pink-mid focus:ring-2 focus:ring-pink/10" />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input type="number" min="0" value={l.price}
                      onChange={e => updateLine(i, 'price', e.target.value)}
                      className="w-28 text-right border border-line rounded-md px-2 py-1
                                 text-sm bg-surface outline-none focus:border-pink-mid focus:ring-2 focus:ring-pink/10" />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-ink">
                    {fmt(l.qty * l.price)}
                  </td>
                  <td className="px-2 py-2.5">
                    <button onClick={() => removeLine(i)}
                      className="text-ink-3 hover:text-red-500 text-lg leading-none transition-colors">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="px-6 py-4 flex justify-end border-t border-line bg-surface">
          <div className="w-56">
            <div className="flex justify-between items-center py-2 border-b border-line">
              <span className="text-xs uppercase tracking-wider font-semibold text-ink-3">Sub-total</span>
              <span className="font-mono text-sm font-semibold text-ink">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center pt-3">
              <span className="text-sm font-semibold text-pink-dark">Total</span>
              <span className="font-mono text-xl font-semibold text-pink-dark">{fmt(subtotal)}</span>
            </div>
          </div>
        </div>

        {/* Firmas */}
        <div className="grid grid-cols-2 gap-8 px-6 pb-6 pt-2 border-t border-line">
          {['Firma Vendedor', 'Firma Comprador'].map(label => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className="w-full h-px bg-ink-3 mt-6" />
              <span className="text-[11px] text-ink-3 tracking-wider">{label}</span>
            </div>
          ))}
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-line bg-white">
          {lastOrderId && (
            <button onClick={handleDownload} disabled={downloading}
              className="btn-secondary disabled:opacity-50">
              {downloading ? 'Generando…' : '📄 Ver PDF'}
            </button>
          )}
          <button onClick={handleClear} className="btn-secondary">Limpiar pedido</button>
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary disabled:opacity-50">
            {submitting ? 'Enviando…' : 'Enviar pedido →'}
          </button>
        </div>

      </div>
    </div>
  )
}
