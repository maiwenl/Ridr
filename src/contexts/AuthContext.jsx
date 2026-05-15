import {createContext, useContext, useEffect, useState} from 'react'
import {supabase} from '../lib/supabase'

const AuthContext = createContext(null)

async function fetchProfile(userId) {
    const {data} = await supabase
        .from('profiles')
        .select('*, club:club_id(id, slug, name)')
        .eq('user_id', userId)
        .maybeSingle()
    return data ?? null
}

export function AuthProvider({children}) {
    const [session, setSession] = useState(undefined)
    const [profile, setProfile] = useState(undefined)

    // 1. Gestion session uniquement dans onAuthStateChange (pas d'appels DB ici)
    useEffect(() => {
        supabase.auth.getSession().then(({data: {session}}) => {
            setSession(session ?? null)
        })

        const {data: {subscription}} = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session ?? null)
        })

        return () => subscription.unsubscribe()
    }, [])

    // 2. Fetch profil dans un useEffect séparé, déclenché par le changement de session
    useEffect(() => {
        if (session === undefined) return // encore en chargement

        if (!session) {
            setProfile(null)
            return
        }

        fetchProfile(session.user.id).then(setProfile)
    }, [session])

    const signIn = (email, password) => supabase.auth.signInWithPassword({email, password})
    const signOut = () => supabase.auth.signOut()

    // Expose clubId, clubSlug and role as top-level convenience values
    const clubId = profile?.club_id ?? null
    const clubSlug = profile?.club?.slug ?? null
    const role = profile?.role ?? null

    return (
        <AuthContext.Provider value={{session, profile, clubId, clubSlug, role, signIn, signOut}}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
    return ctx
}
