import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, History, RefreshCw } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'

const phaseLabels = {
  poule: 'Poule',
  trente_deuxieme: '16ème',
  seizieme: 'Huitième',
  quart: 'Quart',
  demie: 'Demi-finale',
  finale: 'Finale',
}
const FINAL_PHASES = ['trente_deuxieme', 'seizieme', 'quart', 'demie', 'finale']

const dateKey = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : 'sans-date')
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date à confirmer')

/**
 * Un match de phase finale terminé porte un score ALLER et un score RETOUR
 * cumulés dans la même ligne ; on le scinde en lignes distinctes (aller /
 * retour / cumul) pour l'affichage, sans changer le style existant.
 * Un match de poule reste une seule ligne, inchangée.
 */
function buildRows(matches) {
  const rows = []
  for (const m of matches) {
    const p1 = m.player1?.pseudo || 'Joueur 1'
    const p2 = m.player2?.pseudo || 'Joueur 2'
    const isFinal = FINAL_PHASES.includes(m.phase)

    if (!isFinal) {
      rows.push({
        key: m.id,
        phase: m.phase,
        scheduledAt: m.scheduled_at,
        p1, p2,
        subtitle: `${m.round_label || 'Match'}${m.groups?.name ? ` · Groupe ${m.groups.name}` : ''}`,
        score1: m.score1, score2: m.score2,
        damage1: m.damage1, damage2: m.damage2,
        winner: m.winner_id ? (m.winner_id === m.player1?.id ? p1 : p2) : 'Égalité',
      })
      continue
    }

    rows.push({
      key: `${m.id}-aller`, phase: m.phase, scheduledAt: m.scheduled_at, p1, p2,
      subtitle: `${m.round_label || 'Match'} · Match aller`,
      score1: m.score1, score2: m.score2, damage1: m.damage1, damage2: m.damage2,
      winner: '—',
    })
    rows.push({
      key: `${m.id}-retour`, phase: m.phase, scheduledAt: m.scheduled_at_retour || m.scheduled_at, p1, p2,
      subtitle: `${m.round_label || 'Match'} · Match retour`,
      score1: m.score1_retour ?? 0, score2: m.score2_retour ?? 0, damage1: m.damage1_retour ?? 0, damage2: m.damage2_retour ?? 0,
      winner: '—',
    })
    rows.push({
      key: `${m.id}-cumul`, phase: m.phase, scheduledAt: m.scheduled_at_retour || m.scheduled_at, p1, p2,
      subtitle: `${m.round_label || 'Match'} · Cumul qualifiant`,
      score1: Number(m.score1 || 0) + Number(m.score1_retour || 0),
      score2: Number(m.score2 || 0) + Number(m.score2_retour || 0),
      damage1: Number(m.damage1 || 0) + Number(m.damage1_retour || 0),
      damage2: Number(m.damage2 || 0) + Number(m.damage2_retour || 0),
      winner: m.winner_id ? (m.winner_id === m.player1?.id ? p1 : p2) : 'Égalité',
      isSummary: true,
    })
  }
  return rows
}

/** Groupe par (phase + date), groupes triés du plus récent au plus ancien. */
function groupRows(rows) {
  const byKey = new Map()
  for (const row of rows) {
    const key = `${row.phase}__${dateKey(row.scheduledAt)}`
    if (!byKey.has(key)) byKey.set(key, { phase: row.phase, dateIso: row.scheduledAt, rows: [] })
    byKey.get(key).rows.push(row)
  }
  return Array.from(byKey.values())
    .sort((a, b) => new Date(b.dateIso || 0) - new Date(a.dateIso || 0))
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => new Date(b.scheduledAt || 0) - new Date(a.scheduledAt || 0)) }))
}

function HistoryTable({ group }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 bg-ink-800 border-b border-ink-700">
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-full border border-ink-700 px-2.5 py-1 text-xs font-semibold">
            {phaseLabels[group.phase] || group.phase}
          </span>
          <span className="font-bold capitalize">{dateLabel(group.dateIso)}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-ink-800 border-b border-ink-700 text-left">
              <th className="px-5 py-4 font-bold">Match</th>
              <th className="px-5 py-4 font-bold text-center">Score</th>
              <th className="px-5 py-4 font-bold text-center">Dégâts</th>
              <th className="px-5 py-4 font-bold">Vainqueur</th>
              <th className="px-5 py-4 font-bold">Heure</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700">
            {group.rows.map((row) => (
              <tr key={row.key} className={`hover:bg-ink-800/70 transition-colors ${row.isSummary ? 'bg-charo-orange/5' : ''}`}>
                <td className="px-5 py-4">
                  <p className="font-bold">{row.p1} <span className="text-ink-600">vs</span> {row.p2}</p>
                  <p className="text-xs text-ink-600 mt-1">{row.subtitle}</p>
                </td>
                <td className="px-5 py-4 text-center font-display text-xl">{row.score1} — {row.score2}</td>
                <td className="px-5 py-4 text-center font-semibold">{Number(row.damage1 || 0).toLocaleString('fr-FR')} — {Number(row.damage2 || 0).toLocaleString('fr-FR')}</td>
                <td className="px-5 py-4 font-bold text-charo-orange">{row.winner}</td>
                <td className="px-5 py-4 text-ink-600">
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock size={14} />
                    {row.scheduledAt ? new Date(row.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Historique() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadHistory = async () => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setError('Supabase n’est pas configuré. Créez le fichier .env avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const { data, error: queryError } = await supabase
      .from('matches')
      .select(`
        id, phase, leg, match_type, score1, score2, damage1, damage2,
        score1_retour, score2_retour, damage1_retour, damage2_retour,
        status, scheduled_at, scheduled_at_retour, round_label, winner_id,
        player1:profiles!matches_player1_id_fkey(id, pseudo),
        player2:profiles!matches_player2_id_fkey(id, pseudo),
        groups(name)
      `)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })

    if (queryError) setError(queryError.message)
    else setMatches(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadHistory()
    if (typeof supabase.channel !== 'function') return undefined
    const channel = supabase
      .channel('historique-matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, loadHistory)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const groups = useMemo(() => groupRows(buildRows(matches)), [matches])

  return (
    <div className="min-h-screen">
      <Navbar />
      <section className="py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
            <div>
              <span className="eyebrow mb-4"><History size={13} /> Archives</span>
              <h1 className="font-display text-4xl md:text-5xl mb-3 text-ink-900">Historique des matchs</h1>
              <p className="text-ink-600 max-w-2xl">Tous les matchs terminés, leurs scores, kills et dégâts — le plus récent en premier.</p>
            </div>
            <button onClick={loadHistory} className="btn-primary" disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
            </button>
          </div>

          {error && <p className="card p-5 text-sm text-red-600 mb-6">{error}</p>}

          {loading && matches.length === 0 ? (
            <div className="card p-16 text-center text-ink-600">Chargement de l'historique…</div>
          ) : groups.length === 0 ? (
            <div className="card p-16 text-center text-ink-600">Aucun match terminé pour le moment.</div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <HistoryTable key={`${group.phase}__${dateKey(group.dateIso)}`} group={group} />
              ))}
            </div>
          )}
        </div>
      </section>
      <Footer />
    </div>
  )
}