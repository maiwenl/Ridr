import {useEffect, useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'

export function useForfaits(seasonId = null) {
    const {clubId} = useAuth()
    const [forfaits, setForfaits] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!clubId || !seasonId) {
            setForfaits([])
            setLoading(false)
            return
        }
        setLoading(true)
        supabase
            .from('plans')
            .select('*')
            .eq('club_id', clubId)
            .eq('season_id', seasonId)
            .order('price')
            .then(({data}) => {
                if (data) setForfaits(data)
                setLoading(false)
            })
    }, [clubId, seasonId])

    return {forfaits, loading}
}
