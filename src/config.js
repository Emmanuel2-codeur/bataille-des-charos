// Centralise les liens de navigation et les actions principales du site.
// Cela évite de disperser les routes dans plusieurs composants.
export const NAV_LINKS = [
  { to: '/', label: 'Accueil' },
  { to: '/matchs', label: 'Matchs programmés' },
  { to: '/groupes', label: 'Poules' },
  { to: '/classement', label: 'Classement' },
  { to: '/historique', label: 'Historique' },
]

export const HOME_ACTIONS = [
  { to: '/connexion', label: 'Rejoindre le tournoi', variant: 'primary' },
  { to: '/classement', label: 'Voir le classement', variant: 'default' },
  { to: '/matchs', label: 'Voir les matchs', variant: 'dark' },
  { to: '/annonces', label: 'Voir les annonces', variant: 'default' },
]

export const PAGE_LINKS = {
  matchs: '/matchs',
  classement: '/classement',
  bracket: '/bracket',
  annonces: '/annonces',
}

export const STORAGE_BUCKET = 'announcement-media'
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
