import { CalendarClock, Clock3, Crosshair, Crown, Shield, Trophy, Zap } from 'lucide-react'

// La phase finale se joue en 16èmes → huitièmes → quarts → demies → finale.
// Chaque tour (sauf la finale) est scindé en deux moitiés symétriques (gauche/droite)
// qui convergent vers la finale au centre, comme un vrai tableau de tournoi.
const ROUNDS = [
  { phase: 'trente_deuxieme', short: '16èmes', full: 16 },
  { phase: 'seizieme', short: 'Huitièmes', full: 8 },
  { phase: 'quart', short: 'Quarts', full: 4 },
  { phase: 'demie', short: 'Demies', full: 2 },
]

function findMatch(matches, phase, position) {
  return matches.find(m => m.phase === phase && Number(m.bracket_position || 0) === position) || null
}

// Découpe chaque tour en une moitié gauche (positions 1..n/2) et une moitié
// droite (positions n/2+1..n), en conservant l'ordre naturel du bracket_position
// (qui est déjà celui utilisé par la propagation ceil(pos/2) côté base de données).
function buildHalf(matches, side) {
  return ROUNDS.map(({ phase, full }) => {
    const half = full / 2
    const start = side === 'left' ? 1 : half + 1
    return Array.from({ length: half }, (_, i) => findMatch(matches, phase, start + i))
  })
}

function cumulative(match) {
  const total1 = Number(match.score1 || 0) + Number(match.score1_retour || 0)
  const total2 = Number(match.score2 || 0) + Number(match.score2_retour || 0)
  return [total1, total2]
}

function MiniMatchCard({ match, onSelect }) {
  const p1 = match.player1?.pseudo || 'À déterminer'
  const p2 = match.player2?.pseudo || 'À déterminer'
  const winner = match.winner_id === match.player1_id ? 1 : match.winner_id === match.player2_id ? 2 : null
  const [total1, total2] = cumulative(match)
  return (
    <button
      type="button"
      className={`bracket-match ${match.status === 'completed' ? 'is-complete' : ''} ${match.status === 'in_progress' ? 'is-live' : ''}`}
      onClick={() => onSelect?.(match)}
    >
      <div className={`bracket-match-row ${winner === 1 ? 'is-winner' : ''}`}>
        <span className="bracket-match-name">{p1}</span>
        <strong className="bracket-match-score">{match.status === 'scheduled' ? '—' : total1}</strong>
      </div>
      <div className={`bracket-match-row ${winner === 2 ? 'is-winner' : ''}`}>
        <span className="bracket-match-name">{p2}</span>
        <strong className="bracket-match-score">{match.status === 'scheduled' ? '—' : total2}</strong>
      </div>
      <span className={`bracket-match-pulse ${match.status}`} />
    </button>
  )
}

function EmptySlot() {
  return <div className="bracket-empty-slot"><span>À déterminer</span></div>
}

// Chaque case (slot) porte, en plus de la carte, les petits traits de connexion
// qui la relient au tour précédent (entrée) et au tour suivant (sortie).
// - incoming : trait plat, entre par le bord gauche ou droit de la case.
// - outgoing "elbow" : la moitié des cases (paires) doit d'abord rejoindre sa
//   case sœur avant de continuer vers le tour suivant -> trait horizontal +
//   trait vertical (vers le bas pour la case du haut de la paire, vers le
//   haut pour celle du bas), qui se rejoignent exactement à la bordure
//   partagée entre les deux cases (= centre de la case du tour suivant).
// - outgoing "flat" : cas des demies, qui n'ont qu'une case par côté et se
//   relient directement, sans repli, au centre de la finale.
function BracketSlot({ match, onSelect, incomingEdge, outgoing }) {
  return (
    <div className="bracket-slot">
      {incomingEdge && <span className={`bracket-line bracket-line-stub-${incomingEdge}`} />}
      {outgoing?.type === 'flat' && <span className={`bracket-line bracket-line-flat-${outgoing.edge}`} />}
      {outgoing?.type === 'elbow' && (
        <>
          <span className={`bracket-line bracket-line-half-${outgoing.edge}`} />
          <span className={`bracket-line bracket-line-vert-${outgoing.edge} bracket-line-vert-${outgoing.parity === 'top' ? 'down' : 'up'}`} />
        </>
      )}
      {match ? <MiniMatchCard match={match} onSelect={onSelect} /> : <EmptySlot />}
    </div>
  )
}

// side: 'left' (le flux sort vers la droite) ou 'right' (le flux sort vers la gauche, en miroir).
// roundIndex: 0 = tour le plus large (16èmes), le dernier = demies.
function RoundColumn({ side, roundIndex, slots, meta, matchesCountLabel, onSelect }) {
  const half = slots.length
  const outEdge = side === 'left' ? 'right' : 'left'
  const inEdge = side === 'left' ? 'left' : 'right'
  const isOuterRound = roundIndex === 0
  const flexGrow = 8 / half
  return (
    <div className="bracket-round">
      <div className="bracket-round-title">
        <h3>{meta.short}</h3>
        <span>{matchesCountLabel}</span>
      </div>
      <div className="bracket-round-body">
        {slots.map((match, i) => {
          const parity = i % 2 === 0 ? 'top' : 'bottom'
          const outgoing = half > 1
            ? { type: 'elbow', edge: outEdge, parity }
            : { type: 'flat', edge: outEdge }
          return (
            <div key={`${meta.short}-${side}-${i}`} className="bracket-slot-wrap" style={{ flexGrow }}>
              <BracketSlot
                match={match}
                onSelect={onSelect}
                incomingEdge={isOuterRound ? null : inEdge}
                outgoing={outgoing}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BracketTree({ matches = [], onSelect }) {
  const left = buildHalf(matches, 'left')
  const right = buildHalf(matches, 'right')
  const finalMatch = findMatch(matches, 'finale', 1)
  const champion = finalMatch?.status === 'completed'
    ? (finalMatch.winner_id === finalMatch.player1_id ? finalMatch.player1?.pseudo : finalMatch.player2?.pseudo)
    : null

  const countLabel = (phase, full) => `${matches.filter(m => m.phase === phase && m.status === 'completed').length}/${full}`

  return (
    <div className="bracket-scroll-wrap">
      <div className="bracket-tree">
        {ROUNDS.map((round, i) => (
          <RoundColumn
            key={`left-${round.phase}`}
            side="left"
            roundIndex={i}
            slots={left[i]}
            meta={round}
            matchesCountLabel={countLabel(round.phase, round.full)}
            onSelect={onSelect}
          />
        ))}

        <div className="bracket-final-col">
          <div className="bracket-round-title bracket-round-title-center">
            <h3>Grande finale</h3>
            <span>{countLabel('finale', 1)}</span>
          </div>
          <div className="bracket-final-body">
            <div className="bracket-trophy">
              <Trophy size={26} />
            </div>
            <div className="bracket-final-slot">
              {finalMatch ? <MiniMatchCard match={finalMatch} onSelect={onSelect} /> : <EmptySlot />}
            </div>
            <div className={`bracket-champion ${champion ? 'is-decided' : ''}`}>
              <Crown size={15} />
              <span>{champion || 'Champion à venir'}</span>
            </div>
          </div>
        </div>

        {[...ROUNDS].reverse().map((round, i) => {
          const roundIndex = ROUNDS.length - 1 - i
          return (
            <RoundColumn
              key={`right-${round.phase}`}
              side="right"
              roundIndex={roundIndex}
              slots={right[roundIndex]}
              meta={round}
              matchesCountLabel={countLabel(round.phase, round.full)}
              onSelect={onSelect}
            />
          )
        })}
      </div>
    </div>
  )
}

export function BracketDetails({ match, onClose }) {
  if (!match) return null
  const p1 = match.player1?.pseudo || 'À déterminer'
  const p2 = match.player2?.pseudo || 'À déterminer'
  const winner = match.winner_id === match.player1_id ? p1 : match.winner_id === match.player2_id ? p2 : null
  const hasRetour = match.score1_retour != null || match.score2_retour != null
  const total1 = Number(match.score1 || 0) + Number(match.score1_retour || 0)
  const total2 = Number(match.score2 || 0) + Number(match.score2_retour || 0)
  return <div className="bracket-modal-backdrop" onMouseDown={onClose}>
    <div className="bracket-modal" onMouseDown={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><span className="eyebrow"><Trophy size={12}/> {match.round_label || 'Match final'}</span><h2 className="font-display text-3xl mt-2">Détails du match</h2></div><button onClick={onClose} className="bracket-close">×</button></div>
      <div className="detail-scoreboard"><div className={winner === p1 ? 'winner' : ''}><span>{p1}</span><strong>{match.status === 'completed' ? total1 : (match.score1 ?? '—')}</strong></div><div className="versus">VS</div><div className={winner === p2 ? 'winner' : ''}><span>{p2}</span><strong>{match.status === 'completed' ? total2 : (match.score2 ?? '—')}</strong></div></div>
      {hasRetour && (
        <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-ink-600">
          <div className="detail-stat"><span>Aller</span><strong>{match.score1 ?? '—'} - {match.score2 ?? '—'}</strong></div>
          <div className="detail-stat"><span>Retour</span><strong>{match.score1_retour ?? '—'} - {match.score2_retour ?? '—'}</strong></div>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3 mt-5">
        <div className="detail-stat"><Crosshair size={16}/><span>Dégâts J1</span><strong>{Number(match.damage1 || 0) + Number(match.damage1_retour || 0)}</strong></div>
        <div className="detail-stat"><Crosshair size={16}/><span>Dégâts J2</span><strong>{Number(match.damage2 || 0) + Number(match.damage2_retour || 0)}</strong></div>
        <div className="detail-stat"><Zap size={16}/><span>Règle</span><strong>{match.match_type === 'onetap' ? 'One Tap · Headshot Only' : 'Spam · Bodyshot'}</strong></div>
        <div className="detail-stat"><Clock3 size={16}/><span>État</span><strong>{match.status === 'completed' ? 'Terminé' : match.status === 'in_progress' ? 'En cours' : 'Programmé'}</strong></div>
        <div className="detail-stat"><CalendarClock size={16}/><span>Horaire</span><strong>{match.scheduled_at ? new Date(match.scheduled_at).toLocaleString('fr-FR') : 'À confirmer'}</strong></div>
        <div className="detail-stat"><Shield size={16}/><span>Vainqueur</span><strong>{winner || 'À déterminer'}</strong></div>
      </div>
      <p className="text-xs text-ink-600 mt-5">Le vainqueur est déterminé par le cumul des kills aller + retour, et propagé automatiquement au tour suivant lors de la validation.</p>
    </div>
  </div>
}