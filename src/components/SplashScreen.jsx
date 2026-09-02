import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords } from 'lucide-react'
import logo from '../assets/logo.jpg'

const WORDMARK = 'LA BATAILLE DES CHAROS'

// Palette des tuiles façon "pins" Pinterest, assortie à la charte du site
const TILE_STYLES = [
  'bg-charo-gradient',
  'bg-ink-950',
  'bg-white border border-ink-950/10',
  'bg-charo-orange/15',
  'bg-charo-amber/20',
]

function buildGrid(cols, rows) {
  const tiles = []
  let seed = 42
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        id: `${r}-${c}`,
        col: c,
        row: r,
        h: 46 + Math.floor(rand() * 70), // hauteur variable -> effet "masonry"
        style: TILE_STYLES[Math.floor(rand() * TILE_STYLES.length)],
        // distance au centre = ordre d'apparition, comme des pins qui affluent
        delay: Math.hypot(c - (cols - 1) / 2, r - (rows - 1) / 2) * 0.045 + rand() * 0.05,
      })
    }
  }
  return tiles
}

export default function SplashScreen({ onFinish }) {
  const [phase, setPhase] = useState('grid') // grid -> logo -> exiting
  const [progress, setProgress] = useState(0)
  const cols = 8
  const rows = 6
  const tiles = useMemo(() => buildGrid(cols, rows), [])

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('logo'), 650)
    const start = performance.now()
    const DURATION = 1500
    let raf
    const tick = (now) => {
      const pct = Math.min(100, Math.round(((now - start) / DURATION) * 100))
      setProgress(pct)
      if (pct < 100) raf = requestAnimationFrame(tick)
      else setTimeout(() => setPhase('exiting'), 200)
    }
    raf = requestAnimationFrame(tick)
    return () => { clearTimeout(t1); cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => {
    if (phase !== 'exiting') return
    const t = setTimeout(onFinish, 680)
    return () => clearTimeout(t)
  }, [phase, onFinish])

  const exiting = phase === 'exiting'

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#FAFAF9]"
        initial={{ opacity: 1 }}
        animate={exiting ? { opacity: 0 } : { opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
      >
        {/* Mosaïque de tuiles façon masonry Pinterest, qui affluent vers le centre puis se dispersent en sortie */}
        <div
          className="absolute inset-0 grid gap-2.5 p-2.5"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        >
          {tiles.map((t) => {
            const centerCol = (cols - 1) / 2
            const centerRow = (rows - 1) / 2
            const dx = (t.col - centerCol) * 90
            const dy = (t.row - centerRow) * 90
            return (
              <motion.div
                key={t.id}
                className={`rounded-2xl ${t.style} shadow-sm`}
                style={{ height: `${t.h}%`, alignSelf: 'center' }}
                initial={{ opacity: 0, scale: 0.4, x: dx, y: dy }}
                animate={
                  exiting
                    ? { opacity: 0, scale: 0.5, x: dx * 1.6, y: dy * 1.6, transition: { duration: 0.55, delay: t.delay * 0.4, ease: 'easeIn' } }
                    : { opacity: phase === 'grid' ? [0, 0.9, 0.55] : 0.16, scale: 1, x: 0, y: 0 }
                }
                transition={{ duration: 0.7, delay: t.delay, ease: [0.34, 1.56, 0.64, 1] }}
              />
            )
          })}
        </div>

        {/* Voile pour lisibilité du contenu central */}
        <div className="absolute inset-0 bg-[#FAFAF9]/55" />

        {/* Contenu central */}
        <div className="relative z-10 flex flex-col items-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.3, rotate: -20 }}
            animate={
              phase === 'grid'
                ? { opacity: 0, scale: 0.3, rotate: -20 }
                : { opacity: 1, scale: exiting ? 1.4 : 1, rotate: 0 }
            }
            transition={{ duration: 0.65, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative w-24 h-24 sm:w-28 sm:h-28 mb-7"
          >
            <motion.div
              className="absolute inset-0 rounded-[28px] bg-charo-gradient opacity-70 blur-xl"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative w-full h-full rounded-[28px] overflow-hidden border-4 border-white shadow-[0_20px_60px_rgba(255,90,31,0.35)]">
              <img src={logo} alt="Guilde MÉCHANTCHARO" className="w-full h-full object-cover" />
            </div>
            <motion.div
              className="absolute -right-2.5 -bottom-2.5 w-9 h-9 rounded-2xl bg-charo-gradient flex items-center justify-center shadow-lg border-2 border-white"
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            >
              <Swords size={16} className="text-white" />
            </motion.div>
          </motion.div>

          <div className="overflow-hidden mb-6">
            <motion.div
              className="flex flex-wrap justify-center gap-x-[0.35em] max-w-xs sm:max-w-none"
              initial={{ y: '110%' }}
              animate={{ y: phase === 'grid' ? '110%' : 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              {WORDMARK.split(' ').map((word, wi) => (
                <span key={wi} className="flex">
                  {word.split('').map((ch, ci) => (
                    <span
                      key={ci}
                      className="font-display text-[13px] sm:text-base font-extrabold tracking-[0.28em] bg-clip-text text-transparent bg-charo-gradient"
                    >
                      {ch}
                    </span>
                  ))}
                </span>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'grid' ? 0 : 1 }}
            transition={{ delay: 0.15 }}
            className="w-48 sm:w-56"
          >
            <div className="h-[3px] w-full rounded-full bg-ink-950/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-charo-gradient relative overflow-hidden"
                style={{ width: `${progress}%` }}
              >
                <motion.span
                  className="absolute inset-y-0 w-8 bg-white/50"
                  animate={{ x: ['-2rem', '10rem'] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            </div>
            <p className="mt-3 text-center text-[10px] tracking-[0.35em] text-ink-600 font-semibold uppercase">
              Chargement {progress}%
            </p>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
