import { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
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
import SplashScreen from './components/SplashScreen'
import PageTransition from './components/PageTransition'

export default function App() {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('charos_splash_seen'))
  const location = useLocation()

  const finishSplash = () => {
    sessionStorage.setItem('charos_splash_seen', '1')
    setShowSplash(false)
  }

  if (showSplash) {
    return <SplashScreen onFinish={finishSplash} />
  }

  return (
    <>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
          <Route path="/dashboard" element={<Navigate to="/matchs" replace />} />
          <Route path="/groupes" element={<PageTransition><Groupes /></PageTransition>} />
          <Route path="/bracket" element={<PageTransition><Bracket /></PageTransition>} />
          <Route path="/reglement" element={<PageTransition><Reglement /></PageTransition>} />
          <Route path="/classement" element={<PageTransition><Classement /></PageTransition>} />
          <Route path="/historique" element={<PageTransition><Historique /></PageTransition>} />
          <Route path="/connexion" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/profil" element={<PageTransition><Profil /></PageTransition>} />
          <Route path="/matchs" element={<PageTransition><Matchs /></PageTransition>} />
          <Route path="/annonces" element={<PageTransition><Annonces /></PageTransition>} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <PageTransition><Admin /></PageTransition>
              </AdminRoute>
            }
          />
        </Routes>
      </AnimatePresence>
      <BackToTop />
    </>
  )
}
