import {useEffect, useState} from 'react'
import {useParams} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {calculateAge, computeFinancial} from '../lib/calculs'
import Step1Cavalier from './inscription/Step1Cavalier'
import Step2Responsables from './inscription/Step2Responsables'
import PaiementBuilder, {flattenLignesPaiement} from './inscription/PaiementBuilder'

// ── Données initiales ─────────────────────────────────────────────────────────
const INIT_FORM = {
    nom: '', prenom: '', date_naissance: '', email: '', telephone: '', adresse: '',
    galop: '', licence_ffe: '', droit_image: false,
    responsable1: {nom_prenom: '', telephone: '', email: '', adresse: '', meme_adresse: false},
    responsable2: null,
    activite_id: '', offre_id: '',
    lignes_paiement: null,
    reglement_accepte: false,
}

const STEP_META = {
    1: {label: 'Cavalier', short: '1'},
    2: {label: 'Responsables', short: '2'},
    3: {label: 'Cours & forfait', short: '3'},
    4: {label: 'Règlement', short: '4'},
}


// ── Page ──────────────────────────────────────────────────────────────────────
export default function InscriptionPublique() {
    const {slug} = useParams()
    const [club, setClub] = useState(null)
    const [clubLoading, setClubLoading] = useState(true)
    const [phase, setPhase] = useState('accueil') // 'accueil' | 'form' | 'succes'
    const [step, setStep] = useState(1)
    const [formData, setFormData] = useState(INIT_FORM)
    const [errors, setErrors] = useState({})
    const [cours, setCours] = useState([])
    const [forfaits, setForfaits] = useState([])
    const [parametres, setParametres] = useState({})
    const [modesReglement, setModesReglement] = useState(['Chèque', 'Virement', 'Carte bancaire', 'Espèces'])
    const [nbFoisAcceptes, setNbFoisAcceptes] = useState(null)
    const [saisonActive, setSaisonActive] = useState(null)
    const [reglementTexte, setReglementTexte] = useState()
    const [submitting, setSubmitting] = useState(false)
    const [countdown, setCountdown] = useState(20)
    const [honeypot, setHoneypot] = useState('')

    useEffect(() => {
        if (!slug) {
            setClubLoading(false);
            return
        }

        // 1. Charger le club par slug
        supabase.from('clubs').select('id, slug, name, description, address, phone, email').eq('slug', slug).maybeSingle()
            .then(({data: clubData}) => {
                if (!clubData) {
                    setClubLoading(false);
                    return
                }
                setClub(clubData)
                const clubId = clubData.id

                // 2. Charger la saison active
                supabase.from('seasons').select('*').eq('club_id', clubId).eq('active', true).maybeSingle()
                    .then(({data: saison}) => {
                        setSaisonActive(saison)

                        if (saison?.id) {
                            // 3. Charger plans, settings et activités en parallèle (scopés à la saison)
                            Promise.all([
                                supabase.from('plans').select('*').eq('club_id', clubId).eq('season_id', saison.id).order('price'),
                                supabase.from('settings').select('key, value').eq('club_id', clubId).eq('season_id', saison.id),
                                supabase
                                    .from('activities')
                                    .select('id, nom, jour, start_time, end_time, capacite, niveaux, plan_ids')
                                    .eq('club_id', clubId)
                                    .eq('season_id', saison.id)
                                    .eq('type', 'cours_regulier')
                                    .order('jour')
                                    .order('start_time'),
                            ]).then(([{data: f}, {data: p}, {data: c}]) => {
                                setForfaits((f ?? []).map(x => ({
                                    ...x,
                                    libelle: x.label ?? x.libelle,
                                    prix: x.price ?? x.prix,
                                    nb_seances: x.session_count ?? x.nb_seances,
                                })))
                                if (p) {
                                    const map = Object.fromEntries(p.map(x => [x.key, x.value]))
                                    setParametres(map)
                                    if (map.modes_reglement) {
                                        try {
                                            setModesReglement(JSON.parse(map.modes_reglement))
                                        } catch { /* JSON invalide */
                                        }
                                    }
                                    if (map.nb_paiements_acceptes) {
                                        try {
                                            setNbFoisAcceptes(JSON.parse(map.nb_paiements_acceptes))
                                        } catch { /* keep default */
                                        }
                                    }
                                    if (map.reglement_interieur) setReglementTexte(map.reglement_interieur)
                                }
                                setCours((c ?? []).map(a => ({
                                    ...a,
                                    heure_debut: a.start_time ?? a.heure_debut,
                                    heure_fin: a.end_time ?? a.heure_fin,
                                })))
                                setClubLoading(false)
                            })
                        } else {
                            setClubLoading(false)
                        }
                    })
            })
    }, [slug])

    // Countdown après succès
    useEffect(() => {
        if (phase !== 'succes') return
        setCountdown(20)
        const iv = setInterval(() => {
            setCountdown(n => {
                if (n <= 1) {
                    clearInterval(iv);
                    handleReset();
                    return 20
                }
                return n - 1
            })
        }, 1000)
        return () => clearInterval(iv)
    }, [phase])

    const age = calculateAge(formData.date_naissance)
    const isMinor = age !== null && age < 18
    const visibleSteps = isMinor ? [1, 2, 3, 4] : [1, 3, 4]
    const currentIdx = visibleSteps.indexOf(step)

    // Filtrage des cours par niveau (galop) et âge
    const coursFiltres = cours.filter(c => {
        // Filtre niveau
        const niveauOk = !c.niveaux || c.niveaux.length === 0 || !formData.galop || c.niveaux.includes(formData.galop)
        // Filtre âge
        const ageOk = age === null
            || ((c.age_min === null || c.age_min === undefined || age >= c.age_min)
                && (c.age_max === null || c.age_max === undefined || age <= c.age_max))
        return niveauOk && ageOk
    })

    const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    const RE_PHONE = /^[\d\s+\-().]{7,}$/

    function validate() {
        const e = {}
        if (step === 1) {
            if (!formData.nom.trim()) e.nom = 'Requis'
            if (!formData.prenom.trim()) e.prenom = 'Requis'
            if (!formData.date_naissance) e.date_naissance = 'Requis'
            if (!formData.telephone.trim()) e.telephone = 'Requis'
            else if (!RE_PHONE.test(formData.telephone.trim())) e.telephone = 'Numéro invalide'
            if (!formData.email.trim()) e.email = 'Requis'
            else if (!RE_EMAIL.test(formData.email.trim())) e.email = 'Adresse email invalide'
            if (!formData.adresse.trim()) e.adresse = 'Requis'
            if (!formData.galop) e.galop = 'Requis'
        }
        if (step === 2) {
            if (!formData.responsable1.nom_prenom.trim()) e.rl1_nom_prenom = 'Requis'
            if (!formData.responsable1.telephone.trim()) e.rl1_telephone = 'Requis'
            else if (!RE_PHONE.test(formData.responsable1.telephone.trim())) e.rl1_telephone = 'Numéro invalide'
            if (!formData.responsable1.email?.trim()) e.rl1_email = 'Requis'
            else if (!RE_EMAIL.test(formData.responsable1.email.trim())) e.rl1_email = 'Adresse email invalide'
            if (!formData.responsable1.meme_adresse && !formData.responsable1.adresse.trim()) e.rl1_adresse = 'Requis'
            if (formData.responsable2) {
                if (!formData.responsable2.nom_prenom.trim()) e.rl2_nom_prenom = 'Requis'
                if (!formData.responsable2.telephone.trim()) e.rl2_telephone = 'Requis'
                else if (!RE_PHONE.test(formData.responsable2.telephone.trim())) e.rl2_telephone = 'Numéro invalide'
                if (!formData.responsable2.email?.trim()) e.rl2_email = 'Requis'
                else if (!RE_EMAIL.test(formData.responsable2.email.trim())) e.rl2_email = 'Adresse email invalide'
                if (!formData.responsable2.meme_adresse && !formData.responsable2.adresse.trim()) e.rl2_adresse = 'Requis'
            }
        }
        if (step === 3) {
            if (!formData.activite_id) e.activite_id = 'Veuillez sélectionner un cours'
            if (!formData.offre_id) e.offre_id = 'Veuillez sélectionner un forfait'
            // Paiement — mode de règlement obligatoire si forfait sélectionné
            if (formData.offre_id && formData.lignes_paiement) {
                const lp = formData.lignes_paiement
                if (!lp.forfait?.[0]?.mode_reglement)
                    e.paiement_forfait_0 = 'Mode de règlement requis'
                if (financial?.licenceMontant > 0 && !lp.licence?.mode_reglement)
                    e.paiement_licence = 'Mode de règlement requis'
                if (financial?.acompteMontant > 0 && !lp.acompte?.mode_reglement)
                    e.paiement_acompte = 'Mode de règlement requis'
            }
        }
        if (step === 4) {
            if (!formData.reglement_accepte) e.reglement_accepte = 'Vous devez accepter le règlement intérieur pour continuer'
        }
        return e
    }

    function goNext() {
        const e = validate()
        if (Object.keys(e).length) {
            setErrors(e);
            window.scrollTo(0, 0);
            return
        }
        setErrors({})
        if (currentIdx < visibleSteps.length - 1) {
            setStep(visibleSteps[currentIdx + 1])
            window.scrollTo(0, 0)
        } else {
            handleSubmit()
        }
    }

    function goPrev() {
        if (currentIdx === 0) {
            setPhase('accueil');
            return
        }
        setStep(visibleSteps[currentIdx - 1])
        window.scrollTo(0, 0)
    }

    function handleReset() {
        setFormData(INIT_FORM)
        setErrors({})
        setStep(1)
        setPhase('accueil')
    }

    function setField(name, value) {
        setFormData(prev => {
            const next = {...prev, [name]: value}
            if (['offre_id', 'activite_id'].includes(name)) next.lignes_paiement = null
            return next
        })
        setErrors(prev => {
            const n = {...prev}
            delete n[name]
            if (['nom', 'prenom', 'date_naissance'].includes(name)) delete n._global
            return n
        })
    }

    async function handleSubmit() {
        if (honeypot) return  // bot détecté — abandon silencieux
        if (!club?.id) return
        setSubmitting(true)
        const clubId = club.id
        const forfait1 = forfaits.find(f => f.id === formData.offre_id) ?? null
        const {total, licenceMontant, acompteMontant} = computeFinancial({
            forfait1,
            forfait2: null,
            remiseMontant: 0,
            age,
            parametres
        })

        // 0. Vérification doublon : même (nom + prénom + date_naissance) + inscription cette saison
        const {data: doublon} = await supabase
            .from('members')
            .select('id, enrollments!inner(id)')
            .eq('club_id', clubId)
            .eq('last_name', formData.nom.trim().toUpperCase())
            .eq('first_name', formData.prenom.trim())
            .eq('birth_date', formData.date_naissance)
            .eq('enrollments.season_id', saisonActive?.id)
            .maybeSingle()

        if (doublon) {
            setErrors({_global: 'Une pré-inscription existe déjà pour ce cavalier cette saison. Contactez-nous si vous souhaitez modifier votre demande.'})
            window.scrollTo(0, 0)
            setSubmitting(false)
            return
        }

        // 1. Créer l'adhérent
        const {data: adherent, error: err1} = await supabase
            .from('members')
            .insert({
                club_id: clubId,
                last_name: formData.nom.trim().toUpperCase(),
                first_name: formData.prenom.trim(),
                email: formData.email.trim() || null,
                phone: formData.telephone.trim(),
                address: formData.adresse.trim() || null,
                birth_date: formData.date_naissance,
                galop: formData.galop,
                droit_image: formData.droit_image,
                licence_ffe: formData.licence_ffe?.trim() || null,
            })
            .select()
            .single()

        if (err1) {
            setSubmitting(false);
            return
        }

        // 2. Créer l'inscription
        const {data: inscription, error: err2} = await supabase
            .from('enrollments')
            .insert({
                club_id: clubId,
                member_id: adherent.id,
                season_id: saisonActive?.id ?? null,
                type: 'cours_annuel',
                activity_id: formData.activite_id || null,
                plan_id: formData.offre_id || null,
                discount_amount: 0,
                status: 'pre_inscription',
                total_amount: forfait1 ? total : null,
                reglement_accepte: true,
                reglement_accepte_at: new Date().toISOString(),
            })
            .select()
            .single()

        if (err2) {
            setSubmitting(false);
            return
        }

        // 2b. Paiements prévus (plan de paiement)
        if (inscription?.id && formData.lignes_paiement) {
            const rows = flattenLignesPaiement(formData.lignes_paiement, inscription.id, licenceMontant, acompteMontant)
            if (rows.length > 0) {
                const {error: errP} = await supabase.from('payments').insert(rows.map(r => ({
                    ...r,
                    club_id: clubId,
                    enrollment_id: inscription.id,
                })))
                if (errP) {
                    setErrors({_global: `Erreur lors de l'enregistrement du plan de paiement : ${errP.message}`})
                    window.scrollTo(0, 0)
                    setSubmitting(false)
                    return
                }
            }
        }

        // 3. Responsables légaux si mineur
        if (isMinor) {
            const resp = [
                {...formData.responsable1, rang: 1},
                ...(formData.responsable2 ? [{...formData.responsable2, rang: 2}] : []),
            ].map(r => ({
                club_id: clubId,
                member_id: adherent.id,
                rang: r.rang,
                full_name: r.nom_prenom.trim(),
                phone: r.telephone.trim(),
                email: r.email?.trim() || null,
                address: r.meme_adresse ? null : (r.adresse?.trim() || null),
                meme_adresse: r.meme_adresse,
            }))
            await supabase.from('guardians').insert(resp)
        }

        // 4. Email de confirmation
        const coursChoisi = cours.find(c => c.id === formData.activite_id)
        const forfaitChoisi = forfaits.find(f => f.id === formData.offre_id)
        if (formData.email?.trim()) {
            await supabase.functions.invoke('confirmation-inscription', {
                body: {
                    nom: formData.nom.trim().toUpperCase(),
                    prenom: formData.prenom.trim(),
                    email: formData.email.trim(),
                    saison: saisonActive?.name ?? saisonActive?.libelle ?? '',
                    cours: coursChoisi
                        ? `${coursChoisi.nom} — ${coursChoisi.jour} ${coursChoisi.heure_debut}–${coursChoisi.heure_fin}`
                        : null,
                    forfait: forfaitChoisi?.label ?? forfaitChoisi?.libelle ?? null,
                    montant: forfait1 ? total : null,
                    galop: formData.galop || null,
                    licence_ffe: formData.licence_ffe?.trim() || null,
                    club: club?.name || null,
                },
            })
        }

        setSubmitting(false)
        setPhase('succes')
        window.scrollTo(0, 0)
    }

    // ── Slug manquant ou club introuvable ────────────────────────────────────
    if (!slug || (!clubLoading && !club)) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 text-center">
                    <div
                        className="w-14 h-14 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center mx-auto mb-5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-red-500" fill="none"
                             viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/>
                        </svg>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mb-2">Club introuvable</h1>
                    <p className="text-gray-500 text-sm">
                        {!slug
                            ? 'Aucun club spécifié. Utilisez le lien fourni par votre centre équestre.'
                            : `Aucun club trouvé pour l'identifiant « ${slug} ».`}
                    </p>
                </div>
            </div>
        )
    }

    if (clubLoading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
            </div>
        )
    }

    // ── Écran accueil ─────────────────────────────────────────────────────────
    if (phase === 'accueil') {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
                {/* Grille de fond */}
                <div className="absolute inset-0 opacity-[0.04]"
                     style={{
                         backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                         backgroundSize: '32px 32px'
                     }}/>
                {/* Halo violet */}
                <div
                    className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-600/20 rounded-full blur-3xl pointer-events-none"/>

                <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 md:p-12 text-center">
                    {/* Badge saison */}
                    {saisonActive && (
                        <div
                            className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 border border-brand-100 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-500"/>
                            Saison {saisonActive.name ?? saisonActive.libelle}
                        </div>
                    )}
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-3 leading-tight">
                        Pré-inscription<br/>
                        <span className="text-brand-600">{club?.name || 'au club'}</span>
                    </h1>
                    <p className="text-gray-500 text-sm md:text-base mb-10 leading-relaxed">
                        {club?.description || parametres.centre_description || 'Remplissez ce formulaire pour pré-inscrire votre enfant ou vous-même. Notre équipe vous contactera pour finaliser l\'inscription.'}
                    </p>
                    <button
                        onClick={() => {
                            setPhase('form');
                            setStep(1)
                        }}
                        className="w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-base font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                        Commencer mon inscription →
                    </button>
                    <p className="text-xs text-gray-500 mt-5">
                        Déjà inscrit ? Contactez-nous directement.
                    </p>
                </div>
            </div>
        )
    }

    // ── Écran succès ──────────────────────────────────────────────────────────
    if (phase === 'succes') {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.04]"
                     style={{
                         backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                         backgroundSize: '32px 32px'
                     }}/>
                <div
                    className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-emerald-500/15 rounded-full blur-3xl pointer-events-none"/>

                <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 md:p-12 text-center">
                    <div
                        className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-emerald-600" fill="none"
                             viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-3">Demande enregistrée !</h1>
                    <p className="text-gray-600 text-base leading-relaxed mb-4">
                        Votre pré-inscription a bien été prise en compte.
                    </p>

                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-left mb-6">
                        <p className="text-sm font-semibold text-amber-800 mb-1">En attente de validation</p>
                        <p className="text-sm text-amber-700 leading-relaxed">
                            Votre dossier va être examiné par nos moniteurs. Dès qu&apos;il sera validé, vous recevrez
                            une confirmation définitive et les informations pour finaliser votre inscription.
                        </p>
                    </div>

                    {formData.email && (
                        <p className="text-sm text-gray-500 mb-8">
                            Un récapitulatif a été envoyé à <span
                            className="font-medium text-gray-700">{formData.email}</span>.
                        </p>
                    )}

                    <button
                        onClick={handleReset}
                        className="w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-base font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 mb-4"
                    >
                        Nouvelle pré-inscription
                    </button>
                    <p className="text-xs text-gray-500">
                        Retour automatique dans {countdown} secondes…
                    </p>
                </div>
            </div>
        )
    }

    // ── Formulaire ────────────────────────────────────────────────────────────
    const isLastStep = currentIdx === visibleSteps.length - 1

    // Filtre les forfaits selon le cours sélectionné :
    // - si le cours n'a pas de forfaits liés (plan_ids vide) → tous les forfaits visibles
    // - si le cours a des forfaits liés → seuls ceux-là s'affichent
    const coursSelectionne = cours.find(c => c.id === formData.activite_id) ?? null
    const forfaitsFiltres = !coursSelectionne || !coursSelectionne.plan_ids?.length
        ? forfaits
        : forfaits.filter(f => coursSelectionne.plan_ids.includes(f.id))

    const forfait1Sel = forfaits.find(f => f.id === formData.offre_id) ?? null
    const financial = forfait1Sel
        ? computeFinancial({forfait1: forfait1Sel, forfait2: null, remiseMontant: 0, age, parametres})
        : null

    return (
        <div className="min-h-screen bg-gray-50">

            {/* Header */}
            <div className="bg-slate-900 text-white px-4 py-4 md:px-8 md:py-5 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Pré-inscription
                                · {saisonActive?.name ?? saisonActive?.libelle ?? '…'}</p>
                            <h1 className="text-lg font-bold leading-tight mt-0.5">
                                {STEP_META[step]?.label}
                            </h1>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">
                            {currentIdx + 1} / {visibleSteps.length}
                        </div>
                    </div>
                    {/* Barre de progression */}
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-brand-500 rounded-full transition-all duration-500"
                            style={{width: `${((currentIdx + 1) / visibleSteps.length) * 100}%`}}
                        />
                    </div>
                    {/* Étapes desktop */}
                    <div className="hidden md:flex items-center gap-4 mt-3">
                        {visibleSteps.map((s, i) => {
                            const isDone = i < currentIdx
                            const isCurrent = s === step
                            return (
                                <div key={s} className="flex items-center gap-1.5">
                                    <div
                                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                                            isDone ? 'bg-brand-500 text-white' :
                                                isCurrent ? 'bg-white text-slate-900' :
                                                    'bg-white/15 text-slate-500'
                                        }`}>
                                        {isDone ? '✓' : i + 1}
                                    </div>
                                    <span className={`text-xs whitespace-nowrap transition-colors ${
                                        isCurrent ? 'text-white font-semibold' :
                                            isDone ? 'text-brand-400' :
                                                'text-slate-500'
                                    }`}>
                    {STEP_META[s]?.label}
                  </span>
                                    {i < visibleSteps.length - 1 && (
                                        <span className="text-slate-700 text-xs ml-2">›</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Contenu */}
            <div className="max-w-2xl mx-auto px-4 py-6 md:px-8 md:py-8">
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 md:p-8">

                    {/* Step 1 — Cavalier */}
                    {step === 1 && (
                        <Step1Cavalier
                            data={formData}
                            onChange={setField}
                            errors={errors}
                        />
                    )}

                    {/* Step 2 — Responsables */}
                    {step === 2 && (
                        <Step2Responsables
                            data={formData}
                            onChange={setField}
                            errors={errors}
                            adresseAdherent={formData.adresse}
                        />
                    )}

                    {/* Step 3 — Cours & Forfait */}
                    {step === 3 && (
                        <div className="space-y-7">

                            {/* Cours */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Cours souhaité *
                                </label>
                                {formData.galop && coursFiltres.length < cours.length && (
                                    <p className="text-xs text-brand-600 mb-3">
                                        Cours filtrés pour le niveau <strong>{formData.galop}</strong>
                                        {age !== null ? ` · ${age} ans` : ''}
                                    </p>
                                )}
                                {coursFiltres.length === 0 && cours.length > 0 ? (
                                    <p className="text-sm text-gray-500 italic py-2">
                                        Aucun cours disponible pour ce niveau — notre équipe vous guidera.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {coursFiltres.map(c => (
                                            <ChoiceRow
                                                key={c.id}
                                                selected={formData.activite_id === c.id}
                                                onClick={() => {
                                                    setField('activite_id', c.id)
                                                    // Réinitialise le forfait si le nouveau cours ne l'inclut pas
                                                    if (c.plan_ids?.length && formData.offre_id && !c.plan_ids.includes(formData.offre_id)) {
                                                        setField('offre_id', '')
                                                    }
                                                }}
                                                label={c.nom}
                                                sub={`${c.jour} · ${c.heure_debut?.slice(0, 5)} – ${c.heure_fin?.slice(0, 5)}${c.niveaux?.length ? ' · ' + c.niveaux.join(', ') : ''}`}
                                            />
                                        ))}
                                    </div>
                                )}
                                {errors.activite_id && (
                                    <p className="text-xs text-red-500 mt-2">{errors.activite_id}</p>
                                )}
                            </div>

                            {/* Forfait */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Forfait *
                                </label>
                                {forfaitsFiltres.length === 0 ? (
                                    <p className="text-sm text-gray-500 italic py-2">
                                        Aucun forfait disponible — notre équipe vous guidera.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {forfaitsFiltres.map(f => (
                                            <ChoiceRow
                                                key={f.id}
                                                selected={formData.offre_id === f.id}
                                                onClick={() => setField('offre_id', f.id)}
                                                label={f.label ?? f.libelle}
                                                sub={`${Number(f.price ?? f.prix)} €${(f.session_count ?? f.nb_seances) ? ` · ${f.session_count ?? f.nb_seances} séances` : ' · Annuel'}`}
                                            />
                                        ))}
                                    </div>
                                )}
                                {errors.offre_id && (
                                    <p className="text-xs text-red-500 mt-2">{errors.offre_id}</p>
                                )}
                            </div>

                            {/* Récapitulatif financier (affiché si forfait sélectionné) */}
                            {financial && (
                                <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-2">
                                    <p className="text-sm font-semibold text-brand-800 mb-3">Estimation du montant</p>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-sm text-gray-700">
                                            <span>{forfait1Sel.label ?? forfait1Sel.libelle}</span>
                                            <span className="font-medium">{financial.prixForfait1} €</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-gray-700">
                                            <span>Licence FFE</span>
                                            <span className="font-medium">{financial.licenceMontant} €</span>
                                        </div>
                                        <div
                                            className="flex justify-between text-base font-bold text-brand-900 pt-2 border-t border-brand-200">
                                            <span>Total estimé</span>
                                            <span>{financial.total} €</span>
                                        </div>
                                        {financial.acompteMontant > 0 && (
                                            <div
                                                className="flex justify-between text-sm text-amber-700 pt-1 border-t border-brand-200">
                                                <span>dont acompte</span>
                                                <span className="font-semibold">{financial.acompteMontant} €</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Plan de paiement */}
                            {financial && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3">
                                        Plan de paiement *
                                    </label>
                                    <PaiementBuilder
                                        licenceMontant={financial.licenceMontant}
                                        forfaitMontant={financial.totalForfait}
                                        acompteMontant={financial.acompteMontant ?? 0}
                                        modesReglement={modesReglement}
                                        nbFoisAcceptes={nbFoisAcceptes}
                                        saison={saisonActive}
                                        value={formData.lignes_paiement}
                                        onChange={v => setField('lignes_paiement', v)}
                                        errors={errors}
                                    />
                                </div>
                            )}

                        </div>
                    )}

                    {/* Step 4 — Règlement intérieur */}
                    {step === 4 && (
                        <div className="space-y-5">
                            <div>
                                <h2 className="text-base font-semibold text-gray-900 mb-1">Règlement intérieur</h2>
                                <p className="text-sm text-gray-500 mb-4">Veuillez lire attentivement le règlement
                                    intérieur du club avant de valider votre inscription.</p>
                                <div
                                    className="h-72 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                    {reglementTexte || <span className="text-gray-400 italic">Aucun règlement intérieur configuré.</span>}
                                </div>
                            </div>

                            <label
                                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    formData.reglement_accepte
                                        ? 'border-brand-500 bg-brand-50'
                                        : errors.reglement_accepte
                                            ? 'border-red-300 bg-red-50'
                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}>
                                <input
                                    type="checkbox"
                                    checked={formData.reglement_accepte}
                                    onChange={e => setField('reglement_accepte', e.target.checked)}
                                    className="mt-0.5 w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer shrink-0 accent-brand-600"
                                />
                                <span className="text-sm text-gray-700 leading-relaxed">
                  Je soussigné(e),{' '}
                                    <strong className="text-gray-900">
                    {[formData.prenom, formData.nom].filter(Boolean).join(' ') || '…'}
                  </strong>
                  , déclare avoir pris connaissance et accepter le règlement intérieur du centre equestre{' '}
                                    <strong className="text-gray-900">{club?.name ?? 'centre équestre'}</strong>
                                    {' '}et m&apos;engage à le respecter.{' '}
                                    <span className="text-gray-400">
                    Fait le {new Date().toLocaleDateString('fr-FR', {day: '2-digit', month: 'long', year: 'numeric'})}.
                  </span>
                </span>
                            </label>
                            {errors.reglement_accepte && (
                                <p className="text-xs text-red-500">{errors.reglement_accepte}</p>
                            )}
                        </div>
                    )}

                    {/* Honeypot — invisible pour les humains, les bots le remplissent */}
                    <div aria-hidden="true"
                         style={{position: 'absolute', left: '-9999px', width: 0, height: 0, overflow: 'hidden'}}>
                        <label htmlFor="website">Site web</label>
                        <input
                            id="website"
                            name="website"
                            type="text"
                            tabIndex={-1}
                            autoComplete="off"
                            value={honeypot}
                            onChange={e => setHoneypot(e.target.value)}
                        />
                    </div>

                    {/* Erreur globale (ex: doublon) */}
                    {errors._global && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                            {errors._global}
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100 gap-3">
                        <button
                            type="button"
                            onClick={goPrev}
                            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-all duration-150 shadow-card"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none"
                                 viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                      d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
                            </svg>
                            Précédent
                        </button>

                        <button
                            type="button"
                            onClick={goNext}
                            disabled={submitting}
                            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 active:scale-[0.98] text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-150"
                        >
                            {submitting ? (
                                <>
                                    <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none"
                                         viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                                strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor"
                                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                    </svg>
                                    Envoi en cours…
                                </>
                            ) : isLastStep ? (
                                <>
                                    Envoyer mon dossier
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none"
                                         viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round"
                                              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                                    </svg>
                                </>
                            ) : (
                                <>
                                    Suivant
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none"
                                         viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round"
                                              d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
                                    </svg>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <p className="text-center text-xs text-gray-500 mt-6">
                    Vos données sont utilisées uniquement pour la gestion de votre inscription.
                </p>
            </div>
        </div>
    )
}

// ── Composants ────────────────────────────────────────────────────────────────

function ChoiceRow({selected, onClick, label, sub}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all active:scale-[0.99] ${
                selected
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
        >
            <div
                className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    selected ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
                }`}>
                {selected && <div className="w-2 h-2 rounded-full bg-white"/>}
            </div>
            <div className="min-w-0">
                <p className={`text-sm font-medium leading-tight ${selected ? 'text-brand-900' : 'text-gray-800'}`}>
                    {label}
                </p>
                {sub && <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>}
            </div>
        </button>
    )
}
