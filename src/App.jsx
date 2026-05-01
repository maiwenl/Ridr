import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { SaisonProvider } from './contexts/SaisonContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

import Login from './pages/Login'
import InscriptionPublique from './pages/InscriptionPublique'
import Adhesions from './pages/Adhesions'
import NouvelAdherent from './pages/NouvelAdherent'
import FicheAdherent from './pages/FicheAdherent'
import Cours from './pages/Cours'
import Parametres from './pages/Parametres'
import Pointage from './pages/Pointage'
import Utilisateurs from './pages/Utilisateurs'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <SaisonProvider>
          <Routes>
            {/* Pages publiques */}
            <Route path="/login" element={<Login />} />
            <Route path="/inscription" element={<InscriptionPublique />} />

            {/* Pages protégées */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/adhesions" element={<Adhesions />} />
                <Route path="/adhesions/nouveau" element={<NouvelAdherent />} />
                <Route path="/adhesions/:id" element={<FicheAdherent />} />
                <Route path="/cours" element={<Cours />} />
                <Route path="/pointage" element={<Pointage />} />
                <Route path="/utilisateurs" element={<Utilisateurs />} />
                <Route path="/parametres" element={<Parametres />} />
              </Route>
            </Route>

            {/* Redirections */}
            <Route path="/" element={<Navigate to="/adhesions" replace />} />
            <Route path="*" element={<Navigate to="/adhesions" replace />} />
          </Routes>
        </SaisonProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
