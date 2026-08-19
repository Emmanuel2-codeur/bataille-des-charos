import { Link } from 'react-router-dom'
import { Instagram, MessageCircle, Swords } from 'lucide-react'
import logo from '../assets/logo.jpg'

function TikTokIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15.5 4.2c.7 2 2 3.2 4.5 3.3v3.1c-1.7 0-3.2-.5-4.5-1.4v6.1a5.7 5.7 0 1 1-4.9-5.65v3.2a2.55 2.55 0 1 0 1.8 2.45V4.2h3.1Z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function Footer() {
  return (
    <footer className="border-t border-ink-700 bg-white">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <img src={logo} alt="Logo" className="w-10 h-10 rounded-full object-cover ring-2 ring-charo-orange/60" />
            <p className="font-display text-ink-950 tracking-wide">MÉCHANTCHARO</p>
          </div>
          <p className="text-sm text-ink-600 leading-relaxed">
            La Bataille des Charos — tournoi 1v1 Free Fire organisé par la guilde MÉCHANTCHARO.
            40 joueurs. 10 groupes. Un seul vainqueur.
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-charo-orange mb-4">Tournoi</p>
          <ul className="space-y-2.5 text-sm text-ink-600">
            <li><Link to="/matchs" className="hover:text-ink-950 transition-colors">Matchs programmés</Link></li>
            <li><Link to="/groupes" className="hover:text-ink-950 transition-colors">Phase de poules</Link></li>
            <li><Link to="/bracket" className="hover:text-ink-950 transition-colors">Arbre final</Link></li>
            <li><Link to="/classement" className="hover:text-ink-950 transition-colors">Classement</Link></li>
            <li><Link to="/annonces" className="hover:text-ink-950 transition-colors">Annonces</Link></li>
            <li><Link to="/reglement" className="hover:text-ink-950 transition-colors">Règlement complet</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-charo-orange mb-4">Infos</p>
          <ul className="space-y-2.5 text-sm text-ink-600">
            <li>17 Août – 10 Octobre 2026</li>
            <li>Format Solo 1v1</li>
            <li>Free Fire — Aller/Retour</li>
            <li>One Tap & Spam</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-charo-orange mb-4">Suivre la guilde</p>
          <div className="flex gap-3">
            <a href="https://www.instagram.com/mechantcharo1/" aria-label="Instagram" className="w-10 h-10 rounded-full border border-ink-700 flex items-center justify-center text-ink-600 hover:text-charo-orange hover:border-charo-orange transition-colors">
              <Instagram size={17} />
            </a>
            <a href="https://www.tiktok.com/@mechantcharo4" aria-label="TikTok" className="w-10 h-10 rounded-full border border-ink-700 flex items-center justify-center text-ink-600 hover:text-charo-orange hover:border-charo-orange transition-colors">
              <TikTokIcon />
            </a>
            <a href="https://wa.me/22890808584" aria-label="Communauté" className="w-10 h-10 rounded-full border border-ink-700 flex items-center justify-center text-ink-600 hover:text-charo-orange hover:border-charo-orange transition-colors">
              <MessageCircle size={17} />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-ink-700">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-ink-600">
          <p>© 2026 Guilde MÉCHANTCHARO. Tous droits réservés.</p>
          <p className="flex items-center gap-1.5"><Swords size={13} /> Développé par Emmanuel-Dev</p>
        </div>
      </div>
    </footer>
  )
}
