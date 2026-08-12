const ROUNDS = ['Huitièmes', 'Quarts', 'Demies', 'Finale']

function Slot({ name, score, isWinner }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
      isWinner ? 'bg-charo-orange/10 border border-charo-orange/40' : 'bg-ink-800 border border-ink-700'
    }`}>
      <span className={`text-xs font-semibold truncate ${isWinner ? 'text-charo-orange' : 'text-ink-950'}`}>{name ?? 'À déterminer'}</span>
      {score != null && <span className="font-mono text-xs text-ink-600 ml-2">{score}</span>}
    </div>
  )
}

function BracketMatch({ m }) {
  return (
    <div className="w-48 shrink-0 space-y-1.5">
      <Slot name={m.player1} score={m.score1} isWinner={m.winner === 1} />
      <Slot name={m.player2} score={m.score2} isWinner={m.winner === 2} />
    </div>
  )
}

export default function BracketTree({ rounds }) {
  // rounds: [{ label, matches: [{ player1, player2, score1, score2, winner }] }]
  const data = rounds ?? ROUNDS.map((label, ri) => ({
    label,
    matches: Array.from({ length: [8, 4, 2, 1][ri] }, () => ({ player1: null, player2: null, score1: null, score2: null, winner: null })),
  }))

  return (
    <div className="overflow-x-auto pb-4 -mx-5 px-5 snap-x snap-mandatory">
      <div className="flex gap-10 min-w-max">
        {data.map((round) => (
          <div key={round.label} className="snap-start">
            <p className="eyebrow mb-4">{round.label}</p>
            <div className="flex flex-col justify-around gap-8 h-full">
              {round.matches.map((m, i) => (
                <BracketMatch key={i} m={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
