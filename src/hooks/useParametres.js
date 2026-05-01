import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const REGLEMENT_DEFAUT = ['Chèque', 'Virement', 'Carte bancaire', 'Espèces']

export function useParametres() {
  const [parametres, setParametres]     = useState({})
  const [modesReglement, setModesReglement] = useState(REGLEMENT_DEFAUT)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    supabase
      .from('parametres')
      .select('cle, valeur')
      .then(({ data }) => {
        if (data) {
          const map = Object.fromEntries(data.map(p => [p.cle, p.valeur]))
          setParametres(map)
          if (map.modes_reglement) {
            try { setModesReglement(JSON.parse(map.modes_reglement)) } catch {}
          }
        }
        setLoading(false)
      })
  }, [])

  return { parametres, modesReglement, loading }
}
