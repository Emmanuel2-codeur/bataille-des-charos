import { Crosshair, Target, Clock } from 'lucide-react'

function PlayerRow({ name, score, damage, isWinner }) {
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <div className={`flex items-center justify-between py-2.5 ${isWinner ? 'opacity-100' : 'opacity-90'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
          isWinner ? 'bg-charo-gradient text-ink-950' : 'bg-ink-800 text-ink-600 border border-ink-700'
        }`}>
          {initials}
        </div>
        <p className="font-semibold text-ink-950 truncate">{name}</p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {damage != null && <span className="text-xs text-ink-600 hidden sm:block">{damage} dmg</span>}
        <span className={`font-display text-lg w-8 text-right ${isWinner ? 'text-charo-orange' : 'text-ink-950'}`}>{score}</span>
      </div>
    </div>
  )
}

export default function MatchCard({ match }) {
  const {
    player1 = 'Joueur 1', player2 = 'Joueur 2',
    score1 = 0, score2 = 0, damage1, damage2,
    status = 'scheduled', matchType = 'onetap', roundLabel, scheduledAt,
  } = match

  const winner1 = status === 'completed' && score1 > score2
  const winner2 = status === 'completed' && score2 > score1

  return (
    <div className="card p-5 relative overflow-hidden hover:border-charo-orange/50 transition-colors">
      {status === 'in_progress' && <div className="absolute inset-x-0 top-0 h-0.5 bg-live animate-pulse" />}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-ink-600 uppercase tracking-wide">{roundLabel}</span>
        {status === 'in_progress' ? (
          <span className="badge-in-progress"><span className="w-1.5 h-1.5 rounded-full bg-live animate-ping" />En cours</span>
        ) : status === 'completed' ? (
          <span className="text-xs font-bold text-ink-600 uppercase tracking-wide">Terminé</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-600">
            <Clock size={12} /> {scheduledAt}
          </span>
        )}
      </div>

      <div className="divide-y divide-ink-700">
        <PlayerRow name={player1} score={score1} damage={damage1} isWinner={winner1} />
        <PlayerRow name={player2} score={score2} damage={damage2} isWinner={winner2} />
      </div>

      <div className="mt-4 pt-3 border-t border-ink-700 flex items-center gap-2 text-xs font-semibold text-ink-600">
        {matchType === 'onetap' ? <Crosshair size={13} className="text-charo-orange" /> : <Target size={13} className="text-charo-orange" />}
        {matchType === 'onetap' ? 'One Tap · Headshot Only' : 'Spam · Bodyshot'}
      </div>
    </div>
  )
}
