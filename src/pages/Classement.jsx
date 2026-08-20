import { useEffect, useState } from 'react'
import { ArrowRight, Medal, RefreshCw, Trophy } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { PAGE_LINKS } from '../config'

export default function Classement() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRanking = async () => {
    if (
      !import.meta.env.VITE_SUPABASE_URL ||
      !import.meta.env.VITE_SUPABASE_ANON_KEY
    ) {
      setError(
        'Supabase n’est pas configuré. Créez le fichier .env avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.'
      )
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      // Récupération des joueurs approuvés
      const { data: rankingData, error: rankingError } = await supabase
        .from('profiles')
        .select(
          'id, pseudo, ff_uid, avatar_url, total_points, total_kills, total_damage, wins, losses, is_qualified, group_id, groups(name)'
        )
        .eq('status', 'approved')
        .order('total_kills', { ascending: false })
        .order('total_damage', { ascending: false })

      if (rankingError) {
        throw rankingError
      }

      // Récupération des matchs terminés
      const { data: completedMatches, error: matchesError } = await supabase
        .from('matches')
        .select('player1_id, player2_id')
        .eq('status', 'completed')

      if (matchesError) {
        throw matchesError
      }

      // Calcul du nombre de matchs joués par joueur
      const matchesPlayed = {}

      ;(completedMatches || []).forEach((match) => {
        if (match.player1_id) {
          matchesPlayed[match.player1_id] =
            (matchesPlayed[match.player1_id] || 0) + 1
        }

        if (match.player2_id) {
          matchesPlayed[match.player2_id] =
            (matchesPlayed[match.player2_id] || 0) + 1
        }
      })

      // Ajout de matches_played à chaque joueur
      const playersWithMatches = (rankingData || []).map((player) => ({
        ...player,
        matches_played: matchesPlayed[player.id] || 0,
      }))

      setPlayers(playersWithMatches)
    } catch (err) {
      console.error('[Classement] Erreur:', err)

      setError(
        err?.message || 'Impossible de charger le classement.'
      )

      setPlayers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRanking()

    if (typeof supabase.channel !== 'function') {
      return undefined
    }

    // Realtime : changements des profils
    const profilesChannel = supabase
      .channel('classement-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          loadRanking()
        }
      )
      .subscribe()

    // Realtime : changements des matchs
    const matchesChannel = supabase
      .channel('classement-matches')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
        },
        () => {
          loadRanking()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profilesChannel)
      supabase.removeChannel(matchesChannel)
    }
  }, [])

  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">

          {/* En-tête */}
          <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
            <div>
              <span className="eyebrow mb-4">
                <Trophy size={13} />
                Classement général
              </span>

              <h1 className="font-display text-4xl md:text-5xl mb-3 text-ink-900">
                Le classement
              </h1>

              <p className="text-ink-600 max-w-2xl">
                Les scores, matchs joués, dégâts et victoires se mettent à
                jour automatiquement dès qu'un match est terminé.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={PAGE_LINKS.bracket}
                className="btn-outline"
              >
                Voir le bracket
                <ArrowRight size={16} />
              </Link>

              <button
                onClick={loadRanking}
                className="btn-primary"
                disabled={loading}
              >
                <RefreshCw
                  size={16}
                  className={loading ? 'animate-spin' : ''}
                />
                Actualiser
              </button>
            </div>
          </div>

          {/* Tableau */}
          <div className="card overflow-hidden">

            {error && (
              <p className="p-5 text-sm text-red-600 border-b border-ink-700">
                {error}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[930px] text-sm">

                <thead>
                  <tr className="bg-ink-800 border-b border-ink-700 text-left">
                    <th className="px-5 py-4 font-bold">
                      #
                    </th>

                    <th className="px-5 py-4 font-bold">
                      Joueur
                    </th>

                    <th className="px-5 py-4 font-bold">
                      Groupe
                    </th>

                    <th className="px-5 py-4 font-bold text-center">
                      Matchs joués
                    </th>

                    <th className="px-5 py-4 font-bold text-center">
                      Score
                    </th>

                    <th className="px-5 py-4 font-bold text-center">
                      Kills
                    </th>

                    <th className="px-5 py-4 font-bold text-center">
                      Dégâts
                    </th>

                    <th className="px-5 py-4 font-bold text-center">
                      V / D
                    </th>

                    <th className="px-5 py-4 font-bold text-center">
                      Statut
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-ink-700">

                  {loading && players.length === 0 ? (
                    <tr>
                      <td
                        colSpan="9"
                        className="px-5 py-16 text-center text-ink-600"
                      >
                        Chargement du classement…
                      </td>
                    </tr>
                  ) : players.length === 0 ? (
                    <tr>
                      <td
                        colSpan="9"
                        className="px-5 py-16 text-center text-ink-600"
                      >
                        Aucun joueur approuvé pour le moment.
                      </td>
                    </tr>
                  ) : (
                    players.map((player, index) => (
                      <tr
                        key={player.id}
                        className="hover:bg-ink-800/70 transition-colors"
                      >

                        {/* Rang */}
                        <td className="px-5 py-4 font-display text-xl text-charo-orange">
                          {index + 1}
                        </td>

                        {/* Joueur */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">

                            {player.avatar_url ? (
                              <img
                                src={player.avatar_url}
                                alt=""
                                className="w-9 h-9 rounded-full object-cover border border-ink-700"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-charo-gradient flex items-center justify-center text-ink-950 font-bold">
                                {player.pseudo
                                  ?.charAt(0)
                                  ?.toUpperCase() || '?'}
                              </div>
                            )}

                            <div>
                              <p className="font-bold">
                                {player.pseudo}
                              </p>

                              <p className="text-xs text-ink-600">
                                ID FF : {player.ff_uid || '—'}
                              </p>
                            </div>

                          </div>
                        </td>

                        {/* Groupe */}
                        <td className="px-5 py-4 font-semibold">
                          {player.groups?.name || '—'}
                        </td>

                        {/* Matchs joués */}
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex min-w-[36px] items-center justify-center rounded-full bg-charo-orange/10 border border-charo-orange/30 px-2.5 py-1 font-bold text-charo-orange">
                            {player.matches_played}
                          </span>
                        </td>

                        {/* Score */}
                        <td className="px-5 py-4 text-center font-bold">
                          {player.total_points ?? 0}
                        </td>

                        {/* Kills */}
                        <td className="px-5 py-4 text-center font-bold">
                          {player.total_kills ?? 0}
                        </td>

                        {/* Dégâts */}
                        <td className="px-5 py-4 text-center font-bold">
                          {(player.total_damage ?? 0).toLocaleString('fr-FR')}
                        </td>

                        {/* Victoires / défaites */}
                        <td className="px-5 py-4 text-center font-semibold">
                          {player.wins ?? 0} / {player.losses ?? 0}
                        </td>

                        {/* Statut */}
                        <td className="px-5 py-4 text-center">
                          {player.is_qualified ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-charo-orange/10 border border-charo-orange/30 text-charo-orange px-2.5 py-1 text-xs font-bold">
                              <Medal size={12} />
                              Top 16
                            </span>
                          ) : (
                            <span className="text-xs text-ink-600">
                              En course
                            </span>
                          )}
                        </td>

                      </tr>
                    ))
                  )}

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