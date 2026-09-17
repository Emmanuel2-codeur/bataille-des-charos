import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldAlert, Check, X, Star, Clock, Save, RefreshCw, Mail,
  UserPlus, CalendarPlus, ClipboardCheck, Megaphone, Trash2, Pencil, Trophy, Paperclip,
  LayoutDashboard, Users, Swords, History,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { uploadPublicFile } from '../lib/storage'
import AdminTabs from '../components/AdminTabs'
import PlayerCombobox from '../components/PlayerCombobox'
import DashboardSection from '../components/admin/DashboardSection'
import AuditLogSection from '../components/admin/AuditLogSection'
import SecurityAlertsSection from '../components/admin/SecurityAlertsSection'
import FinalistsAdmin from '../components/FinalistsAdmin'

const LAST_MATCH_SETTINGS_KEY = 'charos_admin_last_match_settings'

const MATCH_TYPES = [
  { value: 'onetap', label: 'One Tap (Aller)' },
  { value: 'spam', label: 'Spam (Retour)' },
]
const PHASES = [
  { value: 'poule', label: 'Poule' },
  { value: 'trente_deuxieme', label: '32ème de finale' },
  { value: 'seizieme', label: 'Seizième de finale' },
  { value: 'quart', label: 'Quart de finale' },
  { value: 'demie', label: 'Demi-finale' },
  { value: 'finale', label: 'Finale' },
]
const FINAL_PHASES = ['trente_deuxieme', 'seizieme', 'quart', 'demie', 'finale']
const FINAL_PHASE_COUNTS = { trente_deuxieme: 16, seizieme: 8, quart: 4, demie: 2, finale: 1 }

export default function Admin() {
  const { profile, isSuperAdmin } = useAuth()
  const [pending, setPending] = useState([])
  const [groups, setGroups] = useState([])
  const [players, setPlayers] = useState([]) // joueurs approuvés, pour les selects
  const [matches, setMatches] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [securityAlerts, setSecurityAlerts] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'dashboard')
  const changeTab = (id) => {
    setTab(id)
    const url = new URL(window.location)
    url.searchParams.set('tab', id)
    window.history.replaceState({}, '', url)
  }

  const loadAll = async () => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setError('Supabase n’est pas configuré (fichier .env manquant).')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')

    const queries = [
      supabase.rpc('admin_list_pending_players'),
      supabase.from('groups').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, pseudo, ff_uid, group_id, total_points, total_kills, total_damage, wins, losses, is_qualified, qualification_seed').eq('status', 'approved').order('pseudo'),
      supabase
        .from('matches')
        .select(
          'id, phase, group_id, leg, match_type, round_label, bracket_position, player1_id, player2_id, score1, score2, damage1, damage2, score1_retour, score2_retour, damage1_retour, damage2_retour, winner_id, status, status_override, is_featured, scheduled_at, scheduled_at_retour, player1:profiles!matches_player1_id_fkey(pseudo), player2:profiles!matches_player2_id_fkey(pseudo)'
        )
        .order('scheduled_at', { ascending: true, nullsFirst: false }),
      supabase.from('announcements').select('id, title, body, published, category, image_url, author_id, created_at').order('created_at', { ascending: false }),
      supabase.from('audit_log').select('id, actor_pseudo, action, entity_type, entity_label, created_at').order('created_at', { ascending: false }).limit(200),
    ]
    if (isSuperAdmin) {
      queries.push(supabase.from('security_alerts').select('*').order('created_at', { ascending: false }).limit(100))
    }

    const results = await Promise.all(queries)
    const [
      { data: pendingRows, error: pendingError },
      { data: groupRows, error: groupsError },
      { data: playerRows, error: playersError },
      { data: matchRows, error: matchesError },
      { data: announceRows, error: announceError },
      { data: auditRows, error: auditError },
    ] = results
    const { data: alertRows, error: alertError } = isSuperAdmin ? results[6] : { data: [], error: null }

    const firstError = pendingError || groupsError || playersError || matchesError || announceError || auditError || alertError
    if (firstError) {
      setError(firstError.message)
    } else {
      setPending(pendingRows || [])
      setGroups(groupRows || [])
      setPlayers(playerRows || [])
      setMatches((matchRows || []).map((m) => ({
        ...m,
        score1: Number(m.score1 || 0), score2: Number(m.score2 || 0),
        damage1: Number(m.damage1 || 0), damage2: Number(m.damage2 || 0),
      })))
      setAnnouncements(announceRows || [])
      setAuditLog(auditRows || [])
      setSecurityAlerts(alertRows || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const unresolvedAlerts = securityAlerts.filter((a) => !a.resolved).length

  const TABS = useMemo(() => {
    const list = [
      { id: 'dashboard', label: 'Vue d’ensemble', icon: <LayoutDashboard size={15} /> },
      { id: 'inscriptions', label: 'Inscriptions', icon: <UserPlus size={15} />, badge: pending.length },
      { id: 'joueurs', label: 'Joueurs & poules', icon: <Users size={15} /> },
      { id: 'finalistes', label: 'Joueurs qualifiés', icon: <Trophy size={15} />, badge: players.filter(p => p.is_qualified).length },
      { id: 'matchs', label: 'Matchs', icon: <Swords size={15} />, badge: matches.filter(m => m.status !== 'completed').length },
      { id: 'annonces', label: 'Annonces', icon: <Megaphone size={15} /> },
      { id: 'journal', label: 'Journal', icon: <History size={15} /> },
    ]
    if (isSuperAdmin) list.push({ id: 'securite', label: 'Sécurité', icon: <ShieldAlert size={15} />, badge: unresolvedAlerts })
    return list
  }, [pending.length, matches, players, isSuperAdmin, unresolvedAlerts])

  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-5 mb-8">
            <div>
              <span className="eyebrow mb-4"><ShieldAlert size={12} /> Espace administration{isSuperAdmin ? ' · Super-admin' : ''}</span>
              <h1 className="font-display text-4xl md:text-5xl mb-2 text-ink-700">Panneau de contrôle</h1>
              <p className="text-ink-600 max-w-xl">
                Chaque action ici met à jour le site en direct : joueur validé → visible dans son groupe et
                le classement · match programmé → apparaît en En cours à l'heure dite · info publiée → visible à l'accueil.
              </p>
            </div>
            <button onClick={loadAll} className="btn-primary" disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
            </button>
          </div>

          {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {message && <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}

          <AdminTabs tabs={TABS} active={tab} onChange={changeTab} />

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 14, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {tab === 'dashboard' && (
                <DashboardSection players={players} matches={matches} groups={groups} pendingCount={pending.length} recentActivity={auditLog.slice(0, 8)} />
              )}

              {tab === 'inscriptions' && (
                <PendingSection
                  pending={pending} groups={groups}
                  onChanged={loadAll} setError={setError} setMessage={setMessage}
                />
              )}

              {tab === 'joueurs' && (
                <>
                  <PlayerManagementSection
                    players={players} groups={groups}
                    onChanged={loadAll} setError={setError} setMessage={setMessage}
                  />
                </>
              )}

              {tab === 'finalistes' && (
                <FinalistsAdmin
                  players={players}
                  onChanged={loadAll}
                  setError={setError}
                  setMessage={setMessage}
                />
              )}

              {tab === 'matchs' && (
                <>
                  <ScheduleMatchSection
                    players={players} groups={groups} matches={matches}
                    onCreated={loadAll} setError={setError} setMessage={setMessage}
                  />
                  <ValidateScoreSection
                    matches={matches}
                    onSaved={loadAll} setError={setError} setMessage={setMessage}
                  />
                  <MatchManagementSection
                    matches={matches} players={players} groups={groups}
                    onChanged={loadAll} setError={setError} setMessage={setMessage}
                  />
                </>
              )}

              {tab === 'annonces' && (
                <AnnouncementsSection
                  announcements={announcements}
                  authorId={profile?.id}
                  onChanged={loadAll} setError={setError} setMessage={setMessage}
                />
              )}

              {tab === 'journal' && <AuditLogSection entries={auditLog} />}

              {tab === 'securite' && isSuperAdmin && (
                <SecurityAlertsSection alerts={securityAlerts} onChanged={loadAll} setMessage={setMessage} setError={setError} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <Footer />
    </div>
  )
}

/* ============================================================================
   1. ACCEPTER LES INVITATIONS DU JOUEUR
   ========================================================================= */
function PendingSection({ pending, groups, onChanged, setError, setMessage }) {
  const [selectedGroup, setSelectedGroup] = useState({}) // { [playerId]: groupId }

  const approve = async (playerId) => {
    setError(''); setMessage('')
    const groupId = selectedGroup[playerId] || null
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'approved', group_id: groupId })
      .eq('id', playerId)

    if (error) setError(error.message)
    else {
      setMessage('Joueur validé — il apparaît maintenant dans son groupe et le classement.')
      onChanged()
    }
  }

  const reject = async (playerId) => {
    setError(''); setMessage('')
    const { error } = await supabase.from('profiles').update({ status: 'rejected' }).eq('id', playerId)
    if (error) setError(error.message)
    else onChanged()
  }

  return (
    <div className="mb-14">
      <div className="flex items-center gap-2.5 mb-1">
        <UserPlus size={18} className="text-charo-orange" />
        <h2 className="font-bold text-lg text-ink-700">Accepter les invitations du joueur</h2>
      </div>
      <p className="text-sm text-ink-600 mb-5">
        Choisis un groupe puis valide : le joueur passe direct dans Poules et Classement.
      </p>

      <div className="card divide-y divide-ink-700">
        {pending.length === 0 && <p className="p-6 text-sm text-ink-600">Aucune inscription en attente.</p>}
        {pending.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-[220px]">
              <p className="font-semibold">{p.pseudo}</p>
              <p className="text-xs text-ink-600 flex items-center gap-1.5 mt-0.5">
                <Mail size={11} /> {p.email || '—'} · FF UID {p.ff_uid || '—'}
              </p>
            </div>

            <select
              value={selectedGroup[p.id] ?? ''}
              onChange={(e) => setSelectedGroup((s) => ({ ...s, [p.id]: e.target.value }))}
              className="rounded-lg bg-ink-800 border border-ink-700 text-sm px-3 py-2 outline-none focus:border-charo-orange"
            >
              <option value="">Choisir un groupe…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>Groupe {g.name}</option>)}
            </select>

            <div className="flex gap-2 ml-auto">
              <button onClick={() => approve(p.id)} className="w-9 h-9 rounded-lg bg-charo-orange/15 border border-charo-orange/40 text-charo-orange flex items-center justify-center hover:bg-charo-orange hover:text-white transition-colors" aria-label="Approuver">
                <Check size={16} />
              </button>
              <button onClick={() => reject(p.id)} className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors" aria-label="Refuser">
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


/* ============================================================================
   2. GESTION DES JOUEURS / CLASSEMENT
   ============================================================================ */
function PlayerManagementSection({ players, groups, onChanged, setError, setMessage }) {
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (player) => {
    setSaving(true); setError(''); setMessage('')
    const { error } = await supabase.from('profiles').update({
      pseudo: player.pseudo.trim(),
      ff_uid: player.ff_uid?.trim() || '',
      group_id: player.group_id || null,
    }).eq('id', player.id)
    if (error) setError(error.message)
    else { setMessage(`Joueur ${player.pseudo} modifié.`); setEditing(null); onChanged() }
    setSaving(false)
  }

  const remove = async (id) => {
    if (!window.confirm('Supprimer définitivement ce joueur et son compte ? Cette action est irréversible.')) return
    setError(''); setMessage('')
    const { error } = await supabase.rpc('admin_delete_player', { p_player_id: id })
    if (error) setError(error.message)
    else { setMessage('Joueur supprimé.'); onChanged() }
  }

  return (
    <div className="mb-14">
      <div className="flex items-center gap-2.5 mb-1"><Trophy size={18} className="text-charo-orange" /><h2 className="font-bold text-lg text-ink-700">Joueurs approuvés / classement</h2></div>
      <p className="text-sm text-ink-600 mb-5">Modifie les informations d’un joueur qui alimentent le classement, ou supprime son inscription.</p>
      <div className="card divide-y divide-ink-700 overflow-hidden">
        {players.length === 0 && <p className="p-6 text-sm text-ink-600">Aucun joueur approuvé.</p>}
        {players.map((p) => {
          const row = editing?.id === p.id ? editing : p
          return (
            <div key={p.id} className="p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-[180px] flex-1">
                  {editing?.id === p.id ? (
                    <input value={row.pseudo} onChange={(e) => setEditing({ ...row, pseudo: e.target.value })} className="w-full rounded-lg bg-white border border-ink-700 text-sm px-3 py-2" />
                  ) : <p className="font-semibold">{p.pseudo}</p>}
                  <p className="text-xs text-ink-600 mt-1">{p.wins} V · {p.losses} D · {p.total_kills || 0} kills · {(p.total_damage || 0).toLocaleString('fr-FR')} dégâts · {p.total_points || 0} pts</p>
                </div>
                {editing?.id === p.id ? (
                  <>
                    <input value={row.ff_uid || ''} onChange={(e) => setEditing({ ...row, ff_uid: e.target.value })} placeholder="ID Free Fire" className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2" />
                    <select value={row.group_id || ''} onChange={(e) => setEditing({ ...row, group_id: e.target.value })} className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2">
                      <option value="">Sans groupe</option>{groups.map(g => <option key={g.id} value={g.id}>Groupe {g.name}</option>)}
                    </select>
                    <button onClick={() => save(row)} disabled={saving} className="w-9 h-9 rounded-lg bg-charo-orange text-white flex items-center justify-center"><Save size={15} /></button>
                    <button onClick={() => setEditing(null)} className="w-9 h-9 rounded-lg border border-ink-700 text-ink-600 flex items-center justify-center"><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-semibold px-3 py-2 rounded-lg bg-ink-800">Groupe {groups.find(g => g.id === p.group_id)?.name || '—'}</span>
                    <button onClick={() => setEditing({ ...p })} className="w-9 h-9 rounded-lg border border-ink-700 text-ink-600 flex items-center justify-center hover:bg-ink-800" aria-label="Modifier"><Pencil size={15} /></button>
                    <button onClick={() => remove(p.id)} className="w-9 h-9 rounded-lg border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white" aria-label="Supprimer"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================================
   Les qualifications de la phase finale sont désormais gérées dans l’onglet
   « Joueurs qualifiés » : sélection manuelle de 32 joueurs, sans tirage.
   ============================================================================ */

/* ============================================================================
   4. PROGRAMMER UN MATCH
   ========================================================================= */
function loadLastMatchSettings() {
  try {
    const raw = localStorage.getItem(LAST_MATCH_SETTINGS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function ScheduleMatchSection({ players, groups, matches = [], onCreated, setError, setMessage }) {
  const remembered = loadLastMatchSettings()
  const [form, setForm] = useState({
    player1_id: '', player2_id: '', scheduled_at: '',
    match_type: remembered?.match_type || 'onetap',
    leg: remembered?.leg || 'aller',
    phase: remembered?.phase || 'poule',
    group_id: '',
    group_auto: true, // le groupe suit automatiquement le joueur 1 tant que l'admin n'a rien choisi lui-même
  })
  const [saving, setSaving] = useState(false)
  const [rememberHour, setRememberHour] = useState(remembered?.hour || '')

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // Détection automatique de la poule dès que le joueur 1 est choisi
  const setPlayer1 = (id) => {
    const player = players.find((p) => p.id === id)
    set({
      player1_id: id,
      group_id: form.group_auto && player?.group_id ? player.group_id : form.group_id,
    })
  }

  // Pré-remplit l'heure avec la dernière utilisée, à la date choisie
  const applyRememberedHour = (dateOnly) => {
    if (!dateOnly || !rememberHour) return dateOnly
    return `${dateOnly.slice(0, 10)}T${rememberHour}`
  }

  const onDateChange = (raw) => {
    if (raw && raw.length === 10) { // l'utilisateur n'a saisi que la date (widget natif) -> on complète l'heure mémorisée
      set({ scheduled_at: applyRememberedHour(raw) || raw })
    } else {
      set({ scheduled_at: raw })
      if (raw?.length >= 16) setRememberHour(raw.slice(11, 16))
    }
  }

  const createMatch = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')

    if (!form.player1_id || !form.player2_id) { setError('Choisis les deux joueurs.'); return }
    if (form.player1_id === form.player2_id) { setError('Les deux joueurs doivent être différents.'); return }

    setSaving(true)

    // Les matchs de la phase finale ont toujours une case de bracket explicite.
    // Ainsi, une programmation depuis l'onglet « Matchs » arrive elle aussi
    // directement dans 16èmes / Quarts / Demies / Finale.
    const isFinalPhase = FINAL_PHASES.includes(form.phase)
    let bracket_position = null
    let round_label = null

    if (isFinalPhase) {
      const counts = FINAL_PHASE_COUNTS
      const used = new Set(matches.filter(m => m.phase === form.phase).map(m => Number(m.bracket_position || 0)))
      bracket_position = Array.from({ length: counts[form.phase] }, (_, i) => i + 1).find(pos => !used.has(pos))
      if (!bracket_position) {
        setError(`Toutes les cases de ${PHASES.find(p => p.value === form.phase)?.label || form.phase} sont déjà occupées.`)
        setSaving(false)
        return
      }
      round_label = `${PHASES.find(p => p.value === form.phase)?.label || form.phase} ${bracket_position}`
    }

    const { data: createdMatch, error } = await supabase.from('matches').insert({
      player1_id: form.player1_id,
      player2_id: form.player2_id,
      scheduled_at: form.scheduled_at || null,
      match_type: form.match_type,
      leg: form.phase === 'poule' ? null : form.leg,
      phase: form.phase,
      group_id: form.phase === 'poule' ? (form.group_id || null) : null,
      status: 'scheduled',
      status_override: false,
      bracket_position,
      round_label,
    }).select('id').single()

    if (error) setError(error.message)
    else {
      if (isFinalPhase && createdMatch?.id && form.phase !== 'trente_deuxieme') {
        await supabase.rpc('sync_final_bracket_match_players', { p_match_id: createdMatch.id })
      }
      setMessage(isFinalPhase
        ? `Match programmé dans ${round_label}. Il est maintenant visible dans le tableau de la phase finale pour modification et validation du score.`
        : 'Match programmé. Il passera en cours tout seul à l’heure prévue.')
      // On mémorise les réglages (hors joueurs et date) pour préremplir le prochain match
      const hour = form.scheduled_at?.length >= 16 ? form.scheduled_at.slice(11, 16) : rememberHour
      localStorage.setItem(LAST_MATCH_SETTINGS_KEY, JSON.stringify({
        match_type: form.match_type, leg: form.leg, phase: form.phase, hour,
      }))
      set({ player1_id: '', player2_id: '', group_id: '', group_auto: true })
      onCreated()
    }
    setSaving(false)
  }

  return (
    <div className="mb-14">
      <div className="flex items-center gap-2.5 mb-1">
        <CalendarPlus size={18} className="text-charo-orange" />
        <h2 className="font-bold text-lg text-ink-700">Programmer un match</h2>
      </div>
      <p className="text-sm text-ink-600 mb-5">
        Recherche un joueur par son pseudo, sa poule s'affiche automatiquement. Les derniers réglages
        (heure, règle, phase) sont mémorisés pour aller plus vite au prochain match.
      </p>

      <form onSubmit={createMatch} className="card p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <PlayerCombobox label="Joueur 1" players={players} groups={groups} value={form.player1_id} excludeId={form.player2_id} onChange={setPlayer1} />
        <PlayerCombobox label="Joueur 2" players={players} groups={groups} value={form.player2_id} excludeId={form.player1_id} onChange={(id) => set({ player2_id: id })} />

        <label className="block">
          <span className="block text-xs font-semibold text-ink-600 mb-1.5">Date & heure</span>
          <input type="datetime-local" value={form.scheduled_at} onChange={(e) => onDateChange(e.target.value)}
            className="w-full rounded-lg bg-ink-800 border border-ink-700 text-sm px-3 py-2.5 outline-none focus:border-charo-orange" />
          {rememberHour && <span className="block text-[10px] text-ink-600 mt-1">Heure mémorisée : {rememberHour}</span>}
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-ink-600 mb-1.5">Phase</span>
          <select value={form.phase} onChange={(e) => set({ phase: e.target.value })} className="w-full rounded-lg bg-ink-800 border border-ink-700 text-sm px-3 py-2.5 outline-none focus:border-charo-orange">
            {PHASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        {form.phase === 'poule' ? (
          <label className="block">
            <span className="flex items-center justify-between text-xs font-semibold text-ink-600 mb-1.5">
              Groupe {form.group_auto && form.group_id && <span className="text-charo-orange normal-case font-bold">Auto ✓</span>}
            </span>
            <select
              value={form.group_id}
              onChange={(e) => set({ group_id: e.target.value, group_auto: false })}
              className="w-full rounded-lg bg-ink-800 border border-ink-700 text-sm px-3 py-2.5 outline-none focus:border-charo-orange"
            >
              <option value="">—</option>
              {groups.map((g) => <option key={g.id} value={g.id}>Groupe {g.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="block text-xs font-semibold text-ink-600 mb-1.5">Manche</span>
            <select value={form.leg} onChange={(e) => set({ leg: e.target.value })} className="w-full rounded-lg bg-ink-800 border border-ink-700 text-sm px-3 py-2.5 outline-none focus:border-charo-orange">
              <option value="aller">Aller</option>
              <option value="retour">Retour</option>
            </select>
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-semibold text-ink-600 mb-1.5">Règle</span>
          <select value={form.match_type} onChange={(e) => set({ match_type: e.target.value })} className="w-full rounded-lg bg-ink-800 border border-ink-700 text-sm px-3 py-2.5 outline-none focus:border-charo-orange">
            {MATCH_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>

        <div className="sm:col-span-2 lg:col-span-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Programmation…' : 'Programmer le match'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ============================================================================
   3. VALIDER LE SCORE DU MATCH
   ========================================================================= */
function ValidateScoreSection({ matches, onSaved, setError, setMessage }) {
  const [rows, setRows] = useState(matches)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => setRows(matches), [matches])

  const patch = (id, p) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const toggleFeatured = async (m) => {
    const { error } = await supabase.from('matches').update({ is_featured: !m.is_featured }).eq('id', m.id)
    if (!error) onSaved()
  }

  const validate = async (m) => {
    setSavingId(m.id); setError(''); setMessage('')

    const score1 = Number(m.score1)
    const score2 = Number(m.score2)
    const damage1 = Number(m.damage1 || 0)
    const damage2 = Number(m.damage2 || 0)
    const isFinal = FINAL_PHASES.includes(m.phase)
    const score1_retour = Number(m.score1_retour || 0)
    const score2_retour = Number(m.score2_retour || 0)
    const damage1_retour = Number(m.damage1_retour || 0)
    const damage2_retour = Number(m.damage2_retour || 0)

    const baseNums = [score1, score2, damage1, damage2]
    const retourNums = isFinal ? [score1_retour, score2_retour, damage1_retour, damage2_retour] : []
    if (![...baseNums, ...retourNums].every(Number.isFinite) || [...baseNums, ...retourNums].some(v => v < 0)) {
      setError('Les scores et dégâts doivent être des nombres positifs.')
      setSavingId(null)
      return
    }
    if (isFinal) {
      const total1 = score1 + score1_retour
      const total2 = score2 + score2_retour
      if (total1 === total2) {
        setError(`Égalité sur le cumul aller + retour (${total1} - ${total2}) : impossible de déterminer le joueur qui avance.`)
        setSavingId(null)
        return
      }
      const { error } = await supabase.rpc('admin_validate_final_match', {
        p_match_id: m.id, p_score1: score1, p_score2: score2, p_damage1: damage1, p_damage2: damage2,
        p_score1_retour: score1_retour, p_score2_retour: score2_retour, p_damage1_retour: damage1_retour, p_damage2_retour: damage2_retour,
      })
      if (error) setError(error.message)
      else {
        const winner = total1 > total2 ? m.player1?.pseudo : m.player2?.pseudo
        setMessage(`Résultat validé (cumul ${total1}-${total2}). ${winner || 'Le vainqueur'} avance vers la prochaine case du bracket.`)
        onSaved()
      }
    } else {
      const { error } = await supabase.from('matches').update({ score1, score2, damage1, damage2, status: 'completed' }).eq('id', m.id)
      if (error) setError(error.message)
      else {
        setMessage('Match validé — kills, dégâts et classement mis à jour, match déplacé dans l’Historique.')
        onSaved()
      }
    }
    setSavingId(null)
  }

  const nonCompleted = rows.filter((m) => m.status !== 'completed')

  return (
    <div className="mb-14">
      <div className="flex items-center gap-2.5 mb-1">
        <ClipboardCheck size={18} className="text-charo-orange" />
        <h2 className="font-bold text-lg text-ink-700">Valider le score du match</h2>
      </div>
      <p className="text-sm text-ink-600 mb-5">
        Score = kills du joueur sur ce match. Une fois validé, le match sort automatiquement des matchs en cours et rejoint l'Historique.
      </p>

      <div className="card divide-y divide-ink-700">
        {nonCompleted.length === 0 && <p className="p-6 text-sm text-ink-600">Aucun match à valider pour l'instant.</p>}
        {nonCompleted.map((m) => {
          const isFinal = FINAL_PHASES.includes(m.phase)
          const total1 = Number(m.score1 || 0) + (isFinal ? Number(m.score1_retour || 0) : 0)
          const total2 = Number(m.score2 || 0) + (isFinal ? Number(m.score2_retour || 0) : 0)
          return (
          <div key={m.id} className="p-5 flex flex-wrap items-start gap-5">
            <div className="min-w-[210px]">
              <p className="text-sm font-semibold">{m.player1?.pseudo || '—'} <span className="text-ink-600">vs</span> {m.player2?.pseudo || '—'}</p>
              <p className="text-xs text-ink-600 flex items-center gap-1.5 mt-1">
                <Clock size={11} /> {m.round_label || m.phase} · {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR') : 'sans horaire'} ·{' '}
                <span className={m.status === 'in_progress' ? 'text-live font-bold' : ''}>{m.status === 'in_progress' ? 'EN COURS' : m.status === 'scheduled' ? 'Programmé' : m.status}</span>
              </p>
              {isFinal && <p className="text-[11px] text-charo-orange font-semibold mt-1.5">Cumul aller + retour : {total1} - {total2}</p>}
            </div>

            <div>
              {isFinal && <p className="text-[10px] uppercase tracking-wide text-ink-600 mb-1">Match aller</p>}
              <div className="grid grid-cols-2 gap-2 text-center">
                <label className="text-[11px] text-ink-600">Kills J1
                  <input type="number" min="0" value={m.score1} onChange={(e) => patch(m.id, { score1: e.target.value })} className="mt-1 w-20 rounded-lg bg-ink-800 border border-ink-700 text-center py-2 text-sm outline-none focus:border-charo-orange" />
                </label>
                <label className="text-[11px] text-ink-600">Kills J2
                  <input type="number" min="0" value={m.score2} onChange={(e) => patch(m.id, { score2: e.target.value })} className="mt-1 w-20 rounded-lg bg-ink-800 border border-ink-700 text-center py-2 text-sm outline-none focus:border-charo-orange" />
                </label>
                <label className="text-[11px] text-ink-600">Dégâts J1
                  <input type="number" min="0" value={m.damage1} onChange={(e) => patch(m.id, { damage1: e.target.value })} className="mt-1 w-20 rounded-lg bg-ink-800 border border-ink-700 text-center py-2 text-sm outline-none focus:border-charo-orange" />
                </label>
                <label className="text-[11px] text-ink-600">Dégâts J2
                  <input type="number" min="0" value={m.damage2} onChange={(e) => patch(m.id, { damage2: e.target.value })} className="mt-1 w-20 rounded-lg bg-ink-800 border border-ink-700 text-center py-2 text-sm outline-none focus:border-charo-orange" />
                </label>
              </div>
            </div>

            {isFinal && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-600 mb-1">Match retour</p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <label className="text-[11px] text-ink-600">Kills J1
                    <input type="number" min="0" value={m.score1_retour || 0} onChange={(e) => patch(m.id, { score1_retour: e.target.value })} className="mt-1 w-20 rounded-lg bg-ink-800 border border-ink-700 text-center py-2 text-sm outline-none focus:border-charo-orange" />
                  </label>
                  <label className="text-[11px] text-ink-600">Kills J2
                    <input type="number" min="0" value={m.score2_retour || 0} onChange={(e) => patch(m.id, { score2_retour: e.target.value })} className="mt-1 w-20 rounded-lg bg-ink-800 border border-ink-700 text-center py-2 text-sm outline-none focus:border-charo-orange" />
                  </label>
                  <label className="text-[11px] text-ink-600">Dégâts J1
                    <input type="number" min="0" value={m.damage1_retour || 0} onChange={(e) => patch(m.id, { damage1_retour: e.target.value })} className="mt-1 w-20 rounded-lg bg-ink-800 border border-ink-700 text-center py-2 text-sm outline-none focus:border-charo-orange" />
                  </label>
                  <label className="text-[11px] text-ink-600">Dégâts J2
                    <input type="number" min="0" value={m.damage2_retour || 0} onChange={(e) => patch(m.id, { damage2_retour: e.target.value })} className="mt-1 w-20 rounded-lg bg-ink-800 border border-ink-700 text-center py-2 text-sm outline-none focus:border-charo-orange" />
                  </label>
                </div>
              </div>
            )}

            <button onClick={() => toggleFeatured(m)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border transition-colors ${m.is_featured ? 'bg-charo-orange/15 border-charo-orange/40 text-charo-orange' : 'border-ink-700 text-ink-600 hover:text-ink-950'}`}>
              <Star size={13} fill={m.is_featured ? 'currentColor' : 'none'} /> À la une
            </button>

            <button onClick={() => validate(m)} disabled={savingId === m.id} className="ml-auto flex items-center gap-1.5 rounded-lg bg-charo-gradient text-white text-xs font-bold px-4 py-2.5 hover:brightness-110 disabled:opacity-50 transition-all">
              {savingId === m.id ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Valider le résultat
            </button>
          </div>
        )})}
      </div>
    </div>
  )
}


/* ============================================================================
   5. GESTION DES MATCHS
   ============================================================================ */
function MatchManagementSection({ matches, players, groups, onChanged, setError, setMessage }) {
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (m) => {
    if (m.player1_id && m.player1_id === m.player2_id) { setError('Les deux joueurs doivent être différents.'); return }
    setSaving(true); setError(''); setMessage('')
    const { error } = await supabase.from('matches').update({
      player1_id: m.player1_id || null, player2_id: m.player2_id || null,
      phase: m.phase, group_id: m.phase === 'poule' ? (m.group_id || null) : null,
      leg: m.phase === 'poule' ? null : (m.leg || 'aller'),
      match_type: m.match_type, scheduled_at: m.scheduled_at || null,
      bracket_position: m.bracket_position || null,
      round_label: m.round_label || null,
      score1: Number(m.score1 || 0), score2: Number(m.score2 || 0),
      damage1: Number(m.damage1 || 0), damage2: Number(m.damage2 || 0),
      winner_id: m.winner_id || null,
      status: m.status, status_override: !!m.status_override, is_featured: !!m.is_featured,
    }).eq('id', m.id)
    if (error) setError(error.message)
    else { setMessage('Match modifié et statistiques recalculées si nécessaire.'); setEditing(null); onChanged() }
    setSaving(false)
  }

  const remove = async (id) => {
    if (!window.confirm('Supprimer ce match ? Les statistiques seront recalculées.')) return
    const { error } = await supabase.from('matches').delete().eq('id', id)
    if (error) setError(error.message)
    else { setMessage('Match supprimé et statistiques recalculées.'); onChanged() }
  }

  return (
    <div className="mb-14">
      <div className="flex items-center gap-2.5 mb-1"><Pencil size={18} className="text-charo-orange" /><h2 className="font-bold text-lg text-ink-700">Gestion des matchs</h2></div>
      <p className="text-sm text-ink-600 mb-5">Chaque match enregistré peut être modifié ou supprimé. Une modification de score/dégâts recalcule le classement.</p>
      <div className="card divide-y divide-ink-700 overflow-hidden">
        {matches.map((m) => {
          const row = editing?.id === m.id ? editing : m
          return <div key={m.id} className="p-5">
            {editing?.id === m.id ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                <select value={row.player1_id || ''} onChange={e => setEditing({ ...row, player1_id: e.target.value })} className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2"><option value="">Joueur 1</option>{players.map(p => <option key={p.id} value={p.id}>{p.pseudo}</option>)}</select>
                <select value={row.player2_id || ''} onChange={e => setEditing({ ...row, player2_id: e.target.value })} className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2"><option value="">Joueur 2</option>{players.map(p => <option key={p.id} value={p.id}>{p.pseudo}</option>)}</select>
                <select value={row.phase} onChange={e => setEditing({ ...row, phase: e.target.value })} className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2">{PHASES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
                <select value={row.status} onChange={e => setEditing({ ...row, status: e.target.value, status_override: true })} className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2"><option value="scheduled">Programmé</option><option value="in_progress">En cours</option><option value="completed">Terminé</option></select>
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-600 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <input type="checkbox" checked={!!row.status_override} onChange={e => setEditing({ ...row, status_override: e.target.checked })} />
                  Contrôle manuel du statut
                </label>
                <input type="number" min="0" value={row.score1 ?? 0} onChange={e => setEditing({ ...row, score1: e.target.value })} placeholder="Kills J1" className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2" />
                <input type="number" min="0" value={row.score2 ?? 0} onChange={e => setEditing({ ...row, score2: e.target.value })} placeholder="Kills J2" className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2" />
                <input type="number" min="0" value={row.damage1 ?? 0} onChange={e => setEditing({ ...row, damage1: e.target.value })} placeholder="Dégâts J1" className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2" />
                <input type="number" min="0" value={row.damage2 ?? 0} onChange={e => setEditing({ ...row, damage2: e.target.value })} placeholder="Dégâts J2" className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2" />
                <input value={row.round_label || ''} onChange={e => setEditing({ ...row, round_label: e.target.value })} placeholder="Libellé du tour" className="rounded-lg bg-white border border-ink-700 text-sm px-3 py-2" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!row.is_featured} onChange={e => setEditing({ ...row, is_featured: e.target.checked })} /> À la une</label>
                <div className="flex gap-2"><button onClick={() => save(row)} disabled={saving} className="w-9 h-9 rounded-lg bg-charo-orange text-white flex items-center justify-center"><Save size={15} /></button><button onClick={() => setEditing(null)} className="w-9 h-9 rounded-lg border border-ink-700 text-ink-600 flex items-center justify-center"><X size={15} /></button></div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-[220px] flex-1"><p className="font-semibold">{m.player1?.pseudo || '—'} <span className="text-ink-600">vs</span> {m.player2?.pseudo || '—'}</p><p className="text-xs text-ink-600 mt-1">{m.round_label || m.phase} · {m.status} · {m.score1}-{m.score2} kills · {m.damage1}-{m.damage2} dégâts</p></div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-ink-800">{m.phase}</span>
                <button onClick={() => setEditing({ ...m })} className="w-9 h-9 rounded-lg border border-ink-700 text-ink-600 flex items-center justify-center hover:bg-ink-800"><Pencil size={15} /></button>
                <button onClick={() => remove(m.id)} className="w-9 h-9 rounded-lg border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white"><Trash2 size={15} /></button>
              </div>
            )}
          </div>
        })}
      </div>
    </div>
  )
}

/* ============================================================================
   6. AJOUTER UNE INFORMATION
   ========================================================================= */
function AnnouncementsSection({ announcements, authorId, onChanged, setError, setMessage }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('information')
  const [imageFile, setImageFile] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editingImageFile, setEditingImageFile] = useState(null)

  const publish = async (e) => {
    e.preventDefault()
    if (!body.trim()) { setError('Écris un message avant de publier.'); return }
    setError(''); setMessage(''); setPublishing(true)

    let imageUrl = null
    if (imageFile) {
      const result = await uploadPublicFile(imageFile, 'announcements')
      if (result.error) {
        setError(`Impossible d'envoyer l'image : ${result.error.message}`)
        setPublishing(false)
        return
      }
      imageUrl = result.data.url
    }

    const { error } = await supabase.from('announcements').insert({
      title: title.trim() || null,
      body: body.trim(),
      category,
      image_url: imageUrl,
      author_id: authorId || null,
      published: true,
    })

    if (error) setError(error.message)
    else {
      setMessage('Annonce publiée — visible immédiatement dans Annonces.')
      setTitle(''); setBody(''); setImageFile(null); setCategory('information')
      onChanged()
    }
    setPublishing(false)
  }

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette annonce et ses commentaires ?')) return
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) setError(error.message)
    else { setMessage('Annonce supprimée.'); onChanged() }
  }

  const saveEdit = async (a) => {
    setError('')
    let imageUrl = a.image_url || null
    if (editingImageFile) {
      const result = await uploadPublicFile(editingImageFile, 'announcements')
      if (result.error) { setError(`Impossible d'envoyer l'image : ${result.error.message}`); return }
      imageUrl = result.data.url
    }

    const { error } = await supabase.from('announcements').update({
      title: a.title?.trim() || null,
      body: a.body.trim(),
      category: a.category || 'information',
      image_url: imageUrl,
      published: !!a.published,
    }).eq('id', a.id)
    if (error) setError(error.message)
    else { setMessage('Annonce modifiée.'); setEditing(null); setEditingImageFile(null); onChanged() }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <Megaphone size={18} className="text-charo-orange" />
        <h2 className="font-bold text-lg text-ink-700">Publier une annonce</h2>
      </div>
      <p className="text-sm text-ink-600 mb-5">Publication instantanée dans la page Annonces, avec commentaires, réponses et réactions.</p>

      <form onSubmit={publish} className="card p-6 mb-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de l'annonce" className="w-full rounded-lg bg-white border border-ink-700 text-sm px-3.5 py-2.5 outline-none focus:border-charo-orange" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg bg-white border border-ink-700 text-sm px-3.5 py-2.5 outline-none focus:border-charo-orange">
            <option value="information">📢 Information</option>
            <option value="match">⚔️ Match</option>
            <option value="result">🏆 Résultat</option>
            <option value="event">🔥 Événement</option>
          </select>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Ton message pour les joueurs…" className="w-full rounded-lg bg-white border border-ink-700 text-sm px-3.5 py-2.5 outline-none focus:border-charo-orange resize-none" />

        <div className="rounded-2xl border border-dashed border-ink-700 bg-ink-800 p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="w-10 h-10 rounded-xl bg-charo-orange/10 text-charo-orange flex items-center justify-center"><Paperclip size={18} /></span>
            <span>
              <span className="block text-sm font-bold">Ajouter une image</span>
              <span className="block text-xs text-ink-600 mt-0.5">Téléverse directement depuis ton ordinateur · 10 Mo max</span>
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
          </label>
          {imageFile && <p className="text-xs text-charo-orange font-semibold mt-3">Image sélectionnée : {imageFile.name}</p>}
        </div>

        <button type="submit" disabled={publishing} className="btn-primary">
          {publishing ? 'Téléversement / publication…' : 'Publier l’annonce'}
        </button>
      </form>

      {announcements.length > 0 && (
        <div className="card divide-y divide-ink-700">
          {announcements.map((a) => (
            <div key={a.id} className="p-4">
              {editing?.id === a.id ? (
                <div className="space-y-3">
                  <input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full rounded-lg border border-ink-700 px-3 py-2 text-sm" />
                  <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={4} className="w-full rounded-lg border border-ink-700 px-3 py-2 text-sm" />
                  <select value={editing.category || 'information'} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full rounded-lg border border-ink-700 px-3 py-2 text-sm">
                    <option value="information">📢 Information</option><option value="match">⚔️ Match</option><option value="result">🏆 Résultat</option><option value="event">🔥 Événement</option>
                  </select>
                  <div className="rounded-xl border border-dashed border-ink-700 bg-ink-800 p-3">
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold">
                      <Paperclip size={15} className="text-charo-orange" /> Remplacer l'image
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setEditingImageFile(e.target.files?.[0] || null)} />
                    </label>
                    {editingImageFile && <p className="text-xs text-charo-orange mt-2">Nouvelle image : {editingImageFile.name}</p>}
                    {editing.image_url && !editingImageFile && <img src={editing.image_url} alt="" className="mt-3 h-28 w-full object-cover rounded-xl" />}
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} /> Publiée</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveEdit(editing)} className="btn-primary !px-4 !py-2 text-xs"><Save size={14} /> Enregistrer</button>
                    <button type="button" onClick={() => { setEditing(null); setEditingImageFile(null) }} className="btn-outline !px-4 !py-2 text-xs">Annuler</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase text-charo-orange">{a.category || 'information'}</span>
                      {!a.published && <span className="text-[10px] rounded-full bg-ink-800 px-2 py-1">Brouillon</span>}
                    </div>
                    {a.title && <p className="font-semibold text-sm">{a.title}</p>}
                    <p className="text-sm text-ink-600 whitespace-pre-wrap">{a.body}</p>
                    {a.image_url && <img src={a.image_url} alt="" className="mt-3 max-h-40 rounded-xl object-cover" />}
                    <p className="text-[11px] text-ink-600 mt-1">{new Date(a.created_at).toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => { setEditing({ ...a }); setEditingImageFile(null) }} className="w-8 h-8 rounded-lg border border-ink-700 text-ink-600 flex items-center justify-center hover:bg-ink-800" aria-label="Modifier"><Pencil size={13} /></button>
                    <button type="button" onClick={() => remove(a.id)} className="w-8 h-8 rounded-lg border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white" aria-label="Supprimer"><Trash2 size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

