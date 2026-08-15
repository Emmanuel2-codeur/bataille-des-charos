import { useEffect, useState } from 'react'
import { Radio, Filter, Star, LoaderCircle } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import MatchCard from '../components/MatchCard'
import { supabase } from '../lib/supabaseClient'

const filters = ['Tous', 'À la une', 'Live', 'Terminés', 'À venir']

function mapMatch(m) {
  return {
    player1: m.player1?.pseudo || 'Joueur 1',
    player2: m.player2?.pseudo || 'Joueur 2',
    score1: m.score1, score2: m.score2,
    damage1: m.damage1, damage2: m.damage2,
    status: m.status,
    matchType: m.match_type,
    roundLabel: m.round_label || (m.phase === 'poule' ? 'Poule' : m.phase),
    scheduledAt: m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : null,
    featured: m.is_featured,
  }
}

export default function Dashboard() {
  const [filter, setFilter] = useState('À la une')
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data } = await supabase
      .from('matches')
      .select('id, phase, round_label, match_type, status, is_featured, scheduled_at, score1, score2, damage1, damage2, player1:profiles!matches_player1_id_fkey(pseudo), player2:profiles!matches_player2_id_fkey(pseudo)')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
    setMatches((data || []).map(mapMatch))
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel?.('dashboard-live')
      ?.on?.('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      ?.subscribe?.()
    return () => { if (channel) supabase.removeChannel?.(channel) }
  }, [])

  const filtered = matches.filter((m) => {
    if (filter === 'Tous') return true
    if (filter === 'À la une') return m.featured
    if (filter === 'Live') return m.status === 'live'
    if (filter === 'Terminés') return m.status === 'completed'
    if (filter === 'À venir') return m.status === 'scheduled'
    return true
  })

  const liveCount = matches.filter((m) => m.status === 'live').length

  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="py-14 lg:py-20 bg-radial-glow">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-6 mb-10">
            <div>
              <span className="eyebrow mb-4"><Radio size={12} className="inline -mt-0.5" /> Dashboard Live</span>
              <h1 className="font-display text-ink-700 text-4xl md:text-5xl">Matchs du jour</h1>
              <p className="text-ink-600 mt-3 max-w-lg">
                {liveCount} match{liveCount > 1 ? 's' : ''} en direct actuellement. Les scores se synchronisent automatiquement.
              </p>
            </div>
            <div className="card px-5 py-4 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-live animate-pulse" />
              <div>
                <p className="text-sm font-semibold">{liveCount} en direct</p>
                <p className="text-xs text-ink-600">Synchronisation Supabase Realtime</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
            <Filter size={15} className="text-ink-600 shrink-0" />
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  filter === f
                    ? 'bg-charo-gradient text-white border-transparent'
                    : 'border-ink-700 text-ink-600 hover:text-ink-950 hover:border-ink-950/30'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-ink-600 py-16 justify-center">
              <LoaderCircle className="animate-spin" size={18} /> Chargement des matchs…
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((m, i) => (
                <div key={i} className="relative">
                  {m.featured && (
                    <span className="absolute -top-2.5 -right-2.5 z-10 w-7 h-7 rounded-full bg-charo-gradient flex items-center justify-center shadow-glow">
                      <Star size={13} className="text-white" fill="currentColor" />
                    </span>
                  )}
                  <MatchCard match={m} />
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-ink-600 col-span-full text-center py-16">
                  {matches.length === 0
                    ? "Aucun match n'a encore été programmé. Rendez-vous dans l'espace admin."
                    : 'Aucun match dans cette catégorie pour le moment.'}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
