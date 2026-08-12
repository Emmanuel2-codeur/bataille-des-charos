import { Flame } from 'lucide-react'

export default function GroupTable({ name, players = [] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-charo-gradient flex items-center justify-center font-display text-ink-950 text-sm">
            {name}
          </div>
          <p className="font-semibold text-ink-950">Groupe {name}</p>
        </div>
        <span className="text-[11px] text-ink-600 uppercase tracking-wide">Championnat</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-600 text-xs uppercase tracking-wide">
            <th className="text-left font-medium pb-2">#</th>
            <th className="text-left font-medium pb-2">Joueur</th>
            <th className="text-right font-medium pb-2">Pts</th>
            <th className="text-right font-medium pb-2">Dmg</th>
          </tr>
        </thead>
        <tbody>
          {players.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-ink-600 text-xs">Aucun joueur inscrit dans ce groupe pour l'instant.</td></tr>
          )}
          {players.map((p, i) => (
            <tr key={p.pseudo} className={`border-t border-ink-700 ${i < 2 ? 'text-ink-950' : 'text-ink-600'}`}>
              <td className="py-2.5 flex items-center gap-1.5">
                {i === 0 && <Flame size={13} className="text-charo-orange" />}
                {i + 1}
              </td>
              <td className="py-2.5 font-semibold">{p.pseudo}</td>
              <td className="py-2.5 text-right font-mono">{p.points}</td>
              <td className="py-2.5 text-right font-mono">{p.damage}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-ink-600 mt-3">Top 2 qualifiables · 1er qualifié d'office</p>
    </div>
  )
}
