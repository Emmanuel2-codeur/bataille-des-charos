import { useMemo, useState } from 'react'
import { History, Search } from 'lucide-react'

const ACTION_LABEL = { insert: 'Création', update: 'Modification', delete: 'Suppression' }
const ACTION_COLOR = { insert: 'bg-green-50 text-green-700 border-green-200', update: 'bg-amber-50 text-amber-700 border-amber-200', delete: 'bg-red-50 text-red-700 border-red-200' }
const ENTITY_LABEL = { profiles: 'Joueur', matches: 'Match', groups: 'Poule', announcements: 'Annonce' }

export default function AuditLogSection({ entries }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      e.actor_pseudo?.toLowerCase().includes(q) ||
      e.entity_label?.toLowerCase().includes(q) ||
      e.entity_type?.toLowerCase().includes(q)
    )
  }, [entries, query])

  return (
    <div className="mb-14">
      <div className="flex items-center gap-2.5 mb-1"><History size={18} className="text-charo-orange" /><h2 className="font-bold text-lg text-ink-700">Journal d'audit</h2></div>
      <p className="text-sm text-ink-600 mb-5">
        Chaque modification faite par un admin est enregistrée automatiquement : qui, quoi, quand — pour une traçabilité totale.
      </p>

      <div className="flex items-center gap-2 mb-4 rounded-xl border border-ink-700 bg-white px-3 py-2.5 max-w-md">
        <Search size={14} className="text-ink-600" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par admin, joueur, match…"
          className="w-full text-sm outline-none"
        />
      </div>

      <div className="card divide-y divide-ink-700 max-h-[520px] overflow-y-auto">
        {filtered.length === 0 && <p className="p-6 text-sm text-ink-600">Aucune entrée pour l'instant.</p>}
        {filtered.map((e) => (
          <div key={e.id} className="p-4 flex flex-wrap items-center gap-3">
            <span className={`text-[10px] font-extrabold uppercase tracking-wide rounded-full px-2.5 py-1 border shrink-0 ${ACTION_COLOR[e.action] || 'bg-ink-800 border-ink-700 text-ink-600'}`}>
              {ACTION_LABEL[e.action] || e.action}
            </span>
            <p className="text-sm min-w-0">
              <span className="font-bold">{e.actor_pseudo || 'Système'}</span>
              {' '}<span className="text-ink-600">{ENTITY_LABEL[e.entity_type] || e.entity_type}</span>
              {e.entity_label && <span className="font-semibold"> · {e.entity_label}</span>}
            </p>
            <span className="ml-auto text-[11px] text-ink-600 shrink-0">{new Date(e.created_at).toLocaleString('fr-FR')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
