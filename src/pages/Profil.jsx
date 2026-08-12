import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { signOut, supabase } from '../lib/supabaseClient'

export default function Profil() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [pseudo, setPseudo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData.session) {
        if (mounted) {
          setError('Aucune session active. Retourne à la page de connexion.')
          setLoading(false)
        }
        return
      }

      const currentSession = sessionData.session
      if (mounted) setSession(currentSession)

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, pseudo, ff_uid, role, status, total_points, total_damage, wins, losses, groups(name)')
        .eq('id', currentSession.user.id)
        .single()

      if (profileError) {
        if (mounted) setError(profileError.message)
      } else if (mounted) {
        setProfile(data)
        setPseudo(data.pseudo || '')
      }

      if (mounted) setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [])

  const saveProfile = async (event) => {
    event.preventDefault()
    const cleanPseudo = pseudo.trim()

    if (cleanPseudo.length < 3) {
      setError('Ton pseudo doit contenir au moins 3 caractères.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({ pseudo: cleanPseudo })
      .eq('id', session.user.id)
      .select('id, pseudo, ff_uid, role, status, total_points, total_damage, wins, losses, groups(name)')
      .single()

    if (updateError) {
      setError(
        updateError.code === '23505'
          ? 'Ce pseudo est déjà utilisé. Choisis-en un autre.'
          : updateError.message
      )
    } else {
      setProfile(data)
      setPseudo(data.pseudo)
      setMessage('Ton pseudo a bien été enregistré. Il reste en attente de validation par l’administration.')
    }

    setSaving(false)
  }

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/connexion'
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      <main className="flex-1 py-14 lg:py-20">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <div className="mb-8">
            <span className="eyebrow mb-4"><UserRound size={13} /> Mon profil</span>
            <h1 className="font-display text-4xl md:text-5xl text-ink-950 mb-3">
              Prépare ton inscription
            </h1>
            <p className="text-ink-600">
              Ton email identifie ton compte. Le pseudo que tu renseignes sera utilisé
              dans le classement après validation par l’administration.
            </p>
          </div>

          {loading && (
            <div className="card p-8 flex items-center justify-center gap-3 text-ink-600">
              <LoaderCircle className="animate-spin" size={20} /> Chargement du profil…
            </div>
          )}

          {!loading && !session && (
            <div className="card p-8">
              <p className="text-ink-600">{error}</p>
              <a href="/connexion" className="btn-primary mt-5">Se connecter</a>
            </div>
          )}

          {!loading && session && profile && (
            <div className="space-y-6">
              <form onSubmit={saveProfile} className="card p-6 md:p-8">
                <label className="block">
                  <span className="block text-sm font-bold text-ink-950 mb-2">Ton pseudo</span>
                  <input
                    value={pseudo}
                    onChange={(event) => setPseudo(event.target.value)}
                    minLength={3}
                    maxLength={30}
                    required
                    className="w-full rounded-xl border border-ink-700 px-4 py-3.5 outline-none focus:border-charo-orange"
                    placeholder="Ex. CHARO_X"
                  />
                </label>

                <p className="mt-3 text-xs text-ink-600">
                  Email connecté : {session.user.email}
                </p>

                <button type="submit" disabled={saving} className="btn-primary mt-6">
                  {saving ? 'Enregistrement…' : 'Enregistrer mon pseudo'}
                </button>
              </form>

              <div className="card p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-charo-orange/10 text-charo-orange flex items-center justify-center">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-ink-950">Statut de l’inscription</h2>
                    <p className="text-sm text-ink-600 mt-1">
                      {profile.status === 'approved'
                        ? 'Ton inscription est validée. Tu apparais dans le classement.'
                        : profile.status === 'rejected'
                          ? 'Ton inscription a été refusée. Contacte l’administration.'
                          : 'Ton inscription est en attente. Elle apparaîtra dans le classement après approbation.'}
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-charo-orange/10 px-3 py-1.5 text-sm font-bold text-charo-orange">
                      {profile.status === 'approved' && <CheckCircle2 size={15} />}
                      {profile.status === 'approved' ? 'Approuvé' : profile.status === 'rejected' ? 'Refusé' : 'En attente'}
                    </div>
                  </div>
                </div>
              </div>

              {message && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{message}</div>}
              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

              <button type="button" onClick={handleSignOut} className="btn-outline">
                <LogOut size={16} /> Se déconnecter
              </button>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
