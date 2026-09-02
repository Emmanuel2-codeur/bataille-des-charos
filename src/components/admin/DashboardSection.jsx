import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Users, Swords, Trophy, Activity, Clock, CheckCircle2, ArrowUpRight, Radio, CalendarClock, Pause, Play } from 'lucide-react'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'

const ICON_BG = {
  orange: 'bg-charo-orange/12 text-charo-orange',
  amber: 'bg-charo-amber/15 text-charo-amber',
  live: 'bg-red-50 text-live',
  ink: 'bg-ink-950 text-white',
}

function KpiCard({ icon, tone = 'orange', label, value, trend, index }) {
  return (
    <motion.div
      className="rounded-3xl bg-white border border-ink-950/5 shadow-card p-5"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
    >
      <div className="flex items-start justify-between mb-5">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${ICON_BG[tone]}`}>{icon}</span>
        {trend && (
          <span className="w-7 h-7 rounded-full bg-ink-800 flex items-center justify-center text-ink-600">
            <ArrowUpRight size={14} />
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-ink-600 mb-1.5">{label}</p>
      <p className="font-display text-3xl leading-none text-ink-950">{value}</p>
      {trend && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 rounded-full px-2 py-0.5">
          {trend}
        </p>
      )}
    </motion.div>
  )
}

/** Jauge circulaire façon "Project Progress" du design de référence */
function ProgressGauge({ percent, completed, inProgress, pending }) {
  const r = 62
  const c = 2 * Math.PI * r
  const offset = c - (percent / 100) * c
  return (
    <div className="rounded-3xl bg-white border border-ink-950/5 shadow-card p-6 flex flex-col items-center">
      <p className="self-start text-sm font-bold text-ink-950 mb-4">Avancement du tournoi</p>
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          <circle cx="80" cy="80" r={r} fill="none" stroke="#F1EFEA" strokeWidth="14" />
          <motion.circle
            cx="80" cy="80" r={r} fill="none" stroke="url(#gaugeGradient)" strokeWidth="14" strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
          <defs>
            <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF5A1F" />
              <stop offset="100%" stopColor="#FFB020" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl text-ink-950">{percent}%</span>
          <span className="text-[10px] font-semibold text-ink-600 uppercase tracking-wide">Terminé</span>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-5 text-[11px] font-semibold text-ink-600">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-charo-orange" /> Terminés ({completed})</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-live" /> En cours ({inProgress})</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-ink-700" /> À venir ({pending})</span>
      </div>
    </div>
  )
}

export default function DashboardSection({ players, matches, groups, pendingCount, recentActivity = [] }) {
  const stats = useMemo(() => {
    const byStatus = { scheduled: 0, in_progress: 0, completed: 0 }
    matches.forEach((m) => { byStatus[m.status] = (byStatus[m.status] || 0) + 1 })

    const groupsWithPlayers = new Set(players.filter((p) => p.group_id).map((p) => p.group_id))
    const groupCompletion = groups.length ? Math.round((groupsWithPlayers.size / groups.length) * 100) : 0
    const tournamentProgress = matches.length ? Math.round((byStatus.completed / matches.length) * 100) : 0

    const byDay = {}
    matches.forEach((m) => {
      if (!m.scheduled_at) return
      const day = new Date(m.scheduled_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      byDay[day] = (byDay[day] || 0) + 1
    })
    const dayData = Object.entries(byDay).map(([day, count]) => ({ day, count })).slice(-7)

    const topPlayers = [...players].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 5)

    const upcoming = matches
      .filter((m) => m.status === 'scheduled' && m.scheduled_at)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, 5)

    const live = matches.filter((m) => m.status === 'in_progress')

    return { byStatus, groupCompletion, tournamentProgress, dayData, topPlayers, upcoming, live }
  }, [players, matches, groups])

  return (
    <div className="mb-14">
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink-950">Vue d'ensemble</h2>
        <p className="text-sm text-ink-600 mt-1">Planifie, valide et pilote le tournoi en un coup d'œil.</p>
      </div>

      {/* KPI cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard index={0} tone="orange" icon={<Users size={18} />} label="Joueurs approuvés" value={players.length}
          trend={pendingCount > 0 ? `${pendingCount} en attente` : 'À jour'} />
        <KpiCard index={1} tone="amber" icon={<CalendarClock size={18} />} label="Matchs programmés" value={stats.byStatus.scheduled} />
        <KpiCard index={2} tone="live" icon={<Radio size={18} />} label="En cours maintenant" value={stats.byStatus.in_progress} />
        <KpiCard index={3} tone="ink" icon={<CheckCircle2 size={18} />} label="Matchs terminés" value={stats.byStatus.completed} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Analytics bar chart, style "Project Analytics" */}
        <motion.div
          className="lg:col-span-2 rounded-3xl bg-white border border-ink-950/5 shadow-card p-6"
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45 }}
        >
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm font-bold text-ink-950">Matchs programmés (7 derniers jours actifs)</p>
          </div>
          <div style={{ width: '100%', height: 190 }}>
            <ResponsiveContainer>
              <BarChart data={stats.dayData} barCategoryGap="32%">
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,90,31,0.06)' }} contentStyle={{ borderRadius: 14, border: '1px solid #F1EFEA', fontSize: 12 }} />
                <Bar dataKey="count" name="Matchs" radius={[10, 10, 10, 10]} fill="#FF5A1F" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Reminders-style : prochain match */}
        <motion.div
          className="rounded-3xl bg-ink-950 text-white p-6 flex flex-col justify-between"
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.45 }}
        >
          <div>
            <p className="text-xs font-semibold text-white/60 mb-2">Prochain rendez-vous</p>
            {stats.upcoming[0] ? (
              <>
                <p className="font-display text-lg leading-snug mb-1">
                  {stats.upcoming[0].player1?.pseudo || '—'} vs {stats.upcoming[0].player2?.pseudo || '—'}
                </p>
                <p className="text-xs text-white/60">
                  {new Date(stats.upcoming[0].scheduled_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </>
            ) : <p className="text-sm text-white/70">Aucun match programmé pour l'instant.</p>}
          </div>
          <div className="mt-6 flex items-center gap-2 rounded-2xl bg-charo-gradient px-4 py-3 text-sm font-bold w-fit">
            <Play size={14} /> {stats.live.length} match{stats.live.length !== 1 ? 's' : ''} en direct
          </div>
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Prochains matchs, style liste "Project" */}
        <motion.div
          className="rounded-3xl bg-white border border-ink-950/5 shadow-card p-6"
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.45 }}
        >
          <p className="text-sm font-bold text-ink-950 mb-4">Prochains matchs</p>
          <div className="space-y-3.5">
            {stats.upcoming.length === 0 && <p className="text-xs text-ink-600">Rien de programmé.</p>}
            {stats.upcoming.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-charo-orange/10 text-charo-orange flex items-center justify-center shrink-0"><Swords size={14} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{m.player1?.pseudo || '—'} vs {m.player2?.pseudo || '—'}</p>
                  <p className="text-[11px] text-ink-600">
                    {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Heure à définir'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Jauge circulaire */}
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.45 }}>
          <ProgressGauge percent={stats.tournamentProgress} completed={stats.byStatus.completed} inProgress={stats.byStatus.in_progress} pending={stats.byStatus.scheduled} />
        </motion.div>

        {/* Top joueurs, style "Team Collaboration" */}
        <motion.div
          className="rounded-3xl bg-white border border-ink-950/5 shadow-card p-6"
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.45 }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-ink-950 flex items-center gap-2"><Trophy size={15} className="text-charo-orange" /> Top joueurs</p>
          </div>
          <div className="space-y-3.5">
            {stats.topPlayers.length === 0 && <p className="text-xs text-ink-600">Pas encore de données.</p>}
            {stats.topPlayers.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-charo-gradient text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                  {p.pseudo?.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{p.pseudo}</p>
                  <p className="text-[11px] text-ink-600">{p.wins || 0}V - {p.losses || 0}D</p>
                </div>
                <span className="text-xs font-bold text-ink-950 shrink-0">{p.total_points || 0} pts</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {recentActivity.length > 0 && (
        <motion.div
          className="rounded-3xl bg-white border border-ink-950/5 shadow-card p-6 mt-5"
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.45 }}
        >
          <p className="text-sm font-bold text-ink-950 mb-4 flex items-center gap-2"><Activity size={15} className="text-charo-orange" /> Activité récente</p>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {recentActivity.map((a) => (
              <div key={a.id} className="text-xs flex items-center justify-between gap-3 border-b border-ink-800/60 pb-2.5">
                <span className="truncate"><span className="font-bold">{a.actor_pseudo || 'Système'}</span> — {actionLabel(a)}</span>
                <span className="text-ink-600 shrink-0">{new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function actionLabel(a) {
  const verb = { insert: 'a créé', update: 'a modifié', delete: 'a supprimé' }[a.action] || a.action
  const entity = { profiles: 'un joueur', matches: 'un match', groups: 'une poule', announcements: 'une annonce' }[a.entity_type] || a.entity_type
  return `${verb} ${entity}${a.entity_label ? ` (${a.entity_label})` : ''}`
}
