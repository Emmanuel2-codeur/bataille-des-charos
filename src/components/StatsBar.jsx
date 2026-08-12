import { Users, LayoutGrid, Trophy, Gamepad2 } from 'lucide-react'

const stats = [
  { icon: Users, value: '40+', label: 'Joueurs' },
  { icon: LayoutGrid, value: '10', label: 'Groupes' },
  { icon: Gamepad2, value: '60+', label: 'Matchs de poules' },
  { icon: Trophy, value: 'Top 32', label: 'Phases finales' },
]

export default function StatsBar() {
  return (
    <div className="card px-6 py-6 md:px-10 md:py-7 flex flex-wrap items-center justify-between gap-6">
      {stats.map(({ icon: Icon, value, label }) => (
        <div key={label} className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-charo-orange/10 border border-charo-orange/30 flex items-center justify-center text-charo-orange">
            <Icon size={19} />
          </div>
          <div className="leading-tight">
            <p className="font-display text-xl text-ink-950">{value}</p>
            <p className="text-xs text-ink-600 uppercase tracking-wide">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
