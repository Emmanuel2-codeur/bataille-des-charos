import { useEffect, useState } from 'react'
import { Trophy, MoveHorizontal, LoaderCircle } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import BracketTree from '../components/BracketTree'
import { supabase } from '../lib/supabaseClient'

const PHASE_ORDER = ['seizieme', 'huitieme', 'quart', 'demie', 'finale']
const PHASE_LABELS = { seizieme: 'Seizièmes de finale', huitieme: 'Huitièmes de finale', quart: 'Quarts de finale', demie: 'Demi-finales', finale: 'Finale' }
const SLOTS_PER_PHASE = { seizieme: 16, huitieme: 8, quart: 4, demie: 2, finale: 1 }

export default function Bracket() {
  const [rounds, setRounds] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data } = await supabase
      .from('matches')
      .select('id, phase, status, score1, score2, winner_id, player1_id, player2_id, player1:profiles!matches_player1_id_fkey(pseudo), player2:profiles!matches_player2_id_fkey(pseudo), created_at')
      .in('phase', PHASE_ORDER)
      .order('created_at', { ascending: true })

    const byPhase = {}
    ;(data || []).forEach((m) => {
      if (!byPhase[m.phase]) byPhase[m.phase] = []
      byPhase[m.phase].push(m)
    })

    const built = PHASE_ORDER.map((phase) => {
      const matches = byPhase[phase] || []
      const slots = SLOTS_PER_PHASE[phase]
      const padded = Array.from({ length: slots }, (_, i) => {
        const m = matches[i]
        if (!m) return { player1: null, player2: null, score1: null, score2: null, winner: null }
        return {
          player1: m.player1?.pseudo ?? null,
          player2: m.player2?.pseudo ?? null,
          score1: m.status === 'scheduled' ? null : m.score1,
          score2: m.status === 'scheduled' ? null : m.score2,
          winner: m.winner_id ? (m.winner_id === m.player1_id ? 1 : 2) : null,
        }
      })
      return { label: PHASE_LABELS[phase], matches: padded }
    })

    setRounds(built)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel?.('bracket-live')
      ?.on?.('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      ?.subscribe?.()
    return () => { if (channel) supabase.removeChannel?.(channel) }
  }, [])

  const hasAnyMatch = rounds?.some((r) => r.matches.some((m) => m.player1 || m.player2))

  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <div>
              <span className="eyebrow mb-4"><Trophy size={12} className="inline -mt-0.5" /> Phases finales</span>
              <h1 className="font-display text-4xl md:text-5xl">Arbre de compétition</h1>
            </div>
            <p className="flex items-center gap-2 text-xs text-ink-600 lg:hidden">
              <MoveHorizontal size={14} /> Glisser pour naviguer
            </p>
          </div>
          <p className="text-ink-600 max-w-xl mb-12">
            Élimination directe pour les 32 qualifiés. Les seizièmes ouvrent le bracket, puis huitièmes, quarts, demies et finale. Chaque duel peut être joué en Aller (One Tap) / Retour (Spam).
            Le vainqueur avance automatiquement au tour suivant.
          </p>

          <div className="card p-6 lg:p-10">
            {loading ? (
              <div className="flex items-center gap-3 text-ink-600 py-16 justify-center">
                <LoaderCircle className="animate-spin" size={18} /> Chargement de l'arbre…
              </div>
            ) : (
              <>
                <BracketTree rounds={rounds} />
                {!hasAnyMatch && (
                  <p className="text-center text-ink-600 text-sm mt-6">
                    L'arbre se remplira dès que la phase de poules sera terminée et que les 32 qualifiés seront désignés.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
