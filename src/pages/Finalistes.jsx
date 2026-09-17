import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarClock, Crown, LoaderCircle, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'

export default function Finalistes() {
  const [players, setPlayers] = useState([])
  const [mvp, setMvp] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = async () => {
    const [{ data: ps }, { data: settings }] = await Promise.all([
      supabase.from('profiles').select('id,pseudo,avatar_url,total_kills,total_damage,qualification_seed').eq('status','approved').eq('is_qualified',true).lte('qualification_seed',32).order('qualification_seed',{ascending:true}),
      supabase.from('tournament_settings').select('mvp_player_id,mvp_note').limit(1).maybeSingle(),
    ])
    setPlayers(ps || [])
    if (settings?.mvp_player_id) setMvp({ ...settings, player: (ps || []).find(p => p.id === settings.mvp_player_id) })
    setLoading(false)
  }
  useEffect(() => { load(); const ch=supabase.channel('finalistes-public').on('postgres_changes',{event:'*',schema:'public',table:'profiles'},load).on('postgres_changes',{event:'*',schema:'public',table:'tournament_settings'},load).subscribe(); return ()=>supabase.removeChannel(ch) },[])
  return <div className="min-h-screen finalists-page">
    <Navbar />
    <main className="py-12 lg:py-20">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="finalists-public-hero">
          <span className="eyebrow mb-4"><Trophy size={13}/> Phase finale</span>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6"><div><h1 className="font-display text-5xl md:text-6xl text-ink-700">LES 32 <span className="text-charo-orange">FINALISTES</span></h1><p className="text-ink-600 max-w-2xl mt-4">Les 32 joueurs choisis par l’administration s’affrontent désormais en élimination directe : 32èmes, 16èmes, quarts, demi-finales puis grande finale.</p></div><Link to="/bracket" className="btn-primary"><Trophy size={16}/> Voir le bracket</Link></div>
        </div>
        {loading ? <div className="py-20 flex justify-center"><LoaderCircle className="animate-spin text-charo-orange"/></div> : <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
            {Array.from({length:32},(_,i)=>{ const p=players[i]; return <div key={p?.id || i} className={`finalist-public-card ${p ? '' : 'empty'}`}><div className="seed-number">{String(i+1).padStart(2,'0')}</div><div className="finalist-public-avatar">{p?.avatar_url ? <img src={p.avatar_url} alt=""/> : <Users size={22}/>}</div><div className="min-w-0"><h3>{p?.pseudo || 'Place à confirmer'}</h3>{p && <p>{p.total_kills || 0} kills · {(p.total_damage || 0).toLocaleString('fr-FR')} dégâts</p>}</div></div> })}
          </div>
          {mvp?.player && <div className="mvp-public card mt-8 p-6"><div className="mvp-icon"><Crown size={25}/></div><div><span className="eyebrow">MVP du tournoi</span><h2 className="font-display text-2xl mt-1">{mvp.player.pseudo}</h2>{mvp.mvp_note && <p className="text-sm text-ink-600 mt-1">{mvp.mvp_note}</p>}</div></div>}
          <div className="mt-10 flex items-center gap-3 text-sm text-ink-600"><CalendarClock size={16} className="text-charo-orange"/> La programmation et les résultats apparaissent en direct dans le bracket.</div>
        </>}
      </div>
    </main>
    <Footer />
  </div>
}
