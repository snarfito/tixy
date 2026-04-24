import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { getReferences, getCollections, searchClients, createClient, createOrder, sendOrder, downloadPdfVendor, listOrders, getOrder, updateOrder } from '../api/orders'
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

// ── Helpers de estado de pedido ──────────────────────────────────────────────
const STATUS_LABEL = {
  draft:     'Borrador',
  sent:      'Enviado',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
}
const STATUS_CLASSES = {
  draft:     'bg-gray-100 text-gray-600 border-gray-200',
  sent:      'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

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
  const [successOrder, setSuccessOrder] = useState(null)  // pantalla de éxito post-envío

  // ── Tab activo y mis pedidos ───────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState('form')   // 'form' | 'my_orders'
  const [myOrders,     setMyOrders]     = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)    // { id, order_number } | null
  const [sendingId,    setSendingId]    = useState(null)    // order_id en proceso de envío desde lista

  const refSearchRef = useRef(null)

  // ── cargar mis pedidos ────────────────────────────────────────────────
  const loadMyOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      const data = await listOrders()
      setMyOrders(data)
    } catch (err) {
      console.error('Error cargando pedidos:', err)
    } finally {
      setLoadingOrders(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'my_orders') loadMyOrders()
  }, [activeTab, loadMyOrders])

  // ── resetear formulario ──────────────────────────────────────────────
  function resetForm() {
    setLines([])
    setClientName(''); setStoreName(''); setAddress('')
    setNit(''); setTel(''); setCel('')
    setSelectedStore(null); setClientSearch(''); setRefSearch('')
    setEditingOrder(null)
    setLastOrderId(null)
  }

  // ── cargar orden en el formulario para editar ───────────────────────────
  async function loadOrderForEdit(orderId) {
    try {
      const order = await getOrder(orderId)
      setCollectionId(order.collection_id)
      if (order.store) {
        setSelectedStore({
          id:       order.store.id,
          clientId: order.store.client?.id,
          name:     order.store.name,
          city:     order.store.city,
          address:  order.store.address,
        })
        setStoreName(order.store.name || '')
        setAddress(order.store.address || '')
        setCity(order.store.city || CITIES[0])
        if (order.store.client) {
          setClientName(order.store.client.business_name || '')
          setNit(order.store.client.nit || '')
          setTel(order.store.client.phone || '')
        }
      }
      setLines(order.lines.map(ln => ({
        refId: ln.reference_id,
        code:  ln.reference.code,
        desc:  ln.reference.description,
        cat:   ln.reference.category,
        qty:   ln.quantity,
        price: ln.unit_price,
      })))
      setEditingOrder({ id: order.id, order_number: order.order_number })
      setActiveTab('form')
    } catch {
      flash('err', 'No se pudo cargar el pedido para editar.')
    }
  }

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

  // ── Resolver el storeId (crear cliente si es nuevo) ───────────────────────
  async function resolveStoreId() {
    if (selectedStore?.id) return selectedStore.id
    if (!clientName.trim() || !storeName.trim()) {
      flash('err', 'Completa el nombre del cliente y del almacén.')
      return null
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
    const store = newClient.stores[0]
    setSelectedStore({ id: store.id, clientId: newClient.id, name: store.name, city: store.city, address: store.address })
    return store.id
  }

  // ── Guardar como borrador (sin enviar) ────────────────────────────────
  async function handleSaveDraft() {
    if (!lines.length)  { flash('err', 'Agrega al menos una referencia al pedido.'); return }
    if (!collectionId)  { flash('err', 'No hay una colección activa.'); return }
    setSubmitting(true)
    try {
      const storeId = await resolveStoreId()
      if (!storeId) return

      const linePayload = lines.map(l => ({
        reference_id: l.refId, quantity: l.qty, unit_price: l.price,
      }))

      if (editingOrder) {
        // Actualizar pedido existente
        await updateOrder(editingOrder.id, {
          store_id: storeId, collection_id: collectionId, lines: linePayload,
        })
        flash('ok', `Borrador #${editingOrder.order_number} guardado correctamente.`)
      } else {
        // Crear nuevo pedido en borrador
        const order = await createOrder({
          store_id: storeId, collection_id: collectionId, lines: linePayload,
        })
        flash('ok', `Borrador #${order.order_number} guardado. Puedes editarlo en "Mis pedidos".`)
        setOrderNum(String(Number(order.order_number) + 1).padStart(4, '0'))
      }
      resetForm()
      setActiveTab('my_orders')
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al guardar el borrador.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Guardar y enviar ──────────────────────────────────────────────────
  async function handleSaveAndSend() {
    if (!lines.length)  { flash('err', 'Agrega al menos una referencia al pedido.'); return }
    if (!collectionId)  { flash('err', 'No hay una colección activa.'); return }
    setSubmitting(true)
    try {
      const storeId = await resolveStoreId()
      if (!storeId) return

      const linePayload = lines.map(l => ({
        reference_id: l.refId, quantity: l.qty, unit_price: l.price,
      }))

      let orderId, orderNumber
      if (editingOrder) {
        // Actualizar y luego enviar
        const updated = await updateOrder(editingOrder.id, {
          store_id: storeId, collection_id: collectionId, lines: linePayload,
        })
        orderId = updated.id
        orderNumber = updated.order_number
      } else {
        // Crear nuevo y enviar
        const created = await createOrder({
          store_id: storeId, collection_id: collectionId, lines: linePayload,
        })
        orderId = created.id
        orderNumber = created.order_number
        setOrderNum(String(Number(created.order_number) + 1).padStart(4, '0'))
      }

      await sendOrder(orderId)
      setLastOrderId(orderId)
      setSuccessOrder({
        id:           orderId,
        order_number: orderNumber,
        clientName:   clientName.trim() || '—',
        storeName:    storeName.trim()  || '—',
        city,
        total: subtotal,
      })
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al enviar el pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Enviar un borrador directo desde la lista ───────────────────────────
  async function handleSendFromList(orderId) {
    setSendingId(orderId)
    try {
      await sendOrder(orderId)
      await loadMyOrders()
      flash('ok', 'Pedido enviado correctamente.')
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al enviar el pedido.')
    } finally {
      setSendingId(null)
    }
  }

  async function handleDownload() {
    if (!lastOrderId) return
    setDownloading(true)
    try { await downloadPdfVendor(lastOrderId) }
    catch { flash('err', 'Error generando el PDF.') }
    finally { setDownloading(false) }
  }

  async function handleDownloadSuccess(orderId) {
    setDownloading(true)
    try { await downloadPdfVendor(orderId) }
    catch { flash('err', 'Error generando el PDF.') }
    finally { setDownloading(false) }
  }

  function handleClear() {
    setLines([])
    setClientName(''); setStoreName(''); setAddress('')
    setNit(''); setTel(''); setCel('')
    setSelectedStore(null); setClientSearch(''); setRefSearch('')
  }

  // Resetea todo y vuelve al formulario desde la pantalla de éxito
  function startNewOrder() {
    setSuccessOrder(null)
    setLastOrderId(null)
    setLines([])
    setClientName(''); setStoreName(''); setAddress('')
    setNit(''); setTel(''); setCel('')
    setSelectedStore(null); setClientSearch(''); setRefSearch('')
  }

  // ── Pantalla de éxito post-envío ─────────────────────────────────────────
  if (successOrder) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-line rounded-xl shadow-md overflow-hidden">

          {/* Header — igual que el formulario */}
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between
                          bg-gradient-to-r from-[#1a0d14] via-[#2e0d1e] to-[#1a0d14]">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="font-script text-4xl sm:text-5xl leading-none"
                style={{
                  background: 'linear-gradient(135deg,#f5c0d8 0%,#e8a0c0 30%,#d4608c 60%,#c9907a 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.5))',
                }}>Tixy</span>
              <div className="border-l border-pink/30 pl-3 sm:pl-4">
                <span className="text-[9px] tracking-[3px] sm:tracking-[5px] text-white/40 uppercase font-light block">es moda · Glamour</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-[2px] sm:tracking-[3px] uppercase text-white/40 font-light">Orden de Pedido</div>
              <div className="font-mono text-2xl sm:text-3xl font-medium tracking-widest"
                style={{
                  background: 'linear-gradient(135deg,#f5c0d8,#c9907a)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                #{successOrder.order_number}
              </div>
            </div>
          </div>

          {/* Cuerpo de éxito */}
          <div className="px-6 py-8 sm:py-12 flex flex-col items-center text-center">

            {/* Ícono de éxito */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-50 border-2 border-green-200
                            flex items-center justify-center text-3xl sm:text-4xl mb-4 sm:mb-5">
              ✓
            </div>

            <h2 className="text-xl sm:text-2xl font-semibold text-ink mb-1">
              ¡Orden enviada!
            </h2>
            <p className="text-ink-3 text-sm mb-6">
              {successOrder.clientName}
              {successOrder.storeName !== successOrder.clientName && (
                <> · <span className="text-ink-2">{successOrder.storeName}</span>
                  {successOrder.city && <span className="text-ink-3"> · {successOrder.city}</span>}
                </>
              )}
            </p>

            {/* Total */}
            <div className="bg-pink-light rounded-xl px-8 py-4 mb-8 border border-pink/20">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-pink-dark mb-1">Total del pedido</div>
              <div className="font-mono text-3xl sm:text-4xl font-semibold text-pink-dark">
                {fmt(successOrder.total)}
              </div>
            </div>

            {/* Botones PDF */}
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mb-6">
              <button
                onClick={() => handleDownloadSuccess(successOrder.id)}
                disabled={downloading}
                className="btn-primary justify-center py-3 sm:py-2 text-sm disabled:opacity-50">
                {downloading ? 'Generando…' : '📄 Ver PDF'}
              </button>
            </div>

            {/* Separador */}
            <div className="w-full max-w-xs flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-line" />
              <span className="text-xs text-ink-3">o continuar</span>
              <div className="flex-1 h-px bg-line" />
            </div>

            {/* Nueva orden */}
            <button
              onClick={startNewOrder}
              className="btn-primary py-3 px-8 text-sm w-full sm:w-auto justify-center">
              + Crear nueva orden
            </button>

          </div>
        </div>
      </div>
    )
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

      {/* ── Selector de tabs ──────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 bg-surface border border-line rounded-xl p-1">
        <button
          onClick={() => { resetForm(); setActiveTab('form') }}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'form'
              ? 'bg-white shadow-sm text-pink-dark border border-line'
              : 'text-ink-3 hover:text-ink'
          }`}>
          + Nueva orden
        </button>
        <button
          onClick={() => setActiveTab('my_orders')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'my_orders'
              ? 'bg-white shadow-sm text-pink-dark border border-line'
              : 'text-ink-3 hover:text-ink'
          }`}>
          Mis pedidos
        </button>
      </div>

      {/* ── Tab: Formulario de pedido ──────────────────────────────────── */}
      {activeTab === 'form' && (
      <div className="bg-white border border-line rounded-xl shadow-md overflow-hidden">

        {/* Banner de edición activa */}
        {editingOrder && (
          <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
            <span className="text-blue-600 text-xs font-semibold">✏️ Editando pedido #{editingOrder.order_number}</span>
            <span className="text-blue-400 text-xs">Los cambios no se envían hasta que presiones "Guardar y enviar"</span>
          </div>
        )}

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
              #{editingOrder ? editingOrder.order_number : orderNum}
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
                {refResults.map(ref => {
                    const yaEnPedido = lines.some(l => l.refId === ref.id)
                    return (
                      <div key={ref.id}
                        onClick={() => !yaEnPedido && selectRef(ref)}
                        className={`flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0
                          ${yaEnPedido
                            ? 'opacity-50 cursor-not-allowed bg-surface'
                            : 'hover:bg-pink-light cursor-pointer'}`}>
                        <span className="font-mono text-xs font-semibold text-pink-dark w-14 shrink-0">{ref.code}</span>
                        <span className="text-sm text-ink-2 flex-1">{ref.description}</span>
                        {yaEnPedido
                          ? <span className="text-[10px] font-semibold text-ink-3 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap">Ya en pedido</span>
                          : <span className="text-xs text-ink-3">{fmt(ref.base_price)}</span>
                        }
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Tabla de líneas — Vista tarjetas (móvil) */}
        <div className="sm:hidden divide-y divide-line">
          {lines.length === 0 ? (
            <div className="text-center text-ink-3 py-10 text-sm px-4">
              Usa el buscador para agregar referencias al pedido.
            </div>
          ) : lines.map((l, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs font-semibold text-pink-dark">{l.code}</span>
                  <span className="text-[11px] text-ink-3">{l.cat}</span>
                </div>
                <div className="text-sm text-ink truncate mb-2">{l.desc}</div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-3">Cant.</span>
                    <input type="number" min="1" value={l.qty}
                      onChange={e => updateLine(i, 'qty', e.target.value)}
                      className="w-14 text-center border border-line rounded-md px-1.5 py-1
                                 text-sm bg-surface outline-none focus:border-pink-mid" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-3">Precio</span>
                    <input type="number" min="0" value={l.price}
                      onChange={e => updateLine(i, 'price', e.target.value)}
                      className="w-24 text-right border border-line rounded-md px-1.5 py-1
                                 text-sm bg-surface outline-none focus:border-pink-mid" />
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-semibold text-pink-dark">{fmt(l.qty * l.price)}</div>
                <button onClick={() => removeLine(i)}
                  className="text-ink-3 hover:text-red-500 text-xl leading-none mt-1 transition-colors">×</button>
              </div>
            </div>
          ))}
        </div>

        {/* Tabla de líneas — Vista tabla (desktop) */}
        <div className="hidden sm:block overflow-x-auto">
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

        {/* Firmas — solo visible en desktop/impresión */}
        <div className="hidden sm:grid grid-cols-2 gap-8 px-6 pb-6 pt-2 border-t border-line">
          {['Firma Vendedor', 'Firma Comprador'].map(label => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className="w-full h-px bg-ink-3 mt-6" />
              <span className="text-[11px] text-ink-3 tracking-wider">{label}</span>
            </div>
          ))}
        </div>

        {/* Acciones */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-4 border-t border-line bg-white">
          {/* Cancelar edición */}
          {editingOrder && (
            <button onClick={() => { resetForm(); setActiveTab('my_orders') }}
              className="btn-secondary w-full sm:w-auto justify-center text-ink-3">
              Cancelar edición
            </button>
          )}
          {!editingOrder && (
            <button onClick={handleClear} className="btn-secondary w-full sm:w-auto justify-center">Limpiar pedido</button>
          )}
          {/* Guardar borrador */}
          <button onClick={handleSaveDraft} disabled={submitting}
            className="btn-secondary disabled:opacity-50 w-full sm:w-auto justify-center font-semibold">
            {submitting ? 'Guardando…' : editingOrder ? 'Guardar cambios' : 'Guardar borrador'}
          </button>
          {/* Enviar pedido */}
          <button onClick={handleSaveAndSend} disabled={submitting}
            className="btn-primary disabled:opacity-50 w-full sm:w-auto justify-center">
            {submitting ? 'Enviando…' : editingOrder ? 'Guardar y enviar →' : 'Enviar pedido →'}
          </button>
        </div>

      </div>
      )}

      {/* ── Tab: Mis pedidos ───────────────────────────────────────── */}
      {activeTab === 'my_orders' && (
      <div className="bg-white border border-line rounded-xl shadow-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-pink-light text-pink-dark flex items-center justify-center text-sm">≡</span>
            <span className="text-sm font-semibold text-ink">Mis pedidos</span>
            <span className="text-xs text-ink-3 ml-1">({myOrders.length})</span>
          </div>
          <button onClick={loadMyOrders} className="text-xs text-pink-dark hover:underline">Actualizar</button>
        </div>

        {loadingOrders ? (
          <div className="text-center py-10 text-ink-3 text-sm">Cargando pedidos…</div>
        ) : myOrders.length === 0 ? (
          <div className="text-center py-10 text-ink-3 text-sm">
            No tienes pedidos aún. ¡Crea tu primera orden!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3">#</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3">Almacén</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-3">Total</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-3">Estado</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-36">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {myOrders.map(order => (
                  <tr key={order.id} className="border-b border-line hover:bg-surface last:border-0">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-pink-dark">#{order.order_number}</td>
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {new Date(order.created_at).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-ink font-medium">{order.store?.name || '—'}</div>
                      <div className="text-[11px] text-ink-3">{order.store?.city || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink">
                      {fmt(order.total)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                        STATUS_CLASSES[order.status] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {STATUS_LABEL[order.status] || order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* PDF */}
                        <button
                          onClick={() => handleDownloadSuccess(order.id)}
                          disabled={downloading}
                          title="Ver PDF"
                          className="text-ink-3 hover:text-pink-dark text-xs px-2 py-1 rounded border border-line hover:border-pink/40 transition-colors disabled:opacity-40">
                          PDF
                        </button>
                        {/* Editar — solo en DRAFT o SENT */}
                        {(order.status === 'draft' || order.status === 'sent') && (
                          <button
                            onClick={() => loadOrderForEdit(order.id)}
                            className="text-pink-dark text-xs px-2 py-1 rounded border border-pink/30 hover:bg-pink-light transition-colors font-semibold">
                            Editar
                          </button>
                        )}
                        {/* Enviar — solo en DRAFT */}
                        {order.status === 'draft' && (
                          <button
                            onClick={() => handleSendFromList(order.id)}
                            disabled={sendingId === order.id}
                            className="text-white bg-pink-dark text-xs px-2 py-1 rounded hover:opacity-90 transition-opacity disabled:opacity-50 font-semibold">
                            {sendingId === order.id ? '…' : 'Enviar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

    </div>
  )
}
