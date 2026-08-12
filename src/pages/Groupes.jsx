import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import GroupTable from '../components/GroupTable'
import { supabase } from '../lib/supabaseClient'

export default function Groupes() {
  const [groups, setGroups] = useState([])
  const [playersByGroup, setPlayersByGroup] = useState({})
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [{ data: groupRows }, { data: playerRows }] = await Promise.all([
      supabase.from('groups').select('id, name').order('name', { ascending: true }),
      supabase
        .from('profiles')
        .select('pseudo, group_id, total_points, total_damage')
        .eq('status', 'approved')
        .not('group_id', 'is', null),
    ])

    setGroups(groupRows || [])

    const byGroup = {}
    ;(playerRows || []).forEach((p) => {
      if (!byGroup[p.group_id]) byGroup[p.group_id] = []
      byGroup[p.group_id].push({ pseudo: p.pseudo, points: p.total_points, damage: p.total_damage })
    })
    Object.values(byGroup).forEach((list) => list.sort((a, b) => b.points - a.points || b.damage - a.damage))
    setPlayersByGroup(byGroup)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel?.('groupes-live')
      ?.on?.('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      ?.subscribe?.()
    return () => { if (channel) supabase.removeChannel?.(channel) }
  }, [])

  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <span className="eyebrow mb-4">Phase de qualifications</span>
          <h1 className="font-display text-4xl md:text-5xl mb-4">Les 10 groupes</h1>
          <p className="text-ink-600 max-w-xl mb-12">
            40 joueurs, 10 groupes de 4, championnat interne. Le 1er de chaque groupe est qualifié d'office ;
            les 12 meilleurs joueurs restants complètent le Top 32 après avoir retenu les 2 premiers de chaque groupe.
          </p>

          {loading ? (
            <div className="flex items-center gap-3 text-ink-600 py-16 justify-center">
              <LoaderCircle className="animate-spin" size={18} /> Chargement des groupes…
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              {groups.map((g) => (
                <GroupTable key={g.id} name={g.name} players={playersByGroup[g.id] || []} />
              ))}
              {groups.length === 0 && (
                <p className="text-ink-600 col-span-full text-center py-16">
                  Les groupes n'ont pas encore été créés côté Supabase.
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
