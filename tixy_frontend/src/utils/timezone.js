const COLOMBIA_TZ = 'America/Bogota'

// Fecha/hora actual en Colombia, sin importar la zona horaria del sistema
// del cliente. Se devuelve como un Date cuyos getters locales (getFullYear,
// getMonth, getDate, getDay...) representan la hora de Bogotá, para poder
// seguir usando la API normal de Date en el resto del código.
export function nowInColombia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COLOMBIA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const get = type => Number(parts.find(p => p.type === type).value)

  return new Date(
    get('year'), get('month') - 1, get('day'),
    get('hour') === 24 ? 0 : get('hour'), get('minute'), get('second'),
  )
}

// Formatea un Date a YYYY-MM-DD usando sus componentes locales (no UTC),
// para no desplazar el día al convertir.
export function toLocalISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
