import {useCallback, useEffect, useMemo, useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {useSaison} from '../contexts/SaisonContext'
import {useAuth} from '../contexts/AuthContext'
import {STATUTS} from '../lib/constants'
import TrashIcon from '../components/TrashIcon'
import LoadingSpinner from '../components/LoadingSpinner'

// ── Icône de tri ─────────────────────────────────────────────────────────────
function SortIcon({col, sortCol, sortDir}) {
    const active = sortCol === col
    return (
        <span className={`inline-flex flex-col ml-1.5 gap-[2px] ${active ? 'opacity-100' : 'opacity-30'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4"
           className={`w-1.5 h-1 ${active && sortDir === 'asc' ? 'text-brand-600' : 'text-current'}`}
           fill="currentColor">
        <path d="M3 0 6 4H0z"/>
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4"
           className={`w-1.5 h-1 ${active && sortDir === 'desc' ? 'text-brand-600' : 'text-current'}`}
           fill="currentColor">
        <path d="M3 4 0 0h6z"/>
      </svg>
    </span>
    )
}

// Priorité de statut : pre_inscription > valide > complete
const STATUT_PRIORITY = {pre_inscription: 0, valide: 1, complete: 2}

function aggregateStatut(inscriptions) {
    if (!inscriptions.length) return 'pre_inscription'
    return inscriptions.reduce((worst, insc) => {
        const pw = STATUT_PRIORITY[worst] ?? 0
        const pi = STATUT_PRIORITY[insc.statut] ?? 0
        return pi < pw ? insc.statut : worst
    }, inscriptions[0].statut)
}

// ── Statut de règlement ───────────────────────────────────────────────────────
// solde    : encaissé >= total
// recu     : (encaissé + reçu) >= total — tout reçu, pas encore tout en banque
// partiel  : quelque chose reçu/encaissé mais insuffisant
// nonRegle : rien de reçu (seulement planifié ou rien)
// nc       : pas de montant configuré
const REGL_META = {
    solde: {label: 'Soldé', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', priority: 0},
    recu: {label: 'Reçu', cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-400', priority: 1},
    partiel: {label: 'Partiel', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400', priority: 2},
    nonRegle: {label: 'Non réglé', cls: 'bg-red-100 text-red-600', dot: 'bg-red-400', priority: 3},
    nc: {label: '—', cls: 'text-gray-300', dot: 'bg-gray-200', priority: 4},
}

function reglementStatut(inscriptions) {
    const montantTotal = inscriptions.reduce((s, i) => s + Number(i.total_amount ?? i.montant_total ?? 0), 0)
    if (montantTotal === 0) return 'nc'

    const paiements = inscriptions.flatMap(i => i.paiements ?? [])
    const encaisse = paiements
        .filter(p => (p.status ?? p.statut) === 'encaisse' && p.type !== 'remboursement')
        .reduce((s, p) => s + Number(p.amount ?? p.montant), 0)
    const rembourse = paiements
        .filter(p => (p.status ?? p.statut) === 'encaisse' && p.type === 'remboursement')
        .reduce((s, p) => s + Number(p.amount ?? p.montant), 0)
    const recuMontant = paiements
        .filter(p => (p.status ?? p.statut) === 'recu')
        .reduce((s, p) => s + Number(p.amount ?? p.montant), 0)

    const net = Math.round((encaisse - rembourse) * 100) / 100
    const tot = Math.round(montantTotal * 100) / 100

    if (net >= tot) return 'solde'
    if (net + recuMontant >= tot) return 'recu'
    if (net > 0 || recuMontant > 0) return 'partiel'
    return 'nonRegle'
}

export default function Adhesions() {
    const {saisonCourante} = useSaison()
    const {profile, clubId} = useAuth()
    const isGerant = profile?.role === 'gérant'

    // adhesions = liste de { adherent_id, adherent, inscriptions[], created_at }
    const [adhesions, setAdhesions] = useState([])
    const [coursOptions, setCoursOptions] = useState([])
    const [pointagesCounts, setPointagesCounts] = useState({})
    const [offresMap, setOffresMap] = useState({}) // { [id]: offre }
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterCours, setFilterCours] = useState('')
    const [filterStatut, setFilterStatut] = useState('')
    const [sortCol, setSortCol] = useState('created_at')
    const [sortDir, setSortDir] = useState('desc')

    const fetchAll = useCallback(async () => {
        if (!saisonCourante?.id || !clubId) return
        setLoading(true)
        const [
            {data: adhesionsData},
            {data: coursData},
            {data: pointagesData},
            {data: offresData},
        ] = await Promise.all([
            supabase
                .from('enrollments')
                .select(`
          *,
          adherent:member_id(id, last_name, first_name, email, phone, birth_date, galop),
          cours:activity_id(id, nom),
          forfait:plan_id(id, label, price, session_count, is_annual),
          paiements:payments(id, amount, status, type)
        `)
                .eq('season_id', saisonCourante.id)
                .eq('club_id', clubId)
                .order('created_at', {ascending: false}),
            supabase.from('activities').select('id, nom').eq('season_id', saisonCourante.id).eq('club_id', clubId).eq('type', 'cours_regulier').order('nom'),
            supabase
                .from('attendance')
                .select('member_id, activity_id, activity:activity_id!inner(season_id)')
                .eq('club_id', clubId)
                .eq('activity.season_id', saisonCourante.id),
            supabase.from('plans').select('id, session_count, is_annual').eq('club_id', clubId),
        ])

        // Grouper par member_id : un objet par adhérent
        if (adhesionsData) {
            const grouped = {}
            adhesionsData.forEach(insc => {
                const aid = insc.member_id
                if (!grouped[aid]) {
                    grouped[aid] = {
                        adherent_id: aid,
                        adherent: insc.adherent ? {
                            ...insc.adherent,
                            // Legacy aliases for existing render code
                            nom: insc.adherent.last_name,
                            prenom: insc.adherent.first_name,
                            telephone: insc.adherent.phone,
                        } : null,
                        inscriptions: [],
                        created_at: insc.created_at,
                    }
                }
                grouped[aid].inscriptions.push({
                    ...insc,
                    adherent_id: insc.member_id,
                    saison_id: insc.season_id,
                    activite_id: insc.activity_id,
                    offre_id: insc.plan_id,
                    montant_total: insc.total_amount,
                    statut: insc.status,
                    // normalize nested paiements
                    paiements: (insc.paiements ?? []).map(p => ({
                        ...p,
                        montant: p.amount ?? p.montant,
                        statut: p.status ?? p.statut,
                    })),
                    // normalize nested forfait
                    forfait: insc.forfait ? {
                        ...insc.forfait,
                        libelle: insc.forfait.label,
                        prix: insc.forfait.price,
                        nb_seances: insc.forfait.session_count,
                    } : null,
                })
                if (insc.created_at < grouped[aid].created_at) {
                    grouped[aid].created_at = insc.created_at
                }
            })
            setAdhesions(Object.values(grouped))
        }

        if (coursData) setCoursOptions(coursData)
        if (offresData) setOffresMap(Object.fromEntries(offresData.map(o => [o.id, {
            ...o,
            nb_seances: o.session_count
        }])))
        if (pointagesData) {
            const counts = {}
            pointagesData.forEach(p => {
                counts[p.member_id] = (counts[p.member_id] || 0) + 1
            })
            setPointagesCounts(counts)
        }
        setLoading(false)
    }, [saisonCourante?.id, clubId])

    useEffect(() => {
        fetchAll()
    }, [fetchAll])

    // Change le statut de toutes les inscriptions de cet adhérent pour la saison
    async function handleStatutChange(adherentId, newStatut) {
        if (!isGerant) return
        setAdhesions(prev => prev.map(a => {
            if (a.adherent_id !== adherentId) return a
            return {...a, inscriptions: a.inscriptions.map(i => ({...i, statut: newStatut}))}
        }))
        const inscIds = adhesions.find(a => a.adherent_id === adherentId)?.inscriptions.map(i => i.id) ?? []
        if (inscIds.length) {
            await supabase.from('enrollments').update({status: newStatut}).in('id', inscIds)
        }
    }

    // Supprime toutes les inscriptions de cet adhérent pour la saison
    async function handleDelete(a) {
        if (!isGerant) return
        const nom = `${a.adherent?.prenom} ${a.adherent?.nom}`
        const nb = a.inscriptions.length
        if (!window.confirm(`Supprimer ${nb > 1 ? `les ${nb} inscriptions` : "l'inscription"} de ${nom} pour cette saison ?\n\nLa fiche personnelle de l'adhérent sera conservée.`)) return
        const inscIds = a.inscriptions.map(i => i.id)
        await supabase.from('enrollments').delete().in('id', inscIds)
        fetchAll()
    }

    function exportCsv() {
        const headers = ['Nom', 'Prénom', 'Email', 'Téléphone', 'Activités', 'Statut', 'Séances']
        const rows = filtered.map(a => {
            const statut = aggregateStatut(a.inscriptions)
            const activites = a.inscriptions.map(i => i.cours?.nom ?? i.type ?? '?').join(' | ')
            return [
                a.adherent?.nom ?? '', a.adherent?.prenom ?? '',
                a.adherent?.email ?? '', a.adherent?.telephone ?? '',
                activites, STATUTS[statut]?.label ?? statut,
                (() => {
                    const done = pointagesCounts[a.adherent_id] ?? 0
                    const cap = a.inscriptions.filter(i => i.type === 'cours_annuel')
                        .flatMap(i => [i.forfait, ...(i.extra_plan_ids ?? i.offres_complementaires ?? []).map(id => offresMap[id])].filter(Boolean))
                        .reduce((s, o) => s + (o.session_count ?? o.nb_seances ?? 0), 0)
                    return cap > 0 ? `${done}/${cap}` : done
                })(),
            ]
        })
        const csv = [headers, ...rows]
            .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n')
        const blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8;'})
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `adhesions_${saisonCourante?.name ?? 'export'}_${new Date().toISOString().slice(0, 10)}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    // Métriques (par adhérent)
    const metrics = useMemo(() => ({
        preinscrits: adhesions.filter(a => aggregateStatut(a.inscriptions) === 'pre_inscription').length,
        valides: adhesions.filter(a => aggregateStatut(a.inscriptions) === 'valide').length,
        complets: adhesions.filter(a => aggregateStatut(a.inscriptions) === 'complete').length,
    }), [adhesions])

    // Filtrage + tri
    const filtered = useMemo(() => {
        let list = [...adhesions]

        if (search) {
            const q = search.toLowerCase()
            list = list.filter(a =>
                a.adherent?.nom?.toLowerCase().includes(q) ||
                a.adherent?.prenom?.toLowerCase().includes(q)
            )
        }
        // filtre cours : l'adhérent a au moins une inscription dans ce cours
        if (filterCours) {
            list = list.filter(a => a.inscriptions.some(i => i.activite_id === filterCours))
        }
        // filtre statut : basé sur le statut agrégé
        if (filterStatut) {
            list = list.filter(a => aggregateStatut(a.inscriptions) === filterStatut)
        }

        list.sort((a, b) => {
            let va, vb
            switch (sortCol) {
                case 'nom':
                    va = a.adherent?.nom ?? '';
                    vb = b.adherent?.nom ?? '';
                    break
                case 'prenom':
                    va = a.adherent?.prenom ?? '';
                    vb = b.adherent?.prenom ?? '';
                    break
                case 'statut':
                    va = STATUT_PRIORITY[aggregateStatut(a.inscriptions)] ?? 1;
                    vb = STATUT_PRIORITY[aggregateStatut(b.inscriptions)] ?? 1;
                    break
                case 'conso':
                    va = pointagesCounts[a.adherent_id] ?? 0;
                    vb = pointagesCounts[b.adherent_id] ?? 0;
                    break
                case 'regl':
                    va = REGL_META[reglementStatut(a.inscriptions)]?.priority ?? 9;
                    vb = REGL_META[reglementStatut(b.inscriptions)]?.priority ?? 9;
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
    }, [adhesions, search, filterCours, filterStatut, sortCol, sortDir, pointagesCounts])

    function toggleSort(col) {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else {
            setSortCol(col);
            setSortDir('asc')
        }
    }

    function clearFilters() {
        setSearch('');
        setFilterCours('');
        setFilterStatut('')
    }

    const hasFilters = search || filterCours || filterStatut

    const thBase = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors group'
    const thCls = col => `${thBase} ${sortCol === col ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`
    const td = 'px-4 py-3.5 text-sm text-gray-800 whitespace-nowrap'

    return (
        <div className="p-6 md:p-8">

            {/* Header */}
            <div className="flex items-start justify-between mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Adhérents</h1>
                    {saisonCourante && (
                        <p className="text-sm text-gray-500 mt-0.5">Saison {saisonCourante.libelle}</p>
                    )}
                </div>
                <Link
                    to="/adhesions/nouveau"
                    className="shrink-0 inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-150"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                         strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                    </svg>
                    Nouvelle inscription
                </Link>
            </div>

            {/* Métriques */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <Metric label="Pré-inscrits" value={loading ? null : metrics.preinscrits} accent="amber"/>
                <Metric label="Validés" value={loading ? null : metrics.valides} accent="blue"/>
                <Metric label="Inscrits complets" value={loading ? null : metrics.complets} accent="green"/>
            </div>

            {/* Barre filtres */}
            <div className="flex gap-2.5 mb-4 flex-wrap items-center">
                <div className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg"
                         className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                         fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round"
                              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
                    </svg>
                    <input
                        type="text"
                        placeholder="Nom, prénom…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm w-48 placeholder:text-gray-400"
                    />
                </div>

                <select
                    value={filterCours}
                    onChange={e => setFilterCours(e.target.value)}
                    className={`rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm transition-colors ${filterCours ? 'border-brand-300 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-white text-gray-700'}`}
                >
                    <option value="">Tous les cours</option>
                    {coursOptions.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>

                <select
                    value={filterStatut}
                    onChange={e => setFilterStatut(e.target.value)}
                    className={`rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm transition-colors ${filterStatut ? 'border-brand-300 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-white text-gray-700'}`}
                >
                    <option value="">Tous les statuts</option>
                    {Object.entries(STATUTS).map(([v, {label}]) => (
                        <option key={v} value={v}>{label}</option>
                    ))}
                </select>

                {hasFilters && (
                    <button
                        onClick={clearFilters}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl px-3 py-2 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24"
                             strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
                        </svg>
                        Effacer
                    </button>
                )}

                <button
                    onClick={exportCsv}
                    className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium border border-gray-200 bg-white rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors shadow-sm text-gray-700"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-500" fill="none"
                         viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round"
                              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                    </svg>
                    Exporter CSV
                </button>
            </div>

            {/* Tableau */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                {loading ? (
                    <LoadingSpinner/>
                ) : filtered.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none"
                                 viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                      d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
                            </svg>
                        </div>
                        <p className="text-gray-700 font-medium text-sm">
                            {adhesions.length === 0 ? 'Aucune inscription pour cette saison' : 'Aucun résultat'}
                        </p>
                        {hasFilters && (
                            <button onClick={clearFilters}
                                    className="text-brand-600 hover:text-brand-800 text-xs font-medium">
                                Effacer les filtres
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="border-b border-gray-200">
                                <tr>
                                    <th className={thCls('nom')} onClick={() => toggleSort('nom')}>
                                        <span className="flex items-center">Nom <SortIcon col="nom" sortCol={sortCol}
                                                                                          sortDir={sortDir}/></span>
                                    </th>
                                    <th className={thCls('prenom')} onClick={() => toggleSort('prenom')}>
                                        <span className="flex items-center">Prénom <SortIcon col="prenom"
                                                                                             sortCol={sortCol}
                                                                                             sortDir={sortDir}/></span>
                                    </th>
                                    <th className={`${thBase} cursor-default hover:bg-transparent text-gray-500`}>
                                        Cours
                                    </th>
                                    <th className={thCls('statut')} onClick={() => toggleSort('statut')}>
                                        <span className="flex items-center">Statut <SortIcon col="statut"
                                                                                             sortCol={sortCol}
                                                                                             sortDir={sortDir}/></span>
                                    </th>
                                    <th className={thCls('conso')} onClick={() => toggleSort('conso')}>
                                        <span className="flex items-center">Séances <SortIcon col="conso"
                                                                                              sortCol={sortCol}
                                                                                              sortDir={sortDir}/></span>
                                    </th>
                                    <th className={thCls('regl')} onClick={() => toggleSort('regl')}>
                                        <span className="flex items-center">Règlement <SortIcon col="regl"
                                                                                                sortCol={sortCol}
                                                                                                sortDir={sortDir}/></span>
                                    </th>
                                    <th className={`${thBase} text-right pr-5 cursor-default hover:bg-transparent text-gray-500`}>
                                        Actions
                                    </th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                {filtered.map(a => {
                                    const statut = aggregateStatut(a.inscriptions)
                                    const statutMeta = STATUTS[statut] ?? STATUTS.pre_inscription
                                    const seancesConso = pointagesCounts[a.adherent_id] ?? 0

                                    // Cap cumulé : somme des nb_seances de tous les forfaits (cours annuels)
                                    const seancesCap = a.inscriptions
                                        .filter(i => i.type === 'cours_annuel')
                                        .flatMap(i => {
                                            const offrePrincipal = i.forfait ?? null
                                            const offresCompl = (i.extra_plan_ids ?? i.offres_complementaires ?? []).map(id => offresMap[id]).filter(Boolean)
                                            return [offrePrincipal, ...offresCompl].filter(Boolean)
                                        })
                                        .reduce((sum, o) => sum + (o.session_count ?? o.nb_seances ?? 0), 0)

                                    const seancesPct = seancesCap > 0 ? Math.min(100, (seancesConso / seancesCap) * 100) : 0

                                    return (
                                        <tr key={a.adherent_id} className="hover:bg-gray-50 transition-colors group">
                                            {/* Nom */}
                                            <td className={`${td} font-semibold text-gray-900`}>
                                                {a.adherent?.nom ?? <span className="text-gray-400">—</span>}
                                            </td>
                                            {/* Prénom */}
                                            <td className={td}>
                                                {a.adherent?.prenom ?? <span className="text-gray-400">—</span>}
                                            </td>
                                            {/* Cours */}
                                            <td className={`${td} max-w-[200px]`}>
                                                {(() => {
                                                    const cours = a.inscriptions.filter(i => i.type === 'cours_annuel')
                                                    const premier = cours[0]?.cours?.nom ?? cours[0]?.cours?.nom ?? null
                                                    const reste = cours.length - 1
                                                    if (!premier) return <span className="text-gray-400">—</span>
                                                    return (
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span
                                                                className="text-sm text-gray-800 truncate">{premier}</span>
                                                            {reste > 0 && (
                                                                <span
                                                                    className="shrink-0 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                    +{reste}
                                  </span>
                                                            )}
                                                        </div>
                                                    )
                                                })()}
                                            </td>
                                            {/* Statut */}
                                            <td className={td}>
                                                <select
                                                    value={statut}
                                                    onChange={e => handleStatutChange(a.adherent_id, e.target.value)}
                                                    disabled={!isGerant}
                                                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-brand-400 ${statutMeta.cls} ${isGerant ? 'cursor-pointer' : 'cursor-default'}`}
                                                >
                                                    {Object.entries(STATUTS).map(([v, {label}]) => (
                                                        <option key={v} value={v}>{label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            {/* Séances — jauge */}
                                            <td className={td}>
                                                {seancesConso === 0 && seancesCap === 0 ? (
                                                    <span className="text-gray-300">—</span>
                                                ) : (
                                                    <div className="flex items-center gap-2 min-w-[100px]">
                                                        {seancesCap > 0 && (
                                                            <div
                                                                className="w-16 bg-gray-100 rounded-full h-1.5 shrink-0">
                                                                <div
                                                                    className={`h-1.5 rounded-full transition-all ${seancesPct >= 100 ? 'bg-amber-500' : 'bg-brand-500'}`}
                                                                    style={{width: `${seancesPct}%`}}
                                                                />
                                                            </div>
                                                        )}
                                                        <span
                                                            className={`text-xs tabular-nums font-medium ${seancesCap > 0 && seancesConso >= seancesCap ? 'text-amber-600' : 'text-gray-600'}`}>
                                {seancesConso}{seancesCap > 0 ? `/${seancesCap}` : ''}
                              </span>
                                                    </div>
                                                )}
                                            </td>
                                            {/* Règlement */}
                                            <td className={td}>
                                                {(() => {
                                                    const rs = reglementStatut(a.inscriptions)
                                                    const meta = REGL_META[rs]
                                                    if (rs === 'nc') return <span
                                                        className="text-gray-300 text-xs">—</span>
                                                    return (
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${meta.cls}`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`}/>
                                                            {meta.label}
                              </span>
                                                    )
                                                })()}
                                            </td>
                                            {/* Actions */}
                                            <td className={`${td} text-right`}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Link
                                                        to={`/adherents/${a.adherent_id}`}
                                                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-white hover:bg-brand-600 px-2.5 py-1 rounded-lg border border-brand-200 hover:border-brand-600 transition-all duration-150"
                                                    >
                                                        Voir
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3"
                                                             fill="none" viewBox="0 0 24 24" strokeWidth={2.5}
                                                             stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                                  d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
                                                        </svg>
                                                    </Link>
                                                    {isGerant && (
                                                        <button
                                                            onClick={() => handleDelete(a)}
                                                            title="Supprimer les inscriptions"
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all duration-150"
                                                        >
                                                            <TrashIcon/>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                            <p className="text-xs text-gray-500">
                                <span className="font-semibold text-gray-700">{filtered.length}</span>{' '}
                                adhérent{filtered.length > 1 ? 's' : ''}
                                {filtered.length !== adhesions.length && (
                                    <span className="text-gray-500"> sur {adhesions.length}</span>
                                )}
                            </p>
                            {hasFilters && (
                                <button onClick={clearFilters}
                                        className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors">
                                    Effacer les filtres
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function Metric({label, value, accent}) {
    const styles = {
        green: {num: 'text-emerald-700', light: 'bg-white border-gray-200', dot: 'bg-emerald-500'},
        amber: {num: 'text-amber-700', light: 'bg-white border-gray-200', dot: 'bg-amber-500'},
        blue: {num: 'text-blue-700', light: 'bg-white border-gray-200', dot: 'bg-blue-500'},
    }
    const s = styles[accent] ?? {num: 'text-gray-900', light: 'bg-white border-gray-200', dot: 'bg-gray-400'}
    return (
        <div className={`${s.light} border rounded-2xl p-5 shadow-sm`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
                <div className={`w-2 h-2 rounded-full ${s.dot}`}/>
            </div>
            <p className={`text-3xl font-bold tabular-nums ${s.num}`}>
                {value === null ? <span className="text-gray-300 animate-pulse">—</span> : value}
            </p>
        </div>
    )
}
