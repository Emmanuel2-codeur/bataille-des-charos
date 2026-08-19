import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'

export default function Matchs() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadMatches = async () => {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        phase,
        round_label,
        match_type,
        scheduled_at,
        status,
        player1:profiles!matches_player1_id_fkey (
          id,
          pseudo
        ),
        player2:profiles!matches_player2_id_fkey (
          id,
          pseudo
        ),
        groups (
          name
        )
      `)
      .order('scheduled_at', { ascending: true })

    if (error) {
      console.error(error)
      setError('Impossible de charger les matchs.')
    } else {
      setMatches(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadMatches()

    // Mise à jour automatique lorsqu'un admin
    // ajoute/modifie/supprime un match.
    const channel = supabase
      .channel('matchs-programmes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
        },
        () => {
          loadMatches()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const formatDate = (date) => {
    if (!date) return 'Date non définie'

    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-white text-ink-950">
      <Navbar />

      <main className="max-w-6xl mx-auto px-5 py-12">

        <div className="mb-10">
          <span className="eyebrow">
            LA BATAILLE DES CHAROS
          </span>

          <h1 className="font-display text-4xl md:text-5xl mt-3">
            Matchs programmés
          </h1>

          <p className="text-ink-600 mt-3">
            Consulte tous les matchs programmés du tournoi.
          </p>
        </div>

        {loading && (
          <div className="text-center py-16 text-ink-600">
            Chargement des matchs...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && matches.length === 0 && (
          <div className="rounded-2xl border border-ink-200 bg-ink-50 p-10 text-center">
            <div className="text-4xl mb-4">⚔️</div>

            <h2 className="text-xl font-bold">
              Aucun match programmé
            </h2>

            <p className="text-ink-600 mt-2">
              Les prochains matchs apparaîtront ici dès qu'ils seront programmés.
            </p>
          </div>
        )}

        {!loading && !error && matches.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">

            {matches.map((match) => (
              <div
                key={match.id}
                className="rounded-2xl border border-ink-200 bg-white p-6 shadow-card"
              >

                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="text-sm font-bold uppercase text-charo-orange">
                      {match.phase || 'Match'}
                    </span>

                    {match.round_label && (
                      <p className="text-sm text-ink-500 mt-1">
                        {match.round_label}
                      </p>
                    )}
                  </div>

                  <span className="text-sm font-semibold text-ink-600">
                    🕐 {formatDate(match.scheduled_at)}
                  </span>
                </div>

                <div className="space-y-4">

                  <div className="flex items-center justify-between">
                    <span className="font-bold text-lg">
                      {match.player1?.pseudo || 'À déterminer'}
                    </span>

                    <span className="text-xl font-bold">
                      VS
                    </span>

                    <span className="font-bold text-lg text-right">
                      {match.player2?.pseudo || 'À déterminer'}
                    </span>
                  </div>

                </div>

                <div className="mt-6 pt-4 border-t border-ink-100 flex items-center justify-between">

                  <span className="text-sm text-ink-600">
                    {match.match_type || 'Match'}
                  </span>

                  <span className="text-sm font-bold">
                    {match.status === 'live'
                      ? '🔴 En direct'
                      : match.status === 'completed'
                        ? '✓ Terminé'
                        : '⏳ À venir'}
                  </span>

                </div>

              </div>
            ))}

          </div>
        )}

      </main>

      <Footer />
    </div>
  )
}