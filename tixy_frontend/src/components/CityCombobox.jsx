import { useState, useRef, useEffect } from 'react'
import { COLOMBIA_CITIES } from '../utils/colombiaCities'

/**
 * CityCombobox — selector de municipios colombianos con autocompletado + dropdown inteligente.
 *
 * Props:
 *   value      {string}   — ciudad seleccionada actualmente
 *   onChange   {fn}       — callback(cityName: string)
 *   className  {string}   — clases extra para el input
 *   placeholder {string}  — placeholder del input
 */
export default function CityCombobox({ value, onChange, className = '', placeholder = 'Buscar ciudad…' }) {
  const [query,   setQuery]   = useState(value || '')
  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState(0)
  const containerRef = useRef(null)
  const listRef      = useRef(null)
  const inputRef     = useRef(null)

  // Sincronizar si el valor externo cambia (ej. al cargar una orden)
  useEffect(() => { setQuery(value || '') }, [value])

  // Cerrar al hacer click fuera
  useEffect(() => {
    function onOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        // Si no eligió nada, restaurar el valor guardado
        setQuery(value || '')
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [value])

  // Normaliza texto quitando tildes/diacríticos y pasando a minúsculas
  function normalize(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  const normalizedQuery = normalize(query.trim())

  const filtered = normalizedQuery.length >= 1
    ? COLOMBIA_CITIES
        .filter(c => normalize(c).includes(normalizedQuery))
        .sort((a, b) => {
          // Primero exacto, luego starts with, luego contiene
          const aNorm = normalize(a)
          const bNorm = normalize(b)
          const aExact = aNorm === normalizedQuery
          const bExact = bNorm === normalizedQuery
          const aStarts = aNorm.startsWith(normalizedQuery)
          const bStarts = bNorm.startsWith(normalizedQuery)
          
          if (aExact && !bExact) return -1
          if (!aExact && bExact) return 1
          if (aStarts && !bStarts) return -1
          if (!aStarts && bStarts) return 1
          return aNorm.localeCompare(bNorm)
        })
        .slice(0, 6)  // máximo 6 resultados para evitar scrolleo
    : []

  // El primer resultado (mejor match)
  const topMatch = filtered.length > 0 ? filtered[0] : null
  const hasAutocompletion = topMatch && query.trim().length >= 2 && !normalize(topMatch).startsWith(normalizedQuery.slice(0, -1) + query.trim().charAt(query.trim().length - 1))
  
  // Calcula el sufijo a mostrar en gris (autocompletado)
  const autocompleteText = topMatch && normalize(topMatch).includes(normalizedQuery)
    ? topMatch.slice(query.trim().length)
    : ''

  function handleInput(e) {
    setQuery(e.target.value)
    setOpen(true)
    setFocused(0)
  }

  function handleSelect(city) {
    onChange(city)
    setQuery(city)
    setOpen(false)
  }

  function handleKeyDown(e) {
    // Tab o flecha derecha: aceptar autocompletado
    if ((e.key === 'Tab' || e.key === 'ArrowRight') && topMatch && autocompleteText) {
      e.preventDefault()
      handleSelect(topMatch)
      return
    }

    if (!open || !filtered.length) return
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocused(f => Math.min(f + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocused(f => Math.max(f - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(filtered[focused])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery(value || '')
    }
  }

  // Scroll automático al item enfocado
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[focused]
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [focused])

  // Mostrar dropdown solo si hay múltiples opciones o sin match exacto
  const showDropdown = open && filtered.length > 0 && (
    filtered.length > 1 || 
    (filtered.length === 1 && normalize(filtered[0]) !== normalizedQuery)
  )

  return (
    <div ref={containerRef} className="relative">
      {/* Contenedor con autocompletado visual */}
      <div className="relative">
        {/* Texto autocompletado (ghost text) */}
        {autocompleteText && (
          <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none overflow-hidden">
            <input
              type="text"
              value={query.trim() + autocompleteText}
              disabled
              className="input-base text-ink-3/40 bg-transparent placeholder-transparent"
            />
          </div>
        )}
        {/* Input real */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => { if (query.trim().length >= 1) setOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={`input-base relative bg-white ${className}`}
        />
      </div>

      {/* Dropdown — solo si hay múltiples resultados o sin match exacto */}
      {showDropdown && (
        <ul
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line
                     rounded-lg shadow-lg max-h-56 overflow-y-auto text-sm">
          {filtered.map((city, i) => {
            const isExact = normalize(city) === normalizedQuery
            return (
              <li
                key={city}
                onMouseDown={() => handleSelect(city)}
                className={`px-4 py-2.5 cursor-pointer transition-colors font-medium
                  ${i === focused 
                    ? 'bg-pink-light text-pink-dark' 
                    : isExact
                    ? 'bg-pink/5 text-pink-dark border-l-2 border-pink-mid'
                    : 'hover:bg-surface text-ink'
                }`}>
                {city}
              </li>
            )
          })}
        </ul>
      )}

      {/* Indicador "sin resultados" */}
      {open && query.trim().length >= 2 && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line
                        rounded-lg shadow-lg px-4 py-3 text-sm text-ink-3">
          Sin resultados para «{query}»
        </div>
      )}
    </div>
  )
}
