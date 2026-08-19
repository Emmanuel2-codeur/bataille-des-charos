import { useState } from 'react'
import { Mail, ShieldCheck, ChevronDown } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import logo from '../assets/logo.jpg'
import { signInWithEmail, signInWithGoogle } from '../lib/supabaseClient'

function GoogleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.87 2.69-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.94v2.33A8.997 8.997 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.71A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.71V4.96H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.04l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.997 8.997 0 0 0 .94 4.96l3.01 2.33C4.66 5.16 6.65 3.58 9 3.58Z" />
    </svg>
  )
}

export default function Login() {
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    const { error: authError } = await signInWithGoogle()
    if (authError) {
      setError(authError.message)
      setGoogleLoading(false)
    }
    // en cas de succès, Supabase redirige vers Google puis /profil — pas besoin de reset le loading ici.
  }

  const handleEmailSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSent(false)
    setSending(true)

    const { error: authError } = await signInWithEmail(email)

    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }

    setSending(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      <section className="flex-1 flex items-center justify-center py-16 bg-radial-glow">
        <div className="card p-9 md:p-12 max-w-md w-full mx-5">
          <img
            src={logo}
            alt="Guilde Méchantcharo"
            className="w-16 h-16 rounded-full object-cover mx-auto mb-6 ring-2 ring-charo-orange/60"
          />

          <div className="text-center">
            <span className="eyebrow mb-4">Inscription joueur</span>
            <h1 className="font-display text-3xl mb-2 text-ink-950">
              Rejoindre le tournoi
            </h1>
            <p className="text-ink-600 text-sm mb-8 leading-relaxed">
              Connecte-toi avec ton compte Google. C'est instantané, et ton
              inscription sera ensuite validée par l'administration de la guilde.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-ink-700 bg-white px-6 py-3.5 font-bold text-ink-950 shadow-card hover:border-ink-950/20 hover:shadow-card-lg active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <GoogleGlyph />
            {googleLoading ? 'Redirection vers Google…' : 'Continuer avec Google'}
          </button>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowEmail((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-950 transition-colors"
            >
              Continuer avec mon email à la place
              <ChevronDown size={14} className={`transition-transform ${showEmail ? 'rotate-180' : ''}`} />
            </button>

            {showEmail && (
              <form onSubmit={handleEmailSubmit} className="mt-5 space-y-4">
                <label className="block text-left">
                  <span className="block text-sm font-semibold text-ink-950 mb-2">
                    Adresse email
                  </span>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="joueur@email.com"
                      className="w-full rounded-xl border border-ink-700 pl-10 pr-4 py-3.5 outline-none focus:border-charo-orange"
                    />
                  </div>
                </label>

                <button type="submit" disabled={sending} className="btn-outline w-full">
                  {sending ? 'Envoi en cours…' : 'Recevoir mon lien de connexion'}
                </button>
              </form>
            )}
          </div>

          {sent && (
            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <strong>Vérifie ta boîte mail.</strong> Un lien de connexion vient de
              t’être envoyé. Après avoir cliqué dessus, tu seras redirigé vers ton profil.
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-600">
            <ShieldCheck size={13} /> Authentification sécurisée via Supabase Auth
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
