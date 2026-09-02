import { motion } from 'framer-motion'

/**
 * Anime l'apparition d'un élément quand il entre dans le viewport (une seule
 * fois). Utilisé pour faire "vivre" les grilles de cartes (matchs, joueurs,
 * poules…) façon Pinterest : légère montée + fondu, en cascade via `index`.
 *
 * Usage :
 *   <Reveal index={i}><MatchCard ... /></Reveal>
 */
export function Reveal({ children, index = 0, className = '', y = 18, once = true }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.15 }}
      transition={{ duration: 0.45, delay: Math.min(index, 10) * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Variante "hover lift" : légère élévation + zoom au survol, pour les
 * cartes cliquables (cartes de match, de joueur, d'annonce…).
 */
export function HoverLift({ children, className = '' }) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -6, scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
    >
      {children}
    </motion.div>
  )
}

export default Reveal
