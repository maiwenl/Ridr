import {useEffect, useMemo, useState} from 'react'
import {supabase} from '../lib/supabase'
import {useSaison} from '../contexts/SaisonContext'
import {useAuth} from '../contexts/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import {NB_FOIS_OPTIONS} from '../lib/constants'

// ── Utilitaires semaines ISO ──────────────────────────────────────────────────

function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return {
        num: Math.ceil((((d - yearStart) / 86400000) + 1) / 7),
        year: d.getUTCFullYear(),
    }
}

function getMondayOfISOWeek(num, year) {
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const jan4day = jan4.getUTCDay() || 7
    const monday = new Date(jan4)
    monday.setUTCDate(jan4.getUTCDate() - jan4day + 1 + (num - 1) * 7)
    return monday
}

function generateWeeks(debutStr, finStr) {
    if (!debutStr || !finStr) return []
    const debut = new Date(debutStr)
    const fin = new Date(finStr)
    if (debut > fin) return []
    const {num, year} = getISOWeek(debut)
    let current = getMondayOfISOWeek(num, year)
    const weeks = []
    while (current <= fin) {
        const {num: w, year: y} = getISOWeek(current)
        const sunday = new Date(current)
        sunday.setUTCDate(sunday.getUTCDate() + 6)
        weeks.push({key: `${y}-W${String(w).padStart(2, '0')}`, num: w, year: y, start: new Date(current), end: sunday})
        current = new Date(current)
        current.setUTCDate(current.getUTCDate() + 7)
    }
    return weeks
}

function groupByMonth(weeks) {
    const map = new Map()
    weeks.forEach(w => {
        const k = `${w.start.getUTCFullYear()}-${w.start.getUTCMonth()}`
        const label = w.start.toLocaleDateString('fr-FR', {month: 'long', year: 'numeric', timeZone: 'UTC'})
        if (!map.has(k)) map.set(k, {label, weeks: []})
        map.get(k).weeks.push(w)
    })
    return [...map.values()]
}

const fmtShort = d => d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', timeZone: 'UTC'})

// ── Modes de règlement par défaut ─────────────────────────────────────────────
const REGLEMENT_DEFAUT = ['Chèque', 'Virement', 'Carte bancaire', 'Espèces']

// ── Forfait vide ─────────────────────────────────────────────────────────────
const INIT_FORFAIT = {label: '', price: '', session_count: '', is_annual: false}

// ── Grille tarifaire stage vide ───────────────────────────────────────────────
const INIT_TARIF_STAGE = {
    label: '',
    prix_journee_adherent: '',
    prix_journee_non_adherent: '',
    prix_demi_journee_adherent: '',
    prix_demi_journee_non_adherent: '',
}

// ── Page Paramètres ───────────────────────────────────────────────────────────

export default function Parametres() {
    const {saisons, saisonCourante, creerSaison, setActive: setSaisonActive, supprimerSaison} = useSaison()
    const {clubId} = useAuth()

    // ── Saisons
    const [newAnnee, setNewAnnee] = useState('')
    const [creantSaison, setCreantSaison] = useState(false)
    const [saisonError, setSaisonError] = useState('')
    const [togglingActive, setTogglingActive] = useState(null)
    const [deletingSaison, setDeletingSaison] = useState(null)
    const [deleteError, setDeleteError] = useState('')

    const [loading, setLoading] = useState(true)

    // ── Copie de paramètres vers une autre saison
    const [showCopieModal, setShowCopieModal] = useState(false)
    const [cibleSaisonId, setCibleSaisonId] = useState('')
    const [copying, setCopying] = useState(false)
    const [copyResult, setCopyResult] = useState('')

    // ── Calendrier
    const [debut, setDebut] = useState('')
    const [fin, setFin] = useState('')
    const [inactives, setInactives] = useState(new Set())
    const [savingSaison, setSavingSaison] = useState(false)
    const [savedSaison, setSavedSaison] = useState(false)
    const [errorSaison, setErrorSaison] = useState('')

    // ── Licence & acompte
    const [licenceMineur, setLicenceMineur] = useState('25')
    const [licenceMajeur, setLicenceMajeur] = useState('36')
    const [acompteMontant, setAcompteMontant] = useState('0')
    const [savingTarifs, setSavingTarifs] = useState(false)
    const [savedTarifs, setSavedTarifs] = useState(false)

    // ── Modes de règlement
    const [reglements, setReglements] = useState([])
    const [newReglement, setNewReglement] = useState('')
    const [savedRegl, setSavedRegl] = useState(false)

    // ── Échelonnement du paiement
    const [nbPaiementsAcceptes, setNbPaiementsAcceptes] = useState(new Set(NB_FOIS_OPTIONS))
    const [savedNbPaiements, setSavedNbPaiements] = useState(false)

    // ── Règlement intérieur
    const [reglementInterieur, setReglementInterieur] = useState('')
    const [savingReglement, setSavingReglement] = useState(false)
    const [savedReglement, setSavedReglement] = useState(false)

    // ── Forfaits
    const [forfaits, setForfaits] = useState([])
    const [loadingForfaits, setLoadingForfaits] = useState(true)
    const [showForfaitForm, setShowForfaitForm] = useState(false)
    const [editingForfait, setEditingForfait] = useState(null)

    // ── Remises prédéfinies
    const [remises, setRemises] = useState([])
    const [remiseForm, setRemiseForm] = useState({label: '', amount: ''})
    const [remiseErrors, setRemiseErrors] = useState({})
    const [savingRemise, setSavingRemise] = useState(false)
    const [showRemiseForm, setShowRemiseForm] = useState(false)

    // ── Tarifs stage
    const [tarifsStage, setTarifsStage] = useState([])
    const [showTarifStageForm, setShowTarifStageForm] = useState(false)
    const [editingTarifStage, setEditingTarifStage] = useState(null)   // id | null
    const [tarifStageForm, setTarifStageForm] = useState(INIT_TARIF_STAGE)
    const [tarifStageErrors, setTarifStageErrors] = useState({})
    const [savingTarifStage, setSavingTarifStage] = useState(false)
    const [forfaitForm, setForfaitForm] = useState(INIT_FORFAIT)
    const [forfaitErrors, setForfaitErrors] = useState({})
    const [savingForfait, setSavingForfait] = useState(false)

    // ── Chargement des settings — re-charge à chaque changement de saison
    useEffect(() => {
        if (!clubId || !saisonCourante?.id) {
            setLoading(false);
            setForfaits([]);
            setLoadingForfaits(false);
            return
        }
        setLoading(true)
        setLoadingForfaits(true)
        // Réinitialise les valeurs avant de charger
        setLicenceMineur('25')
        setLicenceMajeur('36')
        setAcompteMontant('0')
        setReglementInterieur('')
        setReglements(REGLEMENT_DEFAUT)
        setNbPaiementsAcceptes(new Set(NB_FOIS_OPTIONS))

        // Forfaits, tarifs stages et remises par saison
        supabase.from('plans').select('*').eq('club_id', clubId).eq('season_id', saisonCourante.id).order('price').then(({data}) => {
            setForfaits(data ?? [])
            setLoadingForfaits(false)
        })
        supabase.from('camp_rates').select('*').eq('club_id', clubId).eq('season_id', saisonCourante.id).order('label').then(({data}) => {
            setTarifsStage(data ?? [])
        })
        supabase.from('discounts').select('*').eq('club_id', clubId).eq('season_id', saisonCourante.id).order('label').then(({data}) => {
            setRemises(data ?? [])
        })

        supabase.from('settings').select('key, value')
            .eq('club_id', clubId)
            .eq('season_id', saisonCourante.id)
            .then(({data}) => {
                if (data?.length) {
                    const map = Object.fromEntries(data.map(p => [p.key, p.value]))
                    if (map.licence_mineur) setLicenceMineur(map.licence_mineur)
                    if (map.licence_majeur) setLicenceMajeur(map.licence_majeur)
                    if (map.acompte_montant) setAcompteMontant(map.acompte_montant)
                    if (map.reglement_interieur) setReglementInterieur(map.reglement_interieur)
                    if (map.modes_reglement) {
                        try {
                            setReglements(JSON.parse(map.modes_reglement))
                        } catch { /* garde défaut */
                        }
                    }
                    if (map.nb_paiements_acceptes) {
                        try {
                            setNbPaiementsAcceptes(new Set(JSON.parse(map.nb_paiements_acceptes)))
                        } catch { /* garde défaut */
                        }
                    }
                }
                setLoading(false)
            })
    }, [clubId, saisonCourante?.id])

    // ── Chargement du calendrier — re-charge à chaque changement de saison
    useEffect(() => {
        if (!saisonCourante?.id) return
        // Réinitialise avant de charger pour éviter d'afficher le calendrier de la saison précédente
        setDebut('')
        setFin('')
        setInactives(new Set())

        supabase
            .from('season_calendar')
            .select('start_date, end_date, inactive_weeks')
            .eq('season_id', saisonCourante.id)
            .maybeSingle()
            .then(({data}) => {
                if (!data) return
                setDebut(data.start_date ?? '')
                setFin(data.end_date ?? '')
                setInactives(new Set(data.inactive_weeks ?? []))
            })
    }, [saisonCourante?.id])

    // ── Calendrier
    const weeks = useMemo(() => generateWeeks(debut, fin), [debut, fin])
    const groups = useMemo(() => groupByMonth(weeks), [weeks])
    const nbActives = weeks.length - inactives.size

    function toggleWeek(key) {
        setInactives(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    function toggleAllWeeks(active) {
        if (active) setInactives(new Set())
        else setInactives(new Set(weeks.map(w => w.key)))
    }

    async function saveSaison() {
        if (!saisonCourante?.id) return
        setSavingSaison(true)
        setErrorSaison('')
        const [resCal, resForfait] = await Promise.all([
            supabase.from('season_calendar').upsert(
                {
                    season_id: saisonCourante.id,
                    start_date: debut,
                    end_date: fin,
                    inactive_weeks: [...inactives],
                    club_id: clubId
                },
                {onConflict: 'season_id'}
            ),
            // Met à jour session_count des forfaits annuels de la saison avec le nombre de semaines actives
            supabase.from('plans')
                .update({session_count: nbActives})
                .eq('is_annual', true)
                .eq('club_id', clubId)
                .eq('season_id', saisonCourante.id),
        ])
        setSavingSaison(false)
        const err = resCal.error ?? resForfait.error
        if (err) {
            setErrorSaison(err.message)
            console.error('saveSaison error', err)
            return
        }
        // Reflète le changement dans la liste des forfaits affichée
        setForfaits(prev => prev.map(f =>
            f.is_annual ? {...f, session_count: nbActives} : f
        ))
        setSavedSaison(true)
        setTimeout(() => setSavedSaison(false), 2000)
    }

    function settingRow(key, value) {
        return {key, value, club_id: clubId, season_id: saisonCourante.id}
    }

    // ── Tarifs & remises
    async function saveTarifs() {
        if (!saisonCourante?.id) return
        setSavingTarifs(true)
        await Promise.all([
            supabase.from('settings').upsert(settingRow('licence_mineur', licenceMineur), {onConflict: 'key,club_id,season_id'}),
            supabase.from('settings').upsert(settingRow('licence_majeur', licenceMajeur), {onConflict: 'key,club_id,season_id'}),
            supabase.from('settings').upsert(settingRow('acompte_montant', acompteMontant), {onConflict: 'key,club_id,season_id'}),
        ])
        setSavingTarifs(false)
        setSavedTarifs(true)
        setTimeout(() => setSavedTarifs(false), 2000)
    }

    // ── Règlement intérieur
    async function saveReglementInterieur() {
        if (!saisonCourante?.id) return
        setSavingReglement(true)
        await supabase.from('settings').upsert(
            settingRow('reglement_interieur', reglementInterieur),
            {onConflict: 'key,club_id,season_id'}
        )
        setSavingReglement(false)
        setSavedReglement(true)
        setTimeout(() => setSavedReglement(false), 2000)
    }

    // ── Modes de règlement
    async function saveReglements(list) {
        if (!saisonCourante?.id) return
        await supabase.from('settings').upsert(
            settingRow('modes_reglement', JSON.stringify(list)),
            {onConflict: 'key,club_id,season_id'}
        )
        setSavedRegl(true)
        setTimeout(() => setSavedRegl(false), 1500)
    }

    function addReglement() {
        const val = newReglement.trim()
        if (!val || reglements.includes(val)) return
        const next = [...reglements, val]
        setReglements(next)
        setNewReglement('')
        saveReglements(next)
    }

    function removeReglement(r) {
        const next = reglements.filter(x => x !== r)
        setReglements(next)
        saveReglements(next)
    }

    // ── Échelonnement
    async function saveNbPaiements(set) {
        if (!saisonCourante?.id) return
        await supabase.from('settings').upsert(
            settingRow('nb_paiements_acceptes', JSON.stringify([...set].sort((a, b) => a - b))),
            {onConflict: 'key,club_id,season_id'}
        )
        setSavedNbPaiements(true)
        setTimeout(() => setSavedNbPaiements(false), 1500)
    }

    function toggleNbPaiement(n) {
        const next = new Set(nbPaiementsAcceptes)
        if (next.has(n)) {
            if (next.size <= 1) return // au moins une option doit rester active
            next.delete(n)
        } else {
            next.add(n)
        }
        setNbPaiementsAcceptes(next)
        saveNbPaiements(next)
    }

    // ── Copie des paramètres, forfaits et tarifs vers une autre saison
    async function copierParametres() {
        if (!cibleSaisonId || !saisonCourante?.id) return
        setCopying(true)
        setCopyResult('')

        // Chargement en parallèle
        const [
            {data: settingsData, error: errSettings},
            {data: forfaitsData, error: errForfaits},
            {data: tarifsData, error: errTarifs},
            {data: remisesData, error: errRemises},
        ] = await Promise.all([
            supabase.from('settings').select('key, value').eq('club_id', clubId).eq('season_id', saisonCourante.id),
            supabase.from('plans').select('label, price, session_count, is_annual').eq('club_id', clubId).eq('season_id', saisonCourante.id),
            supabase.from('camp_rates').select('label, prix_journee_adherent, prix_journee_non_adherent, prix_demi_journee_adherent, prix_demi_journee_non_adherent').eq('club_id', clubId).eq('season_id', saisonCourante.id),
            supabase.from('discounts').select('label, amount').eq('club_id', clubId).eq('season_id', saisonCourante.id),
        ])

        if (errSettings || errForfaits || errTarifs || errRemises) {
            setCopyResult(`Erreur : ${(errSettings ?? errForfaits ?? errTarifs ?? errRemises).message}`)
            setCopying(false)
            return
        }

        const ops = []
        let nbSettings = 0, nbForfaits = 0, nbTarifs = 0, nbRemises = 0

        // Settings
        if (settingsData?.length) {
            const rows = settingsData.map(({key, value}) => ({key, value, club_id: clubId, season_id: cibleSaisonId}))
            ops.push(supabase.from('settings').upsert(rows, {onConflict: 'key,club_id,season_id'}))
            nbSettings = rows.length
        }

        // Forfaits — suppression puis réinsertion pour éviter les doublons
        if (forfaitsData?.length) {
            await supabase.from('plans').delete().eq('club_id', clubId).eq('season_id', cibleSaisonId)
            const rows = forfaitsData.map(({label, price, session_count, is_annual}) => ({
                label, price, session_count, is_annual,
                club_id: clubId, season_id: cibleSaisonId,
            }))
            ops.push(supabase.from('plans').insert(rows))
            nbForfaits = rows.length
        }

        // Tarifs stages — suppression puis réinsertion
        if (tarifsData?.length) {
            await supabase.from('camp_rates').delete().eq('club_id', clubId).eq('season_id', cibleSaisonId)
            const rows = tarifsData.map(({
                                             label,
                                             prix_journee_adherent,
                                             prix_journee_non_adherent,
                                             prix_demi_journee_adherent,
                                             prix_demi_journee_non_adherent
                                         }) => ({
                label,
                prix_journee_adherent,
                prix_journee_non_adherent,
                prix_demi_journee_adherent,
                prix_demi_journee_non_adherent,
                club_id: clubId,
                season_id: cibleSaisonId,
            }))
            ops.push(supabase.from('camp_rates').insert(rows))
            nbTarifs = rows.length
        }

        // Remises — suppression puis réinsertion
        if (remisesData?.length) {
            await supabase.from('discounts').delete().eq('club_id', clubId).eq('season_id', cibleSaisonId)
            const rows = remisesData.map(({label, amount}) => ({
                label, amount, club_id: clubId, season_id: cibleSaisonId,
            }))
            ops.push(supabase.from('discounts').insert(rows))
            nbRemises = rows.length
        }

        if (!ops.length) {
            setCopyResult('Aucune donnée à copier pour cette saison.')
            setCopying(false)
            return
        }

        const results = await Promise.all(ops)
        const err = results.find(r => r.error)?.error
        setCopying(false)
        if (err) {
            setCopyResult(`Erreur : ${err.message}`);
            return
        }

        const parts = []
        if (nbSettings) parts.push(`${nbSettings} paramètre(s)`)
        if (nbForfaits) parts.push(`${nbForfaits} forfait(s)`)
        if (nbTarifs) parts.push(`${nbTarifs} grille(s) tarifaire(s)`)
        if (nbRemises) parts.push(`${nbRemises} remise(s)`)
        setCopyResult(`✓ Copié : ${parts.join(', ')}.`)
        setTimeout(() => {
            setShowCopieModal(false);
            setCopyResult('');
            setCibleSaisonId('')
        }, 2000)
    }

    // ── Forfaits CRUD
    function openCreateForfait() {
        setEditingForfait(null)
        setForfaitForm(INIT_FORFAIT)
        setForfaitErrors({})
        setShowForfaitForm(true)
    }

    function openEditForfait(f) {
        setEditingForfait(f.id)
        setForfaitForm({
            label: f.label,
            price: String(f.price),
            session_count: f.session_count !== null ? String(f.session_count) : '',
            is_annual: f.is_annual ?? false,
        })
        setForfaitErrors({})
        setShowForfaitForm(true)
    }

    function validateForfait() {
        const e = {}
        if (!forfaitForm.label.trim()) e.label = 'Requis'
        if (!forfaitForm.price || isNaN(Number(forfaitForm.price))) e.price = 'Nombre requis'
        return e
    }

    async function saveForfait() {
        const e = validateForfait()
        if (Object.keys(e).length) {
            setForfaitErrors(e);
            return
        }
        setSavingForfait(true)

        const payload = {
            label: forfaitForm.label.trim(),
            price: Number(forfaitForm.price),
            session_count: forfaitForm.session_count !== '' ? Number(forfaitForm.session_count) : null,
            is_annual: forfaitForm.is_annual,
            club_id: clubId,
            season_id: saisonCourante?.id ?? null,
        }

        if (editingForfait) {
            await supabase.from('plans').update(payload).eq('id', editingForfait)
        } else {
            await supabase.from('plans').insert(payload)
        }

        const {data} = await supabase.from('plans').select('*').eq('club_id', clubId).eq('season_id', saisonCourante?.id ?? null).order('price')
        setForfaits(data ?? [])
        setSavingForfait(false)
        setShowForfaitForm(false)
    }

    async function deleteForfait(f) {
        if (!window.confirm(`Supprimer le forfait "${f.label}" ?`)) return
        await supabase.from('plans').delete().eq('id', f.id)
        setForfaits(prev => prev.filter(x => x.id !== f.id))
    }

    // ── Remises CRUD ──────────────────────────────────────────────────────────
    function validateRemise() {
        const e = {}
        if (!remiseForm.label.trim()) e.label = 'Requis'
        if (!remiseForm.amount || isNaN(Number(remiseForm.amount)) || Number(remiseForm.amount) <= 0)
            e.amount = 'Montant requis'
        return e
    }

    async function saveRemise() {
        const e = validateRemise()
        if (Object.keys(e).length) {
            setRemiseErrors(e);
            return
        }
        setSavingRemise(true)
        await supabase.from('discounts').insert({
            club_id: clubId,
            season_id: saisonCourante?.id ?? null,
            label: remiseForm.label.trim(),
            amount: Number(remiseForm.amount),
        })
        const {data} = await supabase.from('discounts').select('*').eq('club_id', clubId).eq('season_id', saisonCourante?.id ?? null).order('label')
        setRemises(data ?? [])
        setSavingRemise(false)
        setShowRemiseForm(false)
        setRemiseForm({label: '', amount: ''})
        setRemiseErrors({})
    }

    async function deleteRemise(r) {
        if (!window.confirm(`Supprimer la remise "${r.label}" ?`)) return
        await supabase.from('discounts').delete().eq('id', r.id)
        setRemises(prev => prev.filter(x => x.id !== r.id))
    }

    // ── Tarifs stage CRUD ─────────────────────────────────────────────────────
    function openCreateTarifStage() {
        setEditingTarifStage(null)
        setTarifStageForm(INIT_TARIF_STAGE)
        setTarifStageErrors({})
        setShowTarifStageForm(true)
    }

    function openEditTarifStage(t) {
        setEditingTarifStage(t.id)
        setTarifStageForm({
            label: t.label,
            prix_journee_adherent: String(t.prix_journee_adherent),
            prix_journee_non_adherent: String(t.prix_journee_non_adherent),
            prix_demi_journee_adherent: t.prix_demi_journee_adherent != null ? String(t.prix_demi_journee_adherent) : '',
            prix_demi_journee_non_adherent: t.prix_demi_journee_non_adherent != null ? String(t.prix_demi_journee_non_adherent) : '',
        })
        setTarifStageErrors({})
        setShowTarifStageForm(true)
    }

    function validateTarifStage() {
        const e = {}
        if (!tarifStageForm.label.trim()) e.label = 'Requis'
        if (!tarifStageForm.prix_journee_adherent || isNaN(Number(tarifStageForm.prix_journee_adherent)))
            e.prix_journee_adherent = 'Nombre requis'
        if (!tarifStageForm.prix_journee_non_adherent || isNaN(Number(tarifStageForm.prix_journee_non_adherent)))
            e.prix_journee_non_adherent = 'Nombre requis'
        return e
    }

    async function saveTarifStage() {
        const e = validateTarifStage()
        if (Object.keys(e).length) {
            setTarifStageErrors(e);
            return
        }
        setSavingTarifStage(true)

        const hasDemi = !!tarifStageForm.prix_demi_journee_adherent
        const payload = {
            label: tarifStageForm.label.trim(),
            prix_journee_adherent: Number(tarifStageForm.prix_journee_adherent),
            prix_journee_non_adherent: Number(tarifStageForm.prix_journee_non_adherent),
            prix_demi_journee_adherent: hasDemi ? Number(tarifStageForm.prix_demi_journee_adherent) : null,
            prix_demi_journee_non_adherent: hasDemi ? Number(tarifStageForm.prix_demi_journee_non_adherent) : null,
        }

        if (editingTarifStage) {
            await supabase.from('camp_rates').update(payload).eq('id', editingTarifStage)
        } else {
            await supabase.from('camp_rates').insert({
                ...payload,
                club_id: clubId,
                season_id: saisonCourante?.id ?? null
            })
        }

        const {data} = await supabase.from('camp_rates').select('*').eq('club_id', clubId).eq('season_id', saisonCourante?.id ?? null).order('label')
        setTarifsStage(data ?? [])
        setSavingTarifStage(false)
        setShowTarifStageForm(false)
    }

    async function deleteTarifStage(t) {
        if (!window.confirm(`Supprimer la grille "${t.label}" ?`)) return
        await supabase.from('camp_rates').delete().eq('id', t.id)
        setTarifsStage(prev => prev.filter(x => x.id !== t.id))
    }

    if (loading) return <LoadingSpinner/>

    async function handleCreerSaison() {
        setSaisonError('')
        const annee = parseInt(newAnnee, 10)
        if (!annee || annee < 2000 || annee > 2100) {
            setSaisonError("Saisissez une année valide (ex : 2027)")
            return
        }
        const libelle = `${annee}-${annee + 1}`
        if (saisons.find(s => s.name === libelle)) {
            setSaisonError(`La saison ${libelle} existe déjà`)
            return
        }
        setCreantSaison(true)
        try {
            await creerSaison(annee)
            setNewAnnee('')
        } catch (e) {
            setSaisonError(e.message)
        }
        setCreantSaison(false)
    }

    async function handleSetActive(saisonId) {
        setTogglingActive(saisonId)
        await setSaisonActive(saisonId)
        setTogglingActive(null)
    }

    async function handleDeleteSaison(saison) {
        setDeleteError('')
        if (!window.confirm(`Supprimer définitivement la saison ${saison.name} ?`)) return
        setDeletingSaison(saison.id)
        try {
            await supprimerSaison(saison.id)
        } catch (e) {
            setDeleteError(e.message)
        }
        setDeletingSaison(null)
    }

    const autresSaisons = saisons.filter(s => s.id !== saisonCourante?.id)

    return (
        <div className="p-8 max-w-5xl space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
                {saisonCourante && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Saison : <strong
                            className="text-gray-800">{saisonCourante.name}</strong></span>
                        {autresSaisons.length > 0 && (
                            <button
                                onClick={() => {
                                    setShowCopieModal(true);
                                    setCibleSaisonId('');
                                    setCopyResult('')
                                }}
                                className="text-xs text-brand-600 hover:text-brand-800 border border-brand-200 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                Copier vers une autre saison →
                            </button>
                        )}
                    </div>
                )}
            </div>

            {!saisonCourante && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    Sélectionnez ou créez une saison pour configurer les paramètres.
                </div>
            )}

            {/* ── Saisons ── */}
            <Section title="Saisons">
                <div className="space-y-2 mb-5">
                    {saisons.length === 0 && (
                        <p className="text-sm text-gray-500 italic">Aucune saison créée.</p>
                    )}
                    {saisons.map(s => (
                        <div key={s.id}
                             className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 gap-3">
                            <div className="flex items-center gap-3">
                                <span className="font-semibold text-gray-900">{s.name}</span>
                                {s.active && (
                                    <span
                                        className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-semibold">
                                        ✦ Active (inscription publique)
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {!s.active && (
                                    <button
                                        onClick={() => handleSetActive(s.id)}
                                        disabled={togglingActive === s.id}
                                        className="text-xs text-gray-500 hover:text-brand-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand-300 transition-colors disabled:opacity-50"
                                    >
                                        {togglingActive === s.id ? 'Activation…' : 'Rendre active'}
                                    </button>
                                )}
                                {!s.active && (
                                    <button
                                        onClick={() => handleDeleteSaison(s)}
                                        disabled={deletingSaison === s.id}
                                        title="Supprimer (seulement si la saison est vide)"
                                        className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300 hover:bg-red-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                                    >
                                        {deletingSaison === s.id ? 'Suppression…' : 'Supprimer'}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {deleteError && (
                        <p className="text-sm text-red-500 mt-1">{deleteError}</p>
                    )}
                </div>

                {/* Créer une nouvelle saison */}
                <div className="flex items-end gap-3 flex-wrap">
                    <Field label="Nouvelle saison — année de début">
                        <input
                            type="number"
                            min="2020"
                            max="2100"
                            value={newAnnee}
                            onChange={e => {
                                setNewAnnee(e.target.value);
                                setSaisonError('')
                            }}
                            onKeyDown={e => e.key === 'Enter' && handleCreerSaison()}
                            placeholder="Ex : 2027"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
                        />
                    </Field>
                    <div className="pb-0.5">
                        {newAnnee && !isNaN(parseInt(newAnnee)) && (
                            <p className="text-xs text-gray-500 mb-1.5">
                                Créera la saison <strong>{newAnnee}-{parseInt(newAnnee) + 1}</strong>
                            </p>
                        )}
                        <button
                            onClick={handleCreerSaison}
                            disabled={creantSaison}
                            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                            {creantSaison ? 'Création…' : '+ Créer la saison'}
                        </button>
                    </div>
                </div>
                {saisonError && (
                    <p className="text-sm text-red-500 mt-2">{saisonError}</p>
                )}
                <p className="text-xs text-gray-500 mt-3">
                    La saison <strong>active</strong> est celle utilisée pour le formulaire de pré-inscription public.
                    Les cours et adhérents créés sont toujours liés à la saison sélectionnée dans la barre latérale.
                </p>
            </Section>

            {/* ── Calendrier de la saison ── */}
            <Section title="Calendrier de la saison">
                <div className="flex items-end gap-4 mb-6 flex-wrap">
                    <Field label="Date de début">
                        <input type="date" value={debut} onChange={e => setDebut(e.target.value)}
                               className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                    </Field>
                    <Field label="Date de fin">
                        <input type="date" value={fin} onChange={e => setFin(e.target.value)}
                               className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                    </Field>
                    {weeks.length > 0 && (
                        <div className="pb-0.5 text-sm text-gray-500">
                            <span className="font-semibold text-brand-700">{nbActives}</span> semaines actives
                            <span className="text-gray-400 mx-2">·</span>
                            {weeks.length} au total
                        </div>
                    )}
                </div>

                {weeks.length === 0 ? (
                    <div
                        className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                        Renseignez les dates de début et de fin pour générer le calendrier.
                    </div>
                ) : (
                    <>
                        <div className="flex gap-3 mb-5">
                            <button onClick={() => toggleAllWeeks(true)}
                                    className="text-xs text-gray-500 hover:text-brand-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand-300 transition-colors">
                                Tout cocher
                            </button>
                            <button onClick={() => toggleAllWeeks(false)}
                                    className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 transition-colors">
                                Tout décocher
                            </button>
                        </div>
                        <div className="overflow-x-auto pb-2">
                            <div className="flex items-center gap-1 min-w-max">
                                {groups.map((group, gi) => (
                                    <div key={group.label} className="flex items-center gap-1">
                                        <div className={`flex flex-col items-center ${gi > 0 ? 'ml-2' : ''}`}>
                      <span
                          className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1 whitespace-nowrap capitalize">
                        {group.label.replace(/\s\d{4}/, '')}
                      </span>
                                            <div className="flex gap-1">
                                                {group.weeks.map(w => {
                                                    const active = !inactives.has(w.key)
                                                    return (
                                                        <button key={w.key} onClick={() => toggleWeek(w.key)}
                                                                title={`Semaine ${w.num} · ${fmtShort(w.start)} – ${fmtShort(w.end)}`}
                                                                className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all select-none border ${
                                                                    active ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                                                                }`}>
                                                            {w.num}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        {gi < groups.length - 1 &&
                                            <div className="w-px h-10 bg-gray-200 ml-2 self-end mb-0"/>}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-gray-100 flex-wrap">
                            <button onClick={saveSaison} disabled={savingSaison || !debut || !fin}
                                    className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                                {savingSaison ? 'Enregistrement…' : 'Enregistrer le calendrier'}
                            </button>
                            {savedSaison && <span className="text-sm text-green-600 font-medium">✓ Enregistré</span>}
                            {errorSaison &&
                                <span className="text-sm text-red-600 font-medium">⚠ Erreur : {errorSaison}</span>}
                            {nbActives > 0 && !savedSaison && !savingSaison && !errorSaison && forfaits.some(f => f.is_annual) && (
                                <span className="text-xs text-gray-500">
                                    → mettra les forfaits annuels à <strong>{nbActives} séances</strong>
                                </span>
                            )}
                        </div>
                    </>
                )}
            </Section>

            {/* ── Forfaits cours ── */}
            <Section title="Forfaits cours">
                <p className="text-sm text-gray-500 mb-4">
                    Deux types : <strong>Annuel</strong> (abonnement à l'année, nb de séances synchronisé avec le
                    calendrier) et <strong>Carte</strong> (carnet de séances fixe, cumulable — un adhérent peut en avoir
                    deux pour le même cours).
                </p>
                {loadingForfaits ? (
                    <LoadingSpinner/>
                ) : (
                    <>
                        {forfaits.length === 0 ? (
                            <p className="text-sm text-gray-500 mb-4">Aucun forfait créé.</p>
                        ) : (
                            <div className="mb-4 rounded-xl border border-gray-100 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Libellé</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Prix</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Séances</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                    {forfaits.map(f => (
                                        <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                {f.is_annual
                                                    ? <span
                                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-700">Annuel</span>
                                                    : <span
                                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Carte</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-900">{f.label}</td>
                                            <td className="px-4 py-3 text-gray-700 tabular-nums">{Number(f.price)} €</td>
                                            <td className="px-4 py-3 text-gray-500">
                                                {f.is_annual
                                                    ? <span className="text-gray-400 italic">↺ depuis calendrier</span>
                                                    : f.session_count !== null ? `${f.session_count} séances` :
                                                        <span className="italic text-gray-400">—</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button onClick={() => openEditForfait(f)}
                                                            className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
                                                        Modifier
                                                    </button>
                                                    <button onClick={() => deleteForfait(f)}
                                                            className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                                                        Supprimer
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <button onClick={openCreateForfait}
                                className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                            + Nouveau forfait
                        </button>
                    </>
                )}
            </Section>

            {/* ── Tarifs stages ── */}
            <Section title="Tarifs stages">
                <p className="text-sm text-gray-500 mb-4">
                    Créez des grilles tarifaires réutilisables (ex : "Tarif standard", "Tarif compétition").
                    Chaque stage choisit sa grille — modifier une grille met à jour tous les stages liés.
                </p>
                {tarifsStage.length === 0 ? (
                    <p className="text-sm text-gray-500 mb-4">Aucune grille créée.</p>
                ) : (
                    <div className="mb-4 rounded-xl border border-gray-100 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Journée
                                    adh.
                                </th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Journée
                                    non-adh.
                                </th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Demi-journée</th>
                                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                            {tarifsStage.map(t => (
                                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-gray-900">{t.label}</td>
                                    <td className="px-4 py-3 tabular-nums text-gray-700">{t.prix_journee_adherent} €</td>
                                    <td className="px-4 py-3 tabular-nums text-gray-700">{t.prix_journee_non_adherent} €</td>
                                    <td className="px-4 py-3 text-gray-500">
                                        {t.prix_demi_journee_adherent != null
                                            ? <span
                                                className="tabular-nums">{t.prix_demi_journee_adherent} / {t.prix_demi_journee_non_adherent} €</span>
                                            : <span className="text-gray-300 italic text-xs">non disponible</span>
                                        }
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button onClick={() => openEditTarifStage(t)}
                                                    className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
                                                Modifier
                                            </button>
                                            <button onClick={() => deleteTarifStage(t)}
                                                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                                                Supprimer
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <button onClick={openCreateTarifStage}
                        className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                    + Nouvelle grille tarifaire
                </button>

                {/* Modal grille tarifaire */}
                {showTarifStageForm && (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                            <div className="px-6 py-4 border-b flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900">
                                    {editingTarifStage ? 'Modifier la grille' : 'Nouvelle grille tarifaire'}
                                </h3>
                                <button onClick={() => setShowTarifStageForm(false)}
                                        className="text-gray-400 hover:text-gray-600 text-xl w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">×
                                </button>
                            </div>
                            <div className="px-6 py-5 space-y-4">
                                {/* Label */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la grille
                                        *</label>
                                    <input
                                        type="text"
                                        value={tarifStageForm.label}
                                        onChange={e => setTarifStageForm(f => ({...f, label: e.target.value}))}
                                        placeholder="Ex : Tarif standard"
                                        className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${tarifStageErrors.label ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                    />
                                    {tarifStageErrors.label &&
                                        <p className="text-xs text-red-500 mt-1">{tarifStageErrors.label}</p>}
                                </div>

                                {/* Journée */}
                                <div>
                                    <p className="text-sm font-medium text-gray-700 mb-2">Journée complète *</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Adhérent (€)</label>
                                            <input type="number" min="0" step="0.01"
                                                   value={tarifStageForm.prix_journee_adherent}
                                                   onChange={e => setTarifStageForm(f => ({
                                                       ...f,
                                                       prix_journee_adherent: e.target.value
                                                   }))}
                                                   placeholder="Ex : 80"
                                                   className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${tarifStageErrors.prix_journee_adherent ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                            />
                                            {tarifStageErrors.prix_journee_adherent &&
                                                <p className="text-xs text-red-500 mt-1">{tarifStageErrors.prix_journee_adherent}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Non-adhérent (€)</label>
                                            <input type="number" min="0" step="0.01"
                                                   value={tarifStageForm.prix_journee_non_adherent}
                                                   onChange={e => setTarifStageForm(f => ({
                                                       ...f,
                                                       prix_journee_non_adherent: e.target.value
                                                   }))}
                                                   placeholder="Ex : 100"
                                                   className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${tarifStageErrors.prix_journee_non_adherent ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                            />
                                            {tarifStageErrors.prix_journee_non_adherent &&
                                                <p className="text-xs text-red-500 mt-1">{tarifStageErrors.prix_journee_non_adherent}</p>}
                                        </div>
                                    </div>
                                </div>

                                {/* Demi-journée */}
                                <div>
                                    <p className="text-sm font-medium text-gray-700 mb-1">
                                        Demi-journée
                                        <span className="ml-1 font-normal text-gray-400 text-xs">(optionnel — laisser vide si indisponible)</span>
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Adhérent (€)</label>
                                            <input type="number" min="0" step="0.01"
                                                   value={tarifStageForm.prix_demi_journee_adherent}
                                                   onChange={e => setTarifStageForm(f => ({
                                                       ...f,
                                                       prix_demi_journee_adherent: e.target.value
                                                   }))}
                                                   placeholder="Ex : 45"
                                                   className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Non-adhérent (€)</label>
                                            <input type="number" min="0" step="0.01"
                                                   value={tarifStageForm.prix_demi_journee_non_adherent}
                                                   onChange={e => setTarifStageForm(f => ({
                                                       ...f,
                                                       prix_demi_journee_non_adherent: e.target.value
                                                   }))}
                                                   placeholder="Ex : 55"
                                                   className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t flex justify-end gap-3">
                                <button onClick={() => setShowTarifStageForm(false)}
                                        className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                                    Annuler
                                </button>
                                <button onClick={saveTarifStage} disabled={savingTarifStage}
                                        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors">
                                    {savingTarifStage ? 'Enregistrement…' : editingTarifStage ? 'Modifier' : 'Créer'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Section>

            {/* ── Remises prédéfinies ── */}
            <Section title="Remises">
                <p className="text-sm text-gray-500 mb-4">
                    Créez des remises réutilisables (ex : "Remise famille", "Remise personnel"). Elles pourront être
                    appliquées manuellement sur la fiche d'un adhérent.
                </p>
                {remises.length === 0 ? (
                    <p className="text-sm text-gray-500 mb-4">Aucune remise configurée.</p>
                ) : (
                    <div className="mb-4 rounded-xl border border-gray-100 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Libellé</th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Montant</th>
                                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                            {remises.map(r => (
                                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-gray-900">{r.label}</td>
                                    <td className="px-4 py-3 tabular-nums text-gray-700">{Number(r.amount)} €</td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => deleteRemise(r)}
                                                className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                                            Supprimer
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {showRemiseForm ? (
                    <div className="flex items-end gap-3 flex-wrap bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Libellé *</label>
                            <input type="text" value={remiseForm.label}
                                   onChange={e => setRemiseForm(f => ({...f, label: e.target.value}))}
                                   placeholder="Ex : Remise famille"
                                   className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-52 ${remiseErrors.label ? 'border-red-300' : 'border-gray-300'}`}
                                   autoFocus/>
                            {remiseErrors.label && <p className="text-xs text-red-500 mt-1">{remiseErrors.label}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Montant (€) *</label>
                            <input type="number" min="0" step="0.01" value={remiseForm.amount}
                                   onChange={e => setRemiseForm(f => ({...f, amount: e.target.value}))}
                                   placeholder="Ex : 50"
                                   className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-28 ${remiseErrors.amount ? 'border-red-300' : 'border-gray-300'}`}/>
                            {remiseErrors.amount && <p className="text-xs text-red-500 mt-1">{remiseErrors.amount}</p>}
                        </div>
                        <div className="flex gap-2 pb-0.5">
                            <button onClick={() => {
                                setShowRemiseForm(false);
                                setRemiseForm({label: '', amount: ''});
                                setRemiseErrors({})
                            }}
                                    className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors">
                                Annuler
                            </button>
                            <button onClick={saveRemise} disabled={savingRemise}
                                    className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                                {savingRemise ? 'Enregistrement…' : 'Créer'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setShowRemiseForm(true)}
                            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                        + Nouvelle remise
                    </button>
                )}
            </Section>

            {/* ── Licence FFE & Acompte ── */}
            <Section title="Licence FFE & Acompte">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
                    <Field label="Licence FFE — mineur (€)">
                        <input type="number" min="0" value={licenceMineur}
                               onChange={e => setLicenceMineur(e.target.value)}
                               className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                    </Field>
                    <Field label="Licence FFE — majeur (€)">
                        <input type="number" min="0" value={licenceMajeur}
                               onChange={e => setLicenceMajeur(e.target.value)}
                               className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                    </Field>
                </div>
                <div className="mb-6">
                    <Field label="Acompte à l'inscription (€)"
                           hint="Affiché comme ligne séparée dans le plan de paiement. Mettre 0 pour désactiver.">
                        <input type="number" min="0" value={acompteMontant}
                               onChange={e => setAcompteMontant(e.target.value)}
                               className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                               placeholder="Ex : 100"/>
                    </Field>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={saveTarifs} disabled={savingTarifs}
                            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                        {savingTarifs ? 'Enregistrement…' : 'Enregistrer les tarifs'}
                    </button>
                    {savedTarifs && <span className="text-sm text-green-600 font-medium">✓ Enregistré</span>}
                </div>
            </Section>

            {/* ── Paiement ── */}
            <Section title="Paiement">
                {/* Modes de règlement */}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Modes de règlement</p>
                <div className="flex flex-wrap gap-2 mb-3">
                    {reglements.map(r => (
                        <div key={r} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1.5">
                            <span className="text-sm text-gray-700">{r}</span>
                            <button onClick={() => removeReglement(r)}
                                    className="text-gray-400 hover:text-red-500 transition-colors text-xs leading-none"
                                    title="Supprimer">
                                ×
                            </button>
                        </div>
                    ))}
                    {reglements.length === 0 && (
                        <p className="text-sm text-gray-500 italic">Aucun mode configuré.</p>
                    )}
                </div>
                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        placeholder="Ajouter un mode…"
                        value={newReglement}
                        onChange={e => setNewReglement(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addReglement()}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-52"
                    />
                    <button onClick={addReglement}
                            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                        Ajouter
                    </button>
                    {savedRegl && <span className="text-sm text-green-600 font-medium self-center">✓ Enregistré</span>}
                </div>

                {/* Échelonnement */}
                <div className="border-t border-gray-100 pt-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Versements
                        acceptés</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {NB_FOIS_OPTIONS.map(n => {
                            const active = nbPaiementsAcceptes.has(n)
                            return (
                                <label key={n} className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={() => toggleNbPaiement(n)}
                                        className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                                    />
                                    <span
                                        className={`text-sm ${active ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                        {n === 1 ? '1 fois' : `${n} fois`}
                                    </span>
                                </label>
                            )
                        })}
                    </div>
                    {savedNbPaiements &&
                        <span className="block mt-3 text-sm text-green-600 font-medium">✓ Enregistré</span>}
                </div>
            </Section>

            {/* ── Règlement intérieur ── */}
            <Section title="Règlement intérieur">
                <p className="text-sm text-gray-500 mb-4">
                    Ce texte est affiché à la dernière étape du formulaire de pré-inscription public. Le candidat doit
                    l&apos;accepter pour valider son dossier.
                </p>
                <textarea
                    rows={12}
                    value={reglementInterieur}
                    onChange={e => setReglementInterieur(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y font-mono"
                    placeholder="Saisissez le texte du règlement intérieur…"
                />
                <div className="flex items-center gap-3 mt-4">
                    <button
                        onClick={saveReglementInterieur}
                        disabled={savingReglement}
                        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                    >
                        {savingReglement ? 'Enregistrement…' : 'Enregistrer le règlement'}
                    </button>
                    {savedReglement && <span className="text-sm text-green-600 font-medium">✓ Enregistré</span>}
                </div>
            </Section>

            {/* ── Modal forfait ── */}
            {showForfaitForm && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {editingForfait ? 'Modifier le forfait' : 'Nouveau forfait'}
                            </h2>
                            <button onClick={() => setShowForfaitForm(false)}
                                    className="text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                                ×
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

                            {/* Type : Annuel ou Carte */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                                <div className="flex gap-2">
                                    {[
                                        {
                                            v: false,
                                            label: 'Carte',
                                            desc: 'Carnet de séances fixe, cumulable',
                                            cls: 'border-purple-300 bg-purple-50 text-purple-700'
                                        },
                                        {
                                            v: true,
                                            label: 'Annuel',
                                            desc: 'Abonnement à l\'année, séances ↺ calendrier',
                                            cls: 'border-brand-300 bg-brand-50 text-brand-700'
                                        },
                                    ].map(({v, label, desc, cls}) => (
                                        <button
                                            key={label}
                                            type="button"
                                            onClick={() => setForfaitForm(f => ({
                                                ...f,
                                                is_annual: v,
                                                session_count: v ? '' : f.session_count
                                            }))}
                                            className={`flex-1 text-left px-4 py-3 rounded-xl border-2 transition-colors ${forfaitForm.is_annual === v ? cls : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                                        >
                                            <p className="text-sm font-semibold">{label}</p>
                                            <p className="text-xs mt-0.5 opacity-75">{desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Libellé */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Libellé *</label>
                                <input type="text" value={forfaitForm.label}
                                       onChange={e => setForfaitForm(f => ({...f, label: e.target.value}))}
                                       className={`w-full rounded-lg border ${forfaitErrors.label ? 'border-red-400' : 'border-gray-300'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500`}
                                       placeholder={forfaitForm.is_annual ? 'Ex : Galop 1-3 annuel' : 'Ex : Carte 10 séances'}
                                       autoFocus/>
                                {forfaitErrors.label &&
                                    <p className="text-xs text-red-500 mt-1">{forfaitErrors.label}</p>}
                            </div>

                            {/* Prix */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Prix (€) *</label>
                                <input type="number" min="0" value={forfaitForm.price}
                                       onChange={e => setForfaitForm(f => ({...f, price: e.target.value}))}
                                       className={`w-full rounded-lg border ${forfaitErrors.price ? 'border-red-400' : 'border-gray-300'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500`}
                                       placeholder="Ex : 450"/>
                                {forfaitErrors.price &&
                                    <p className="text-xs text-red-500 mt-1">{forfaitErrors.price}</p>}
                            </div>

                            {/* Nombre de séances — seulement pour les cartes */}
                            {!forfaitForm.is_annual && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nombre de séances *
                                    </label>
                                    <input type="number" min="1" value={forfaitForm.session_count}
                                           onChange={e => setForfaitForm(f => ({...f, session_count: e.target.value}))}
                                           className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                                           placeholder="Ex : 10"/>
                                    <p className="text-xs text-gray-400 mt-1">Un adhérent peut cumuler deux cartes pour
                                        un même cours.</p>
                                </div>
                            )}

                        </div>

                        <div className="flex justify-end gap-3 px-6 py-4 border-t shrink-0">
                            <button onClick={() => setShowForfaitForm(false)}
                                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                                Annuler
                            </button>
                            <button onClick={saveForfait} disabled={savingForfait}
                                    className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors">
                                {savingForfait ? 'Enregistrement…' : editingForfait ? 'Enregistrer' : 'Créer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Modal copie paramètres ── */}
            {showCopieModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="text-base font-semibold text-gray-900">Copier les paramètres</h2>
                            <button onClick={() => setShowCopieModal(false)}
                                    className="text-gray-400 hover:text-gray-600 text-xl w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">×
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <p className="text-sm text-gray-600">
                                Copier tous les paramètres de <strong>{saisonCourante?.name}</strong> vers :
                            </p>
                            <select
                                value={cibleSaisonId}
                                onChange={e => setCibleSaisonId(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                                <option value="">Choisir une saison…</option>
                                {autresSaisons.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-400">Les paramètres existants sur la saison cible seront
                                écrasés.</p>
                            {copyResult && (
                                <p className={`text-sm font-medium ${copyResult.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{copyResult}</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <button onClick={() => setShowCopieModal(false)}
                                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100">Annuler
                            </button>
                            <button
                                onClick={copierParametres}
                                disabled={!cibleSaisonId || copying}
                                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                            >
                                {copying ? 'Copie…' : 'Copier'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function Section({title, children}) {
    return (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">{title}</h2>
            {children}
        </div>
    )
}

function Field({label, hint, children}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            {children}
            {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
        </div>
    )
}
