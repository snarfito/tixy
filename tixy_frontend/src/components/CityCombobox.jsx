import { useState, useRef, useEffect } from 'react'
import { COLOMBIA_CITIES } from '../utils/colombiaCities'

/**
 * CityCombobox — selector de municipios colombianos con búsqueda en tiempo real.
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

  const filtered = query.trim().length >= 1
    ? COLOMBIA_CITIES.filter(c =>
        c.toLowerCase().includes(query.toLowerCase().trim())
      ).slice(0, 40)  // máximo 40 resultados para no saturar el DOM
    : []

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

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => { if (query.trim().length >= 1) setOpen(true) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={`input-base ${className}`}
      />

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line
                     rounded-lg shadow-lg max-h-52 overflow-y-auto text-sm">
          {filtered.map((city, i) => (
            <li
              key={city}
              onMouseDown={() => handleSelect(city)}
              className={`px-4 py-2 cursor-pointer transition-colors
                ${i === focused ? 'bg-pink-light text-pink-dark font-medium' : 'hover:bg-surface text-ink'}`}>
              {city}
            </li>
          ))}
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
