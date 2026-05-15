import {useCallback, useEffect, useRef, useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../contexts/AuthContext'
import {useSaison} from '../contexts/SaisonContext'
import {getISOWeek, weekKey} from '../lib/calculs'
import LoadingSpinner from '../components/LoadingSpinner'

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function toDateStr(date) {
    return date.toISOString().slice(0, 10)
}

export default function Pointage() {
    const {profile} = useAuth()
    const {saisonCourante} = useSaison()

    const [date, setDate] = useState(new Date())
    const [coursJour, setCoursJour] = useState([])
    const [etudiants, setEtudiants] = useState({})
    const [presences, setPresences] = useState({})
    const [pointagesExistants, setPointagesExistants] = useState({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState({})
    const [done, setDone] = useState({})

    // ── Rattrapages ──────────────────────────────────────────────────────────
    const [allAdherents, setAllAdherents] = useState([])
    const [rattrapeurs, setRattrapeurs] = useState({}) // { [coursId]: adherent[] }
    const [searches, setSearches] = useState({}) // { [coursId]: string }
    const [searchOpen, setSearchOpen] = useState({}) // { [coursId]: boolean }
    const [addingRatt, setAddingRatt] = useState({}) // { [coursId]: boolean }

    const [calSaison, setCalSaison] = useState(null)

    const isMoniteur = profile?.role === 'moniteur'
    const dayName = JOURS[date.getDay()]
    const dateStr = toDateStr(date)
    const {num: weekNum, year: weekYear} = getISOWeek(date)
    const curWeekKey = weekKey(date)
    const isToday = toDateStr(new Date()) === dateStr
    const isVacanceWeek = calSaison != null
        && ((calSaison.inactive_weeks ?? calSaison.semaines_inactives) ?? []).includes(curWeekKey)

    const fetchData = useCallback(async () => {
        setLoading(true)
        setDone({})
        setSearches({})
        setSearchOpen({})

        // 1. Cours réguliers du jour — ignorés pendant les vacances
        let coursQuery = supabase
            .from('activities')
            .select('*')
            .eq('type', 'cours_regulier')
            .eq('jour', dayName)
            .order('start_time')
        if (saisonCourante?.id) coursQuery = coursQuery.eq('season_id', saisonCourante.id)
        if (isMoniteur && profile?.id) coursQuery = coursQuery.eq('instructor_id', profile.id)

        // 2. Stages dont la date couvre ce jour
        let stagesQuery = supabase
            .from('activities')
            .select('*')
            .eq('type', 'stage')
            .lte('start_date', dateStr)
            .gte('end_date', dateStr)
            .order('nom')
        if (saisonCourante?.id) stagesQuery = stagesQuery.eq('season_id', saisonCourante.id)

        const [{data: coursData}, {data: stagesData}] = await Promise.all([
            isVacanceWeek ? {data: []} : coursQuery,
            stagesQuery,
        ])

        const allActivites = [...(coursData ?? []), ...(stagesData ?? [])]

        if (!allActivites.length) {
            setCoursJour([])
            setEtudiants({})
            setPresences({})
            setPointagesExistants({})
            setRattrapeurs({})
            setLoading(false)
            return
        }

        setCoursJour(allActivites)
        const activiteIds = allActivites.map(a => a.id)

        const [
            {data: adhesionsData},
            {data: pointagesData},
            {data: allAdhesionsData},
        ] = await Promise.all([
            supabase
                .from('enrollments')
                .select('member_id, activity_id, member:member_id(id, last_name, first_name), plan:plan_id(label, session_count)')
                .in('activity_id', activiteIds)
                .eq('season_id', saisonCourante?.id ?? ''),
            supabase
                .from('attendance')
                .select('member_id, activity_id')
                .in('activity_id', activiteIds)
                .eq('date', dateStr),
            (() => {
                let q = supabase
                    .from('enrollments')
                    .select('member_id, activity_id, member:member_id(id, last_name, first_name), plan:plan_id(label, session_count)')
                if (saisonCourante?.id) q = q.eq('season_id', saisonCourante.id)
                if (isMoniteur) q = q.in('activity_id', activiteIds)
                return q
            })(),
        ])

        // Convertit une ligne enrollment → objet étudiant utilisé partout
        const toStudent = a => ({
            id: a.member_id,
            nom: a.member?.last_name ?? '',
            prenom: a.member?.first_name ?? '',
            cours_id: a.activity_id,
            forfait: a.plan ? {libelle: a.plan.label, nb_seances: a.plan.session_count} : null,
        })

        const mappedStudents = (adhesionsData ?? []).map(toStudent).sort((a, b) => a.nom.localeCompare(b.nom))
        const allMapped = (allAdhesionsData ?? []).map(toStudent).sort((a, b) => a.nom.localeCompare(b.nom))

        setAllAdherents(allMapped)

        const etudiantsByCours = Object.fromEntries(activiteIds.map(id => [id, []]))
        mappedStudents.forEach(s => {
            if (etudiantsByCours[s.cours_id]) etudiantsByCours[s.cours_id].push(s)
        })
        setEtudiants(etudiantsByCours)

        const existingByCours = Object.fromEntries(activiteIds.map(id => [id, new Set()]))
        pointagesData?.forEach(p => {
            existingByCours[p.activity_id]?.add(p.member_id)
        })
        setPointagesExistants(existingByCours)

        const rattByCours = Object.fromEntries(activiteIds.map(id => [id, []]))
        pointagesData?.forEach(p => {
            const isNormal = etudiantsByCours[p.activity_id]?.some(s => s.id === p.member_id)
            if (!isNormal) {
                const adherent = allMapped.find(a => a.id === p.member_id)
                if (adherent) rattByCours[p.activity_id].push(adherent)
            }
        })
        setRattrapeurs(rattByCours)

        const initPresences = {}
        const initDone = {}
        activiteIds.forEach(id => {
            const existing = existingByCours[id]
            const students = etudiantsByCours[id]
            if (existing.size > 0) {
                initPresences[id] = new Set(existing)
                initDone[id] = true
            } else {
                initPresences[id] = new Set(students.map(s => s.id))
                initDone[id] = false
            }
        })
        setPresences(initPresences)
        setDone(initDone)
        setLoading(false)
    }, [dayName, dateStr, isMoniteur, isVacanceWeek, profile?.id, saisonCourante?.id])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Charge le calendrier de la saison pour détecter les semaines inactives
    useEffect(() => {
        if (!saisonCourante?.id) return
        supabase
            .from('season_calendar')
            .select('inactive_weeks, semaines_inactives')
            .eq('season_id', saisonCourante.id)
            .maybeSingle()
            .then(({data}) => setCalSaison(data))
    }, [saisonCourante?.id])

    function toggleStudent(coursId, adherentId) {
        setPresences(prev => {
            const set = new Set(prev[coursId])
            set.has(adherentId) ? set.delete(adherentId) : set.add(adherentId)
            return {...prev, [coursId]: set}
        })
    }

    function toggleAll(coursId) {
        const students = etudiants[coursId] ?? []
        const allChecked = (presences[coursId]?.size ?? 0) === students.length
        setPresences(prev => ({
            ...prev,
            [coursId]: allChecked ? new Set() : new Set(students.map(s => s.id)),
        }))
    }

    async function validerCours(coursId) {
        setSaving(prev => ({...prev, [coursId]: true}))

        const checked = presences[coursId] ?? new Set()
        const existing = pointagesExistants[coursId] ?? new Set()
        const students = etudiants[coursId] ?? []

        const toAdd = students
            .filter(s => checked.has(s.id) && !existing.has(s.id))
            .map(s => ({member_id: s.id, activity_id: coursId, date: dateStr}))

        const toRemove = students
            .filter(s => !checked.has(s.id) && existing.has(s.id))
            .map(s => s.id)

        await Promise.all([
            toAdd.length && supabase.from('attendance').insert(toAdd),
            toRemove.length && supabase.from('attendance')
                .delete()
                .eq('activity_id', coursId)
                .eq('date', dateStr)
                .in('member_id', toRemove),
        ].filter(Boolean))

        setPointagesExistants(prev => ({...prev, [coursId]: new Set(checked)}))
        setDone(prev => ({...prev, [coursId]: true}))
        setSaving(prev => ({...prev, [coursId]: false}))
    }

    // ── Rattrapages ──────────────────────────────────────────────────────────
    async function addRattrapage(coursId, adherent) {
        setAddingRatt(prev => ({...prev, [coursId]: true}))
        await supabase.from('attendance').insert({
            member_id: adherent.id,
            activity_id: coursId,
            date: dateStr,
        })
        setRattrapeurs(prev => ({
            ...prev,
            [coursId]: [...(prev[coursId] ?? []), adherent],
        }))
        setSearches(prev => ({...prev, [coursId]: ''}))
        setSearchOpen(prev => ({...prev, [coursId]: false}))
        setAddingRatt(prev => ({...prev, [coursId]: false}))
    }

    async function removeRattrapage(coursId, adherentId) {
        await supabase.from('attendance')
            .delete()
            .eq('member_id', adherentId)
            .eq('activity_id', coursId)
            .eq('date', dateStr)
        setRattrapeurs(prev => ({
            ...prev,
            [coursId]: prev[coursId].filter(r => r.id !== adherentId),
        }))
    }

    function getSearchResults(coursId) {
        const q = (searches[coursId] ?? '').toLowerCase().trim()
        if (q.length < 2) return []
        const normalIds = new Set((etudiants[coursId] ?? []).map(s => s.id))
        const rattIds = new Set((rattrapeurs[coursId] ?? []).map(r => r.id))
        return allAdherents
            .filter(a => {
                if (normalIds.has(a.id) || rattIds.has(a.id)) return false
                return `${a.prenom} ${a.nom}`.toLowerCase().includes(q)
                    || `${a.nom} ${a.prenom}`.toLowerCase().includes(q)
            })
            .slice(0, 6)
    }

    function goDay(offset) {
        const next = new Date(date)
        next.setDate(next.getDate() + offset)
        setDate(next)
    }

    const dateInputRef = useRef(null)

    const fmtDateMobile = d => d.toLocaleDateString('fr-FR', {weekday: 'short', day: 'numeric', month: 'short'})
    const fmtDateDesktop = d => d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    })

    function handleDatePick(e) {
        if (!e.target.value) return
        // +T12:00:00 pour éviter le décalage UTC → heure locale
        setDate(new Date(e.target.value + 'T12:00:00'))
    }

    const emptyMessage = isVacanceWeek
        ? 'Aucun stage prévu ce jour.'
        : isMoniteur
            ? 'Aucune activité qui vous est attribuée ce jour.'
            : `Aucune activité ce ${dayName.toLowerCase()}.`

    return (
        <div className="min-h-screen bg-gray-50 md:bg-transparent">

            {/* ── Header sticky ── */}
            <div
                className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm px-4 py-3 md:static md:shadow-none md:border-0 md:bg-transparent md:px-8 md:pt-8 md:pb-0">
                <div className="flex items-center justify-between gap-2">
                    {/* Date cliquable — ouvre le date picker natif */}
                    <div className="relative min-w-0 cursor-pointer group"
                         onClick={() => dateInputRef.current?.showPicker()}>
                        <h1 className="text-base font-bold text-gray-900 capitalize truncate md:text-2xl group-hover:text-brand-600 transition-colors">
                            <span className="md:hidden">{fmtDateMobile(date)}</span>
                            <span className="hidden md:inline">{fmtDateDesktop(date)}</span>
                        </h1>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-500">S{weekNum}</span>
                            {isToday && (
                                <span
                                    className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                  Aujourd&apos;hui
                </span>
                            )}
                            {isMoniteur && profile && (
                                <span
                                    className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                  {profile.first_name ?? profile.prenom}
                </span>
                            )}
                        </div>
                        {/* Input invisible — déclenché par le clic sur le titre */}
                        <input
                            ref={dateInputRef}
                            type="date"
                            value={dateStr}
                            onChange={handleDatePick}
                            className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
                            tabIndex={-1}
                        />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => goDay(-1)}
                                className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 active:bg-gray-100 transition-colors text-lg">‹
                        </button>
                        {!isToday && (
                            <button onClick={() => setDate(new Date())}
                                    className="h-10 px-3 rounded-xl border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold active:bg-brand-100 transition-colors">Auj.</button>
                        )}
                        {/* Bouton calendrier — ouvre le date picker natif */}
                        <button
                            onClick={() => dateInputRef.current?.showPicker()}
                            title="Choisir une date"
                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-brand-600 hover:border-brand-200 active:bg-gray-100 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 20 20"
                                 fill="currentColor">
                                <path fillRule="evenodd"
                                      d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                                      clipRule="evenodd"/>
                            </svg>
                        </button>
                        <button onClick={() => goDay(1)}
                                className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 active:bg-gray-100 transition-colors text-lg">›
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Contenu ── */}
            <div className="px-4 py-4 md:px-8 md:py-6 space-y-4 md:space-y-5">

                {/* Bannière vacances — info uniquement, n'empêche plus le pointage */}
                {isVacanceWeek && (
                    <div
                        className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                        <span className="text-sm shrink-0">🏖️</span>
                        <p className="text-xs font-medium text-amber-800">
                            Semaine {weekNum} — vacances · Les cours réguliers sont suspendus, seuls les stages sont
                            affichés.
                        </p>
                    </div>
                )}

                {loading ? (
                    <LoadingSpinner/>
                ) : coursJour.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center md:max-w-md">
                        <p className="text-2xl mb-2">🐴</p>
                        <p className="text-gray-500 text-sm">{emptyMessage}</p>
                    </div>
                ) : (
                    <div
                        className="space-y-4 md:space-y-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(360px,1fr))] md:gap-5 md:items-start">
                        {coursJour.map(cours => {
                            const students = etudiants[cours.id] ?? []
                            const checked = presences[cours.id] ?? new Set()
                            const nbChecked = checked.size
                            const nbRatt = (rattrapeurs[cours.id] ?? []).length
                            const allCkd = nbChecked === students.length && students.length > 0
                            const isSaving = saving[cours.id]
                            const isDone = done[cours.id]
                            const searchQuery = searches[cours.id] ?? ''
                            const isDropOpen = searchOpen[cours.id] && searchQuery.length >= 2
                            const results = isDropOpen ? getSearchResults(cours.id) : []

                            const isStage = cours.type !== 'cours_regulier'

                            // Jour N / total pour les stages multi-jours
                            let stageDayLabel = null
                            if (isStage && (cours.start_date ?? cours.date_debut) && (cours.end_date ?? cours.date_fin)) {
                                const d0 = new Date((cours.start_date ?? cours.date_debut) + 'T12:00:00')
                                const d1 = new Date((cours.end_date ?? cours.date_fin) + 'T12:00:00')
                                const cur = new Date(dateStr + 'T12:00:00')
                                const dayNum = Math.round((cur - d0) / 86_400_000) + 1
                                const totalDays = Math.round((d1 - d0) / 86_400_000) + 1
                                stageDayLabel = totalDays > 1 ? `J${dayNum} / ${totalDays}` : null
                            }

                            const typeBadgeCls = isStage ? 'bg-orange-100 text-orange-700' : null
                            const typeBadgeLabel = isStage ? 'Stage' : null

                            const counterColor =
                                nbChecked === students.length ? 'text-green-600'
                                    : nbChecked === 0 ? 'text-red-500'
                                        : 'text-amber-600'

                            return (
                                <div key={cours.id} className="bg-white rounded-2xl shadow-sm border border-gray-100">

                                    {/* En-tête activité */}
                                    <div
                                        className={`px-4 py-3 border-b border-gray-100 rounded-t-2xl ${isDone ? 'bg-green-50' : isStage ? 'bg-orange-50/60' : 'bg-gray-50'}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h2 className="font-bold text-gray-900 text-base leading-tight">{cours.nom}</h2>
                                                    {typeBadgeCls && (
                                                        <span
                                                            className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${typeBadgeCls}`}>
                              {typeBadgeLabel}
                            </span>
                                                    )}
                                                    {isDone && (
                                                        <span
                                                            className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                              ✓ Pointé
                            </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-500 mt-0.5">
                                                    {stageDayLabel
                                                        ? stageDayLabel
                                                        : (cours.start_time ?? cours.heure_debut)
                                                            ? `${(cours.start_time ?? cours.heure_debut).slice(0, 5)} – ${(cours.end_time ?? cours.heure_fin)?.slice(0, 5)}`
                                                            : null}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div>
                                                    <span
                                                        className={`text-2xl font-black ${counterColor}`}>{nbChecked}</span>
                                                    <span
                                                        className="text-gray-500 text-base font-semibold">/{students.length}</span>
                                                </div>
                                                {nbRatt > 0 && (
                                                    <span className="text-xs text-violet-600 font-medium">
                            +{nbRatt} rattrap.
                          </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Barre tout cocher */}
                                    {students.length > 0 && (
                                        <div
                                            className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                                            <button
                                                onClick={() => toggleAll(cours.id)}
                                                className="text-sm text-brand-600 font-medium py-1 active:opacity-70"
                                            >
                                                {allCkd ? 'Tout décocher' : 'Tout cocher'}
                                            </button>
                                            <span className="text-xs text-gray-500">
                        {students.length} {isStage ? 'participant' : 'élève'}{students.length > 1 ? 's' : ''}
                      </span>
                                        </div>
                                    )}

                                    {/* Liste participants */}
                                    {students.length === 0 ? (
                                        <p className="px-4 py-4 text-sm text-gray-500 text-center">
                                            {isStage ? 'Aucun participant inscrit à ce stage.' : 'Aucun élève inscrit à ce cours.'}
                                        </p>
                                    ) : (
                                        <div className="divide-y divide-gray-50">
                                            {students.map(s => {
                                                const isPresent = checked.has(s.id)
                                                return (
                                                    <label
                                                        key={s.id}
                                                        className={`flex items-center gap-4 px-4 py-4 cursor-pointer active:bg-gray-50 transition-colors select-none ${!isPresent ? 'opacity-40' : ''}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isPresent}
                                                            onChange={() => toggleStudent(cours.id, s.id)}
                                                            className="w-6 h-6 rounded-md border-2 border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer shrink-0 accent-brand-600"
                                                        />
                                                        <span
                                                            className={`flex-1 text-base font-medium leading-tight ${isPresent ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
                              {s.prenom} {s.nom}
                            </span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* ── Section Rattrapages ── */}
                                    <div className="border-t border-dashed border-gray-200 bg-violet-50/40">

                                        {/* Rattrapeurs existants */}
                                        {(rattrapeurs[cours.id] ?? []).length > 0 && (
                                            <div className="px-4 pt-3 pb-1">
                                                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">
                                                    Rattrapages · {rattrapeurs[cours.id].length}
                                                </p>
                                                <div className="space-y-1">
                                                    {rattrapeurs[cours.id].map(r => (
                                                        <div
                                                            key={r.id}
                                                            className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-violet-100"
                                                        >
                                                            <span
                                                                className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold shrink-0">↩</span>
                                                            <span className="flex-1 text-sm font-medium text-gray-800">
                                {r.prenom} {r.nom}
                              </span>
                                                            {r.forfait?.nb_seances && (
                                                                <span
                                                                    className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                                  {r.forfait.libelle}
                                </span>
                                                            )}
                                                            <button
                                                                onClick={() => removeRattrapage(cours.id, r.id)}
                                                                title="Retirer le rattrapage"
                                                                className="text-gray-400 hover:text-red-400 transition-colors shrink-0 text-lg leading-none"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Barre de recherche */}
                                        <div className="px-4 py-3 relative">
                                            <div className="relative">
                                                <span
                                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    placeholder="Ajouter un rattrapage — tapez un nom…"
                                                    onChange={e => {
                                                        setSearches(prev => ({...prev, [cours.id]: e.target.value}))
                                                        setSearchOpen(prev => ({...prev, [cours.id]: true}))
                                                    }}
                                                    onFocus={() => setSearchOpen(prev => ({...prev, [cours.id]: true}))}
                                                    onBlur={() => setTimeout(() => setSearchOpen(prev => ({
                                                        ...prev,
                                                        [cours.id]: false
                                                    })), 200)}
                                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                                                />
                                            </div>

                                            {/* Dropdown résultats */}
                                            {isDropOpen && (
                                                <div
                                                    className="absolute left-4 right-4 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                                                    {results.length === 0 ? (
                                                        <p className="px-4 py-3 text-sm text-gray-500 text-center">
                                                            Aucun résultat pour « {searchQuery} »
                                                        </p>
                                                    ) : (
                                                        results.map(a => (
                                                            <button
                                                                key={a.id}
                                                                onMouseDown={e => e.preventDefault()} // empêche le blur de masquer avant le click
                                                                onClick={() => addRattrapage(cours.id, a)}
                                                                disabled={addingRatt[cours.id]}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50 transition-colors border-b border-gray-50 last:border-0"
                                                            >
                                                                <div
                                                                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                                                                    {a.prenom?.[0]}{a.nom?.[0]}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-medium text-gray-900 leading-tight">
                                                                        {a.prenom} {a.nom}
                                                                    </p>
                                                                    {a.forfait?.libelle && (
                                                                        <p className="text-xs text-gray-500 truncate">{a.forfait.libelle}</p>
                                                                    )}
                                                                </div>
                                                                <span
                                                                    className="text-xs text-brand-600 font-semibold shrink-0">+ Ajouter</span>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bouton valider */}
                                    {students.length > 0 && (
                                        <div className="px-4 py-4 border-t border-gray-100">
                                            <button
                                                onClick={() => validerCours(cours.id)}
                                                disabled={isSaving}
                                                className={`w-full py-4 rounded-xl text-base font-bold transition-all active:scale-[0.98] disabled:opacity-60 ${
                                                    isDone
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-brand-600 text-white shadow-sm shadow-brand-200'
                                                }`}
                                            >
                                                {isSaving
                                                    ? '⏳ Enregistrement…'
                                                    : isDone
                                                        ? `✓ Mettre à jour — ${nbChecked} présent${nbChecked > 1 ? 's' : ''}`
                                                        : `Valider — ${nbChecked} / ${students.length}`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
