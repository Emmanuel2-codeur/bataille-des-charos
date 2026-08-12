import { useEffect, useState } from 'react'

function getTimeLeft(target) {
  const diff = Math.max(0, target - Date.now())
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export default function CountdownTimer({ targetDate = '2026-08-17T00:00:00' }) {
  const target = new Date(targetDate).getTime()
  const [t, setT] = useState(getTimeLeft(target))

  useEffect(() => {
    const id = setInterval(() => setT(getTimeLeft(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  const units = [
    { label: 'Jours', value: t.days },
    { label: 'Heures', value: t.hours },
    { label: 'Min', value: t.minutes },
    { label: 'Sec', value: t.seconds },
  ]

  return (
    <div className="flex gap-3">
      {units.map((u) => (
        <div key={u.label} className="w-16 md:w-20 rounded-xl bg-ink-900 border border-ink-700 py-3 text-center">
          <p className="font-mono font-bold text-xl md:text-2xl text-charo-orange">{String(u.value).padStart(2, '0')}</p>
          <p className="text-[10px] uppercase tracking-widest text-ink-600 mt-0.5">{u.label}</p>
        </div>
      ))}
    </div>
  )
}
