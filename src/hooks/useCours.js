import {useCallback, useEffect, useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'

/**
 * Charge les activités depuis la table `activities`.
 * @param {string|null} saisonId  - filtre par saison
 * @param {string|null} typeFilter - filtre par type d'activité ('cours_regulier', 'stage', …)
 * Retourne { cours, loading, refetch } — le nom `cours` est conservé pour la compatibilité
 * avec les composants existants ; les données viennent bien de la table `activities`.
 */
export function useCours(saisonId = null, typeFilter = null) {
    const {clubId} = useAuth()
    const [cours, setCours] = useState([])
    const [loading, setLoading] = useState(true)

    const fetchCours = useCallback(async () => {
        if (!clubId) {
            setLoading(false);
            return
        }

        let activitesQuery = supabase
            .from('activities')
            .select('*, instructor:instructor_id(id, last_name, first_name), rate:rate_id(*)')
            .eq('club_id', clubId)
            .order('jour')
            .order('start_time')

        if (saisonId) activitesQuery = activitesQuery.eq('season_id', saisonId)
        if (typeFilter) activitesQuery = activitesQuery.eq('type', typeFilter)

        // Inscrits = enrollments ayant un activity_id (par saison)
        let inscritsQuery = supabase
            .from('enrollments')
            .select('activity_id')
            .eq('club_id', clubId)
            .not('activity_id', 'is', null)
        if (saisonId) inscritsQuery = inscritsQuery.eq('season_id', saisonId)

        const [{data: activitesData, error}, {data: inscritsData}] = await Promise.all([
            activitesQuery,
            inscritsQuery,
        ])

        if (error) {
            console.error('useCours error:', error);
            setLoading(false);
            return
        }

        if (activitesData) {
            const counts = {}
            inscritsData?.forEach(a => {
                counts[a.activity_id] = (counts[a.activity_id] || 0) + 1
            })
            setCours(
                activitesData.map(c => ({
                    ...c,
                    inscrits: counts[c.id] || 0,
                    placesRestantes: c.capacite != null ? c.capacite - (counts[c.id] || 0) : null,
                    // Keep legacy field aliases for existing components
                    heure_debut: c.start_time,
                    heure_fin: c.end_time,
                    date_debut: c.start_date,
                    date_fin: c.end_date,
                    moniteur: c.instructor ? {
                        ...c.instructor,
                        nom: c.instructor.last_name,
                        prenom: c.instructor.first_name
                    } : null,
                    tarif: c.rate,
                    tarif_stage_id: c.rate_id,
                }))
            )
        }
        setLoading(false)
    }, [clubId, saisonId, typeFilter])

    useEffect(() => {
        fetchCours()
    }, [fetchCours])

    return {cours, loading, refetch: fetchCours}
}
