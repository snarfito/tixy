import { useState, useEffect, useCallback } from 'react'
import { listOrders, confirmOrder, cancelOrder, salesByReference, salesByVendor, salesByCollection, getCollections, getUsers, viewPdf, getOrder } from '../api/manager'
import fmt from '../utils/fmt'

// ── Modal de Vista Rápida ────────────────────────────────────────────────────
const STATUS_COLOR = {
  draft:     'bg-gray-100 text-gray-500',
  sent:      'bg-amber-50 text-amber-700',
  confirmed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-500',
}

function OrderDetailModal({ order, onClose }) {
  const store  = order.store
  const client = store?.client
  const lines  = order.lines || []

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">

        {/* Encabezado estilo PDF */}
        <div className="bg-[#2B0A18] px-6 py-5 flex items-start justify-between">
          <div>
            <div style={{
              fontFamily: "'Great Vibes', cursive",
              color: '#C0206A',
              fontSize: '2.6rem',
              lineHeight: 1,
            }}>Tixy</div>
            <div className="text-[11px] text-[#E8A0C0] mt-0.5">es moda · GLAMOUR</div>
            <div className="text-[10px] text-[#C09090] mt-1">Transversal 49c #59-62, 4to piso</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[#E8B0C8] uppercase tracking-wider">ORDEN DE PEDIDO</div>
            <div className="text-3xl font-bold text-pink-dark mt-0.5">#{order.order_number}</div>
            <div className="text-[11px] text-[#C09090] mt-0.5">
              {new Date(order.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Barra vendedor */}
        <div className="bg-[#F9EAF0] px-6 py-2 border-b border-[#E0C8D4] flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#C0206A]">Vendedor:</span>
          <span className="text-[11px] text-[#3D0E22]">{order.vendor?.full_name}</span>
          {order.vendor?.contact_info && (
            <span className="text-[11px] text-[#999]">&nbsp;·&nbsp;{order.vendor.contact_info}</span>
          )}
          <span className={`ml-auto inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[order.status]}`}>
            {order.status === 'draft' ? 'Borrador' : order.status === 'sent' ? 'Enviado' :
             order.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}
          </span>
        </div>

        {/* Info cliente / almacén */}
        <div className="px-6 py-4 border-b border-line">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <div className="flex gap-2">
              <span className="font-semibold text-pink-dark w-20 shrink-0">Cliente:</span>
              <span className="text-ink">{client?.business_name || '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-pink-dark w-20 shrink-0">NIT/CC:</span>
              <span className="text-ink">{client?.nit || '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-pink-dark w-20 shrink-0">Almacén:</span>
              <span className="text-ink">{store?.name || '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-pink-dark w-20 shrink-0">Ciudad:</span>
              <span className="text-ink">{store?.city || '—'}</span>
            </div>
            <div className="flex gap-2 col-span-2">
              <span className="font-semibold text-pink-dark w-20 shrink-0">Dirección:</span>
              <span className="text-ink">{store?.address || '—'}</span>
            </div>
          </div>
        </div>

        {/* Tabla de productos */}
        <div className="px-6 py-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-2">Productos</div>
          <div className="rounded-xl border border-line overflow-hidden">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-pink text-white">
                  <th className="px-3 py-2 text-left font-semibold">Ref.</th>
                  <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                  <th className="px-3 py-2 text-center font-semibold">Categoría</th>
                  <th className="px-3 py-2 text-right font-semibold">Cant.</th>
                  <th className="px-3 py-2 text-right font-semibold">Vlr. unit.</th>
                  <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-6 text-ink-3">Sin productos</td></tr>
                ) : lines.map((ln, i) => (
                  <tr key={ln.id} className={`border-t border-line ${i % 2 === 0 ? 'bg-white' : 'bg-[#F7F7F7]'}`}>
                    <td className="px-3 py-2 font-mono font-semibold text-pink-dark">{ln.reference?.code}</td>
                    <td className="px-3 py-2 text-ink">{ln.reference?.description}</td>
                    <td className="px-3 py-2 text-center text-ink-3">{ln.reference?.category}</td>
                    <td className="px-3 py-2 text-right font-mono">{ln.quantity}</td>
                    <td className="px-3 py-2 text-right font-mono">${ln.unit_price?.toLocaleString('es-CO')}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">${ln.line_total?.toLocaleString('es-CO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="flex justify-end mt-3 gap-8 text-sm">
            <div className="text-ink-3">Sub-total: <span className="font-semibold text-ink font-mono">${order.subtotal?.toLocaleString('es-CO')}</span></div>
            <div className="text-pink-dark font-bold">TOTAL: <span className="font-mono">${order.total?.toLocaleString('es-CO')}</span></div>
          </div>
        </div>

        {/* Acciones */}
        <div className="px-6 pb-5 flex justify-end">
          <button onClick={onClose}
            className="btn-secondary text-xs px-4 py-2">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABEL = { draft: 'Borrador', sent: 'Enviado', confirmed: 'Confirmado', cancelled: 'Cancelado' }
const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-500',
  sent:      'bg-gold-light text-amber-700',
  confirmed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-500',
}
const CITIES = ['La Dorada','Bogotá','Medellín','Cali','Barranquilla','Pereira','Manizales','Bucaramanga','Ibagué']

const CATEGORIES = [
  'Vestido corto', 'Vestido largo', 'Conjunto',
  'Blusa', 'Body', 'Camiseta', 'Chaleco', 'Otro',
]

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── Métrica ──────────────────────────────────────────────────────────────────
function Metric({ label, value, pink }) {
  return (
    <div className="bg-white border border-line rounded-xl px-5 py-4 shadow-sm relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-pink to-pink-mid rounded-l-xl" />
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mb-1">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${pink ? 'text-pink-dark' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

// ── Barra de ranking ──────────────────────────────────────────────────────────
function RankBar({ label, sub, value, units, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
      <div className="w-40 shrink-0">
        <div className="text-xs font-semibold text-ink truncate">{label}</div>
        {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
      </div>
      <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-pink-mid to-pink rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right shrink-0 min-w-[90px]">
        <div className="text-xs font-semibold text-ink font-mono">{fmt(value)}</div>
        <div className="text-[11px] text-ink-3">{units} uds</div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SECCIÓN: COMPARATIVA COLECCIONES
// ════════════════════════════════════════════════════════════════════════════

const CAT_COLORS = [
  'bg-pink-light text-pink-dark',
  'bg-gold-light text-amber-700',
  'bg-rose-light text-rose',
  'bg-green-50 text-green-700',
  'bg-blue-50 text-blue-600',
  'bg-purple-50 text-purple-600',
  'bg-orange-50 text-orange-600',
  'bg-gray-100 text-gray-500',
]

function ColCard({ col, maxValue, rank }) {
  const barPct     = maxValue > 0 ? Math.round((col.total_value / maxValue) * 100) : 0
  const rankEmoji  = ['🥇', '🥈', '🥉']
  const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600']

  return (
    <div className="card p-0 overflow-hidden">
      {/* Cabecera */}
      <div className="px-5 py-4 border-b border-line flex items-start justify-between
                      bg-gradient-to-r from-[#1a0d14]/5 to-transparent">
        <div>
          <div className="flex items-center gap-2">
            {rank <= 3 && (
              <span className={`text-lg ${rankColors[rank - 1]}`}>{rankEmoji[rank - 1]}</span>
            )}
            <h3 className="text-sm font-semibold text-ink">{col.collection_name}</h3>
          </div>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Año {col.year} · Temporada #{col.season}
          </p>
        </div>
        <span className="text-[10px] font-semibold bg-pink-light text-pink-dark px-2 py-0.5 rounded-full shrink-0 ml-2">
          {col.order_count} pedido{col.order_count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
        <div className="px-5 py-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-0.5">Unidades</div>
          <div className="text-xl font-semibold text-ink">{col.total_units.toLocaleString('es-CO')}</div>
        </div>
        <div className="px-5 py-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-0.5">Ingresos</div>
          <div className="text-xl font-semibold text-pink-dark">{fmt(col.total_value)}</div>
        </div>
      </div>

      {/* Barra vs mejor colección */}
      <div className="px-5 py-3 border-b border-line">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-ink-3">vs mejor colección</span>
          <span className="text-[10px] font-semibold text-pink-dark">{barPct}%</span>
        </div>
        <div className="h-2 bg-line rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pink-mid to-pink rounded-full transition-all duration-700"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* Desglose por categoría */}
      {col.by_category.length > 0 && (
        <div className="px-5 py-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-2">Por categoría</div>
          <div className="space-y-1.5">
            {col.by_category.map((cat, i) => {
              const catPct = col.total_units > 0
                ? Math.round((cat.total_units / col.total_units) * 100)
                : 0
              return (
                <div key={cat.category} className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0
                    min-w-[90px] text-center ${CAT_COLORS[i % CAT_COLORS.length]}`}>
                    {cat.category}
                  </span>
                  <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-pink-mid/70 transition-all duration-500"
                      style={{ width: `${catPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-ink-3 font-mono shrink-0 w-10 text-right">
                    {cat.total_units}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ComparativasSection({ data }) {
  if (!data.length) {
    return (
      <div className="card py-16 text-center text-ink-3 text-sm">
        No hay datos de ventas por colección aún. Los datos aparecerán cuando haya pedidos confirmados.
      </div>
    )
  }

  // Ordenar por ingresos descendente
  const ranked         = [...data].sort((a, b) => b.total_value - a.total_value)
  const maxRankedValue = ranked[0]?.total_value || 1
  const totalAll       = data.reduce((s, c) => s + c.total_value, 0)
  const unitsAll       = data.reduce((s, c) => s + c.total_units, 0)

  // Pivot: todas las categorías que aparecen en cualquier colección
  const allCats = [...new Set(data.flatMap(c => c.by_category.map(b => b.category)))]

  return (
    <div>
      {/* ── Resumen global ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="card py-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-0.5">Colecciones con ventas</div>
          <div className="text-2xl font-semibold text-ink">{data.length}</div>
        </div>
        <div className="card py-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-0.5">Unidades totales</div>
          <div className="text-2xl font-semibold text-ink">{unitsAll.toLocaleString('es-CO')}</div>
        </div>
        <div className="card py-3 text-center col-span-2 md:col-span-1">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-0.5">Ingresos totales histórico</div>
          <div className="text-2xl font-semibold text-pink-dark">{fmt(totalAll)}</div>
        </div>
      </div>

      {/* ── Cards por colección ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {ranked.map((col, i) => (
          <ColCard key={col.collection_id} col={col} maxValue={maxRankedValue} rank={i + 1} />
        ))}
      </div>

      {/* ── Tabla pivot por categoría ── */}
      {allCats.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-pink-light text-pink-dark flex items-center justify-center text-sm">📈</span>
            <span className="text-sm font-semibold text-ink">Unidades por categoría y colección</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-pink-light border-b border-line">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">
                    Categoría
                  </th>
                  {ranked.map(c => (
                    <th key={c.collection_id}
                      className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark whitespace-nowrap">
                      {c.collection_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCats.map((cat, ri) => (
                  <tr key={cat} className={ri % 2 === 0 ? 'bg-white' : 'bg-surface'}>
                    <td className="px-4 py-2.5 font-medium text-ink">{cat}</td>
                    {ranked.map(col => {
                      const entry = col.by_category.find(b => b.category === cat)
                      return (
                        <td key={col.collection_id} className="px-3 py-2.5 text-center font-mono">
                          {entry
                            ? <span className="text-ink">{entry.total_units.toLocaleString('es-CO')}</span>
                            : <span className="text-ink-3">—</span>
                          }
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {/* Fila total unidades */}
                <tr className="border-t-2 border-pink/30 bg-pink-light">
                  <td className="px-4 py-2.5 font-semibold text-pink-dark text-[11px] uppercase tracking-wider">
                    Total unidades
                  </td>
                  {ranked.map(col => (
                    <td key={col.collection_id} className="px-3 py-2.5 text-center font-mono font-semibold text-pink-dark">
                      {col.total_units.toLocaleString('es-CO')}
                    </td>
                  ))}
                </tr>
                {/* Fila total ingresos */}
                <tr className="bg-pink-light">
                  <td className="px-4 py-2.5 font-semibold text-pink-dark text-[11px] uppercase tracking-wider">
                    Total ingresos
                  </td>
                  {ranked.map(col => (
                    <td key={col.collection_id} className="px-3 py-2.5 text-center font-mono font-semibold text-pink-dark">
                      {fmt(col.total_value)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PÁGINA GERENCIA
// ════════════════════════════════════════════════════════════════════════════
export default function ManagerPage() {
  const [collections, setCollections] = useState([])
  const [vendors,     setVendors]     = useState([])
  const [orders,      setOrders]      = useState([])
  const [refSales,    setRefSales]    = useState([])
  const [vendorSales, setVendorSales] = useState([])
  const [colSales,    setColSales]    = useState([])   // ← comparativas
  const [loading,     setLoading]     = useState(true)
  const [banner,      setBanner]      = useState(null)
  const [activeTab,   setActiveTab]   = useState('pedidos')  // 'pedidos' | 'comparativas'

  // filtros
  const [fCol,      setFCol]      = useState('')
  const [fStatus,   setFStatus]   = useState('')
  const [fCity,     setFCity]     = useState('')
  const [fVendor,   setFVendor]   = useState('')
  const [fCategory, setFCategory] = useState('')   // filtro de categoría en reportes

  // carga inicial
  useEffect(() => {
    Promise.all([getCollections(), getUsers()])
      .then(([cols, users]) => {
        setCollections(cols)
        setVendors(users.filter(u => u.is_active))
      })
    // comparativas: independiente de filtros
    salesByCollection().then(setColSales).catch(() => {})
  }, [])

  // carga de pedidos y reportes cuando cambian los filtros
  const loadData = useCallback(() => {
    setLoading(true)
    const params = {}
    if (fCol)    params.collection_id = fCol
    if (fStatus) params.status        = fStatus
    if (fCity)   params.city          = fCity
    if (fVendor) params.vendor_id     = fVendor

    const reportParams = {}
    if (fCol)      reportParams.collection_id = fCol
    if (fVendor)   reportParams.vendor_id     = fVendor
    if (fCategory) reportParams.category      = fCategory

    Promise.all([
      listOrders(params),
      salesByReference(reportParams),
      salesByVendor({ collection_id: fCol || undefined }),
    ])
      .then(([ords, refs, vends]) => {
        setOrders(ords)
        setRefSales(refs)
        setVendorSales(vends)
      })
      .finally(() => setLoading(false))
  }, [fCol, fStatus, fCity, fVendor, fCategory])

  useEffect(() => { loadData() }, [loadData])

  const [downloading,  setDownloading]  = useState({})
  const [viewOrder,    setViewOrder]    = useState(null)   // pedido detallado en vista rápida
  const [loadingView,  setLoadingView]  = useState(false)

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3000) }

  function handleRefresh() {
    loadData()
    salesByCollection().then(setColSales).catch(() => {})
  }

  async function handleOpenView(order) {
    setLoadingView(true)
    try {
      const detail = await getOrder(order.id)
      setViewOrder(detail)
    } catch { flash('err', 'No se pudo cargar el detalle del pedido.') }
    finally { setLoadingView(false) }
  }

  async function handleViewPdf(order, showTotal) {
    setDownloading(prev => ({ ...prev, [order.id]: true }))
    try {
      await viewPdf(order.id, showTotal)
    } catch { flash('err', 'Error generando el PDF.') }
    finally { setDownloading(prev => ({ ...prev, [order.id]: false })) }
  }

  async function handleConfirm(order) {
    try {
      const updated = await confirmOrder(order.id)
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
      flash('ok', `✓ Pedido #${order.order_number} confirmado.`)
    } catch (err) { flash('err', err.response?.data?.detail || 'Error.') }
  }

  async function handleCancel(order) {
    if (!confirm(`¿Cancelar el pedido #${order.order_number}?`)) return
    try {
      const updated = await cancelOrder(order.id)
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
      flash('ok', `Pedido #${order.order_number} cancelado.`)
    } catch (err) { flash('err', err.response?.data?.detail || 'Error.') }
  }

  // métricas globales (pestaña pedidos)
  const totalOrders  = orders.length
  const totalUnits   = orders.reduce((s, o) => s + (o.units ?? 0), 0)
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
  const pending      = orders.filter(o => o.status === 'sent').length

  const maxRef    = refSales[0]?.total_value    || 1
  const maxVendor = vendorSales[0]?.total_value || 1

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Panel de Gerencia</h1>
          <p className="text-ink-3 text-sm">Seguimiento de ventas por pedido, referencia y vendedor.</p>
        </div>
        <button onClick={handleRefresh} className="btn-secondary text-xs px-3 py-1.5">↻ Actualizar</button>
      </div>

      {banner && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium border
          ${banner.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}

      {/* ── Métricas globales (siempre visibles) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Metric label="Pedidos"           value={totalOrders} />
        <Metric label="Pendientes"        value={pending} />
        <Metric label="Unidades vendidas" value={totalUnits.toLocaleString('es-CO')} />
        <Metric label="Total en ventas"   value={fmt(totalRevenue)} pink />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-line mb-6">
        {[
          { id: 'pedidos',      label: 'Pedidos y Rankings',      icon: '≡' },
          { id: 'comparativas', label: 'Comparativa Colecciones', icon: '⇄' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 transition-colors
              ${activeTab === t.id
                ? 'text-pink-dark border-pink'
                : 'text-ink-3 border-transparent hover:text-ink-2'}`}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Pedidos y Rankings                                           */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pedidos' && (
        <>
          {/* ── Filtros ── */}
          <div className="flex gap-2 flex-wrap mb-4 items-center">
            <span className="text-xs text-ink-3 font-medium">Filtrar:</span>

            <select value={fCol} onChange={e => setFCol(e.target.value)}
              className="input-base w-auto text-xs py-1.5">
              <option value="">Todas las colecciones</option>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select value={fStatus} onChange={e => setFStatus(e.target.value)}
              className="input-base w-auto text-xs py-1.5">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            <select value={fCity} onChange={e => setFCity(e.target.value)}
              className="input-base w-auto text-xs py-1.5">
              <option value="">Todas las ciudades</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={fVendor} onChange={e => setFVendor(e.target.value)}
              className="input-base w-auto text-xs py-1.5">
              <option value="">Todos los usuarios</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.full_name} ({v.role})</option>)}
            </select>

            <select value={fCategory} onChange={e => setFCategory(e.target.value)}
              className="input-base w-auto text-xs py-1.5">
              <option value="">Todas las categorías</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {(fCol || fStatus || fCity || fVendor || fCategory) && (
              <button onClick={() => { setFCol(''); setFStatus(''); setFCity(''); setFVendor(''); setFCategory('') }}
                className="text-xs text-pink-dark hover:underline">
                × Limpiar filtros
              </button>
            )}
          </div>

          {/* ── Tabla de pedidos ── */}
          <div className="card mb-6 p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-pink-light text-pink-dark flex items-center justify-center text-sm">≡</span>
              <span className="text-sm font-semibold text-ink">Pedidos recibidos</span>
              <span className="text-xs text-ink-3 ml-1">({orders.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3">#</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3">Fecha</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3">Vendedor</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3">Almacén</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-3">Total</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-3">Estado</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-10 text-ink-3 text-sm">Cargando…</td></tr>
                  ) : orders.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-ink-3 text-sm">No hay pedidos con los filtros seleccionados.</td></tr>
                  ) : orders.map(order => (
                    <tr key={order.id} className="border-b border-line hover:bg-surface transition-colors cursor-pointer"
                      onClick={() => handleOpenView(order)}>
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-pink-dark">#{order.order_number}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-3">{fmtDate(order.created_at)}</td>
                      <td className="px-4 py-2.5 text-sm text-ink">{order.vendor?.full_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-sm text-ink">{order.store?.name || '—'}</div>
                        {order.store?.city && (
                          <div className="text-[11px] text-ink-3">{order.store.city}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-ink">{fmt(order.total)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[order.status]}`}>
                          {STATUS_LABEL[order.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {order.status === 'sent' && (
                            <button onClick={() => handleConfirm(order)}
                              title="Confirmar pedido"
                              className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors">
                              ✓ Confirmar
                            </button>
                          )}
                          {(order.status === 'sent' || order.status === 'draft') && (
                            <button onClick={() => handleCancel(order)}
                              title="Cancelar pedido"
                              className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 transition-colors">
                              × Cancelar
                            </button>
                          )}
                          <button
                            onClick={() => handleViewPdf(order, true)}
                            disabled={downloading[order.id]}
                            title="Ver PDF con total"
                            className="text-xs px-2 py-1 rounded-lg bg-pink-light text-pink-dark hover:bg-pink/10 border border-pink/20 transition-colors disabled:opacity-40">
                            {downloading[order.id] ? '…' : '📄 Ver PDF'}
                          </button>
                          <button
                            onClick={() => handleViewPdf(order, false)}
                            disabled={downloading[order.id]}
                            title="Ver PDF sin total (para cliente)"
                            className="text-xs px-2 py-1 rounded-lg bg-surface text-ink-3 hover:bg-line border border-line transition-colors disabled:opacity-40">
                            sin total
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Rankings ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Top referencias */}
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-line flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-pink-light text-pink-dark flex items-center justify-center text-sm">↑</span>
                <span className="text-sm font-semibold text-ink">Top referencias</span>
                {fCategory && (
                  <span className="ml-1 text-[11px] font-medium bg-pink-light text-pink-dark px-2 py-0.5 rounded-full">
                    {fCategory}
                  </span>
                )}
              </div>
              <div className="px-5 py-2">
                {refSales.length === 0 ? (
                  <div className="text-center py-8 text-ink-3 text-sm">Sin datos aún.</div>
                ) : refSales.slice(0, 8).map(r => (
                  <RankBar key={r.code}
                    label={r.code}
                    sub={r.description}
                    value={r.total_value}
                    units={r.total_units}
                    max={maxRef} />
                ))}
              </div>
            </div>

            {/* Top vendedores */}
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-line flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-pink-light text-pink-dark flex items-center justify-center text-sm">★</span>
                <span className="text-sm font-semibold text-ink">Top vendedores</span>
              </div>
              <div className="px-5 py-2">
                {vendorSales.length === 0 ? (
                  <div className="text-center py-8 text-ink-3 text-sm">Sin datos aún.</div>
                ) : vendorSales.map(v => (
                  <RankBar key={v.vendor_id}
                    label={v.vendor_name}
                    sub={`${v.order_count} pedido${v.order_count !== 1 ? 's' : ''}`}
                    value={v.total_value}
                    units={v.total_units}
                    max={maxVendor} />
                ))}
              </div>
            </div>

          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Comparativa entre colecciones                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'comparativas' && (
        <ComparativasSection data={colSales} />
      )}

      {/* Modal de Vista Rápida de pedido */}
      {viewOrder && <OrderDetailModal order={viewOrder} onClose={() => setViewOrder(null)} />}
      {loadingView && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-xl px-6 py-4 shadow-xl text-sm text-ink-3">Cargando detalle…</div>
        </div>
      )}

    </div>
  )
}
