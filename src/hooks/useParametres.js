import {useEffect, useState} from 'react'
import {supabase} from '../lib/supabase'
import {NB_FOIS_OPTIONS} from '../lib/constants'
import {useAuth} from '../contexts/AuthContext'

const REGLEMENT_DEFAUT = ['Chèque', 'Virement', 'Carte bancaire', 'Espèces']

export function useParametres(seasonId = null) {
    const {clubId} = useAuth()
    const [parametres, setParametres] = useState({})
    const [modesReglement, setModesReglement] = useState(REGLEMENT_DEFAUT)
    const [nbFoisAcceptes, setNbFoisAcceptes] = useState(NB_FOIS_OPTIONS)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!clubId || !seasonId) {
            setLoading(false);
            return
        }

        let query = supabase
            .from('settings')
            .select('key, value')
            .eq('club_id', clubId)
            .eq('season_id', seasonId)

        query.then(({data}) => {
            if (data) {
                const map = Object.fromEntries(data.map(p => [p.key, p.value]))
                setParametres(map)
                if (map.modes_reglement) {
                    try {
                        setModesReglement(JSON.parse(map.modes_reglement))
                    } catch { /* garde défaut */
                    }
                }
                if (map.nb_paiements_acceptes) {
                    try {
                        setNbFoisAcceptes(JSON.parse(map.nb_paiements_acceptes))
                    } catch { /* garde défaut */
                    }
                }
            }
            setLoading(false)
        })
    }, [clubId, seasonId])

    return {parametres, modesReglement, nbFoisAcceptes, loading}
}
