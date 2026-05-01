import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useForfaits() {
  const [forfaits, setForfaits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('forfaits')
      .select('*')
      .order('age_min', { nullsFirst: true })
      .order('prix')
      .then(({ data }) => {
        if (data) setForfaits(data)
        setLoading(false)
      })
  }, [])

  return { forfaits, loading }
}
