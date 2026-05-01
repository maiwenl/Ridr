import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useCours(saisonId = null) {
  const [cours, setCours]     = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCours = useCallback(async () => {
    let coursQuery = supabase
      .from('cours')
      .select('*, moniteur:moniteur_id(id, nom, prenom)')
      .order('jour')
      .order('heure_debut')

    if (saisonId) coursQuery = coursQuery.eq('saison_id', saisonId)

    // Inscrits = adhesions (pas adherents directement)
    let inscritsQuery = supabase.from('adhesions').select('cours_id').not('cours_id', 'is', null)
    if (saisonId) inscritsQuery = inscritsQuery.eq('saison_id', saisonId)

    const [{ data: coursData, error }, { data: inscritsData }] = await Promise.all([
      coursQuery,
      inscritsQuery,
    ])

    if (error) { console.error('useCours error:', error); setLoading(false); return }

    if (coursData) {
      const counts = {}
      inscritsData?.forEach(a => {
        counts[a.cours_id] = (counts[a.cours_id] || 0) + 1
      })
      setCours(
        coursData.map(c => ({
          ...c,
          inscrits:        counts[c.id] || 0,
          placesRestantes: c.capacite - (counts[c.id] || 0),
        }))
      )
    }
    setLoading(false)
  }, [saisonId])

  useEffect(() => { fetchCours() }, [fetchCours])

  return { cours, loading, refetch: fetchCours }
}
