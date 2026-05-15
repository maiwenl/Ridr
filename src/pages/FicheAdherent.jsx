import React, {useCallback, useEffect, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {useParametres} from '../hooks/useParametres'
import {useSaison} from '../contexts/SaisonContext'
import {
    calculateAge,
    computeFinancial,
    computePaiements,
    formatMontant,
    getStagePrix,
    MODES_PAIEMENT,
} from '../lib/calculs'
import {STATUTS, TYPE_INSCRIPTION} from '../lib/constants'
import LoadingSpinner from '../components/LoadingSpinner'

function makeDefaultForm() {
    return {
        statut: 'encaisse', type: 'acompte', mode: '', montant: '',
        date: new Date().toISOString().slice(0, 10), reference: '', notes: '',
    }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FicheAdherent() {
    const {id} = useParams()                      // adherent.id
    const {parametres, modesReglement} = useParametres()
    const {saisonCourante} = useSaison()

    const [adherent, setAdherent] = useState(null)
    const [responsables, setResponsables] = useState([])
    const [inscriptions, setInscriptions] = useState([])
    const [paiements, setPaiements] = useState({})   // { [inscriptionId]: paiement[] }
    const [seances, setSeances] = useState([])   // tous les pointages de l'adhérent pour la saison
    const [offres, setOffres] = useState([])   // catalogue des offres cours
    const [remises, setRemises] = useState([])   // remises prédéfinies
    const [activites, setActivites] = useState([])   // activités de la saison courante
    const [inscModal, setInscModal] = useState(null) // null | { mode:'add' } | { mode:'edit', inscription }
    const [loading, setLoading] = useState(true)
    const [loadingInsc, setLoadingInsc] = useState(false)
    const [notFound, setNotFound] = useState(false)

    // Formulaire paiement — un seul ouvert à la fois, toutes inscriptions confondues
    const [addingFor, setAddingFor] = useState(null)   // inscription_id | null
    const [addForm, setAddForm] = useState(makeDefaultForm())
    const [addLoading, setAddLoading] = useState(false)
    const [markingRecu, setMarkingRecu] = useState(null)   // paiement_id en cours de marquage

    // ── Chargement adhérent + responsables + remises (une seule fois) ───────────
    useEffect(() => {
        async function init() {
            const [
                {data: adhData, error: adhErr},
                {data: respData},
            ] = await Promise.all([
                supabase.from('members').select('*').eq('id', id).single(),
                supabase.from('guardians').select('*').eq('member_id', id).order('rang'),
            ])
            // normalize for legacy field names
            if (adhData) {
                adhData.nom = adhData.last_name ?? adhData.nom
                adhData.prenom = adhData.first_name ?? adhData.prenom
                adhData.date_naissance = adhData.birth_date ?? adhData.date_naissance
                adhData.telephone = adhData.phone ?? adhData.telephone
                adhData.adresse = adhData.address ?? adhData.adresse
            }

            if (adhErr || !adhData) {
                setNotFound(true);
                setLoading(false);
                return
            }
            // normalize guardians for legacy field names
            const normalizedResp = (respData ?? []).map(r => ({
                ...r,
                nom_prenom: r.full_name ?? r.nom_prenom,
                telephone: r.phone ?? r.telephone,
                adresse: r.address ?? r.adresse,
            }))
            setAdherent(adhData)
            setResponsables(normalizedResp)
        }

        init()
    }, [id])

    // ── Chargement des remises selon la saison courante ──────────────────────────
    useEffect(() => {
        if (!saisonCourante?.id) {
            setRemises([]);
            return
        }
        supabase
            .from('discounts')
            .select('*')
            .eq('season_id', saisonCourante.id)
            .order('label')
            .then(({data}) => setRemises(data ?? []))
    }, [saisonCourante?.id])

    // ── Chargement des offres (forfaits) selon la saison courante ────────────────
    useEffect(() => {
        if (!saisonCourante?.id) {
            setOffres([]);
            return
        }
        supabase
            .from('plans')
            .select('*')
            .eq('season_id', saisonCourante.id)
            .order('is_annual', {ascending: false})
            .order('price')
            .then(({data}) => {
                const offresData = data ?? []
                offresData.forEach(o => {
                    o.libelle = o.label ?? o.libelle
                    o.prix = o.price ?? o.prix
                    o.nb_seances = o.session_count ?? o.nb_seances
                })
                setOffres(offresData)
            })
    }, [saisonCourante?.id])

    // ── Inscriptions de la saison courante ───────────────────────────────────────
    const fetchInscriptions = useCallback(async () => {
        if (!saisonCourante?.id) {
            setLoading(false);
            return
        }
        setLoadingInsc(true)

        const [{data: inscData}, {data: activitesData}] = await Promise.all([
            supabase
                .from('enrollments')
                .select(`
          *,
          saison:season_id(id, name),
          cours:activity_id(*, tarif:rate_id(*)),
          forfait:plan_id(*),
          forfait2:plan2_id(*)
        `)
                .eq('member_id', id)
                .eq('season_id', saisonCourante.id)
                .order('created_at', {ascending: true}),
            supabase
                .from('activities')
                .select('id, nom, type, jour, start_time, end_time, start_date, end_date, rate_id, tarif:rate_id(*), capacite')
                .eq('season_id', saisonCourante.id)
                .order('nom'),
        ])
        // normalize enrollments for legacy field names
        const normalizeEnrollment = e => {
            if (!e) return e
            e.adherent_id = e.member_id
            e.saison_id = e.season_id
            e.activite_id = e.activity_id
            e.offre_id = e.plan_id
            e.offre2_id = e.plan2_id
            e.offres_complementaires = e.extra_plan_ids ?? e.offres_complementaires ?? []
            e.montant_total = e.total_amount ?? e.montant_total
            e.remise_montant = e.discount_amount ?? e.remise_montant ?? 0
            e.motif_remise = e.discount_reason ?? e.motif_remise
            e.mode_reglement = e.payment_method ?? e.mode_reglement
            e.statut = e.status ?? e.statut
            e.stage_formule = e.camp_formula ?? e.stage_formule
            e.is_adherent_price = e.member_price ?? e.is_adherent_price
            if (e.cours) {
                e.cours.heure_debut = e.cours.start_time ?? e.cours.heure_debut
                e.cours.heure_fin = e.cours.end_time ?? e.cours.heure_fin
                e.cours.date_debut = e.cours.start_date ?? e.cours.date_debut
                e.cours.date_fin = e.cours.end_date ?? e.cours.date_fin
                e.cours.tarif_stage_id = e.cours.rate_id ?? e.cours.tarif_stage_id
            }
            if (e.forfait) {
                e.forfait.libelle = e.forfait.label ?? e.forfait.libelle
                e.forfait.prix = e.forfait.price ?? e.forfait.prix
                e.forfait.nb_seances = e.forfait.session_count ?? e.forfait.nb_seances
            }
            if (e.forfait2) {
                e.forfait2.libelle = e.forfait2.label ?? e.forfait2.libelle
                e.forfait2.prix = e.forfait2.price ?? e.forfait2.prix
                e.forfait2.nb_seances = e.forfait2.session_count ?? e.forfait2.nb_seances
            }
            return e
        }

        const insc = (inscData ?? []).map(normalizeEnrollment)
        setInscriptions(insc)
        setActivites((activitesData ?? []).map(a => ({
            ...a,
            heure_debut: a.start_time ?? a.heure_debut,
            heure_fin: a.end_time ?? a.heure_fin,
            date_debut: a.start_date ?? a.date_debut,
            date_fin: a.end_date ?? a.date_fin,
            tarif_stage_id: a.rate_id ?? a.tarif_stage_id,
        })))

        if (insc.length > 0) {
            const [{data: paiData}, {data: seancesData}] = await Promise.all([
                supabase
                    .from('payments')
                    .select('*')
                    .in('enrollment_id', insc.map(i => i.id))
                    .order('paid_at', {ascending: true}),
                // Tous les pointages de l'adhérent dans la saison (réguliers + rattrapages)
                supabase
                    .from('attendance')
                    .select('id, activity_id, date, cours:activity_id!inner(id, nom, jour, season_id)')
                    .eq('member_id', id)
                    .eq('cours.season_id', saisonCourante.id)
                    .order('date', {ascending: true}),
            ])

            const byId = Object.fromEntries(insc.map(i => [i.id, []]))
                // normalize payments for legacy field names
            ;(paiData ?? []).map(p => ({
                ...p,
                inscription_id: p.enrollment_id ?? p.inscription_id,
                montant: p.amount ?? p.montant,
                statut: p.status ?? p.statut,
                mode: p.payment_method ?? p.mode,
            })).forEach(p => {
                if (byId[p.inscription_id]) byId[p.inscription_id].push(p)
            })
            // normalize attendance for legacy field names
            const seancesNorm = (seancesData ?? []).map(s => ({
                ...s,
                cours_id: s.activity_id ?? s.cours_id,
                cours: s.cours ? {...s.cours, saison_id: s.cours.season_id ?? s.cours.saison_id} : null,
            }))
            setPaiements(byId)
            setSeances(seancesNorm)
        } else {
            setPaiements({})
            setSeances([])
        }

        setLoadingInsc(false)
        setLoading(false)
    }, [id, saisonCourante?.id])

    useEffect(() => {
        if (!adherent) return
        fetchInscriptions()
    }, [adherent, fetchInscriptions])

    // ── Handlers ─────────────────────────────────────────────────────────────────

    async function handleStatutChange(inscriptionId, newStatut) {
        setInscriptions(prev => prev.map(i => i.id === inscriptionId ? {
            ...i,
            statut: newStatut,
            status: newStatut
        } : i))
        await supabase.from('enrollments').update({status: newStatut}).eq('id', inscriptionId)
    }

    async function handleAddPaiement() {
        if (!addingFor || !addForm.mode || !addForm.montant || Number(addForm.montant) <= 0) return
        setAddLoading(true)
        const {data, error} = await supabase
            .from('payments')
            .insert({
                enrollment_id: addingFor,
                status: addForm.statut,
                type: addForm.type,
                payment_method: addForm.mode,
                amount: Number(addForm.montant),
                paid_at: addForm.date,
                reference: addForm.reference.trim() || null,
                notes: addForm.notes.trim() || null,
            })
            .select()
            .single()
        setAddLoading(false)
        if (error) return
        const normalized = {
            ...data,
            inscription_id: data.enrollment_id,
            montant: data.amount,
            statut: data.status,
            mode: data.payment_method,
        }
        setPaiements(prev => ({
            ...prev,
            [addingFor]: [...(prev[addingFor] ?? []), normalized].sort((a, b) => (a.paid_at ?? '').localeCompare(b.paid_at ?? '')),
        }))
        setAddForm(makeDefaultForm())
        setAddingFor(null)
    }

    async function handleMarquerRecu(paiementId, inscriptionId) {
        setMarkingRecu(paiementId)
        const today = new Date().toISOString().slice(0, 10)
        await supabase.from('payments').update({status: 'recu', paid_at: today}).eq('id', paiementId)
        setPaiements(prev => ({
            ...prev,
            [inscriptionId]: (prev[inscriptionId] ?? []).map(p =>
                p.id === paiementId ? {...p, statut: 'recu', status: 'recu', paid_at: today} : p
            ),
        }))
        setMarkingRecu(null)
    }

    async function handleMarquerEncaisse(paiementId, inscriptionId) {
        setMarkingRecu(paiementId)
        await supabase.from('payments').update({status: 'encaisse'}).eq('id', paiementId)
        setPaiements(prev => ({
            ...prev,
            [inscriptionId]: (prev[inscriptionId] ?? []).map(p =>
                p.id === paiementId ? {...p, statut: 'encaisse', status: 'encaisse'} : p
            ),
        }))
        setMarkingRecu(null)
    }

    async function handleDeletePaiement(paiementId, inscriptionId) {
        if (!window.confirm('Supprimer ce paiement ?')) return
        await supabase.from('payments').delete().eq('id', paiementId)
        setPaiements(prev => ({
            ...prev,
            [inscriptionId]: (prev[inscriptionId] ?? []).filter(p => p.id !== paiementId),
        }))
    }

    async function handleSaveInscription(mode, inscriptionId, form) {
        const activite = activites.find(a => a.id === form.activite_id) ?? null
        const forfaitPrincipal = offres.find(o => o.id === form.offre_id) ?? null
        const remiseMontant = Number(form.remise_montant) || 0
        const isStage = form.type === 'stage'

        // Détection statut adhérent : a-t-il une inscription avec offre_id (cours annuel) ?
        const isAdherentPrice = isStage
            ? inscriptions.some(i => i.offre_id != null && i.type === 'cours_annuel')
            : false

        const stagePrix = isStage
            ? (getStagePrix(activite?.tarif, form.stage_formule ?? 'journee', isAdherentPrice) ?? 0)
            : 0

        const {total} = isStage
            ? computeFinancial({prixBase: stagePrix, remiseMontant, age, parametres})
            : computeFinancial({forfait1: forfaitPrincipal, forfait2: null, remiseMontant, age, parametres})

        const payload = {
            type: form.type,
            activity_id: form.activite_id || null,
            plan_id: isStage ? null : (form.offre_id || null),
            extra_plan_ids: [],
            discount_amount: remiseMontant,
            discount_reason: form.motif_remise?.trim() || null,
            payment_method: form.mode_reglement,
            total_amount: total,
            ...(isStage ? {
                camp_formula: form.stage_formule ?? 'journee',
                member_price: isAdherentPrice,
            } : {}),
        }

        if (mode === 'add') {
            const {error: insErr} = await supabase.from('enrollments').insert({
                ...payload,
                member_id: id,
                season_id: saisonCourante.id,
                status: 'valide',
            })
            if (insErr) {
                alert(`Erreur lors de la création : ${insErr.message}`);
                return
            }
        } else {
            const {error: updErr} = await supabase.from('enrollments').update(payload).eq('id', inscriptionId)
            if (updErr) {
                alert(`Erreur lors de la mise à jour : ${updErr.message}`);
                return
            }
        }

        setInscModal(null)
        fetchInscriptions()
    }

    // offreId = forfait principal, offresCompl = uuid[] de cartes complémentaires
    async function handleUpdateForfaits(inscriptionId, offreId, offresCompl) {
        await supabase
            .from('enrollments')
            .update({plan_id: offreId, extra_plan_ids: offresCompl ?? []})
            .eq('id', inscriptionId)
        // Recharger pour récupérer les données fraîches avec les joins
        fetchInscriptions()
    }

    // ── Rendu ────────────────────────────────────────────────────────────────────

    if (loading && !adherent) return <LoadingSpinner/>
    if (notFound) return (
        <div className="p-8 text-center">
            <p className="text-gray-500 font-medium">Adhérent introuvable</p>
            <Link to="/adhesions" className="text-brand-600 hover:text-brand-800 text-sm mt-2 inline-block">← Retour à
                la liste</Link>
        </div>
    )
    if (!adherent) return <LoadingSpinner/>

    const age = calculateAge(adherent.date_naissance)
    const isMinor = age !== null && age < 18

    return (
        <div className="p-6 md:p-8 space-y-6">

            {/* En-tête */}
            <div>
                <Link to="/adhesions"
                      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                         strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
                    </svg>
                    Retour
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">
                    {adherent.prenom} <span className="uppercase">{adherent.nom}</span>
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">
                    {age !== null ? `${age} ans · ` : ''}
                    Membre depuis le {new Date(adherent.created_at).toLocaleDateString('fr-FR')}
                </p>
            </div>

            {/* Fiche cavalier */}
            <CavalierBlock
                adherent={adherent}
                isMinor={isMinor}
                responsables={responsables}
                age={age}
                onSaveAdherent={async (updates) => {
                    // Map legacy names to new column names
                    const mapped = {
                        last_name: updates.nom ?? updates.last_name,
                        first_name: updates.prenom ?? updates.first_name,
                        email: updates.email,
                        phone: updates.telephone ?? updates.phone,
                        address: updates.adresse ?? updates.address,
                        birth_date: updates.date_naissance ?? updates.birth_date,
                        galop: updates.galop,
                        licence_ffe: updates.licence_ffe,
                        droit_image: updates.droit_image,
                    }
                    const {data} = await supabase.from('members').update(mapped).eq('id', id).select().single()
                    if (data) {
                        data.nom = data.last_name
                        data.prenom = data.first_name
                        data.date_naissance = data.birth_date
                        data.telephone = data.phone
                        data.adresse = data.address
                        setAdherent(data)
                    }
                }}
                onSaveResponsable={async (respId, updates) => {
                    const mapped = {
                        full_name: updates.nom_prenom ?? updates.full_name,
                        phone: updates.telephone ?? updates.phone,
                        address: updates.adresse ?? updates.address,
                        email: updates.email,
                        meme_adresse: updates.meme_adresse,
                        rang: updates.rang,
                    }
                    const {data} = await supabase.from('guardians').update(mapped).eq('id', respId).select().single()
                    if (data) {
                        const normalized = {
                            ...data,
                            nom_prenom: data.full_name ?? data.nom_prenom,
                            telephone: data.phone ?? data.telephone,
                            adresse: data.address ?? data.adresse,
                        }
                        setResponsables(prev => prev.map(r => r.id === respId ? normalized : r))
                    }
                }}
            />

            {/* Inscriptions de la saison — avec onglets par type */}
            <InscriptionsBlock
                inscriptions={inscriptions}
                paiements={paiements}
                parametres={parametres}
                modesReglement={modesReglement}
                offres={offres}
                activites={activites}
                seances={seances}
                age={age}
                loading={loadingInsc}
                saisonCourante={saisonCourante}
                addingFor={addingFor}
                addForm={addForm}
                addLoading={addLoading}
                markingRecu={markingRecu}
                onStatutChange={handleStatutChange}
                onOpenAdd={(inscId) => {
                    setAddingFor(inscId);
                    setAddForm(makeDefaultForm())
                }}
                onCloseAdd={() => setAddingFor(null)}
                onAddFormChange={(f, v) => setAddForm(prev => ({...prev, [f]: v}))}
                onAddPaiement={handleAddPaiement}
                onMarquerRecu={handleMarquerRecu}
                onMarquerEncaisse={handleMarquerEncaisse}
                onDeletePaiement={handleDeletePaiement}
                onUpdateForfaits={handleUpdateForfaits}
                onOpenInscModal={(payload) => setInscModal(payload)}
            />

            {/* Modale inscription / modification */}
            {inscModal && (
                <InscriptionModal
                    mode={inscModal.mode}
                    inscription={inscModal.inscription ?? null}
                    defaultType={inscModal.defaultType ?? 'cours_annuel'}
                    activites={activites}
                    offres={offres}
                    modesReglement={modesReglement}
                    parametres={parametres}
                    remises={remises}
                    age={age}
                    isAdherent={inscriptions.some(i => i.offre_id != null && i.type === 'cours_annuel')}
                    onSave={(form) => handleSaveInscription(inscModal.mode, inscModal.inscription?.id ?? null, form)}
                    onClose={() => setInscModal(null)}
                />
            )}

        </div>
    )
}

// ── Bloc inscriptions avec onglets ───────────────────────────────────────────

const TABS_ORDER = ['cours_annuel', 'stage', 'ponctuel']

function InscriptionsBlock({
                               inscriptions,
                               paiements,
                               parametres,
                               modesReglement,
                               offres,
                               activites,
                               seances,
                               age,
                               loading,
                               saisonCourante,
                               addingFor,
                               addForm,
                               addLoading,
                               markingRecu,
                               onStatutChange,
                               onOpenAdd,
                               onCloseAdd,
                               onAddFormChange,
                               onAddPaiement,
                               onMarquerRecu,
                               onMarquerEncaisse,
                               onDeletePaiement,
                               onUpdateForfaits,
                               onOpenInscModal,
                           }) {
    // Types effectivement présents, dans l'ordre défini
    const presentTypes = TABS_ORDER.filter(t => inscriptions.some(i => i.type === t))
    const [activeTab, setActiveTab] = useState('cours_annuel')

    // Si l'onglet actif n'a plus d'inscription (changement de saison), bascule sur le premier dispo
    const effectiveTab = presentTypes.includes(activeTab)
        ? activeTab
        : (presentTypes[0] ?? 'cours_annuel')

    const visibles = inscriptions.filter(i => i.type === effectiveTab)

    return (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

            {/* En-tête : titre + indicateur chargement */}
            <div className="px-5 pt-4 pb-0 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {saisonCourante ? `Saison ${saisonCourante.name ?? saisonCourante.libelle}` : 'Saison courante'}
          </span>
                    <div className="flex items-center gap-3">
                        {loading && <span className="text-xs text-gray-400 animate-pulse">Chargement…</span>}
                        <button
                            onClick={() => onOpenInscModal({mode: 'add', defaultType: effectiveTab})}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-2.5 py-1.5 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24"
                                 strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                            </svg>
                            Ajouter
                        </button>
                    </div>
                </div>

                {/* Onglets */}
                {presentTypes.length > 0 && (
                    <div className="flex gap-0.5">
                        {presentTypes.map(type => {
                            const meta = TYPE_INSCRIPTION[type] ?? {label: type}
                            const count = inscriptions.filter(i => i.type === type).length
                            const isActive = effectiveTab === type
                            return (
                                <button
                                    key={type}
                                    onClick={() => setActiveTab(type)}
                                    className={`relative px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors focus:outline-none ${
                                        isActive
                                            ? 'text-brand-700 bg-white border border-b-white border-gray-200 -mb-px z-10'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {meta.label}
                                    {count > 1 && (
                                        <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                            isActive ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                      {count}
                    </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Contenu */}
            {loading ? null : inscriptions.length === 0 ? (
                <div className="py-10 text-center">
                    <p className="text-sm text-gray-400">Aucune inscription pour cette saison</p>
                </div>
            ) : visibles.length === 0 ? (
                <div className="py-10 text-center">
                    <p className="text-sm text-gray-400">Aucune inscription de ce type</p>
                </div>
            ) : effectiveTab === 'cours_annuel' ? (
                <div className="p-5 space-y-4">
                    {visibles.map(insc => (
                        <CoursCard
                            key={insc.id}
                            inscription={insc}
                            paiements={paiements[insc.id] ?? []}
                            parametres={parametres}
                            modesReglement={modesReglement}
                            offres={offres}
                            age={age}
                            isAddingOpen={addingFor === insc.id}
                            addForm={addForm}
                            addLoading={addLoading}
                            markingRecu={markingRecu}
                            onStatutChange={v => onStatutChange(insc.id, v)}
                            onOpenAdd={() => onOpenAdd(insc.id)}
                            onCloseAdd={onCloseAdd}
                            onAddFormChange={onAddFormChange}
                            onAddPaiement={onAddPaiement}
                            onMarquerRecu={pId => onMarquerRecu(pId, insc.id)}
                            onMarquerEncaisse={pId => onMarquerEncaisse(pId, insc.id)}
                            onDeletePaiement={pId => onDeletePaiement(pId, insc.id)}
                            seances={seances}
                            onUpdateForfaits={(o1, o2) => onUpdateForfaits(insc.id, o1, o2)}
                            onEdit={() => onOpenInscModal({mode: 'edit', inscription: insc})}
                        />
                    ))}
                </div>
            ) : (
                <StageTable
                    inscriptions={visibles}
                    paiements={paiements}
                    parametres={parametres}
                    modesReglement={modesReglement}
                    age={age}
                    addingFor={addingFor}
                    addForm={addForm}
                    addLoading={addLoading}
                    markingRecu={markingRecu}
                    onOpenAdd={onOpenAdd}
                    onCloseAdd={onCloseAdd}
                    onAddFormChange={onAddFormChange}
                    onAddPaiement={onAddPaiement}
                    onMarquerRecu={onMarquerRecu}
                    onMarquerEncaisse={onMarquerEncaisse}
                    onDeletePaiement={onDeletePaiement}
                    onEdit={(insc) => onOpenInscModal({mode: 'edit', inscription: insc})}
                />
            )}
        </div>
    )
}

// ── Tableau stages / ponctuel ────────────────────────────────────────────────

const REGL_STATUT = {
    solde: {label: 'Soldé', cls: 'bg-emerald-100 text-emerald-700'},
    partiel: {label: 'En cours', cls: 'bg-brand-50 text-brand-700'},
    nonRegle: {label: 'Non réglé', cls: 'bg-gray-100 text-gray-500'},
}

function reglStatut(paiementsInfo) {
    if (paiementsInfo.estSolde) return 'solde'
    if (paiementsInfo.totalEncaisse > 0) return 'partiel'
    return 'nonRegle'
}

function StageTable({
                        inscriptions, paiements, parametres, modesReglement, age,
                        addingFor, addForm, addLoading, markingRecu,
                        onOpenAdd, onCloseAdd, onAddFormChange, onAddPaiement,
                        onMarquerRecu, onMarquerEncaisse, onDeletePaiement, onEdit,
                    }) {
    const [expanded, setExpanded] = useState(null) // inscription_id | null
    const [sortCol, setSortCol] = useState('date')
    const [sortDir, setSortDir] = useState('asc')

    function toggleSort(col) {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else {
            setSortCol(col);
            setSortDir('asc')
        }
    }

    const sorted = [...inscriptions].sort((a, b) => {
        let va, vb
        if (sortCol === 'date') {
            va = (a.cours?.start_date ?? a.cours?.date_debut) ?? ''
            vb = (b.cours?.start_date ?? b.cours?.date_debut) ?? ''
        } else if (sortCol === 'montant') {
            va = Number(a.total_amount ?? a.montant_total ?? 0)
            vb = Number(b.total_amount ?? b.montant_total ?? 0)
        } else if (sortCol === 'regl') {
            const order = {solde: 0, partiel: 1, nonRegle: 2}
            va = order[reglStatut(computePaiements(paiements[a.id] ?? [], a.total_amount ?? a.montant_total))] ?? 2
            vb = order[reglStatut(computePaiements(paiements[b.id] ?? [], b.total_amount ?? b.montant_total))] ?? 2
        } else {
            va = a.cours?.nom ?? ''
            vb = b.cours?.nom ?? ''
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
    })

    const thCls = col => `px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-gray-700 transition-colors ${sortCol === col ? 'text-brand-700' : ''}`

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead className="border-b border-gray-100">
                <tr>
                    <th className={thCls('nom')} onClick={() => toggleSort('nom')}>
                        <span className="flex items-center gap-1">Activité <SortChevrons col="nom" sortCol={sortCol}
                                                                                         sortDir={sortDir}/></span>
                    </th>
                    <th className={thCls('date')} onClick={() => toggleSort('date')}>
                        <span className="flex items-center gap-1">Date <SortChevrons col="date" sortCol={sortCol}
                                                                                     sortDir={sortDir}/></span>
                    </th>
                    <th className={thCls('montant')} onClick={() => toggleSort('montant')}>
                        <span className="flex items-center gap-1">Montant <SortChevrons col="montant" sortCol={sortCol}
                                                                                        sortDir={sortDir}/></span>
                    </th>
                    <th className={thCls('regl')} onClick={() => toggleSort('regl')}>
                        <span className="flex items-center gap-1">Règlement <SortChevrons col="regl" sortCol={sortCol}
                                                                                          sortDir={sortDir}/></span>
                    </th>
                    <th className="px-4 py-2.5 w-10"/>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                {sorted.map(insc => {
                    const pai = paiements[insc.id] ?? []
                    const mt = insc.total_amount ?? insc.montant_total
                    const remise = Number(insc.discount_amount ?? insc.remise_montant ?? 0)
                    const prixBase = mt != null
                        ? mt + remise
                        : (getStagePrix(insc.cours?.tarif, insc.camp_formula ?? insc.stage_formule ?? 'journee', insc.member_price ?? insc.is_adherent_price ?? false) ?? 0)
                    const {total} = computeFinancial({prixBase, remiseMontant: remise, age, parametres})
                    const montantRef = mt ?? (total > 0 ? total : null)
                    const info = computePaiements(pai, montantRef)
                    const rs = reglStatut(info)
                    const meta = REGL_STATUT[rs]
                    const isOpen = expanded === insc.id

                    const stageStart = insc.cours?.start_date ?? insc.cours?.date_debut
                    const stageEnd = insc.cours?.end_date ?? insc.cours?.date_fin
                    const dateLabel = stageStart
                        ? [
                            new Date(stageStart).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                            }),
                            stageEnd && stageEnd !== stageStart
                                ? `→ ${new Date(stageEnd).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'short'
                                })}`
                                : null,
                        ].filter(Boolean).join(' ')
                        : '—'

                    return (
                        <React.Fragment key={insc.id}>
                            <tr
                                className="hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => setExpanded(isOpen ? null : insc.id)}
                            >
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{insc.cours?.nom ?? '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{dateLabel}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                                    {montantRef ? formatMontant(montantRef) : '—'}
                                </td>
                                <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.cls}`}>
                      {meta.label}
                    </span>
                                    {!info.estSolde && info.resteADu > 0 && (
                                        <span
                                            className="ml-2 text-xs text-gray-400">{formatMontant(info.resteADu)} restant</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                onEdit(insc)
                                            }}
                                            className="text-xs font-semibold text-gray-400 hover:text-brand-600 transition-colors"
                                            title="Modifier"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none"
                                                 viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round"
                                                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>
                                            </svg>
                                        </button>
                                        <svg xmlns="http://www.w3.org/2000/svg"
                                             className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                             fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                  d="m19.5 8.25-7.5 7.5-7.5-7.5"/>
                                        </svg>
                                    </div>
                                </td>
                            </tr>
                            {isOpen && (
                                <tr>
                                    <td colSpan={5} className="px-6 pb-4 pt-2 bg-gray-50/60">
                                        <PaiementsSection
                                            planifies={pai.filter(p => p.statut === 'planifie')}
                                            recus={pai.filter(p => p.statut === 'recu')}
                                            encaisses={pai.filter(p => p.statut === 'encaisse' || (!p.statut))}
                                            isAddingOpen={addingFor === insc.id}
                                            addForm={addForm}
                                            addLoading={addLoading}
                                            markingRecu={markingRecu}
                                            modesReglement={modesReglement}
                                            onOpenAdd={() => onOpenAdd(insc.id)}
                                            onCloseAdd={onCloseAdd}
                                            onAddFormChange={onAddFormChange}
                                            onAddPaiement={onAddPaiement}
                                            onMarquerRecu={pId => onMarquerRecu(pId, insc.id)}
                                            onMarquerEncaisse={pId => onMarquerEncaisse(pId, insc.id)}
                                            onDeletePaiement={pId => onDeletePaiement(pId, insc.id)}
                                        />
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    )
                })}
                </tbody>
            </table>
        </div>
    )
}

function SortChevrons({col, sortCol, sortDir}) {
    const active = sortCol === col
    return (
        <span className={`inline-flex flex-col gap-[2px] ${active ? 'opacity-100' : 'opacity-30'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4"
           className={`w-1.5 h-1 ${active && sortDir === 'asc' ? 'text-brand-600' : 'text-current'}`}
           fill="currentColor"><path d="M3 0 6 4H0z"/></svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4"
           className={`w-1.5 h-1 ${active && sortDir === 'desc' ? 'text-brand-600' : 'text-current'}`}
           fill="currentColor"><path d="M3 4 0 0h6z"/></svg>
    </span>
    )
}

// ── Bloc cavalier ─────────────────────────────────────────────────────────────

function CavalierBlock({adherent, isMinor, responsables, age, onSaveAdherent, onSaveResponsable}) {
    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({})
    const [respForms, setRespForms] = useState({}) // { [respId]: {...} }

    function startEdit() {
        setForm({
            nom: adherent.nom ?? '',
            prenom: adherent.prenom ?? '',
            date_naissance: adherent.date_naissance ?? '',
            galop: adherent.galop ?? '',
            licence_ffe: adherent.licence_ffe ?? '',
            email: adherent.email ?? '',
            telephone: adherent.telephone ?? '',
            droit_image: adherent.droit_image ?? false,
            adresse: adherent.adresse ?? '',
        })
        const rf = {}
        responsables.forEach(r => {
            rf[r.id] = {
                nom_prenom: r.nom_prenom ?? '',
                telephone: r.telephone ?? '',
                email: r.email ?? '',
                adresse: r.adresse ?? '',
                meme_adresse: r.meme_adresse ?? false,
            }
        })
        setRespForms(rf)
        setEditing(true)
    }

    function cancel() {
        setEditing(false)
    }

    async function save() {
        setSaving(true)
        await onSaveAdherent(form)
        await Promise.all(
            responsables.map(r => onSaveResponsable(r.id, respForms[r.id] ?? {}))
        )
        setSaving(false)
        setEditing(false)
    }

    function setF(field, value) {
        setForm(prev => ({...prev, [field]: value}))
    }

    function setRF(respId, field, value) {
        setRespForms(prev => ({...prev, [respId]: {...prev[respId], [field]: value}}))
    }

    return (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cavalier</span>
                {!editing ? (
                    <button
                        onClick={startEdit}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-3 py-1.5 rounded-full transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                             strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>
                        </svg>
                        Modifier
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={cancel}
                            className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-full border border-gray-200 bg-white transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={save}
                            disabled={saving}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors"
                        >
                            {saving ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                    </div>
                )}
            </div>

            <div className="p-5 space-y-5">
                {editing ? (
                    <>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <EditField label="Nom" value={form.nom} onChange={v => setF('nom', v)}/>
                            <EditField label="Prénom" value={form.prenom} onChange={v => setF('prenom', v)}/>
                            <EditField label="Date de naissance" value={form.date_naissance}
                                       onChange={v => setF('date_naissance', v)} type="date"/>
                            <EditField label="Galop" value={form.galop} onChange={v => setF('galop', v)} type="number"
                                       min="0" max="9"/>
                            <EditField label="N° licence FFE" value={form.licence_ffe}
                                       onChange={v => setF('licence_ffe', v)} placeholder="Optionnel"/>
                            <EditField label="Email" value={form.email} onChange={v => setF('email', v)} type="email"/>
                            <EditField label="Téléphone" value={form.telephone} onChange={v => setF('telephone', v)}
                                       type="tel"/>
                            <div className="flex items-center gap-2.5 pt-1">
                                <input
                                    id="droit_image"
                                    type="checkbox"
                                    checked={!!form.droit_image}
                                    onChange={e => setF('droit_image', e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                />
                                <label htmlFor="droit_image"
                                       className="text-sm text-gray-700 font-medium select-none cursor-pointer">
                                    Droit à l'image accordé
                                </label>
                            </div>
                            <EditField label="Adresse" value={form.adresse} onChange={v => setF('adresse', v)} full/>
                        </div>

                        {isMinor && responsables.length > 0 && (
                            <div className="pt-4 border-t border-gray-100 space-y-5">
                                {responsables.map((r, i) => (
                                    <div key={r.id} className={i > 0 ? 'pt-4 border-t border-gray-100' : ''}>
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                                            Responsable légal {r.rang}
                                        </p>
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                            <EditField label="Nom Prénom" value={respForms[r.id]?.nom_prenom ?? ''}
                                                       onChange={v => setRF(r.id, 'nom_prenom', v)}/>
                                            <EditField label="Téléphone" value={respForms[r.id]?.telephone ?? ''}
                                                       onChange={v => setRF(r.id, 'telephone', v)} type="tel"/>
                                            <EditField label="Email" value={respForms[r.id]?.email ?? ''}
                                                       onChange={v => setRF(r.id, 'email', v)} type="email"/>
                                            <div className="flex items-center gap-2.5 pt-1">
                                                <input
                                                    id={`meme_adresse_${r.id}`}
                                                    type="checkbox"
                                                    checked={!!respForms[r.id]?.meme_adresse}
                                                    onChange={e => setRF(r.id, 'meme_adresse', e.target.checked)}
                                                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                                />
                                                <label htmlFor={`meme_adresse_${r.id}`}
                                                       className="text-sm text-gray-700 font-medium select-none cursor-pointer">
                                                    Même adresse que le cavalier
                                                </label>
                                            </div>
                                            {!respForms[r.id]?.meme_adresse && (
                                                <EditField label="Adresse" value={respForms[r.id]?.adresse ?? ''}
                                                           onChange={v => setRF(r.id, 'adresse', v)} full/>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <Grid>
                            <Info label="Nom" value={adherent.nom}/>
                            <Info label="Prénom" value={adherent.prenom}/>
                            <Info label="Date de naissance"
                                  value={adherent.date_naissance
                                      ? `${new Date(adherent.date_naissance).toLocaleDateString('fr-FR')} — ${age} ans`
                                      : null}/>
                            <Info label="Galop" value={adherent.galop}/>
                            <Info label="N° licence FFE" value={adherent.licence_ffe}/>
                            <Info label="Email" value={adherent.email}/>
                            <Info label="Téléphone" value={adherent.telephone}/>
                            <Info label="Droit à l'image" value={adherent.droit_image ? 'Oui' : 'Non'}/>
                            <Info label="Adresse" value={adherent.adresse} full/>
                        </Grid>

                        {isMinor && responsables.length > 0 && (
                            <div className="pt-4 border-t border-gray-100 space-y-5">
                                {responsables.map((r, i) => (
                                    <div key={r.id} className={i > 0 ? 'pt-4 border-t border-gray-100' : ''}>
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                                            Responsable légal {r.rang}
                                        </p>
                                        <Grid>
                                            <Info label="Nom Prénom" value={r.nom_prenom}/>
                                            <Info label="Téléphone" value={r.telephone}/>
                                            <Info label="Email" value={r.email}/>
                                            <Info label="Adresse"
                                                  value={r.meme_adresse ? 'Même adresse que le cavalier' : r.adresse}
                                                  full/>
                                        </Grid>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

// ── Carte d'inscription ───────────────────────────────────────────────────────


// ── Imputation des séances sur les forfaits (N forfaits) ─────────────────────

// Retourne un tableau de buckets (un par forfait), dans l'ordre des forfaits fournis
function imputerSeances(seances, coursId, forfaits = []) {
    const sorted = [...seances].sort((a, b) => a.date.localeCompare(b.date))
    const annotated = sorted.map(s => ({...s, isRattrapage: s.cours_id !== coursId}))

    const caps = forfaits.map(f => f ? (f.is_annual ? Infinity : (f.session_count ?? f.nb_seances ?? Infinity)) : 0)
    const buckets = forfaits.map(() => [])

    for (const s of annotated) {
        for (let i = 0; i < forfaits.length; i++) {
            if (buckets[i].length < caps[i]) {
                buckets[i].push(s);
                break
            }
        }
    }

    return buckets // buckets[i] = séances imputées au forfait i
}

// Carte cours annuel — table de forfaits + séances dépliables
function CoursCard({
                       inscription, paiements, parametres, modesReglement, offres, seances, age,
                       isAddingOpen, addForm, addLoading, markingRecu,
                       onStatutChange, onOpenAdd, onCloseAdd, onAddFormChange, onAddPaiement,
                       onMarquerRecu, onMarquerEncaisse, onDeletePaiement, onUpdateForfaits, onEdit,
                   }) {
    const cours = inscription.cours ?? null
    const remise = Number(inscription.remise_montant ?? inscription.discount_amount ?? 0)

    // Forfait principal + cartes complémentaires (résolution depuis le catalogue)
    const forfaitPrincipal = inscription.forfait ?? null
    const offresComplIds = inscription.offres_complementaires ?? inscription.extra_plan_ids ?? []
    const cartesComplementaires = offresComplIds
        .map(id => offres.find(o => o.id === id))
        .filter(Boolean)

    // Tous les forfaits dans l'ordre : principal en premier
    const allForfaits = [forfaitPrincipal, ...cartesComplementaires].filter(Boolean)

    // Finance globale (on passe seulement principal + 1ère carte pour l'instant)
    const {total, licenceMontant, remiseAppliquee} = computeFinancial({
        forfait1: forfaitPrincipal,
        forfait2: cartesComplementaires[0] ?? null,
        remiseMontant: remise, age, parametres,
    })

    const montantRef = (inscription.total_amount ?? inscription.montant_total) ?? (total > 0 ? total : null)
    const paiementsInfo = computePaiements(paiements, montantRef)
    const statut = STATUTS[inscription.statut ?? inscription.status] ?? STATUTS.pre_inscription
    const planifies = paiements.filter(p => p.statut === 'planifie')
    const recus = paiements.filter(p => p.statut === 'recu')
    const encaisses = paiements.filter(p => p.statut === 'encaisse' || !p.statut)
    const encaisse = paiementsInfo.totalEncaisse ?? 0

    // Imputation séances → N buckets
    const buckets = imputerSeances(seances, inscription.activite_id, allForfaits)

    // Prix par forfait (approximation : prix brut de l'offre)
    const prixParForfait = allForfaits.map(f => Number(f?.price ?? f?.prix ?? 0))

    // Statut règlement par forfait (cumulatif)
    function reglStatutForfait(prix, cumulPrix) {
        if (encaisse >= cumulPrix) return {label: 'Soldé', cls: 'bg-emerald-100 text-emerald-700'}
        if (encaisse > cumulPrix - prix) return {label: 'Partiel', cls: 'bg-amber-100 text-amber-700'}
        return {label: 'Non réglé', cls: 'bg-gray-100 text-gray-500'}
    }

    const [expanded, setExpanded] = useState(null) // index de forfait | null

    // ── Éditeur de forfaits ───────────────────────────────────────────────────
    const [editingForfaits, setEditingForfaits] = useState(false)
    const [savingForfaits, setSavingForfaits] = useState(false)
    const [selPrincipal, setSelPrincipal] = useState('')
    const [selCartes, setSelCartes] = useState([]) // uuid[]

    function openForfaitEdit() {
        setSelPrincipal(inscription.plan_id ?? inscription.offre_id ?? '')
        setSelCartes(inscription.extra_plan_ids ?? inscription.offres_complementaires ?? [])
        setEditingForfaits(true)
    }

    async function saveForfaits() {
        if (!selPrincipal) return
        setSavingForfaits(true)
        await onUpdateForfaits(selPrincipal, selCartes)
        setSavingForfaits(false)
        setEditingForfaits(false)
    }

    function addCarte() {
        setSelCartes(prev => [...prev, ''])
    }

    function setCarte(idx, val) {
        setSelCartes(prev => prev.map((v, i) => i === idx ? val : v))
    }

    function removeCarte(idx) {
        setSelCartes(prev => prev.filter((_, i) => i !== idx))
    }

    const offresAnnuelles = offres.filter(o => o.is_annual)
    const offresCartes = offres.filter(o => !o.is_annual)

    // ── Ligne forfait ─────────────────────────────────────────────────────────
    const ForfaitRow = ({forfait, prix, imputed, cumulPrix, idx}) => {
        const isAnnual = forfait?.is_annual
        // Pour l'annuel, nb_seances = total des cours du calendrier (synced)
        // Pour la carte, nb_seances = séances disponibles sur la carte
        const cap = (forfait?.session_count ?? forfait?.nb_seances) ?? null  // null = inconnu
        const pct = cap ? Math.min(100, (imputed.length / cap) * 100) : (imputed.length > 0 ? 100 : 0)
        const isOpen = expanded === idx
        const regl = reglStatutForfait(prix, cumulPrix)

        return (
            <>
                <tr
                    className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    onClick={() => setExpanded(isOpen ? null : idx)}
                >
                    <td className="px-4 py-3">
            <span
                className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${isAnnual ? 'bg-brand-100 text-brand-700' : 'bg-purple-100 text-purple-700'}`}>
              {isAnnual ? 'Annuel' : 'Carte'}
            </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{forfait?.libelle ?? '—'}</td>
                    <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                <div
                                    className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-amber-500' : 'bg-brand-500'}`}
                                    style={{width: `${pct}%`}}/>
                            </div>
                            <span
                                className={`text-xs tabular-nums shrink-0 ${cap && imputed.length >= cap ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
                {imputed.length}{cap ? `/${cap}` : ''} séance{cap !== 1 ? 's' : ''}
              </span>
                        </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{prix} €</td>
                    <td className="px-4 py-3">
                        <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${regl.cls}`}>{regl.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                        <svg xmlns="http://www.w3.org/2000/svg"
                             className={`w-4 h-4 text-gray-400 transition-transform inline ${isOpen ? 'rotate-180' : ''}`}
                             fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/>
                        </svg>
                    </td>
                </tr>
                {isOpen && (
                    <tr>
                        <td colSpan={6} className="px-0">
                            <div
                                className={`mx-3 mb-3 rounded-xl border overflow-hidden ${isAnnual ? 'border-brand-100' : 'border-purple-100'}`}>
                                <SeancesList seances={imputed} isAnnual={isAnnual}/>
                            </div>
                        </td>
                    </tr>
                )}
            </>
        )
    }

    return (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

            {/* En-tête */}
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="font-semibold text-gray-900 truncate">{cours?.nom ?? '—'}</span>
                    {cours?.jour && (
                        <span className="text-xs text-gray-400 shrink-0">
              {cours.jour} · {(cours.start_time ?? cours.heure_debut)?.slice(0, 5)}–{(cours.end_time ?? cours.heure_fin)?.slice(0, 5)}
            </span>
                    )}
                    {licenceMontant > 0 &&
                        <span className="text-xs text-gray-400 shrink-0">· Licence {licenceMontant} €</span>}
                    {remiseAppliquee > 0 &&
                        <span className="text-xs text-emerald-700 shrink-0">· Remise −{remiseAppliquee} €</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onEdit}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-brand-600 bg-white hover:bg-brand-50 border border-gray-200 hover:border-brand-200 px-2.5 py-1.5 rounded-full transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24"
                             strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>
                        </svg>
                        Modifier
                    </button>
                    <select
                        value={inscription.statut ?? inscription.status ?? 'creation'}
                        onChange={e => onStatutChange(e.target.value)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 ${statut.cls}`}
                    >
                        {Object.entries(STATUTS).map(([v, {label}]) => (
                            <option key={v} value={v}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table des forfaits */}
            {!editingForfaits ? (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b border-gray-100">
                        <tr>
                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Forfait</th>
                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Séances</th>
                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Prix</th>
                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Règlement</th>
                            <th className="px-4 py-2 w-8"/>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                        {allForfaits.map((forfait, idx) => {
                            const cumul = prixParForfait.slice(0, idx + 1).reduce((s, p) => s + p, 0)
                            return (
                                <ForfaitRow
                                    key={forfait.id + '-' + idx}
                                    forfait={forfait}
                                    prix={prixParForfait[idx]}
                                    imputed={buckets[idx] ?? []}
                                    cumulPrix={cumul}
                                    idx={idx}
                                />
                            )
                        })}
                        {allForfaits.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-4 text-sm text-gray-400 italic text-center">
                                    Aucun forfait — cliquez sur "Gérer les forfaits" pour en ajouter
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>

                    {/* Barre du bas */}
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                        <button
                            onClick={openForfaitEdit}
                            className="text-xs font-semibold text-gray-500 hover:text-brand-600 transition-colors"
                        >
                            + Gérer les forfaits / cartes
                        </button>
                        <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {paiementsInfo.estSolde
                    ? <span className="font-semibold text-emerald-700">✓ Soldé</span>
                    : encaisse > 0
                        ? <>{formatMontant(encaisse)} encaissé · <span
                            className="font-semibold text-gray-700">{formatMontant(paiementsInfo.resteADu)} restant</span></>
                        : 'Aucun paiement enregistré'
                }
              </span>
                            <span className="text-sm font-black text-gray-900">{formatMontant(total)}</span>
                        </div>
                    </div>
                </div>
            ) : (
                /* ── Éditeur forfaits ── */
                <div className="p-4 space-y-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Gérer les forfaits</p>

                    {/* Principal */}
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Forfait principal *</label>
                        <select
                            value={selPrincipal}
                            onChange={e => setSelPrincipal(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                            <option value="">— Choisir —</option>
                            {offresAnnuelles.length > 0 && (
                                <optgroup label="Annuels">
                                    {offresAnnuelles.map(o => <option key={o.id}
                                                                      value={o.id}>{o.libelle} — {o.prix} €</option>)}
                                </optgroup>
                            )}
                            {offresCartes.length > 0 && (
                                <optgroup label="Cartes">
                                    {offresCartes.map(o => <option key={o.id}
                                                                   value={o.id}>{o.libelle} — {o.prix} €</option>)}
                                </optgroup>
                            )}
                        </select>
                    </div>

                    {/* Cartes complémentaires — liste dynamique */}
                    <div className="space-y-2">
                        <label className="block text-xs text-gray-500">Cartes complémentaires</label>
                        {selCartes.map((carteId, idx) => (
                            <div key={idx} className="flex gap-1.5 items-center">
                                <select
                                    value={carteId}
                                    onChange={e => setCarte(idx, e.target.value)}
                                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                >
                                    <option value="">— Choisir une carte —</option>
                                    {offresCartes.map(o => <option key={o.id}
                                                                   value={o.id}>{o.libelle} — {o.prix} €</option>)}
                                </select>
                                <button
                                    onClick={() => removeCarte(idx)}
                                    className="shrink-0 text-gray-400 hover:text-red-500 transition-colors px-1"
                                    title="Supprimer"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none"
                                         viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={addCarte}
                            className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors"
                        >
                            + Ajouter une carte
                        </button>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => setEditingForfaits(false)}
                            className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={saveForfaits}
                            disabled={!selPrincipal || savingForfaits}
                            className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                        >
                            {savingForfaits ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                    </div>
                </div>
            )}

            {/* Paiements */}
            <div className="px-4 py-3">
                <PaiementsSection
                    planifies={planifies} recus={recus} encaisses={encaisses}
                    isAddingOpen={isAddingOpen} addForm={addForm} addLoading={addLoading}
                    markingRecu={markingRecu} modesReglement={modesReglement}
                    onOpenAdd={onOpenAdd} onCloseAdd={onCloseAdd}
                    onAddFormChange={onAddFormChange} onAddPaiement={onAddPaiement}
                    onMarquerRecu={onMarquerRecu} onMarquerEncaisse={onMarquerEncaisse}
                    onDeletePaiement={onDeletePaiement}
                />
            </div>
        </div>
    )
}

// ── Liste des séances imputées ────────────────────────────────────────────────

function SeancesList({seances, isAnnual}) {
    const accentBg = isAnnual ? 'bg-brand-50' : 'bg-purple-50'
    const accentTxt = isAnnual ? 'text-brand-700' : 'text-purple-700'
    const accentDot = isAnnual ? 'bg-brand-400' : 'bg-purple-400'

    if (seances.length === 0) {
        return (
            <div className={`${accentBg} px-5 py-5 flex items-center gap-3`}>
                <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${accentTxt} opacity-50`} fill="none"
                         viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round"
                              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
                    </svg>
                </div>
                <p className="text-sm text-gray-400">Aucune séance enregistrée sur ce forfait</p>
            </div>
        )
    }

    // Regrouper par mois en préservant l'ordre
    const monthKeys = []
    const monthMap = {}
    seances.forEach(s => {
        const key = s.date.slice(0, 7)
        if (!monthMap[key]) {
            monthMap[key] = [];
            monthKeys.push(key)
        }
        monthMap[key].push(s)
    })

    const nReg = seances.filter(s => !s.isRattrapage).length
    const nRat = seances.filter(s => s.isRattrapage).length

    return (
        <div className={`${accentBg}`}>
            {/* En-tête : légende */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-4 border-b border-white/60">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <span className={`w-2 h-2 rounded-full ${accentDot}`}/>
            {nReg} séance{nReg > 1 ? 's' : ''}
        </span>
                {nRat > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <span className="w-2 h-2 rounded-full bg-violet-400"/>
                        {nRat} rattrapage{nRat > 1 ? 's' : ''}
          </span>
                )}
            </div>

            {/* Corps : mois par mois */}
            <div className="px-4 py-3 space-y-3">
                {monthKeys.map(key => {
                    const [y, m] = key.split('-')
                    const monthSeances = monthMap[key]
                    const monthLabel = new Date(Number(y), Number(m) - 1, 1)
                        .toLocaleDateString('fr-FR', {month: 'short'}).replace('.', '')

                    return (
                        <div key={key} className="flex items-start gap-3">
                            {/* Label mois */}
                            <span
                                className="w-8 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-1 leading-none capitalize">
                {monthLabel}
              </span>

                            {/* Ligne verticale */}
                            <div className="w-px bg-gray-200 self-stretch shrink-0 mt-1 mb-0.5"/>

                            {/* Pills */}
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {monthSeances.map((s, i) => {
                                    const day = new Date(s.date + 'T00:00:00').getDate()
                                    return s.isRattrapage ? (
                                        <div
                                            key={s.id ?? i}
                                            title={s.cours?.nom ? `Rattrapage — ${s.cours.nom}` : 'Rattrapage'}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-violet-200 text-violet-700 text-xs font-semibold hover:border-violet-300 transition-colors cursor-default"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg"
                                                 className="w-2.5 h-2.5 text-violet-400 shrink-0" fill="none"
                                                 viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round"
                                                      d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"/>
                                            </svg>
                                            <span>{day}</span>
                                            {s.cours?.nom && (
                                                <span
                                                    className="text-[9px] font-medium text-violet-400 max-w-[52px] truncate leading-none">
                          {s.cours.nom}
                        </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div
                                            key={s.id ?? i}
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-lg bg-white border ${
                                                isAnnual ? 'border-brand-200 text-brand-700 hover:border-brand-300' : 'border-purple-200 text-purple-700 hover:border-purple-300'
                                            } text-xs font-semibold transition-colors cursor-default`}
                                        >
                                            {day}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Section paiements partagée ────────────────────────────────────────────────

function PaiementsSection({
                              planifies,
                              recus,
                              encaisses,
                              isAddingOpen,
                              addForm,
                              addLoading,
                              markingRecu,
                              modesReglement,
                              onOpenAdd,
                              onCloseAdd,
                              onAddFormChange,
                              onAddPaiement,
                              onMarquerRecu,
                              onMarquerEncaisse,
                              onDeletePaiement,
                          }) {
    return (
        <div className="border-t border-gray-100 pt-4 space-y-3">
            {planifies.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1.5">Planifiés</p>
                    <div className="divide-y divide-amber-50 border border-amber-100 rounded-xl overflow-hidden">
                        {planifies.map(p => (
                            <PaiementRow key={p.id} p={p} niveau="planifie" marking={markingRecu === p.id}
                                         onAction={() => onMarquerRecu(p.id)} onDelete={() => onDeletePaiement(p.id)}/>
                        ))}
                    </div>
                </div>
            )}
            {recus.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-sky-600 uppercase tracking-wider mb-1.5">Reçus</p>
                    <div className="divide-y divide-sky-50 border border-sky-100 rounded-xl overflow-hidden">
                        {recus.map(p => (
                            <PaiementRow key={p.id} p={p} niveau="recu" marking={markingRecu === p.id}
                                         onAction={() => onMarquerEncaisse(p.id)}
                                         onDelete={() => onDeletePaiement(p.id)}/>
                        ))}
                    </div>
                </div>
            )}
            {encaisses.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Encaissés</p>
                    <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {encaisses.map(p => (
                            <PaiementRow key={p.id} p={p} niveau="encaisse" onDelete={() => onDeletePaiement(p.id)}/>
                        ))}
                    </div>
                </div>
            )}
            {isAddingOpen ? (
                <AddPaiementForm form={addForm} loading={addLoading} modesReglement={modesReglement}
                                 onChange={onAddFormChange} onSubmit={onAddPaiement} onCancel={onCloseAdd}/>
            ) : (
                <div className="flex justify-end">
                    <AddPaiementButton onClick={onOpenAdd}/>
                </div>
            )}
        </div>
    )
}

function AddPaiementButton({onClick}) {
    return (
        <button type="button" onClick={onClick}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-3 py-1.5 rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                 strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Enregistrer un paiement
        </button>
    )
}

// ── Ligne de paiement ─────────────────────────────────────────────────────────

const NIVEAU_STYLES = {
    planifie: {
        row: 'bg-amber-50/40 hover:bg-amber-50/80',
        montant: 'text-amber-700',
        btn: 'text-sky-700 bg-sky-50 hover:bg-sky-100 border-sky-200',
        label: '✓ Reçu'
    },
    recu: {
        row: 'bg-sky-50/40 hover:bg-sky-50/80',
        montant: 'text-sky-700',
        btn: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
        label: '✓ Encaissé'
    },
    encaisse: {row: 'hover:bg-gray-50/60', montant: 'text-gray-900', btn: null, label: null},
}

function PaiementRow({p, niveau = 'encaisse', marking, onAction, onDelete}) {
    const s = NIVEAU_STYLES[niveau] ?? NIVEAU_STYLES.encaisse
    return (
        <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${s.row}`}>
      <span className="text-xs text-gray-400 w-20 shrink-0">
        {(p.paid_at ?? p.date) ? new Date((p.paid_at ?? p.date) + 'T00:00:00').toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short'
        }) : '—'}
      </span>
            <TypeBadge type={p.type}/>
            <span className="text-xs text-gray-600 flex-1 min-w-0 truncate">
        {p.label ? `${p.label} · ` : ''}{p.mode}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` — ${p.notes}` : ''}
      </span>
            <span className={`text-sm font-bold shrink-0 ${
                p.type === 'remboursement' ? 'text-red-600' : s.montant
            }`}>
        {p.type === 'remboursement' ? '−' : '+'}{formatMontant(p.montant)}
      </span>
            {s.btn && onAction && (
                <button
                    type="button"
                    onClick={onAction}
                    disabled={marking}
                    className={`text-[10px] font-bold border px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap ${s.btn}`}
                >
                    {marking ? '…' : s.label}
                </button>
            )}
            <button
                type="button"
                onClick={onDelete}
                className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                title="Supprimer"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                     strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                </svg>
            </button>
        </div>
    )
}

// ── Formulaire ajout paiement ─────────────────────────────────────────────────

function AddPaiementForm({form, loading, modesReglement, onChange, onSubmit, onCancel}) {
    return (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            {/* Prévu / Reçu toggle */}
            <div className="flex items-center gap-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Nouveau paiement</p>
                <div className="flex gap-0.5 bg-gray-200 rounded-lg p-0.5">
                    {[{v: 'encaisse', l: 'Encaissé'}, {v: 'recu', l: 'Reçu'}, {v: 'planifie', l: 'Planifié'}].map(({
                                                                                                                       v,
                                                                                                                       l
                                                                                                                   }) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => onChange('statut', v)}
                            className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                                form.statut === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >{l}</button>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Type</label>
                    <select value={form.type} onChange={e => onChange('type', e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="acompte">Acompte</option>
                        <option value="solde">Solde</option>
                        <option value="remboursement">Remboursement</option>
                        <option value="divers">Divers</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Moyen *</label>
                    <select value={form.mode} onChange={e => onChange('mode', e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="">— Choisir —</option>
                        {modesReglement.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Montant (€) *</label>
                    <input type="number" min="0.01" step="0.01" placeholder="0,00"
                           value={form.montant} onChange={e => onChange('montant', e.target.value)}
                           className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                </div>
                <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Date</label>
                    <input type="date"
                           value={form.date} onChange={e => onChange('date', e.target.value)}
                           className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                </div>
                <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Référence</label>
                    <input type="text" placeholder="N° chèque…"
                           value={form.reference} onChange={e => onChange('reference', e.target.value)}
                           className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                </div>
                <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Notes</label>
                    <input type="text"
                           value={form.notes} onChange={e => onChange('notes', e.target.value)}
                           className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                </div>
            </div>
            <div className="flex gap-2 justify-end">
                <button type="button" onClick={onCancel}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
                    Annuler
                </button>
                <button type="button" onClick={onSubmit}
                        disabled={loading || !form.mode || !form.montant}
                        className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors">
                    {loading ? 'Enregistrement…' : 'Enregistrer'}
                </button>
            </div>
        </div>
    )
}


// ── Utilitaires ───────────────────────────────────────────────────────────────

function EditField({label, value, onChange, type = 'text', full, min, max, placeholder}) {
    return (
        <div className={full ? 'col-span-2' : ''}>
            <label
                className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</label>
            <input
                type={type}
                value={value}
                min={min}
                max={max}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                className="w-full text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder:text-gray-300"
            />
        </div>
    )
}

function Grid({children}) {
    return <div className="grid grid-cols-2 gap-x-6 gap-y-4">{children}</div>
}

function Info({label, value, full}) {
    return (
        <div className={full ? 'col-span-2' : ''}>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-sm font-medium text-gray-900">{value ||
                <span className="text-gray-400 font-normal">—</span>}</p>
        </div>
    )
}

const TYPE_META = {
    acompte: {label: 'Acompte', cls: 'bg-amber-100 text-amber-700'},
    solde: {label: 'Solde', cls: 'bg-emerald-100 text-emerald-700'},
    remboursement: {label: 'Remboursement', cls: 'bg-red-100 text-red-600'},
    divers: {label: 'Divers', cls: 'bg-gray-100 text-gray-600'},
}

function TypeBadge({type}) {
    const meta = TYPE_META[type] ?? TYPE_META.divers
    return (
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${meta.cls}`}>
      {meta.label}
    </span>
    )
}

// ── Modale inscription / modification ─────────────────────────────────────────

const INSCRIPTION_TYPES = [
    {value: 'cours_annuel', label: 'Cours annuel'},
    {value: 'stage', label: 'Stage'},
    {value: 'ponctuel', label: 'Ponctuel'},
]

function InscriptionModal({
                              mode,
                              inscription,
                              defaultType,
                              activites,
                              offres,
                              modesReglement,
                              parametres,
                              remises = [],
                              age,
                              isAdherent,
                              onSave,
                              onClose
                          }) {
    const isEdit = mode === 'edit'

    const [form, setForm] = useState(() => isEdit ? {
        type: inscription.type ?? 'cours_annuel',
        activite_id: inscription.activite_id ?? '',
        stage_formule: inscription.stage_formule ?? 'journee',
        remise_montant: inscription.remise_montant ?? '',
        motif_remise: inscription.motif_remise ?? '',
        mode_paiement: inscription.mode_paiement ?? '1_fois',
        mode_reglement: inscription.mode_reglement ?? '',
    } : {
        type: defaultType ?? 'cours_annuel',
        activite_id: '',
        stage_formule: 'journee',
        remise_montant: '',
        motif_remise: '',
        mode_paiement: '1_fois',
        mode_reglement: '',
    })

    const [saving, setSaving] = useState(false)
    const [showRemise, setShowRemise] = useState(!!(inscription?.remise_montant || inscription?.motif_remise))
    const [errors, setErrors] = useState({})

    const isAnnuel = form.type === 'cours_annuel'
    const isStage = form.type === 'stage'

    const coursReguliers = activites.filter(a => a.type === 'cours_regulier')
    const stages = activites.filter(a => a.type === 'stage')

    const activiteSelectionnee = activites.find(a => a.id === form.activite_id) ?? null
    const remiseMontant = Number(form.remise_montant) || 0

    const stagePrix = isStage
        ? (getStagePrix(activiteSelectionnee?.tarif, form.stage_formule, isAdherent) ?? 0)
        : 0

    const {total, remiseAppliquee} = isStage
        ? computeFinancial({prixBase: stagePrix, remiseMontant, age, parametres})
        : computeFinancial({prixBase: 0, remiseMontant, age, parametres})

    function setF(field, value) {
        setForm(prev => ({...prev, [field]: value}))
        setErrors(prev => {
            const n = {...prev};
            delete n[field];
            return n
        })
    }

    function validate() {
        const e = {}
        if (!form.activite_id) e.activite_id = 'Requis'
        if (!form.mode_reglement) e.mode_reglement = 'Requis'
        return e
    }

    async function handleSave() {
        const e = validate()
        if (Object.keys(e).length) {
            setErrors(e);
            return
        }
        setSaving(true)
        await onSave(form)
        setSaving(false)
    }

    const inputCls = (err) =>
        `w-full text-sm border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors ${
            err ? 'border-red-300 bg-red-50' : 'border-gray-200'
        }`

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
             onClick={onClose}>
            <div
                className="bg-white w-full sm:rounded-2xl sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10">
                    <h2 className="text-base font-bold text-gray-900">
                        {isEdit ? "Modifier l'inscription" : 'Ajouter une inscription'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                             strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-5">

                    {/* Type (seulement en création) */}
                    {!isEdit && (
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Type</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {INSCRIPTION_TYPES.map(t => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => {
                                            setF('type', t.value);
                                            setF('activite_id', '')
                                        }}
                                        className={`text-sm font-medium px-3.5 py-1.5 rounded-xl border transition-colors ${
                                            form.type === t.value
                                                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Cours annuel ── */}
                    {isAnnuel && (
                        <div>
                            <label
                                className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Cours
                                *</label>
                            <select value={form.activite_id} onChange={e => setF('activite_id', e.target.value)}
                                    className={inputCls(errors.activite_id)}>
                                <option value="">Sélectionner un cours…</option>
                                {coursReguliers.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.nom}{c.jour ? ` — ${c.jour} ${c.heure_debut?.slice(0, 5)}–${c.heure_fin?.slice(0, 5)}` : ''}
                                    </option>
                                ))}
                            </select>
                            {errors.activite_id && <p className="text-xs text-red-500 mt-1">{errors.activite_id}</p>}
                            <p className="text-xs text-gray-400 mt-1.5">
                                Les forfaits et cartes seront à ajouter ensuite depuis la fiche.
                            </p>
                        </div>
                    )}

                    {/* ── Stage ── */}
                    {isStage && (
                        <div className="space-y-3">
                            <div>
                                <label
                                    className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Stage
                                    *</label>
                                {stages.length === 0 ? (
                                    <p className="text-sm text-gray-400 italic py-2">Aucun stage disponible pour cette
                                        saison.</p>
                                ) : (
                                    <select value={form.activite_id} onChange={e => {
                                        setF('activite_id', e.target.value);
                                        setF('stage_formule', 'journee')
                                    }} className={inputCls(errors.activite_id)}>
                                        <option value="">Sélectionner…</option>
                                        {stages.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.nom}{s.date_debut ? ` — ${new Date(s.date_debut).toLocaleDateString('fr-FR', {
                                                day: 'numeric',
                                                month: 'short'
                                            })}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {errors.activite_id &&
                                    <p className="text-xs text-red-500 mt-1">{errors.activite_id}</p>}
                            </div>

                            {/* Formule */}
                            {activiteSelectionnee && (
                                <div>
                                    <label
                                        className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Formule</label>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {[
                                            {value: 'journee', label: 'Journée'},
                                            ...(activiteSelectionnee.tarif?.prix_demi_journee_adherent != null ? [
                                                {value: 'matin', label: 'Matin'},
                                                {value: 'apres_midi', label: 'Après-midi'},
                                            ] : []),
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setF('stage_formule', opt.value)}
                                                className={`text-sm font-medium px-3.5 py-1.5 rounded-xl border transition-colors ${
                                                    form.stage_formule === opt.value
                                                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Statut adhérent + prix */}
                            {activiteSelectionnee && (
                                <div
                                    className="bg-purple-50 border border-purple-100 rounded-xl px-3 py-2.5 text-sm space-y-1">
                                    <div
                                        className="flex items-center justify-between text-xs text-purple-700 font-medium">
                                        <span>{isAdherent ? '✓ Tarif adhérent appliqué' : 'Tarif non-adhérent'}</span>
                                        {stagePrix != null && (
                                            <span className="text-purple-900 font-bold">{stagePrix} €</span>
                                        )}
                                    </div>
                                    {stagePrix == null && (
                                        <p className="text-xs text-amber-600">Prix non configuré pour cette formule</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Ponctuel / autre ── */}
                    {!isAnnuel && !isStage && (
                        <div>
                            <label
                                className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Activité
                                *</label>
                            <select value={form.activite_id} onChange={e => setF('activite_id', e.target.value)}
                                    className={inputCls(errors.activite_id)}>
                                <option value="">Sélectionner…</option>
                                {activites.map(a => (
                                    <option key={a.id} value={a.id}>{a.nom}</option>
                                ))}
                            </select>
                            {errors.activite_id && <p className="text-xs text-red-500 mt-1">{errors.activite_id}</p>}
                        </div>
                    )}

                    {/* ── Remise ── */}
                    {!showRemise ? (
                        <button type="button" onClick={() => setShowRemise(true)}
                                className="text-sm text-brand-600 hover:text-brand-800 font-medium">
                            + Ajouter une remise
                        </button>
                    ) : (
                        <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Remise</p>
                                <button type="button" onClick={() => {
                                    setShowRemise(false);
                                    setF('remise_montant', '');
                                    setF('motif_remise', '')
                                }} className="text-xs text-gray-400 hover:text-red-500">
                                    Supprimer
                                </button>
                            </div>
                            {/* Remises prédéfinies */}
                            {remises.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {remises.map(r => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => {
                                                setF('remise_montant', String(r.amount));
                                                setF('motif_remise', r.label)
                                            }}
                                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                                form.remise_montant === String(r.amount) && form.motif_remise === r.label
                                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                                    : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400 hover:text-emerald-700'
                                            }`}
                                        >
                                            {r.label} — {Number(r.amount)} €
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* Saisie manuelle */}
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="number" min="0" step="0.01" placeholder="Montant €"
                                    value={form.remise_montant} onChange={e => setF('remise_montant', e.target.value)}
                                    className={inputCls(false)}
                                />
                                <input
                                    type="text" placeholder="Motif…"
                                    value={form.motif_remise} onChange={e => setF('motif_remise', e.target.value)}
                                    className={inputCls(false)}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Mode paiement ── */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mode de
                            paiement</p>
                        <div className="flex gap-1.5 flex-wrap">
                            {MODES_PAIEMENT.map(m => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setF('mode_paiement', m.value)}
                                    className={`text-sm font-medium px-3.5 py-1.5 rounded-xl border transition-colors ${
                                        form.mode_paiement === m.value
                                            ? 'bg-brand-600 text-white border-brand-600'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Mode règlement ── */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Mode
                            de règlement *</label>
                        <select value={form.mode_reglement} onChange={e => setF('mode_reglement', e.target.value)}
                                className={inputCls(errors.mode_reglement)}>
                            <option value="">Sélectionner…</option>
                            {modesReglement.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        {errors.mode_reglement && <p className="text-xs text-red-500 mt-1">{errors.mode_reglement}</p>}
                    </div>

                    {/* ── Récap financier (stages) ── */}
                    {isStage && activiteSelectionnee && stagePrix != null && (
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-1.5 text-sm">
                            <div className="flex justify-between text-gray-600">
                                <span>{activiteSelectionnee.nom}</span>
                                <span>{stagePrix} €</span>
                            </div>
                            {remiseAppliquee > 0 && (
                                <div className="flex justify-between text-emerald-700">
                                    <span>Remise</span><span>−{remiseAppliquee} €</span></div>
                            )}
                            <div
                                className="flex justify-between font-bold text-gray-900 pt-1.5 border-t border-gray-200">
                                <span>Total</span>
                                <span>{formatMontant(total)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl border border-gray-200 bg-white transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 px-5 py-2 rounded-xl transition-colors"
                    >
                        {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter'}
                    </button>
                </div>
            </div>
        </div>
    )
}
