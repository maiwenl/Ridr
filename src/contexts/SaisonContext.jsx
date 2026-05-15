import {createContext, useCallback, useContext, useEffect, useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAuth} from './AuthContext'

const SaisonContext = createContext(null)

const STORAGE_KEY = 'stableconnect_saison_id'

export function SaisonProvider({children}) {
    const {clubId} = useAuth()
    const [saisons, setSaisons] = useState([])
    const [saisonCourante, setSaisonCourante] = useState(null)
    const [loading, setLoading] = useState(true)

    const fetchSaisons = useCallback(async () => {
        if (!clubId) {
            setLoading(false);
            return []
        }

        const {data} = await supabase
            .from('seasons')
            .select('*')
            .eq('club_id', clubId)
            .order('start_year', {ascending: false})

        if (!data?.length) {
            setLoading(false);
            return data ?? []
        }

        setSaisons(data)

        // Essaie de restaurer la saison depuis localStorage
        const savedId = localStorage.getItem(STORAGE_KEY)
        const saved = savedId ? data.find(s => s.id === savedId) : null

        // Par défaut : saison active, sinon la plus récente
        const active = data.find(s => s.active) ?? data[0]
        setSaisonCourante(prev => prev ?? saved ?? active)

        setLoading(false)
        return data
    }, [clubId])

    useEffect(() => {
        fetchSaisons()
    }, [fetchSaisons])

    function choisirSaison(saison) {
        setSaisonCourante(saison)
        if (saison?.id) localStorage.setItem(STORAGE_KEY, saison.id)
    }

    async function creerSaison(anneeDebut) {
        const name = `${anneeDebut}-${anneeDebut + 1}`
        const {data, error} = await supabase
            .from('seasons')
            .insert({name, start_year: anneeDebut, end_year: anneeDebut + 1, active: false, club_id: clubId})
            .select()
            .single()
        if (error) throw error
        await fetchSaisons()
        return data
    }

    async function setActive(saisonId) {
        // Désactiver toutes puis activer la choisie
        await supabase.from('seasons').update({active: false}).eq('club_id', clubId).neq('id', saisonId)
        await supabase.from('seasons').update({active: true}).eq('id', saisonId)
        await fetchSaisons()
    }

    async function supprimerSaison(saisonId) {
        // Vérifie que la saison est vide (aucune inscription, aucune activité)
        const [{count: nbInscriptions}, {count: nbActivites}] = await Promise.all([
            supabase.from('enrollments').select('id', {count: 'exact', head: true}).eq('season_id', saisonId),
            supabase.from('activities').select('id', {count: 'exact', head: true}).eq('season_id', saisonId),
        ])
        if ((nbInscriptions ?? 0) > 0 || (nbActivites ?? 0) > 0) {
            throw new Error(
                `Cette saison n'est pas vide : ${nbInscriptions ?? 0} inscription(s) et ${nbActivites ?? 0} activité(s).`
            )
        }
        const {error} = await supabase.from('seasons').delete().eq('id', saisonId)
        if (error) throw error
        // Si c'était la saison courante, la réinitialiser
        if (saisonCourante?.id === saisonId) {
            localStorage.removeItem(STORAGE_KEY)
            setSaisonCourante(null)
        }
        await fetchSaisons()
    }

    return (
        <SaisonContext.Provider value={{
            saisons,
            saisonCourante,
            choisirSaison,
            creerSaison,
            setActive,
            supprimerSaison,
            refreshSaisons: fetchSaisons,
            loading,
        }}>
            {children}
        </SaisonContext.Provider>
    )
}

export function useSaison() {
    const ctx = useContext(SaisonContext)
    if (!ctx) throw new Error('useSaison doit être utilisé dans un SaisonProvider')
    return ctx
}
