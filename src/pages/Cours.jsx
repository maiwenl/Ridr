import {useEffect, useMemo, useState} from 'react'
import {Link} from 'react-router-dom'
import {useCours} from '../hooks/useCours'
import {useForfaits} from '../hooks/useForfaits'
import {useParametres} from '../hooks/useParametres'
import {supabase} from '../lib/supabase'
import {calculateAge, computeFinancial, filterForfaitsByAge, GALOPS, getStagePrix} from '../lib/calculs'
import {useAuth} from '../contexts/AuthContext'
import {useSaison} from '../contexts/SaisonContext'
import {STATUTS, TYPE_ACTIVITE} from '../lib/constants'
import {inputCls} from '../lib/ui'
import TrashIcon from '../components/TrashIcon'
import LoadingSpinner from '../components/LoadingSpinner'

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const JOUR_ORDER = Object.fromEntries(JOURS.map((j, i) => [j, i]))

const INIT_FORM = {
    nom: '', type: 'cours_regulier',
    // Cours régulier
    jour: '', heure_debut: '', heure_fin: '',
    // Stage
    date_debut: '', date_fin: '', tarif_stage_id: '',
    // Communs
    niveaux: [], plan_ids: [], capacite: '', description: '', moniteur_id: '',
    min_age: '', max_age: '',
}


function SortIcon({col, sortCol, sortDir}) {
    const active = sortCol === col
    return (
        <span className={`inline-flex flex-col ml-1.5 gap-[2px] ${active ? 'opacity-100' : 'opacity-30'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4"
           className={`w-1.5 h-1 ${active && sortDir === 'asc' ? 'text-brand-600' : 'text-current'}`}
           fill="currentColor"><path d="M3 0 6 4H0z"/></svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4"
           className={`w-1.5 h-1 ${active && sortDir === 'desc' ? 'text-brand-600' : 'text-current'}`}
           fill="currentColor"><path d="M3 4 0 0h6z"/></svg>
    </span>
    )
}

function formatDateRange(debut, fin) {
    if (!debut) return '—'
    const d = new Date(debut).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})
    if (!fin || fin === debut) return d
    const f = new Date(fin).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})
    return `${d} → ${f}`
}

export default function Cours() {
    const {profile, clubId} = useAuth()
    const isGerant = profile?.role === 'gérant'
    const {saisonCourante} = useSaison()

    const {cours, loading, refetch} = useCours(saisonCourante?.id ?? null)
    const {forfaits} = useForfaits(saisonCourante?.id ?? null)
    const {parametres, modesReglement} = useParametres()
    const [moniteurs, setMoniteurs] = useState([])
    const [tarifsStage, setTarifsStage] = useState([])

    // ── Tabs / Tri / Filtre ───────────────────────────────────────────────────
    const [activeType, setActiveType] = useState('cours_regulier')
    const [sortCol, setSortCol] = useState('jour')
    const [sortDir, setSortDir] = useState('asc')
    const [filterJour, setFilterJour] = useState('')

    // ── Panneau fiche ──────────────────────────────────────────────────────────
    const [selectedCours, setSelectedCours] = useState(null)
    const [ficheTab, setFicheTab] = useState('infos')
    const [eleves, setEleves] = useState([])
    const [loadingEleves, setLoadingEleves] = useState(false)

    // ── Ajout d'un inscrit ─────────────────────────────────────────────────────
    const [showAddInscrit, setShowAddInscrit] = useState(false)
    const [adherents, setAdherents] = useState([])
    const [adherentSearch, setAdherentSearch] = useState('')
    const [addForm, setAddForm] = useState({adherent_id: '', offre_id: '', mode_reglement: '', formule: 'journee'})
    const [addError, setAddError] = useState('')
    const [savingInscrit, setSavingInscrit] = useState(false)

    // ── Formulaire ────────────────────────────────────────────────────────────
    const [showCreate, setShowCreate] = useState(false)
    const [form, setForm] = useState(INIT_FORM)
    const [errors, setErrors] = useState({})
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        supabase.from('profiles').select('id, last_name, first_name').eq('role', 'moniteur').order('last_name')
            .then(({data}) => setMoniteurs((data ?? []).map(m => ({...m, nom: m.last_name, prenom: m.first_name}))))
    }, [])

    useEffect(() => {
        if (!saisonCourante?.id) {
            setTarifsStage([]);
            return
        }
        supabase.from('camp_rates').select('*').eq('season_id', saisonCourante.id).order('label')
            .then(({data}) => setTarifsStage(data ?? []))
    }, [saisonCourante?.id])

    // ── Fiche cours ────────────────────────────────────────────────────────────
    async function openFiche(c) {
        setSelectedCours(c)
        setFicheTab('infos')
        setErrors({})
        setForm({
            nom: c.nom,
            type: c.type ?? 'cours_regulier',
            jour: c.jour ?? '',
            heure_debut: c.heure_debut?.slice(0, 5) ?? '',
            heure_fin: c.heure_fin?.slice(0, 5) ?? '',
            date_debut: c.date_debut ?? '',
            date_fin: c.date_fin ?? '',
            tarif_stage_id: c.tarif_stage_id ?? '',
            niveaux: c.niveaux ?? [],
            plan_ids: c.plan_ids ?? [],
            capacite: String(c.capacite ?? ''),
            description: c.description ?? '',
            moniteur_id: c.moniteur_id ?? '',
            min_age: c.min_age !== null && c.min_age !== undefined ? String(c.min_age) : '',
            max_age: c.max_age !== null && c.max_age !== undefined ? String(c.max_age) : '',
        })
        setLoadingEleves(true)
        const {data} = await supabase
            .from('enrollments')
            .select('id, status, member:member_id(id, last_name, first_name, galop)')
            .eq('activity_id', c.id)
            .eq('season_id', saisonCourante?.id ?? '')
        const sorted = (data ?? []).map(e => ({
            ...e,
            statut: e.status,
            adherent: e.member ? {...e.member, nom: e.member.last_name, prenom: e.member.first_name} : null,
        })).sort((a, b) =>
            (a.adherent?.nom ?? '').localeCompare(b.adherent?.nom ?? '')
        )
        setEleves(sorted)
        setLoadingEleves(false)
    }

    function closeFiche() {
        setSelectedCours(null)
        setEleves([])
        setShowAddInscrit(false)
        setAdherentSearch('')
        setAddForm({adherent_id: '', offre_id: '', mode_reglement: '', formule: 'journee'})
        setAddError('')
    }

    function openCreate() {
        setForm({...INIT_FORM, type: activeType})
        setErrors({})
        setShowCreate(true)
    }

    function setField(name, value) {
        setForm(prev => ({...prev, [name]: value}))
        setErrors(prev => {
            const next = {...prev};
            delete next[name];
            return next
        })
    }

    function toggleNiveau(g) {
        setForm(prev => ({
            ...prev,
            niveaux: prev.niveaux.includes(g)
                ? prev.niveaux.filter(n => n !== g)
                : [...prev.niveaux, g],
        }))
    }

    function togglePlan(id) {
        setForm(prev => ({
            ...prev,
            plan_ids: prev.plan_ids.includes(id)
                ? prev.plan_ids.filter(p => p !== id)
                : [...prev.plan_ids, id],
        }))
    }

    // ── Validation ─────────────────────────────────────────────────────────────
    function validate() {
        const e = {}
        if (!form.nom.trim()) e.nom = 'Requis'
        if (form.type === 'cours_regulier') {
            if (!form.jour) e.jour = 'Requis'
            if (!form.heure_debut) e.heure_debut = 'Requis'
            if (!form.heure_fin) e.heure_fin = 'Requis'
        } else {
            if (!form.date_debut) e.date_debut = 'Requis'
            if (!form.date_fin) e.date_fin = 'Requis'
        }
        if (form.type === 'cours_regulier' && (!form.capacite || isNaN(Number(form.capacite)) || Number(form.capacite) < 1))
            e.capacite = 'Entier > 0 requis'
        return e
    }

    // ── Sauvegarde ─────────────────────────────────────────────────────────────
    async function handleSave(editingId = null) {
        const e = validate()
        if (Object.keys(e).length) {
            setErrors(e);
            return
        }
        setSaving(true)

        const base = {
            club_id: clubId,
            nom: form.nom.trim(),
            type: form.type,
            niveaux: form.niveaux,
            plan_ids: form.plan_ids ?? [],
            capacite: form.capacite ? Number(form.capacite) : null,
            description: form.description.trim() || null,
            instructor_id: form.moniteur_id || null,
            season_id: saisonCourante?.id ?? null,
            min_age: form.min_age !== '' ? Number(form.min_age) : null,
            max_age: form.max_age !== '' ? Number(form.max_age) : null,
        }

        const payload = form.type === 'cours_regulier'
            ? {...base, jour: form.jour, start_time: form.heure_debut, end_time: form.heure_fin}
            : {
                ...base,
                start_date: form.date_debut || null,
                end_date: form.date_fin || null,
                start_time: form.heure_debut || null,
                end_time: form.heure_fin || null,
                rate_id: form.tarif_stage_id || null,
            }

        if (editingId) {
            await supabase.from('activities').update(payload).eq('id', editingId)
        } else {
            await supabase.from('activities').insert(payload)
        }

        setSaving(false)
        setShowCreate(false)
        await refetch()

        if (editingId) {
            const {data: updated} = await supabase
                .from('activities')
                .select('*, instructor:instructor_id(id, last_name, first_name)')
                .eq('id', editingId)
                .single()
            if (updated) {
                const counts = cours.find(c => c.id === editingId)
                setSelectedCours({
                    ...updated,
                    inscrits: counts?.inscrits ?? 0,
                    placesRestantes: (updated.capacite - (counts?.inscrits ?? 0)),
                })
            }
        }
    }

    // Charge les adhérents la première fois qu'on ouvre le formulaire d'ajout
    useEffect(() => {
        if (!showAddInscrit || adherents.length > 0) return
        supabase
            .from('members')
            .select('id, last_name, first_name, birth_date')
            .order('last_name')
            .then(({data}) => setAdherents((data ?? []).map(m => ({
                ...m,
                nom: m.last_name,
                prenom: m.first_name,
                date_naissance: m.birth_date
            }))))
    }, [showAddInscrit, adherents.length])

    async function handleAddInscrit() {
        if (!addForm.adherent_id || !addForm.mode_reglement) {
            setAddError('Sélectionnez un adhérent et un mode de règlement')
            return
        }
        const isStage = selectedCours.type !== 'cours_regulier'
        if (!isStage && !addForm.offre_id) {
            setAddError('Sélectionnez un forfait')
            return
        }

        setSavingInscrit(true)
        setAddError('')

        const adherent = adherents.find(a => a.id === addForm.adherent_id)
        const age = calculateAge(adherent?.date_naissance)

        let total = 0
        let isAdherentPrice = false

        if (isStage) {
            // Détecter si l'adhérent a une inscription avec plan_id (cours annuel) cette saison
            const {count} = await supabase
                .from('enrollments')
                .select('id', {count: 'exact', head: true})
                .eq('member_id', addForm.adherent_id)
                .eq('season_id', saisonCourante?.id ?? '')
                .not('plan_id', 'is', null)
            isAdherentPrice = (count ?? 0) > 0

            const prixBase = getStagePrix(selectedCours.tarif ?? selectedCours.rate, addForm.formule, isAdherentPrice) ?? 0
            const {total: t} = computeFinancial({prixBase, remiseMontant: 0, age, parametres})
            total = t
        } else {
            const forfait1 = forfaits.find(f => f.id === addForm.offre_id) ?? null
            const {total: t} = computeFinancial({forfait1, remiseMontant: 0, age, parametres})
            total = t
        }

        const {error} = await supabase.from('enrollments').insert({
            member_id: addForm.adherent_id,
            season_id: saisonCourante?.id ?? null,
            type: isStage ? 'stage' : 'cours_annuel',
            activity_id: selectedCours.id,
            plan_id: isStage ? null : (addForm.offre_id || null),
            payment_method: addForm.mode_reglement,
            total_amount: total,
            discount_amount: 0,
            status: 'valide',
            reglement_accepte: true,
            reglement_accepte_at: new Date().toISOString(),
            ...(isStage ? {camp_formula: addForm.formule, member_price: isAdherentPrice} : {}),
        })

        if (error) {
            setAddError(error.message);
            setSavingInscrit(false);
            return
        }

        // Rafraîchir la liste des inscrits
        const {data} = await supabase
            .from('enrollments')
            .select('id, status, member:member_id(id, last_name, first_name, galop)')
            .eq('activity_id', selectedCours.id)
            .eq('season_id', saisonCourante?.id ?? '')
        setEleves((data ?? []).map(e => ({
            ...e,
            statut: e.status,
            adherent: e.member ? {...e.member, nom: e.member.last_name, prenom: e.member.first_name} : null,
        })).sort((a, b) => (a.adherent?.nom ?? '').localeCompare(b.adherent?.nom ?? '')))
        setAddForm({adherent_id: '', offre_id: '', mode_reglement: '', formule: 'journee'})
        setAdherentSearch('')
        setShowAddInscrit(false)
        setSavingInscrit(false)
        refetch()
    }

    // ── Suppression ────────────────────────────────────────────────────────────
    async function handleDelete(c) {
        const label = TYPE_ACTIVITE[c.type]?.label ?? 'activité'
        const msg = c.inscrits > 0
            ? `${c.inscrits} adhérent(s) sont inscrits à ce${label === 'Stage' ? ' stage' : ' cours'}. Supprimer quand même ?`
            : `Supprimer "${c.nom}" ?`
        if (!window.confirm(msg)) return
        await supabase.from('activities').delete().eq('id', c.id)
        closeFiche()
        refetch()
    }

    // ── Tri ────────────────────────────────────────────────────────────────────
    function toggleSort(col) {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else {
            setSortCol(col);
            setSortDir('asc')
        }
    }

    // ── Liste filtrée par tab ──────────────────────────────────────────────────
    const coursFiltres = useMemo(() => {
        let list = cours.filter(c => c.type === activeType)
        if (filterJour) list = list.filter(c => c.jour === filterJour)

        list.sort((a, b) => {
            let va, vb
            switch (sortCol) {
                case 'jour': {
                    if (a.type === 'cours_regulier') {
                        const jDiff = (JOUR_ORDER[a.jour] ?? 99) - (JOUR_ORDER[b.jour] ?? 99)
                        if (jDiff !== 0) return sortDir === 'asc' ? jDiff : -jDiff
                    } else {
                        va = a.date_debut ?? '';
                        vb = b.date_debut ?? '';
                        break
                    }
                    va = a.heure_debut ?? '';
                    vb = b.heure_debut ?? '';
                    break
                }
                case 'nom':
                    va = a.nom ?? '';
                    vb = b.nom ?? '';
                    break
                case 'moniteur':
                    va = a.moniteur?.prenom ?? '';
                    vb = b.moniteur?.prenom ?? '';
                    break
                case 'places':
                    va = a.inscrits / (a.capacite || 1);
                    vb = b.inscrits / (b.capacite || 1);
                    break
                default:
                    va = a[sortCol] ?? '';
                    vb = b[sortCol] ?? ''
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1
            if (va > vb) return sortDir === 'asc' ? 1 : -1
            return 0
        })
        return list
    }, [cours, activeType, filterJour, sortCol, sortDir])

    const typeTabs = Object.entries(TYPE_ACTIVITE).map(([key, meta]) => ({
        key, ...meta,
        count: cours.filter(c => c.type === key).length,
    }))

    const thBase = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors'
    const thCls = col => `${thBase} ${sortCol === col ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`
    const thStatic = `${thBase} text-gray-500 cursor-default hover:bg-transparent`
    const td = 'px-4 py-3.5 text-sm text-gray-800'

    const isRegulier = activeType === 'cours_regulier'
    const creationLabel = isRegulier ? 'Nouveau cours' : TYPE_ACTIVITE[activeType]?.label ?? 'Nouvelle activité'

    return (
        <div className="p-6 md:p-8 flex gap-6 min-h-full">

            {/* ── Colonne principale ───────────────────────────────────────────── */}
            <div className={`flex-1 min-w-0 transition-all ${selectedCours ? 'hidden md:block' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Activités</h1>
                        {saisonCourante &&
                            <p className="text-sm text-gray-500 mt-0.5">Saison {saisonCourante.name ?? saisonCourante.libelle}</p>}
                    </div>
                    {isGerant && (
                        <button
                            onClick={openCreate}
                            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-150"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                                 strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                            </svg>
                            {creationLabel}
                        </button>
                    )}
                </div>

                {/* Tabs par type */}
                <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
                    {typeTabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => {
                                setActiveType(tab.key);
                                setFilterJour('');
                                setSortCol(tab.key === 'cours_regulier' ? 'jour' : 'nom')
                            }}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all ${
                                activeType === tab.key
                                    ? 'bg-white shadow text-gray-900'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.label}
                            {tab.count > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    activeType === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-600'
                                }`}>
                  {tab.count}
                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Filtre jour (cours réguliers seulement) */}
                {isRegulier && (
                    <div className="flex gap-2 mb-4 flex-wrap">
                        <button
                            onClick={() => setFilterJour('')}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!filterJour ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                        >
                            Tous
                        </button>
                        {JOURS.filter(j => cours.some(c => c.type === 'cours_regulier' && c.jour === j)).map(j => (
                            <button
                                key={j}
                                onClick={() => setFilterJour(j === filterJour ? '' : j)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${filterJour === j ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                            >
                                {j}
                            </button>
                        ))}
                    </div>
                )}

                {/* Tableau */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    {loading ? (
                        <LoadingSpinner/>
                    ) : coursFiltres.length === 0 ? (
                        <div className="py-16 flex flex-col items-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none"
                                     viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
                                </svg>
                            </div>
                            <p className="text-gray-700 font-medium text-sm">
                                {cours.filter(c => c.type === activeType).length === 0
                                    ? `Aucun ${TYPE_ACTIVITE[activeType]?.label?.toLowerCase() ?? 'activité'} créé`
                                    : 'Aucun résultat'}
                            </p>
                            {filterJour && <button onClick={() => setFilterJour('')}
                                                   className="text-brand-600 hover:text-brand-800 text-xs font-medium">Voir
                                tous les jours</button>}
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="border-b border-gray-200">
                                    <tr>
                                        <th className={thCls('jour')} onClick={() => toggleSort('jour')}>
                        <span className="flex items-center">
                          {isRegulier ? 'Créneau' : 'Dates'}
                            <SortIcon col="jour" sortCol={sortCol} sortDir={sortDir}/>
                        </span>
                                        </th>
                                        <th className={thCls('nom')} onClick={() => toggleSort('nom')}>
                                            <span className="flex items-center">Nom <SortIcon col="nom"
                                                                                              sortCol={sortCol}
                                                                                              sortDir={sortDir}/></span>
                                        </th>
                                        <th className={thStatic}>Niveaux</th>
                                        <th className={thCls('moniteur')} onClick={() => toggleSort('moniteur')}>
                                            <span className="flex items-center">Moniteur <SortIcon col="moniteur"
                                                                                                   sortCol={sortCol}
                                                                                                   sortDir={sortDir}/></span>
                                        </th>
                                        <th className={thCls('places')} onClick={() => toggleSort('places')}>
                                            <span className="flex items-center">Places <SortIcon col="places"
                                                                                                 sortCol={sortCol}
                                                                                                 sortDir={sortDir}/></span>
                                        </th>
                                        <th className={`${thStatic} text-right pr-5`}>Action</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                    {coursFiltres.map(c => {
                                        const pct = c.capacite ? Math.min(100, (c.inscrits / c.capacite) * 100) : 0
                                        const complet = c.placesRestantes <= 0
                                        const quasi = pct > 75 && !complet
                                        const isSelected = selectedCours?.id === c.id

                                        return (
                                            <tr
                                                key={c.id}
                                                onClick={() => openFiche(c)}
                                                className={`cursor-pointer transition-colors ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                                            >
                                                {/* Créneau / Dates */}
                                                <td className={`${td} text-gray-600 tabular-nums font-medium`}>
                                                    {c.type === 'cours_regulier' ? (
                                                        <>
                                <span
                                    className="inline-flex items-center text-xs font-bold text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-md mr-2">
                                  {c.jour}
                                </span>
                                                            {c.heure_debut?.slice(0, 5)} – {c.heure_fin?.slice(0, 5)}
                                                        </>
                                                    ) : (
                                                        <span className="text-sm">
                                {formatDateRange(c.date_debut, c.date_fin)}
                                                            {c.heure_debut && (
                                                                <span className="text-gray-500 ml-1.5">
                                    · {c.heure_debut.slice(0, 5)}{c.heure_fin ? `–${c.heure_fin.slice(0, 5)}` : ''}
                                  </span>
                                                            )}
                              </span>
                                                    )}
                                                </td>

                                                {/* Nom */}
                                                <td className={td}>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-gray-900">{c.nom}</span>
                                                        {complet && (
                                                            <span
                                                                className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">Complet</span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Niveaux */}
                                                <td className={td}>
                                                    {c.niveaux?.length > 0 ? (
                                                        <div className="flex gap-1 flex-wrap">
                                                            {c.niveaux.map(n => (
                                                                <span key={n}
                                                                      className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded-full font-medium">{n}</span>
                                                            ))}
                                                        </div>
                                                    ) : <span className="text-gray-500">—</span>}
                                                </td>

                                                {/* Moniteur */}
                                                <td className={`${td} text-gray-600`}>
                                                    {c.moniteur ? c.moniteur.prenom :
                                                        <span className="text-gray-500">—</span>}
                                                </td>


                                                {/* Places */}
                                                <td className={td}>
                                                    <div className="flex items-center gap-2 min-w-[110px]">
                                                        <div
                                                            className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[50px]">
                                                            <div
                                                                className={`h-1.5 rounded-full transition-all ${complet ? 'bg-red-500' : quasi ? 'bg-amber-400' : 'bg-brand-500'}`}
                                                                style={{width: `${pct}%`}}
                                                            />
                                                        </div>
                                                        <span
                                                            className={`text-xs font-medium tabular-nums shrink-0 ${complet ? 'text-red-600' : quasi ? 'text-amber-600' : 'text-gray-600'}`}>
                                {c.inscrits}/{c.capacite}
                              </span>
                                                    </div>
                                                </td>

                                                {/* Action */}
                                                <td className={`${td} text-right pr-5`}
                                                    onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => openFiche(c)}
                                                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-white hover:bg-brand-600 px-2.5 py-1 rounded-lg border border-brand-200 hover:border-brand-600 transition-all duration-150"
                                                    >
                                                        Voir
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3"
                                                             fill="none" viewBox="0 0 24 24" strokeWidth={2.5}
                                                             stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                                  d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                                <p className="text-xs text-gray-500">
                                    <span
                                        className="font-semibold text-gray-700">{coursFiltres.length}</span> {TYPE_ACTIVITE[activeType]?.label?.toLowerCase() ?? 'activité'}{coursFiltres.length > 1 ? 's' : ''}
                                    {filterJour && <span className="text-gray-500"> · {filterJour}</span>}
                                </p>
                                {filterJour && (
                                    <button onClick={() => setFilterJour('')}
                                            className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                                        Tous les jours
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Panneau fiche ─────────────────────────────────────────────────── */}
            {selectedCours && (
                <div className="w-full md:w-[420px] shrink-0">
                    <div
                        className="bg-white border border-gray-100 rounded-xl shadow-sm sticky top-6 max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden">

                        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs text-brand-600 font-semibold uppercase tracking-wide mb-0.5">
                                    {selectedCours.type === 'cours_regulier'
                                        ? `${selectedCours.jour} · ${selectedCours.heure_debut?.slice(0, 5)} – ${selectedCours.heure_fin?.slice(0, 5)}`
                                        : formatDateRange(selectedCours.date_debut, selectedCours.date_fin)}
                                </p>
                                <h2 className="text-base font-bold text-gray-900 leading-tight truncate">{selectedCours.nom}</h2>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_ACTIVITE[selectedCours.type]?.cls ?? ''}`}>
                    {TYPE_ACTIVITE[selectedCours.type]?.label ?? selectedCours.type}
                  </span>
                                    {selectedCours.placesRestantes <= 0 ? (
                                        <span
                                            className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Complet</span>
                                    ) : (
                                        <span
                                            className="text-xs text-gray-500">{selectedCours.inscrits} inscrit{selectedCours.inscrits !== 1 ? 's' : ''}</span>
                                    )}
                                </div>
                            </div>
                            <button onClick={closeFiche}
                                    className="text-gray-500 hover:text-gray-700 text-xl leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 shrink-0">×
                            </button>
                        </div>

                        <div className="flex border-b border-gray-100 px-4">
                            {[
                                {key: 'infos', label: 'Informations'},
                                {key: 'eleves', label: `Inscrits (${loadingEleves ? '…' : eleves.length})`},
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setFicheTab(tab.key)}
                                    className={`py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${ficheTab === tab.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {ficheTab === 'infos' && (
                                <div className="px-5 py-4 space-y-4">
                                    <FormActivite
                                        form={form} errors={errors} setField={setField} toggleNiveau={toggleNiveau}
                                        togglePlan={togglePlan}
                                        forfaits={forfaits} moniteurs={moniteurs} tarifsStage={tarifsStage}
                                        isGerant={isGerant} modeEdit
                                    />
                                    {isGerant && (
                                        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                                            <button
                                                onClick={() => handleSave(selectedCours.id)}
                                                disabled={saving}
                                                className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                                            >
                                                {saving ? 'Enregistrement…' : 'Enregistrer'}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(selectedCours)}
                                                title="Supprimer"
                                                className="text-red-400 hover:text-red-600 p-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                            >
                                                <TrashIcon/>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {ficheTab === 'eleves' && (
                                <div className="px-5 py-4 space-y-3">

                                    {/* Bouton + formulaire d'ajout */}
                                    {isGerant && (
                                        <div>
                                            {!showAddInscrit ? (
                                                <button
                                                    onClick={() => {
                                                        setShowAddInscrit(true);
                                                        setAddError('')
                                                    }}
                                                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-200 hover:border-brand-300 px-3 py-2 rounded-lg transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5"
                                                         fill="none" viewBox="0 0 24 24" strokeWidth={2.5}
                                                         stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round"
                                                              d="M12 4.5v15m7.5-7.5h-15"/>
                                                    </svg>
                                                    Inscrire un adhérent
                                                </button>
                                            ) : (
                                                <div
                                                    className="border border-brand-200 bg-brand-50/40 rounded-xl p-3 space-y-2.5">
                                                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Nouvelle
                                                        inscription</p>

                                                    {/* Recherche adhérent */}
                                                    <input
                                                        type="text"
                                                        placeholder="Rechercher un adhérent…"
                                                        value={adherentSearch}
                                                        onChange={e => setAdherentSearch(e.target.value)}
                                                        className={inputCls(false) + ' text-xs'}
                                                    />
                                                    <select
                                                        value={addForm.adherent_id}
                                                        onChange={e => setAddForm(f => ({
                                                            ...f,
                                                            adherent_id: e.target.value
                                                        }))}
                                                        className={inputCls(!addForm.adherent_id && addError) + ' text-xs'}
                                                    >
                                                        <option value="">Sélectionner…</option>
                                                        {adherents
                                                            .filter(a => {
                                                                const alreadyIn = new Set(eleves.map(e => e.adherent?.id))
                                                                const q = adherentSearch.toLowerCase()
                                                                return !alreadyIn.has(a.id) && (
                                                                    !q || `${a.nom} ${a.prenom}`.toLowerCase().includes(q)
                                                                )
                                                            })
                                                            .map(a => (
                                                                <option key={a.id}
                                                                        value={a.id}>{a.nom} {a.prenom}</option>
                                                            ))}
                                                    </select>

                                                    {/* Forfait (cours régulier uniquement) */}
                                                    {selectedCours.type === 'cours_regulier' && (
                                                        <select
                                                            value={addForm.offre_id}
                                                            onChange={e => setAddForm(f => ({
                                                                ...f,
                                                                offre_id: e.target.value
                                                            }))}
                                                            className={inputCls(!addForm.offre_id && addError) + ' text-xs'}
                                                        >
                                                            <option value="">Forfait…</option>
                                                            {(() => {
                                                                const selectedAdherent = adherents.find(a => a.id === addForm.adherent_id)
                                                                const age = calculateAge(selectedAdherent?.date_naissance)
                                                                return filterForfaitsByAge(forfaits, age)
                                                            })().map(f => (
                                                                <option key={f.id}
                                                                        value={f.id}>{f.label ?? f.libelle} — {Number(f.price ?? f.prix)} €</option>
                                                            ))}
                                                        </select>
                                                    )}

                                                    {/* Formule (stage uniquement) */}
                                                    {selectedCours.type === 'stage' && (
                                                        <>
                                                            <div className="flex gap-1.5 flex-wrap">
                                                                {[
                                                                    {value: 'journee', label: 'Journée'},
                                                                    ...(selectedCours.tarif?.prix_demi_journee_adherent != null ? [
                                                                        {value: 'matin', label: 'Matin'},
                                                                        {value: 'apres_midi', label: 'Après-midi'},
                                                                    ] : []),
                                                                ].map(opt => (
                                                                    <button
                                                                        key={opt.value}
                                                                        type="button"
                                                                        onClick={() => setAddForm(f => ({
                                                                            ...f,
                                                                            formule: opt.value
                                                                        }))}
                                                                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                                                                            addForm.formule === opt.value
                                                                                ? 'bg-purple-600 text-white border-purple-600'
                                                                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                                                        }`}
                                                                    >
                                                                        {opt.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* Mode de règlement */}
                                                    <select
                                                        value={addForm.mode_reglement}
                                                        onChange={e => setAddForm(f => ({
                                                            ...f,
                                                            mode_reglement: e.target.value
                                                        }))}
                                                        className={inputCls(!addForm.mode_reglement && addError) + ' text-xs'}
                                                    >
                                                        <option value="">Mode de règlement…</option>
                                                        {modesReglement.map(m => <option key={m}
                                                                                         value={m}>{m}</option>)}
                                                    </select>

                                                    {addError && <p className="text-xs text-red-500">{addError}</p>}

                                                    <div className="flex gap-2 justify-end pt-1">
                                                        <button
                                                            onClick={() => {
                                                                setShowAddInscrit(false);
                                                                setAddError('');
                                                                setAdherentSearch('')
                                                            }}
                                                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                                                        >
                                                            Annuler
                                                        </button>
                                                        <button
                                                            onClick={handleAddInscrit}
                                                            disabled={savingInscrit}
                                                            className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            {savingInscrit ? 'Inscription…' : 'Inscrire'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Liste des inscrits */}
                                    {loadingEleves ? (
                                        <LoadingSpinner/>
                                    ) : eleves.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            Aucun inscrit.
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {eleves.map(e => {
                                                const statut = STATUTS[e.statut] ?? STATUTS.creation
                                                return (
                                                    <Link
                                                        key={e.id}
                                                        to={`/adhesions/${e.id}`}
                                                        className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-gray-900 leading-tight">
                                                                {e.adherent?.nom} <span
                                                                className="font-normal">{e.adherent?.prenom}</span>
                                                            </p>
                                                            {e.adherent?.galop &&
                                                                <p className="text-xs text-gray-500 mt-0.5">{e.adherent.galop}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 ml-3">
                                                            <span
                                                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${statut.cls}`}>{statut.label}</span>
                                                            <span
                                                                className="text-gray-400 group-hover:text-brand-500 text-xs transition-colors">→</span>
                                                        </div>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal création ───────────────────────────────────────────────── */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div
                            className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">{creationLabel}</h2>
                                {/* Sélecteur de type */}
                                <div className="flex gap-1.5 mt-2">
                                    {Object.entries(TYPE_ACTIVITE).map(([key, meta]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setField('type', key)}
                                            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                                                form.type === key ? meta.cls : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent'
                                            }`}
                                        >
                                            {meta.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCreate(false)}
                                className="text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
                            >×
                            </button>
                        </div>

                        <div className="px-6 py-5">
                            <FormActivite
                                form={form} errors={errors} setField={setField} toggleNiveau={toggleNiveau}
                                togglePlan={togglePlan}
                                forfaits={forfaits} moniteurs={moniteurs} tarifsStage={tarifsStage} isGerant={true}
                            />
                        </div>

                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => handleSave(null)}
                                disabled={saving}
                                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
                            >
                                {saving ? 'Création…' : `Créer`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Formulaire partagé (fiche + modal) ────────────────────────────────────────
function FormActivite({
                          form,
                          errors,
                          setField,
                          toggleNiveau,
                          togglePlan,
                          forfaits = [],
                          moniteurs,
                          tarifsStage,
                          isGerant,
                          modeEdit = false
                      }) {
    const isRegulier = form.type === 'cours_regulier'
    const dis = !isGerant

    return (
        <div className="space-y-4">
            {/* Nom */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input
                    type="text"
                    value={form.nom}
                    onChange={e => setField('nom', e.target.value)}
                    disabled={dis}
                    placeholder={isRegulier ? 'Ex : Galop 3-4 — Samedi matin' : 'Ex : Stage Toussaint 2026'}
                    className={inputCls(errors.nom) + (dis ? ' bg-gray-50' : '')}
                    autoFocus={!modeEdit}
                />
                {errors.nom && <p className="text-xs text-red-500 mt-1">{errors.nom}</p>}
            </div>

            {isRegulier ? (
                <>
                    {/* Jour (cours régulier) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Jour *</label>
                        <select
                            value={form.jour}
                            onChange={e => setField('jour', e.target.value)}
                            disabled={dis}
                            className={inputCls(errors.jour) + (dis ? ' bg-gray-50' : '')}
                        >
                            <option value="">Sélectionner…</option>
                            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(j => (
                                <option key={j} value={j}>{j}</option>
                            ))}
                        </select>
                        {errors.jour && <p className="text-xs text-red-500 mt-1">{errors.jour}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Début *</label>
                            <input type="time" value={form.heure_debut}
                                   onChange={e => setField('heure_debut', e.target.value)} disabled={dis}
                                   className={inputCls(errors.heure_debut) + (dis ? ' bg-gray-50' : '')}/>
                            {errors.heure_debut && <p className="text-xs text-red-500 mt-1">{errors.heure_debut}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fin *</label>
                            <input type="time" value={form.heure_fin}
                                   onChange={e => setField('heure_fin', e.target.value)} disabled={dis}
                                   className={inputCls(errors.heure_fin) + (dis ? ' bg-gray-50' : '')}/>
                            {errors.heure_fin && <p className="text-xs text-red-500 mt-1">{errors.heure_fin}</p>}
                        </div>
                    </div>
                </>
            ) : (
                <>
                    {/* Dates (stage) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
                            <input type="date" value={form.date_debut}
                                   onChange={e => setField('date_debut', e.target.value)} disabled={dis}
                                   className={inputCls(errors.date_debut) + (dis ? ' bg-gray-50' : '')}/>
                            {errors.date_debut && <p className="text-xs text-red-500 mt-1">{errors.date_debut}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin *</label>
                            <input type="date" value={form.date_fin}
                                   onChange={e => setField('date_fin', e.target.value)} disabled={dis}
                                   className={inputCls(errors.date_fin) + (dis ? ' bg-gray-50' : '')}/>
                            {errors.date_fin && <p className="text-xs text-red-500 mt-1">{errors.date_fin}</p>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Heure de début</label>
                            <input type="time" value={form.heure_debut}
                                   onChange={e => setField('heure_debut', e.target.value)} disabled={dis}
                                   className={inputCls(false) + (dis ? ' bg-gray-50' : '')}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Heure de fin</label>
                            <input type="time" value={form.heure_fin}
                                   onChange={e => setField('heure_fin', e.target.value)} disabled={dis}
                                   className={inputCls(false) + (dis ? ' bg-gray-50' : '')}/>
                        </div>
                    </div>
                    {/* Grille tarifaire */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Grille tarifaire</label>
                        {(!tarifsStage || tarifsStage.length === 0) ? (
                            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                Aucune grille configurée — créez-en une dans <span className="font-semibold">Paramètres → Tarifs stages</span>.
                            </p>
                        ) : (
                            <>
                                <select
                                    value={form.tarif_stage_id}
                                    onChange={e => setField('tarif_stage_id', e.target.value)}
                                    disabled={dis}
                                    className={inputCls(false) + (dis ? ' bg-gray-50' : '')}
                                >
                                    <option value="">— Aucune grille —</option>
                                    {tarifsStage.map(t => (
                                        <option key={t.id} value={t.id}>{t.label}</option>
                                    ))}
                                </select>
                                {/* Aperçu des prix de la grille sélectionnée */}
                                {form.tarif_stage_id && (() => {
                                    const t = tarifsStage.find(x => x.id === form.tarif_stage_id)
                                    if (!t) return null
                                    return (
                                        <div
                                            className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                            <span className="text-gray-500">Journée adhérent</span>
                                            <span
                                                className="font-semibold text-gray-800 text-right">{t.prix_journee_adherent} €</span>
                                            <span className="text-gray-500">Journée non-adhérent</span>
                                            <span
                                                className="font-semibold text-gray-800 text-right">{t.prix_journee_non_adherent} €</span>
                                            {t.prix_demi_journee_adherent != null && <>
                                                <span className="text-gray-500">Demi-journée adhérent</span>
                                                <span
                                                    className="font-semibold text-gray-800 text-right">{t.prix_demi_journee_adherent} €</span>
                                                <span className="text-gray-500">Demi-journée non-adhérent</span>
                                                <span
                                                    className="font-semibold text-gray-800 text-right">{t.prix_demi_journee_non_adherent} €</span>
                                            </>}
                                        </div>
                                    )
                                })()}
                            </>
                        )}
                    </div>
                </>
            )}

            {/* Niveaux */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Niveaux <span
                    className="font-normal text-gray-500">(optionnel)</span></label>
                <div className="flex flex-wrap gap-1.5">
                    {GALOPS.map(g => (
                        <button
                            key={g}
                            type="button"
                            disabled={dis}
                            onClick={() => !dis && toggleNiveau(g)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                                form.niveaux.includes(g)
                                    ? 'bg-brand-600 text-white border-brand-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400 hover:text-brand-700'
                            } ${dis ? 'cursor-default opacity-70' : ''}`}
                        >
                            {g}
                        </button>
                    ))}
                </div>
            </div>

            {/* Forfaits associés — cours régulier seulement */}
            {isRegulier && forfaits.length > 0 && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Forfaits associés
                        <span className="font-normal text-gray-400 ml-1">(vide = tous les forfaits)</span>
                    </label>
                    <div className="space-y-1.5 border border-gray-200 rounded-lg px-3 py-2 max-h-36 overflow-y-auto">
                        {forfaits.map(f => {
                            const checked = form.plan_ids.includes(f.id)
                            return (
                                <label key={f.id} className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={dis}
                                        onChange={() => !dis && togglePlan(f.id)}
                                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className="text-sm text-gray-700">
                    {f.label}
                                        <span className="text-gray-400 ml-1.5 text-xs">
                      {Number(f.price)} €{f.session_count ? ` · ${f.session_count} séances` : ' · Annuel'}
                    </span>
                  </span>
                                </label>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Capacité */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de places *</label>
                <input
                    type="number" min="1"
                    value={form.capacite}
                    onChange={e => setField('capacite', e.target.value)}
                    disabled={dis}
                    placeholder="Ex : 10"
                    className={inputCls(errors.capacite) + (dis ? ' bg-gray-50' : '')}
                />
                {errors.capacite && <p className="text-xs text-red-500 mt-1">{errors.capacite}</p>}
            </div>

            {/* Description */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span
                    className="font-normal text-gray-500">(optionnel)</span></label>
                <textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setField('description', e.target.value)}
                    disabled={dis}
                    className={inputCls(false) + ' resize-none' + (dis ? ' bg-gray-50' : '')}
                    placeholder="Informations complémentaires…"
                />
            </div>

            {/* Tranche d'âge */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tranche d'âge <span
                    className="font-normal text-gray-500">(optionnel)</span></label>
                <div className="grid grid-cols-2 gap-3">
                    <input
                        type="number" min="0"
                        value={form.min_age}
                        onChange={e => setField('min_age', e.target.value)}
                        disabled={dis}
                        placeholder="Âge min"
                        className={inputCls(false) + (dis ? ' bg-gray-50' : '')}
                    />
                    <input
                        type="number" min="0"
                        value={form.max_age}
                        onChange={e => setField('max_age', e.target.value)}
                        disabled={dis}
                        placeholder="Âge max"
                        className={inputCls(false) + (dis ? ' bg-gray-50' : '')}
                    />
                </div>
            </div>

            {/* Moniteur */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Moniteur <span
                    className="font-normal text-gray-500">(optionnel)</span></label>
                <select
                    value={form.moniteur_id}
                    onChange={e => setField('moniteur_id', e.target.value)}
                    disabled={dis}
                    className={inputCls(false) + (dis ? ' bg-gray-50' : '')}
                >
                    <option value="">— Aucun —</option>
                    {moniteurs.map(m => (
                        <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>
                    ))}
                </select>
            </div>
        </div>
    )
}
