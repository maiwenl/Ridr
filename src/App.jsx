import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom'
import {AuthProvider} from './contexts/AuthContext'
import {SaisonProvider} from './contexts/SaisonContext'
import ProtectedRoute, {RequireRole} from './components/ProtectedRoute'
import Layout from './components/Layout'

import Login from './pages/Login'
import InscriptionPublique from './pages/InscriptionPublique'
import Dashboard from './pages/Dashboard'
import Adhesions from './pages/Adhesions'
import NouvelAdherent from './pages/NouvelAdherent'
import FicheAdherent from './pages/FicheAdherent'
import Cours from './pages/Cours'
import Parametres from './pages/Parametres'
import Pointage from './pages/Pointage'
import Utilisateurs from './pages/Utilisateurs'
import MonCentre from './pages/MonCentre'

export default function App() {
    return (
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AuthProvider>
                <SaisonProvider>
                    <Routes>
                        {/* Pages publiques */}
                        <Route path="/login" element={<Login/>}/>
                        <Route path="/inscription" element={<InscriptionPublique/>}/>
                        <Route path="/inscription/:slug" element={<InscriptionPublique/>}/>

                        {/* Pages protégées — tous les rôles connectés */}
                        <Route element={<ProtectedRoute/>}>
                            <Route element={<Layout/>}>
                                <Route path="/adhesions" element={<Adhesions/>}/>
                                <Route path="/adherents/:id" element={<FicheAdherent/>}/>
                                <Route path="/cours" element={<Cours/>}/>
                                <Route path="/pointage" element={<Pointage/>}/>
                            </Route>
                        </Route>

                        {/* Pages réservées gérant uniquement */}
                        <Route element={<RequireRole roles={['gérant']}/>}>
                            <Route element={<Layout/>}>
                                <Route path="/dashboard" element={<Dashboard/>}/>
                                <Route path="/adhesions/nouveau" element={<NouvelAdherent/>}/>
                                <Route path="/utilisateurs" element={<Utilisateurs/>}/>
                                <Route path="/parametres" element={<Parametres/>}/>
                                <Route path="/mon-centre" element={<MonCentre/>}/>
                            </Route>
                        </Route>

                        {/* Redirections */}
                        <Route path="/" element={<Navigate to="/adhesions" replace/>}/>
                        <Route path="*" element={<Navigate to="/adhesions" replace/>}/>
                    </Routes>
                </SaisonProvider>
            </AuthProvider>
        </BrowserRouter>
    )
}
