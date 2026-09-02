import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'

function normalize(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .toLowerCase()
    .trim()
}

/**
 * Sélecteur de joueur "intelligent" pour l'admin :
 *  - recherche instantanée par pseudo (ou ID Free Fire), insensible aux
 *    accents/casse, qui matche n'importe où dans le nom (pas seulement le
 *    début) et gère plusieurs mots tapés dans n'importe quel ordre
 *  - affiche automatiquement le badge de la poule du joueur sélectionné
 *  - clavier : flèches + Entrée + Échap
 */
export default function PlayerCombobox({ players, groups, value, onChange, label, excludeId }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef(null)

  const groupName = (groupId) => groups.find((g) => g.id === groupId)?.name

  const selected = players.find((p) => p.id === value)

  const filtered = useMemo(() => {
    const base = players.filter((p) => p.id !== excludeId)
    const tokens = normalize(query).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return base.slice(0, 40)

    const scored = base
      .map((p) => {
        const pseudoN = normalize(p.pseudo)
        const uidN = normalize(p.ff_uid)
        // chaque mot tapé doit se retrouver QUELQUE PART dans le pseudo ou l'ID
        const matchesAll = tokens.every((t) => pseudoN.includes(t) || uidN.includes(t))
        if (!matchesAll) return null
        // score : priorité aux pseudos qui commencent par ce qui est tapé
        const score = pseudoN.startsWith(tokens[0]) ? 0 : pseudoN.includes(tokens[0]) ? 1 : 2
        return { p, score }
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.p.pseudo.localeCompare(b.p.pseudo))

    return scored.map((s) => s.p).slice(0, 40)
  }, [players, query, excludeId])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const pick = (player) => {
    onChange(player?.id || '')
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) pick(filtered[highlight]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="block relative" ref={rootRef}>
      {label && <span className="block text-xs font-semibold text-ink-600 mb-1.5">{label}</span>}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="w-full flex items-center justify-between gap-2 rounded-lg bg-ink-800 border border-ink-700 text-sm px-3 py-2.5 outline-none focus:border-charo-orange text-left"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate font-semibold">{selected.pseudo}</span>
            {selected.group_id && (
              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-charo-orange/15 text-charo-orange border border-charo-orange/30">
                Poule {groupName(selected.group_id) || '—'}
              </span>
            )}
          </span>
        ) : (
          <span className="text-ink-600">Rechercher un joueur…</span>
        )}
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <X
              size={14}
              className="text-ink-600 hover:text-red-500"
              onClick={(e) => { e.stopPropagation(); pick(null) }}
            />
          )}
          <ChevronDown size={14} className={`text-ink-600 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-ink-700 bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ink-700">
            <Search size={14} className="text-ink-600 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0) }}
              onKeyDown={onKeyDown}
              placeholder="Nom du joueur ou ID Free Fire…"
              className="w-full text-sm outline-none bg-transparent"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-ink-600 text-center">Aucun joueur trouvé.</p>
            )}
            {filtered.map((p, i) => (
              <button
                type="button"
                key={p.id}
                onClick={() => pick(p)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                  i === highlight ? 'bg-charo-orange/10' : 'hover:bg-ink-800'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-ink-800 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {p.pseudo?.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate font-medium">{p.pseudo}</span>
                </span>
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink-800 text-ink-600">
                  {p.group_id ? `Poule ${groupName(p.group_id) || '—'}` : 'Sans poule'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
