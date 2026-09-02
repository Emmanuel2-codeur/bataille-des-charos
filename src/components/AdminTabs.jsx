import { motion } from 'framer-motion'

export default function AdminTabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-10 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
      {tabs.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative shrink-0 flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition-colors ${
              isActive
                ? 'border-transparent text-white'
                : 'border-ink-700 text-ink-600 hover:text-charo-orange hover:border-charo-orange/40 bg-white'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="admin-tab-bg"
                className="absolute inset-0 rounded-2xl bg-charo-gradient shadow-glow"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.badge > 0 && (
                <span className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] flex items-center justify-center font-extrabold ${
                  isActive ? 'bg-white/25 text-white' : 'bg-charo-orange/15 text-charo-orange'
                }`}>
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
