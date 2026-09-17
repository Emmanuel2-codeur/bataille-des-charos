import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, CalendarClock, Check, ChevronDown, ChevronUp, Crown,
  Edit3, GripVertical, Plus, Save, Trash2, Trophy, Users, X, Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const PHASES = [
  { key: 'trente_deuxieme', label: '32èmes de finale', short: '32èmes', count: 16, previous: null },
  { key: 'seizieme', label: '16èmes de finale', short: '16èmes', count: 8, previous: 'trente_deuxieme' },
  { key: 'quart', label: 'Quarts de finale', short: 'Quarts', count: 4, previous: 'seizieme' },
  { key: 'demie', label: 'Demi-finales', short: 'Demies', count: 2, previous: 'quart' },
  { key: 'finale', label: 'Grande finale', short: 'Finale', count: 1, previous: 'demie' },
]
const NB_FINALISTES = 32

const EMPTY_FORM = { player1_id: '', player2_id: '', scheduled_at: '', match_type: 'onetap', leg: 'aller', score1_retour: 0, score2_retour: 0, damage1_retour: 0, damage2_retour: 0 }

function fmtDate(value) {
  if (!value) return 'Horaire à confirmer'
  return new Date(value).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function statusLabel(m) {
  if (m.status === 'completed') return 'Terminé'
  if (m.status === 'in_progress') return 'En cours'
  return 'Programmé'
}

export default function FinalistsAdmin({ players, onChanged, setError, setMessage }) {
  const [selected, setSelected] = useState([])
  const [matches, setMatches] = useState([])
  const [mvp, setMvp] = useState('')
  const [mvpNote, setMvpNote] = useState('')
  const [savedMvp, setSavedMvp] = useState(null)
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [savingSelection, setSavingSelection] = useState(false)
  const [savingMatch, setSavingMatch] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingSnapshot, setEditingSnapshot] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [targetPosition, setTargetPosition] = useState(null)

  const qualifiedPlayers = useMemo(() => players.filter(p => p.is_qualified).sort((a, b) => (a.qualification_seed || 99) - (b.qualification_seed || 99)), [players])
  const availablePlayers = useMemo(() => players.filter(p => !p.is_qualified && (!search || p.pseudo.toLowerCase().includes(search.toLowerCase()))), [players, search])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id, phase, round_label, bracket_position, match_type, leg, scheduled_at, scheduled_at_retour,
        score1, score2, damage1, damage2, score1_retour, score2_retour, damage1_retour, damage2_retour,
        status, status_override, winner_id,
        player1_id, player2_id,
        player1:profiles!matches_player1_id_fkey(id, pseudo, avatar_url),
        player2:profiles!matches_player2_id_fkey(id, pseudo, avatar_url)
      `)
      .in('phase', PHASES.map(p => p.key))
      .order('phase', { ascending: true })
      .order('bracket_position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setMatches(data || [])

    const { data: settings } = await supabase.from('tournament_settings').select('id, mvp_player_id, mvp_note').limit(1).maybeSingle()
    if (settings) {
      setSavedMvp(settings)
      setMvp(settings.mvp_player_id || '')
      setMvpNote(settings.mvp_note || '')
    }
    setLoading(false)
  }

  useEffect(() => {
    setSelected(qualifiedPlayers.length === NB_FINALISTES ? qualifiedPlayers.map(p => p.id) : [])
  }, [players])

  useEffect(() => {
    load()
    const channel = supabase.channel('finalistes-admin-live').on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load).subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const togglePlayer = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length >= NB_FINALISTES ? s : [...s, id])
  }

  const move = (index, direction) => {
    const next = [...selected]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setSelected(next)
  }

  const saveSelection = async () => {
    if (selected.length !== NB_FINALISTES) { setError(`Sélectionne exactement ${NB_FINALISTES} joueurs (${selected.length}/${NB_FINALISTES}).`); return }
    setSavingSelection(true); setError(''); setMessage('')
    const { error } = await supabase.rpc('set_final_qualifiers', { p_player_ids: selected })
    if (error) setError(error.message)
    else { setMessage(`Les ${NB_FINALISTES} joueurs qualifiés ont été enregistrés dans l’ordre choisi. Aucun tirage automatique n’est effectué.`); await load(); onChanged?.() }
    setSavingSelection(false)
  }

  const startCreate = (phase, suggested = {}) => {
    const phaseMeta = PHASES.find(p => p.key === phase) || PHASES[0]
    const requestedPosition = Number(suggested.bracket_position || 0)
    const existingPositions = new Set(matches.filter(m => m.phase === phase).map(m => Number(m.bracket_position || 0)))
    const position = requestedPosition >= 1 && requestedPosition <= phaseMeta.count
      ? requestedPosition
      : Array.from({ length: phaseMeta.count }, (_, i) => i + 1).find(pos => !existingPositions.has(pos)) || 1
    const { bracket_position: _ignored, ...playerForm } = suggested
    setEditingId(null)
    setEditingSnapshot(null)
    setPhaseFilter(phase)
    setTargetPosition(position)
    setForm({ ...EMPTY_FORM, ...playerForm })
    window.setTimeout(() => document.getElementById('finalistes-programmer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 20)
  }

  const editMatch = (m) => {
    setEditingId(m.id)
    setEditingSnapshot(m)
    setPhaseFilter(m.phase)
    setTargetPosition(Number(m.bracket_position || 1))
    setForm({ player1_id: m.player1_id || '', player2_id: m.player2_id || '', scheduled_at: m.scheduled_at ? new Date(m.scheduled_at).toISOString().slice(0, 16) : '', match_type: m.match_type || 'onetap', leg: m.leg || 'aller' })
    window.setTimeout(() => document.getElementById('finalistes-programmer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 20)
  }

  const saveMatch = async (e) => {
    e.preventDefault()
    if (!form.player1_id || !form.player2_id || form.player1_id === form.player2_id) { setError('Choisis deux joueurs différents.'); return }
    setSavingMatch(true); setError(''); setMessage('')
    const phase = phaseFilter === 'all' ? 'trente_deuxieme' : phaseFilter
    const phaseMeta = PHASES.find(p => p.key === phase) || PHASES[0]
    const phaseMatches = matches.filter(m => m.phase === phase && m.id !== editingId)
    const usedPositions = new Set(phaseMatches.map(m => Number(m.bracket_position || 0)))
    const firstFreePosition = Array.from({ length: phaseMeta.count }, (_, i) => i + 1).find(pos => !usedPositions.has(pos))
    if (!editingId && !firstFreePosition) {
      setError(`Tous les créneaux de ${phaseMeta.label} sont déjà utilisés. Supprime un match pour en reprogrammer un.`)
      setSavingMatch(false)
      return
    }
    // On ne demande jamais à l'admin de choisir une case précise : le match
    // part automatiquement dans la première case vide de la phase choisie.
    const position = editingId
      ? (matches.find(m => m.id === editingId)?.bracket_position || firstFreePosition)
      : firstFreePosition
    const payload = {
      player1_id: form.player1_id,
      player2_id: form.player2_id,
      phase,
      leg: PHASES.some(p => p.key === phase) ? form.leg : null,
      match_type: form.match_type,
      scheduled_at: form.scheduled_at || null,
      status: editingSnapshot?.status || 'scheduled',
      status_override: editingSnapshot?.status_override || false,
      score1: editingSnapshot?.score1 || 0,
      score2: editingSnapshot?.score2 || 0,
      damage1: editingSnapshot?.damage1 || 0,
      damage2: editingSnapshot?.damage2 || 0,
      bracket_position: position,
      round_label: `${PHASES.find(p => p.key === phase)?.label || phase} ${position}`,
    }
    const query = editingId ? supabase.from('matches').update(payload).eq('id', editingId).select('id').single() : supabase.from('matches').insert(payload).select('id').single()
    const { data: savedMatch, error } = await query
    if (error) setError(error.message)
    else {
      if (!editingId && savedMatch?.id && ['seizieme', 'quart', 'demie', 'finale'].includes(phase)) {
        await supabase.rpc('sync_final_bracket_match_players', { p_match_id: savedMatch.id })
      }
      setMessage(editingId ? 'Match final modifié.' : 'Match final programmé. Il apparaît immédiatement dans sa case du tableau et attend la validation du score.')
      setForm(EMPTY_FORM); setEditingId(null); setEditingSnapshot(null); setTargetPosition(null); await load(); onChanged?.(); window.setTimeout(() => document.getElementById('finalistes-bracket-admin')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    }
    setSavingMatch(false)
  }

  const deleteMatch = async (m) => {
    if (!window.confirm(`Supprimer ${m.round_label || 'ce match'} ? Le créneau du bracket sera libéré.`)) return
    const { error } = await supabase.from('matches').delete().eq('id', m.id)
    if (error) setError(error.message)
    else { setMessage('Match supprimé. Tu peux réutiliser immédiatement son emplacement.'); await load(); onChanged?.() }
  }

  const validateMatch = async (m, values) => {
    const score1 = Number(values.score1)
    const score2 = Number(values.score2)
    const damage1 = Math.max(0, Number(values.damage1 || 0))
    const damage2 = Math.max(0, Number(values.damage2 || 0))
    const score1_retour = Number(values.score1_retour || 0)
    const score2_retour = Number(values.score2_retour || 0)
    const damage1_retour = Math.max(0, Number(values.damage1_retour || 0))
    const damage2_retour = Math.max(0, Number(values.damage2_retour || 0))
    if (![score1, score2, score1_retour, score2_retour].every(Number.isFinite) || [score1, score2, score1_retour, score2_retour].some(v => v < 0)) {
      setError('Les scores (aller et retour) doivent être des nombres positifs.')
      return
    }
    const total1 = score1 + score1_retour
    const total2 = score2 + score2_retour
    if (total1 === total2) { setError(`Égalité sur le cumul aller + retour (${total1} - ${total2}) : impossible de déterminer le qualifié.`); return }
    setError(''); setMessage('')
    const { error } = await supabase.rpc('admin_validate_final_match', {
      p_match_id: m.id,
      p_score1: score1,
      p_score2: score2,
      p_damage1: damage1,
      p_damage2: damage2,
      p_score1_retour: score1_retour,
      p_score2_retour: score2_retour,
      p_damage1_retour: damage1_retour,
      p_damage2_retour: damage2_retour,
    })
    if (error) setError(error.message)
    else {
      const winner = total1 > total2 ? m.player1?.pseudo : m.player2?.pseudo
      setMessage(`Score validé (cumul ${total1}-${total2}). ${winner || 'Le vainqueur'} avance automatiquement dans le prochain emplacement du bracket.`)
      await load(); onChanged?.()
    }
  }

  const deletePhase = async (phase) => {
    const rows = matches.filter(m => m.phase === phase)
    if (!rows.length) return
    if (!window.confirm(`Supprimer les ${rows.length} match(s) de ${PHASES.find(p => p.key === phase)?.label} ? Cette action sert aussi aux tests.`)) return
    const { error } = await supabase.from('matches').delete().in('id', rows.map(r => r.id))
    if (error) setError(error.message)
    else { setMessage(`${rows.length} match(s) supprimé(s) de cette phase.`); await load(); onChanged?.() }
  }

  const saveMvp = async () => {
    if (!mvp) { setError('Sélectionne le MVP.'); return }
    setError(''); setMessage('')
    const { data: existing } = await supabase.from('tournament_settings').select('id').limit(1).maybeSingle()
    const payload = { mvp_player_id: mvp, mvp_note: mvpNote.trim() || null, updated_at: new Date().toISOString() }
    const result = existing
      ? await supabase.from('tournament_settings').update(payload).eq('id', existing.id)
      : await supabase.from('tournament_settings').insert(payload)
    if (result.error) setError(result.error.message)
    else { setMessage('MVP annoncé sur le tournoi.'); await load() }
  }

  const byPhase = (phase) => matches.filter(m => m.phase === phase).sort((a, b) => (a.bracket_position || 99) - (b.bracket_position || 99))

  const previousWinners = (phase) => {
    const previous = PHASES.find(p => p.key === phase)?.previous
    if (!previous) return []
    const rows = byPhase(previous)
    return rows.map((m) => ({
      position: Number(m.bracket_position || 0),
      match: m,
      ready: m.status === 'completed' && !!m.winner_id,
      winner: m.winner_id === m.player1_id ? m.player1 : m.player2,
    }))
  }

  const phaseOptions = phaseFilter === 'all' ? PHASES : PHASES.filter(p => p.key === phaseFilter)

  return (
    <div className="space-y-10">
      <section className="finalists-hero card p-6 lg:p-8 overflow-hidden relative">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-charo-orange/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <span className="eyebrow mb-3"><Trophy size={13} /> Phase finale — sélection manuelle</span>
            <h2 className="font-display text-3xl md:text-4xl text-ink-950">Les {NB_FINALISTES} joueurs qualifiés</h2>
            <p className="text-sm text-ink-600 mt-2 max-w-2xl">L’admin choisit lui-même les {NB_FINALISTES} joueurs. L’ordre de la liste devient leur rang 1→{NB_FINALISTES} dans la phase finale. Aucun tirage, aucune génération automatique.</p>
          </div>
          <div className="finalists-counter"><strong>{selected.length}</strong><span>/{NB_FINALISTES}</span><small>sélectionnés</small></div>
        </div>
      </section>

      <section className="grid xl:grid-cols-[1.35fr_.65fr] gap-6">
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-ink-700 flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold text-lg">Sélection des qualifiés</h3><p className="text-xs text-ink-600 mt-1">Clique pour ajouter ou retirer un joueur.</p></div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un pseudo…" className="rounded-xl border border-ink-700 px-3 py-2 text-sm w-full sm:w-64" />
          </div>
          <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[520px] overflow-y-auto">
            {players.filter(p => !search || p.pseudo.toLowerCase().includes(search.toLowerCase())).map(p => {
              const active = selected.includes(p.id)
              return <button key={p.id} type="button" onClick={() => togglePlayer(p.id)} className={`finalist-player ${active ? 'is-selected' : ''}`}>
                <span className="finalist-avatar">{p.avatar_url ? <img src={p.avatar_url} alt="" /> : <Users size={15} />}</span>
                <span className="min-w-0 text-left"><strong>{p.pseudo}</strong><small>{p.total_kills || 0} kills · {(p.total_damage || 0).toLocaleString('fr-FR')} dmg</small></span>
                <span className="ml-auto">{active ? <Check size={16} /> : <Plus size={16} />}</span>
              </button>
            })}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="p-5 border-b border-ink-700"><h3 className="font-bold text-lg">Ordre des {NB_FINALISTES} finalistes</h3><p className="text-xs text-ink-600 mt-1">Les flèches modifient le rang affiché dans le bracket.</p></div>
          <div className="p-4 space-y-2 max-h-[520px] overflow-y-auto">
            {selected.map((id, index) => {
              const p = players.find(x => x.id === id)
              if (!p) return null
              return <div key={id} className="finalist-rank-row">
                <span className="rank-chip">{index + 1}</span><GripVertical size={14} className="text-ink-600" />
                <span className="font-bold truncate flex-1">{p.pseudo}</span>
                <button onClick={() => move(index, -1)} disabled={index === 0} className="rank-action" title="Monter"><ArrowUp size={13} /></button>
                <button onClick={() => move(index, 1)} disabled={index === selected.length - 1} className="rank-action" title="Descendre"><ArrowDown size={13} /></button>
                <button onClick={() => togglePlayer(id)} className="rank-action danger" title="Retirer"><X size={13} /></button>
              </div>
            })}
            {!selected.length && <p className="text-sm text-ink-600 text-center py-12">Aucun finaliste sélectionné.</p>}
          </div>
          <div className="p-5 border-t border-ink-700">
            <button onClick={saveSelection} disabled={savingSelection || selected.length !== NB_FINALISTES} className="btn-primary w-full"><Save size={15} />{savingSelection ? 'Enregistrement…' : `Valider les ${NB_FINALISTES} finalistes`}</button>
          </div>
        </div>
      </section>

      <section className="card p-5 lg:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div><span className="eyebrow mb-2"><CalendarClock size={13} /> Programmation</span><h3 className="font-display text-2xl">Programmation des matchs des finalistes</h3><p className="text-sm text-ink-600 mt-1">Programme une rencontre ici : elle est ensuite déplacée dans sa case du tableau ci-dessous. La modification et la validation du score se font directement depuis cette case.</p></div>
          <button onClick={() => startCreate('trente_deuxieme')} className="btn-primary"><Plus size={15} /> Nouveau match</button>
        </div>

        <div id="finalistes-programmer" className="final-schedule-panel rounded-2xl border border-charo-orange/30 bg-charo-orange/[0.035] p-5 mb-8">
          <div className="flex items-center justify-between gap-3 mb-4"><div><h4 className="font-bold">{editingId ? `Modifier ${PHASES.find(p => p.key === phaseFilter)?.short || ''} — case ${targetPosition || ''}` : `Programmer → ${PHASES.find(p => p.key === (phaseFilter === 'all' ? 'trente_deuxieme' : phaseFilter))?.short || '32èmes'} ${targetPosition || ''}`}</h4><p className="text-xs text-ink-600">Après enregistrement, le match apparaît dans la case correspondante du tableau. C’est depuis cette case que tu le modifies et valides son score.</p></div>{editingId && <button onClick={() => { setEditingId(null); setEditingSnapshot(null); setForm(EMPTY_FORM); setTargetPosition(null) }} className="rank-action"><X size={14} /></button>}</div>
          <form onSubmit={saveMatch} className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <select value={phaseFilter === 'all' ? 'trente_deuxieme' : phaseFilter} onChange={e => { const phase = e.target.value; setPhaseFilter(phase); const meta = PHASES.find(p => p.key === phase); const used = new Set(matches.filter(m => m.phase === phase && m.id !== editingId).map(m => Number(m.bracket_position || 0))); setTargetPosition(Array.from({ length: meta.count }, (_, i) => i + 1).find(pos => !used.has(pos)) || 1) }} className="field">{PHASES.map(p => <option key={p.key} value={p.key}>{p.short}</option>)}</select>
            <select value={form.player1_id} onChange={e => setForm(f => ({ ...f, player1_id: e.target.value }))} className="field"><option value="">Joueur 1</option>{players.filter(p => p.is_qualified || p.id === form.player1_id).map(p => <option key={p.id} value={p.id}>{p.pseudo}</option>)}</select>
            <select value={form.player2_id} onChange={e => setForm(f => ({ ...f, player2_id: e.target.value }))} className="field"><option value="">Joueur 2</option>{players.filter(p => p.is_qualified || p.id === form.player2_id).map(p => <option key={p.id} value={p.id}>{p.pseudo}</option>)}</select>
            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} className="field" />
            <select value={form.match_type} onChange={e => setForm(f => ({ ...f, match_type: e.target.value }))} className="field"><option value="onetap">One Tap · Aller</option><option value="spam">Spam · Retour</option></select>
            <button disabled={savingMatch} className="btn-primary"><Save size={15} />{savingMatch ? '…' : editingId ? 'Enregistrer' : 'Programmer'}</button>
          </form>
        </div>

        <div id="finalistes-bracket-admin" className="final-admin-bracket"><div className="final-admin-bracket-head"><div><span className="eyebrow mb-2"><Trophy size={13} /> Tableau de gestion</span><h3 className="font-display text-2xl">32èmes → 16èmes → Quarts → Demies → Finale</h3><p className="text-sm text-ink-600 mt-1">Chaque case est un match aller-retour. Clique dessus pour saisir les kills et dégâts des deux manches, puis valider le score cumulé.</p></div><div className="final-admin-flow"><span>PROGRAMMÉ</span><b>→</b><span>VALIDÉ</span><b>→</b><span>VAINQUEUR</span></div></div><div className="grid lg:grid-cols-5 gap-4">
          {PHASES.map((phase) => {
            const rows = byPhase(phase.key)
            const next = previousWinners(phase.key)
            const slots = Array.from({ length: phase.count }, (_, i) => rows.find(m => Number(m.bracket_position || 0) === i + 1) || null)
            return <div key={phase.key} className="final-phase-column">
              <div className="flex items-center justify-between mb-3"><div><p className="text-[10px] uppercase tracking-[.2em] font-extrabold text-charo-orange">{phase.short}</p><h4 className="font-bold">{phase.label}</h4></div><button onClick={() => deletePhase(phase.key)} disabled={!rows.length} className="rank-action danger" title="Supprimer toute la phase"><Trash2 size={13} /></button></div>
              <div className="space-y-3">
                {slots.map((match, i) => {
                  if (match) return <AdminBracketMatch key={match.id} match={match} onEdit={editMatch} onDelete={deleteMatch} onValidate={validateMatch} />
                  if (phase.previous) {
                    const a = next.find(x => x.position === i * 2 + 1), b = next.find(x => x.position === i * 2 + 2)
                    const ready = a?.ready && b?.ready
                    return <div key={`${phase.key}-next-${i}`} className="next-slot"><div><strong>{phase.short} {i + 1}</strong><small>{ready ? `${a.winner.pseudo} vs ${b.winner.pseudo}` : 'En attente des deux vainqueurs'}</small></div><button disabled={!ready} onClick={() => startCreate(phase.key, { bracket_position: i + 1, player1_id: a?.winner?.id || '', player2_id: b?.winner?.id || '' })} className="rank-action"><Plus size={14} /></button></div>
                  }
                  return <button key={`${phase.key}-empty-${i}`} onClick={() => startCreate(phase.key, { bracket_position: i + 1 })} className="empty-phase"><Plus size={15} /> Programmer {phase.short.toLowerCase()} {i + 1}</button>
                })}
              </div>
            </div>
          })}
        </div></div>
      </section>

      <section className="card p-5 lg:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5"><div><span className="eyebrow mb-2"><Crown size={13} /> Distinction</span><h3 className="font-display text-2xl">Annoncer le MVP</h3><p className="text-sm text-ink-600 mt-1">La distinction peut être annoncée avant ou après la finale.</p></div></div>
        <div className="grid lg:grid-cols-[.65fr_1.35fr_auto] gap-3">
          <select value={mvp} onChange={e => setMvp(e.target.value)} className="field"><option value="">Sélectionner un joueur</option>{qualifiedPlayers.map(p => <option key={p.id} value={p.id}>{p.pseudo}</option>)}</select>
          <input value={mvpNote} onChange={e => setMvpNote(e.target.value)} placeholder="Message du MVP (optionnel)" className="field" />
          <button onClick={saveMvp} className="btn-primary"><Crown size={15} /> Publier le MVP</button>
        </div>
        {savedMvp?.mvp_player_id && <p className="mt-3 text-xs font-semibold text-charo-orange">MVP actuel : {players.find(p => p.id === savedMvp.mvp_player_id)?.pseudo || 'joueur sélectionné'}</p>}
      </section>

      <section className="card p-5 lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5"><div><span className="eyebrow mb-2"><Zap size={13} /> Contrôle rapide</span><h3 className="font-display text-2xl">État des phases</h3></div><button onClick={load} className="btn-outline">Actualiser</button></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PHASES.map(p => { const rows = byPhase(p.key); const done = rows.filter(m => m.status === 'completed').length; return <div key={p.key} className="rounded-2xl border border-ink-700 bg-ink-800/40 p-4"><div className="flex justify-between"><span className="text-xs font-bold">{p.label}</span><span className="text-xs text-charo-orange font-bold">{done}/{rows.length}</span></div><div className="mt-3 h-1.5 rounded-full bg-ink-700 overflow-hidden"><div className="h-full bg-charo-gradient" style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} /></div><p className="text-[11px] text-ink-600 mt-2">{rows.length ? `${rows.length} programmé(s)` : 'Aucun match'}</p></div> })}
        </div>
      </section>
    </div>
  )
}

function AdminBracketMatch({ match, onEdit, onDelete, onValidate }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({
    score1: match.score1 || 0, score2: match.score2 || 0, damage1: match.damage1 || 0, damage2: match.damage2 || 0,
    score1_retour: match.score1_retour || 0, score2_retour: match.score2_retour || 0, damage1_retour: match.damage1_retour || 0, damage2_retour: match.damage2_retour || 0,
  })
  const winner = match.winner_id ? (match.winner_id === match.player1_id ? match.player1 : match.player2) : null
  const total1 = Number(match.score1 || 0) + Number(match.score1_retour || 0)
  const total2 = Number(match.score2 || 0) + Number(match.score2_retour || 0)
  return <div className={`admin-bracket-match ${match.status === 'completed' ? 'is-complete' : ''}`}>
    <button type="button" onClick={() => setOpen(v => !v)} className="w-full text-left">
      <div className="flex items-center justify-between gap-2 mb-2"><span className="match-phase-tag">{match.round_label || 'Match'}</span><span className={`match-status ${match.status}`}>{statusLabel(match)}</span></div>
      <div className="space-y-1.5"><div className={`match-player ${winner?.id === match.player1_id ? 'winner' : ''}`}><span>{match.player1?.pseudo || 'À définir'}</span><strong>{match.status === 'completed' ? total1 : '—'}</strong></div><div className={`match-player ${winner?.id === match.player2_id ? 'winner' : ''}`}><span>{match.player2?.pseudo || 'À définir'}</span><strong>{match.status === 'completed' ? total2 : '—'}</strong></div></div>
      <div className="mt-2 text-[10px] text-ink-600 flex items-center gap-1"><CalendarClock size={11} /> {fmtDate(match.scheduled_at)} <span className="ml-auto">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span></div>
      <div className="mt-2 text-[9px] font-bold text-charo-orange">● Visible dans le bracket public</div>
    </button>
    {open && <div className="pt-3 mt-3 border-t border-ink-700 space-y-2" onClick={e => e.stopPropagation()}>
      {match.status !== 'completed' ? (
        <>
          <p className="text-[10px] uppercase tracking-wide text-ink-600">Match aller</p>
          <div className="grid grid-cols-2 gap-2"><label className="mini-field">Kills J1<input type="number" min="0" value={values.score1} onChange={e => setValues(v => ({ ...v, score1: e.target.value }))} /></label><label className="mini-field">Kills J2<input type="number" min="0" value={values.score2} onChange={e => setValues(v => ({ ...v, score2: e.target.value }))} /></label><label className="mini-field">Dégâts J1<input type="number" min="0" value={values.damage1} onChange={e => setValues(v => ({ ...v, damage1: e.target.value }))} /></label><label className="mini-field">Dégâts J2<input type="number" min="0" value={values.damage2} onChange={e => setValues(v => ({ ...v, damage2: e.target.value }))} /></label></div>
          <p className="text-[10px] uppercase tracking-wide text-ink-600 pt-1">Match retour</p>
          <div className="grid grid-cols-2 gap-2"><label className="mini-field">Kills J1<input type="number" min="0" value={values.score1_retour} onChange={e => setValues(v => ({ ...v, score1_retour: e.target.value }))} /></label><label className="mini-field">Kills J2<input type="number" min="0" value={values.score2_retour} onChange={e => setValues(v => ({ ...v, score2_retour: e.target.value }))} /></label><label className="mini-field">Dégâts J1<input type="number" min="0" value={values.damage1_retour} onChange={e => setValues(v => ({ ...v, damage1_retour: e.target.value }))} /></label><label className="mini-field">Dégâts J2<input type="number" min="0" value={values.damage2_retour} onChange={e => setValues(v => ({ ...v, damage2_retour: e.target.value }))} /></label></div>
          <p className="text-xs font-bold text-charo-orange pt-1">Cumul : {Number(values.score1 || 0) + Number(values.score1_retour || 0)} - {Number(values.score2 || 0) + Number(values.score2_retour || 0)}</p>
        </>
      ) : (
        <div className="rounded-xl bg-ink-800 p-3 text-xs">
          <strong>Aller :</strong> {match.score1} — {match.score2}<br />
          <strong>Retour :</strong> {match.score1_retour ?? 0} — {match.score2_retour ?? 0}<br />
          <strong>Dégâts :</strong> {Number(match.damage1 || 0) + Number(match.damage1_retour || 0)} — {Number(match.damage2 || 0) + Number(match.damage2_retour || 0)}<br />
          <strong>Règle :</strong> {match.match_type === 'onetap' ? 'One Tap / Headshot Only' : 'Spam / Bodyshot'}
        </div>
      )}
      <div className="flex gap-2 pt-1"><button onClick={() => onEdit(match)} className="rank-action"><Edit3 size={13} /></button><button onClick={() => onDelete(match)} className="rank-action danger"><Trash2 size={13} /></button>{match.status !== 'completed' && <button onClick={() => onValidate(match, values)} className="btn-primary flex-1 !py-2 !px-3 text-xs"><Check size={13} /> Valider le score</button>}</div>
    </div>}
  </div>
}