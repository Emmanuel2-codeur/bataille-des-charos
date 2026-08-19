import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Groupes from './pages/Groupes'
import Bracket from './pages/Bracket'
import Reglement from './pages/Reglement'
import Login from './pages/Login'
import Admin from './pages/Admin'
import Classement from './pages/Classement'
import Historique from './pages/Historique'
import Profil from './pages/Profil'
import AdminRoute from './components/AdminRoute'
import Matchs from './pages/Matchs'
import Annonces from './pages/Annonces'
import BackToTop from './components/BackToTop'

export default function App() {
  return (
    <>
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Navigate to="/matchs" replace />} />
      <Route path="/groupes" element={<Groupes />} />
      <Route path="/bracket" element={<Bracket />} />
      <Route path="/reglement" element={<Reglement />} />
      <Route path="/classement" element={<Classement />} />
      <Route path="/historique" element={<Historique />} />
      <Route path="/connexion" element={<Login />} />
      <Route path="/profil" element={<Profil />} />
      <Route path="/matchs" element={<Matchs />} />
      <Route path="/annonces" element={<Annonces />} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <Admin />
          </AdminRoute>
        }
      />
    </Routes>
    <BackToTop />
    </>
  )
}
