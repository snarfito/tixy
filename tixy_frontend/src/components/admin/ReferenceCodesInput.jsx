import { useState, useMemo, useRef } from 'react'

/**
 * Selector de códigos de referencia con autocompletado tipo "chips".
 * `refs`: [{id, code, description}] de la colección actual.
 * `value`: ids seleccionados. `onChange(ids)`: nuevo array completo.
 */
export default function ReferenceCodesInput({ refs, value, onChange, placeholder = 'Buscar código…' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const selectedRefs = useMemo(
    () => value.map(id => refs.find(r => r.id === id)).filter(Boolean),
    [value, refs]
  )

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return refs
      .filter(r => !value.includes(r.id) && r.code.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, refs, value])

  function addRef(ref) {
    onChange([...value, ref.id])
    setQuery('')
    inputRef.current?.focus()
  }

  function removeRef(id) {
    onChange(value.filter(v => v !== id))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault()
      addRef(suggestions[0])
    } else if (e.key === 'Backspace' && !query && selectedRefs.length > 0) {
      removeRef(selectedRefs[selectedRefs.length - 1].id)
    }
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1 border border-line rounded px-2 py-1.5 focus-within:border-pink">
        {selectedRefs.map(r => (
          <span key={r.id} className="inline-flex items-center gap-1 bg-pink-light text-pink-dark text-[11px] px-1.5 py-0.5 rounded">
            {r.code}
            <button type="button" onClick={() => removeRef(r.id)} className="hover:text-red-600 leading-none">×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={selectedRefs.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] text-xs outline-none py-0.5"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-line rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map(r => (
            <button
              key={r.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => addRef(r)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-pink-light">
              <span className="font-semibold text-pink-dark">{r.code}</span>
              <span className="text-ink-3 ml-1.5">{r.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
