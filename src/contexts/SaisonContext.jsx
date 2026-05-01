import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SaisonContext = createContext(null)

const STORAGE_KEY = 'stableconnect_saison_id'

export function SaisonProvider({ children }) {
  const [saisons, setSaisons]               = useState([])
  const [saisonCourante, setSaisonCourante] = useState(null)
  const [loading, setLoading]               = useState(true)

  const fetchSaisons = useCallback(async () => {
    const { data } = await supabase
      .from('saisons')
      .select('*')
      .order('annee_debut', { ascending: false })

    if (!data?.length) { setLoading(false); return data ?? [] }

    setSaisons(data)

    // Essaie de restaurer la saison depuis localStorage
    const savedId = localStorage.getItem(STORAGE_KEY)
    const saved   = savedId ? data.find(s => s.id === savedId) : null

    // Par défaut : saison active, sinon la plus récente
    const active = data.find(s => s.active) ?? data[0]
    setSaisonCourante(prev => prev ?? saved ?? active)

    setLoading(false)
    return data
  }, [])

  useEffect(() => { fetchSaisons() }, [fetchSaisons])

  function choisirSaison(saison) {
    setSaisonCourante(saison)
    if (saison?.id) localStorage.setItem(STORAGE_KEY, saison.id)
  }

  async function creerSaison(anneeDebut) {
    const libelle  = `${anneeDebut}-${anneeDebut + 1}`
    const { data, error } = await supabase
      .from('saisons')
      .insert({ libelle, annee_debut: anneeDebut, annee_fin: anneeDebut + 1, active: false })
      .select()
      .single()
    if (error) throw error
    await fetchSaisons()
    return data
  }

  async function setActive(saisonId) {
    // Désactiver toutes puis activer la choisie
    await supabase.from('saisons').update({ active: false }).neq('id', saisonId)
    await supabase.from('saisons').update({ active: true  }).eq('id', saisonId)
    await fetchSaisons()
  }

  return (
    <SaisonContext.Provider value={{
      saisons,
      saisonCourante,
      choisirSaison,
      creerSaison,
      setActive,
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
