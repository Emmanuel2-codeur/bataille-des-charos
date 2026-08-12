import { useEffect, useState } from 'react'
import { Medal, RefreshCw, Trophy } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'

export default function Classement() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRanking = async () => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setError('Supabase n’est pas configuré. Créez le fichier .env avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')

    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id, pseudo, ff_uid, avatar_url, total_points, total_kills, total_damage, wins, losses, is_qualified, group_id, groups(name)')
      .eq('status', 'approved')
      .order('total_kills', { ascending: false })
      .order('total_damage', { ascending: false })

    if (queryError) {
      setError(queryError.message || 'Impossible de charger le classement.')
    } else {
      setPlayers(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadRanking()

    if (typeof supabase.channel !== 'function') return undefined
    const channel = supabase
      .channel('classement-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadRanking)
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
              <span className="eyebrow mb-4"><Trophy size={13} /> Classement général</span>
              <h1 className="font-display text-4xl md:text-5xl mb-3">Le classement</h1>
              <p className="text-ink-600 max-w-2xl">
                Les scores, dégâts et victoires se mettent à jour automatiquement dès qu'un match de poule est terminé.
              </p>
            </div>
            <button onClick={loadRanking} className="btn-primary" disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
            </button>
          </div>

          <div className="card overflow-hidden">
            {error && <p className="p-5 text-sm text-red-600 border-b border-ink-700">{error}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="bg-ink-800 border-b border-ink-700 text-left">
                    <th className="px-5 py-4 font-bold">#</th>
                    <th className="px-5 py-4 font-bold">Joueur</th>
                    <th className="px-5 py-4 font-bold">Groupe</th>
                    <th className="px-5 py-4 font-bold text-center">Score</th>
                    <th className="px-5 py-4 font-bold text-center">Kills</th>
                    <th className="px-5 py-4 font-bold text-center">Dégâts</th>
                    <th className="px-5 py-4 font-bold text-center">V / D</th>
                    <th className="px-5 py-4 font-bold text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700">
                  {loading && players.length === 0 ? (
                    <tr><td colSpan="8" className="px-5 py-16 text-center text-ink-600">Chargement du classement…</td></tr>
                  ) : players.length === 0 ? (
                    <tr><td colSpan="8" className="px-5 py-16 text-center text-ink-600">Aucun joueur approuvé pour le moment.</td></tr>
                  ) : players.map((player, index) => (
                    <tr key={player.id} className="hover:bg-ink-800/70 transition-colors">
                      <td className="px-5 py-4 font-display text-xl text-charo-orange">{index + 1}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {player.avatar_url ? (
                            <img src={player.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-ink-700" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-charo-gradient flex items-center justify-center text-ink-950 font-bold">
                              {player.pseudo?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div>
                            <p className="font-bold">{player.pseudo}</p>
                            <p className="text-xs text-ink-600">ID FF : {player.ff_uid || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold">{player.groups?.name || '—'}</td>
                      <td className="px-5 py-4 text-center font-bold">{player.total_points}</td>
                      <td className="px-5 py-4 text-center font-bold">{player.total_kills}</td>
                      <td className="px-5 py-4 text-center font-bold">{player.total_damage.toLocaleString('fr-FR')}</td>
                      <td className="px-5 py-4 text-center font-semibold">{player.wins} / {player.losses}</td>
                      <td className="px-5 py-4 text-center">
                        {player.is_qualified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-charo-orange/10 border border-charo-orange/30 text-charo-orange px-2.5 py-1 text-xs font-bold">
                            <Medal size={12} /> Top 16
                          </span>
                        ) : (
                          <span className="text-xs text-ink-600">En course</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
