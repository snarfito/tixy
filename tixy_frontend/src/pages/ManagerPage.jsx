import { useState, useEffect, useCallback } from 'react'
import { listOrders, confirmOrder, cancelOrder, salesByReference, salesByVendor, getCollections, getUsers, downloadPdf } from '../api/manager'
import fmt from '../utils/fmt'

// ── helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABEL = { draft: 'Borrador', sent: 'Enviado', confirmed: 'Confirmado', cancelled: 'Cancelado' }
const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-500',
  sent:      'bg-gold-light text-amber-700',
  confirmed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-500',
}
const CITIES = ['La Dorada','Bogotá','Medellín','Cali','Barranquilla','Pereira','Manizales','Bucaramanga','Ibagué']

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
// PÁGINA GERENCIA
// ════════════════════════════════════════════════════════════════════════════
export default function ManagerPage() {
  const [collections, setCollections] = useState([])
  const [vendors,     setVendors]     = useState([])
  const [orders,      setOrders]      = useState([])
  const [refSales,    setRefSales]    = useState([])
  const [vendorSales, setVendorSales] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [banner,      setBanner]      = useState(null)

  // filtros
  const [fCol,    setFCol]    = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fCity,   setFCity]   = useState('')
  const [fVendor, setFVendor] = useState('')

  // carga inicial
  useEffect(() => {
    Promise.all([getCollections(), getUsers()])
      .then(([cols, users]) => {
        setCollections(cols)
              setVendors(users.filter(u => u.is_active))
      })
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
    if (fCol)    reportParams.collection_id = fCol
    if (fVendor) reportParams.vendor_id     = fVendor

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
  }, [fCol, fStatus, fCity, fVendor])

  useEffect(() => { loadData() }, [loadData])

  const [downloading, setDownloading] = useState({})

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3000) }

  async function handleDownload(order, showTotal) {
    setDownloading(prev => ({ ...prev, [order.id]: true }))
    try {
      await downloadPdf(order.id, showTotal)
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

  // métricas
  const totalOrders  = orders.length
  const totalUnits   = orders.reduce((s, o) => s + (o.units || 0), 0)
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
  const pending      = orders.filter(o => o.status === 'sent').length

  const maxRef    = refSales[0]?.total_value    || 1
  const maxVendor = vendorSales[0]?.total_value || 1

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Panel de Gerencia</h1>
          <p className="text-ink-3 text-sm">Seguimiento de ventas por pedido, referencia y vendedor.</p>
        </div>
        <button onClick={loadData} className="btn-secondary text-xs px-3 py-1.5">↻ Actualizar</button>
      </div>

      {banner && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium border
          ${banner.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}

      {/* ── Métricas ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Metric label="Pedidos"          value={totalOrders} />
        <Metric label="Pendientes"       value={pending} />
        <Metric label="Unidades vendidas" value={totalUnits.toLocaleString('es-CO')} />
        <Metric label="Total en ventas"  value={fmt(totalRevenue)} pink />
      </div>

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

        {(fCol || fStatus || fCity || fVendor) && (
          <button onClick={() => { setFCol(''); setFStatus(''); setFCity(''); setFVendor('') }}
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
                <tr key={order.id} className="border-b border-line hover:bg-surface transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-pink-dark">#{order.order_number}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-3">{fmtDate(order.created_at)}</td>
                  <td className="px-4 py-2.5 text-sm text-ink">{order.vendor?.full_name || '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-ink-2">
                    {order.store_id ? <span className="text-xs text-ink-3">#{order.store_id}</span> : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-ink">{fmt(order.total)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
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
                        onClick={() => handleDownload(order, true)}
                        disabled={downloading[order.id]}
                        title="Descargar PDF con total"
                        className="text-xs px-2 py-1 rounded-lg bg-pink-light text-pink-dark hover:bg-pink/10 border border-pink/20 transition-colors disabled:opacity-40">
                        {downloading[order.id] ? '…' : '↓ PDF'}
                      </button>
                      <button
                        onClick={() => handleDownload(order, false)}
                        disabled={downloading[order.id]}
                        title="Descargar PDF sin total (para cliente)"
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
    </div>
  )
}
