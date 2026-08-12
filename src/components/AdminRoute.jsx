import { Navigate } from 'react-router-dom'
import { LoaderCircle, ShieldAlert } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import Navbar from './Navbar'
import Footer from './Footer'

export default function AdminRoute({ children }) {
  const { session, profile, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Navbar />
        <div className="flex-1 flex items-center justify-center py-24 text-ink-600 gap-3">
          <LoaderCircle className="animate-spin" size={20} /> Vérification des droits d’accès…
        </div>
        <Footer />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/connexion" replace />
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Navbar />
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="card p-10 max-w-md text-center mx-5">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-5">
              <ShieldAlert size={26} />
            </div>
            <h1 className="font-display text-2xl text-ink-950 mb-2">Accès refusé</h1>
            <p className="text-sm text-ink-600 leading-relaxed">
              Cet espace est réservé aux comptes administrateurs de la guilde MÉCHANTCHARO.
              {profile?.status === 'pending' && ' Ton inscription est encore en attente de validation.'}
            </p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return children
}
