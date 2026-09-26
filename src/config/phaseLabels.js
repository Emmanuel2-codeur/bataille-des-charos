// Un seul endroit pour les noms de phase. Si un tour est renommé un jour,
// c'est ICI et seulement ici que ça se change — tous les écrans (Admin,
// Finalistes, Bracket, Matchs, Historique) l'importent.

export const FINAL_PHASES = ['trente_deuxieme', 'seizieme', 'quart', 'demie', 'finale']

export const FINAL_PHASE_COUNTS = { trente_deuxieme: 16, seizieme: 8, quart: 4, demie: 2, finale: 1 }

export const PHASE_LABELS = {
  poule: 'Poule',
  trente_deuxieme: '16ème de finale',
  seizieme: 'Huitième de finale',
  quart: 'Quart de finale',
  demie: 'Demi-finale',
  finale: 'Finale',
}

export const PHASE_SHORT_LABELS = {
  poule: 'Poule',
  trente_deuxieme: '16èmes',
  seizieme: 'Huitièmes',
  quart: 'Quarts',
  demie: 'Demies',
  finale: 'Finale',
}

export function phaseLabel(phase) {
  return PHASE_LABELS[phase] || phase
}

export function phaseShortLabel(phase) {
  return PHASE_SHORT_LABELS[phase] || phase
}

export function isFinalPhase(phase) {
  return FINAL_PHASES.includes(phase)
}