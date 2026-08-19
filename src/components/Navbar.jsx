import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X, Swords, ShieldCheck, UserRound, LogOut } from 'lucide-react'
import NotificationCenter from './NotificationCenter'
import logo from '../assets/logo.jpg'
import { useAuth } from '../lib/AuthContext'
import { NAV_LINKS } from '../config'
import { signOut } from '../lib/supabaseClient'

const links = NAV_LINKS


export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { session, profile, isAdmin } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/'
  }

  return (
    <header className="sticky top-0 z-50 border-b border-ink-700 bg-white/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="Guilde MÉCHANTCHARO" className="w-8 h-8 rounded-full object-cover ring-2 ring-charo-orange/60" />
          <div className="leading-none">
            <p className="font-display text-lg tracking-wide text-ink-950">BATAILLE <span className="text-charo-orange">DES CHAROS</span></p>
            <p className="text-[10px] uppercase tracking-[0.25em] text-ink-600 text-opacity-80">Guilde Méchantcharo</p>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `text-sm font-semibold tracking-wide transition-colors ${
                  isActive ? 'text-charo-orange' : 'text-ink-600 hover:text-ink-950'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          {session && <NotificationCenter />}
          {isAdmin && (
            <Link to="/admin" className="btn-outline !px-4 !py-2 text-xs">
              <ShieldCheck size={14} /> Admin
            </Link>
          )}

          {session ? (
            <div className="flex items-center gap-2">
              <Link to="/profil" className="flex items-center gap-2 rounded-xl border border-ink-700 px-3.5 py-2 text-sm font-semibold text-ink-950 hover:border-charo-orange transition-colors">
                <UserRound size={16} className="text-charo-orange" />
                {profile?.pseudo || 'Mon profil'}
                {profile?.status === 'pending' && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">En attente</span>
                )}
              </Link>
              <button onClick={handleSignOut} className="w-9 h-9 rounded-xl border border-ink-700 flex items-center justify-center text-ink-600 hover:text-red-600 hover:border-red-200 transition-colors" aria-label="Se déconnecter">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link to="/connexion" className="btn-primary !px-5 !py-2.5 text-sm">
              <Swords size={16} strokeWidth={2.5} />
              Rejoindre le tournoi
            </Link>
          )}
        </div>

        <button className="lg:hidden text-ink-950" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X size={26} /> : <Menu size={26} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-ink-700 bg-white px-5 py-6 flex flex-col gap-5">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)} className="text-ink-950 font-semibold text-base">
              {l.label}
            </NavLink>
          ))}

          {session && (
            <div className="pt-2 border-t border-ink-700">
              <NotificationCenter />
            </div>
          )}

          {isAdmin && (
            <Link to="/admin" onClick={() => setOpen(false)} className="text-charo-orange font-semibold text-base flex items-center gap-2">
              <ShieldCheck size={16} /> Admin
            </Link>
          )}

          {session ? (
            <>
              <Link to="/profil" onClick={() => setOpen(false)} className="btn-outline w-full">
                <UserRound size={16} /> {profile?.pseudo || 'Mon profil'}
              </Link>
              <button onClick={handleSignOut} className="btn-outline w-full text-red-600 border-red-200">
                <LogOut size={16} /> Se déconnecter
              </button>
            </>
          ) : (
            <Link to="/connexion" onClick={() => setOpen(false)} className="btn-primary w-full mt-2">
              <Swords size={16} /> Rejoindre le tournoi
            </Link>
          )}
        </div>
      )}
    </header>
  )
}
