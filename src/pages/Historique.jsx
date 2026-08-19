import { useEffect, useState } from 'react'
import { CalendarClock, History, RefreshCw } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'

const phaseLabels = {
  poule: 'Poule',
  huitieme: 'Huitième',
  quart: 'Quart',
  demie: 'Demi-finale',
  finale: 'Finale',
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
        status, scheduled_at, round_label, winner_id,
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

  return (
    <div className="min-h-screen">
      <Navbar />
      <section className="py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
            <div>
              <span className="eyebrow mb-4"><History size={13} /> Archives</span>
              <h1 className="font-display text-4xl md:text-5xl mb-3 text-ink-900">Historique des matchs</h1>
              <p className="text-ink-600 max-w-2xl">Tous les matchs terminés, leurs scores, kills et dégâts.</p>
            </div>
            <button onClick={loadHistory} className="btn-primary" disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
            </button>
          </div>

          <div className="card overflow-hidden">
            {error && <p className="p-5 text-sm text-red-600 border-b border-ink-700">{error}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-ink-800 border-b border-ink-700 text-left">
                    <th className="px-5 py-4 font-bold">Match</th>
                    <th className="px-5 py-4 font-bold">Phase</th>
                    <th className="px-5 py-4 font-bold text-center">Score</th>
                    <th className="px-5 py-4 font-bold text-center">Dégâts</th>
                    <th className="px-5 py-4 font-bold">Vainqueur</th>
                    <th className="px-5 py-4 font-bold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700">
                  {loading && matches.length === 0 ? (
                    <tr><td colSpan="6" className="px-5 py-16 text-center text-ink-600">Chargement de l'historique…</td></tr>
                  ) : matches.length === 0 ? (
                    <tr><td colSpan="6" className="px-5 py-16 text-center text-ink-600">Aucun match terminé pour le moment.</td></tr>
                  ) : matches.map((match) => {
                    const p1 = match.player1?.pseudo || 'Joueur 1'
                    const p2 = match.player2?.pseudo || 'Joueur 2'
                    const winner = match.winner_id ? (match.winner_id === match.player1?.id ? p1 : p2) : 'Égalité'
                    return (
                      <tr key={match.id} className="hover:bg-ink-800/70 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-bold">{p1} <span className="text-ink-600">vs</span> {p2}</p>
                          <p className="text-xs text-ink-600 mt-1">{match.round_label || 'Match'}{match.groups?.name ? ` · Groupe ${match.groups.name}` : ''}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full border border-ink-700 px-2.5 py-1 text-xs font-semibold">
                            {phaseLabels[match.phase] || match.phase}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center font-display text-xl">{match.score1} — {match.score2}</td>
                        <td className="px-5 py-4 text-center font-semibold">{match.damage1.toLocaleString('fr-FR')} — {match.damage2.toLocaleString('fr-FR')}</td>
                        <td className="px-5 py-4 font-bold text-charo-orange">{winner}</td>
                        <td className="px-5 py-4 text-ink-600">
                          <span className="inline-flex items-center gap-2">
                            <CalendarClock size={14} />
                            {match.scheduled_at ? new Date(match.scheduled_at).toLocaleString('fr-FR') : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
