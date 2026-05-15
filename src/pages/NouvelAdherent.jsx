import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'
import { useForfaits } from '../hooks/useForfaits'
import { useCours } from '../hooks/useCours'
import { useParametres } from '../hooks/useParametres'
import { calculateAge, computeFinancial } from '../lib/calculs'
import { flattenLignesPaiement } from './inscription/PaiementBuilder'
import { supabase } from '../lib/supabase'
import { useSaison } from '../contexts/SaisonContext'
import { useAuth } from '../contexts/AuthContext'
import Step1Cavalier from './inscription/Step1Cavalier'
import Step2Responsables from './inscription/Step2Responsables'
import Step3ForFait from './inscription/Step3ForFait'
import Step4Recap from './inscription/Step4Recap'

const INIT_FORM = {
  nom: '', prenom: '', date_naissance: '', email: '', telephone: '', adresse: '',
  galop: '', droit_image: false,
  responsable1: { nom_prenom: '', telephone: '', email: '', adresse: '', meme_adresse: false },
  responsable2: null,
  type_inscription: 'cours_annuel',
  activite_id: '', offre_id: '', offre2_id: '',
  remise_montant: '', motif_remise: '',
  lignes_paiement: null,
}

const STEP_META = {
  1: 'Cavalier',
  2: 'Responsables légaux',
  3: 'Cours & forfait',
  4: 'Récapitulatif',
}

export default function NouvelAdherent() {
  const navigate = useNavigate()
  const { clubId } = useAuth()
  const { saisonCourante } = useSaison()
  const { forfaits, loading: loadingF } = useForfaits(saisonCourante?.id ?? null)
  const { cours, loading: loadingC }   = useCours(saisonCourante?.id ?? null)
  const { parametres, modesReglement, nbFoisAcceptes, loading: loadingP } = useParametres(saisonCourante?.id ?? null)

  const [step, setStep]         = useState(1)
  const [formData, setFormData] = useState(INIT_FORM)
  const [errors, setErrors]     = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const age     = calculateAge(formData.date_naissance)
  const isMinor = age !== null && age < 18

  // Calcul financier (utilisé pour PaiementBuilder et validation)
  const isStageForm  = formData.type_inscription !== 'cours_annuel'
  const forfait1Form = isStageForm ? null : (forfaits.find(f => f.id === formData.offre_id) ?? null)
  const forfait2Form = isStageForm ? null : (formData.offre2_id ? forfaits.find(f => f.id === formData.offre2_id) ?? null : null)
  const remiseMontantForm = Number(formData.remise_montant) || 0
  const financial = (forfait1Form || isStageForm)
    ? (isStageForm
        ? computeFinancial({ prixBase: 0, remiseMontant: remiseMontantForm, age, parametres })
        : computeFinancial({ forfait1: forfait1Form, forfait2: forfait2Form, remiseMontant: remiseMontantForm, age, parametres }))
    : null

  const visibleSteps = isMinor ? [1, 2, 3, 4] : [1, 3, 4]
  const currentIdx   = visibleSteps.indexOf(step)

  function setField(name, value) {
    setFormData(prev => {
      const next = { ...prev, [name]: value }
      // Réinitialise le plan de paiement si le forfait ou la remise change
      if (['offre_id', 'offre2_id', 'remise_montant', 'activite_id', 'type_inscription'].includes(name)) {
        next.lignes_paiement = null
      }
      return next
    })
    setErrors(prev => { const next = { ...prev }; delete next[name]; return next })
  }

  function validate(s) {
    const e = {}
    if (s === 1) {
      if (!formData.nom.trim())           e.nom            = 'Requis'
      if (!formData.prenom.trim())        e.prenom         = 'Requis'
      if (!formData.date_naissance)       e.date_naissance = 'Requis'
      if (!formData.email.trim())         e.email          = 'Requis'
      if (!formData.telephone.trim())     e.telephone      = 'Requis'
      if (!formData.adresse.trim())       e.adresse        = 'Requis'
      if (!formData.galop)               e.galop          = 'Requis'
    }
    if (s === 2) {
      if (!formData.responsable1.nom_prenom.trim()) e.rl1_nom_prenom = 'Requis'
      if (!formData.responsable1.telephone.trim())  e.rl1_telephone  = 'Requis'
      if (!formData.responsable1.email?.trim())     e.rl1_email      = 'Requis'
      if (!formData.responsable1.meme_adresse && !formData.responsable1.adresse.trim()) e.rl1_adresse = 'Requis'
      if (formData.responsable2) {
        if (!formData.responsable2.nom_prenom.trim()) e.rl2_nom_prenom = 'Requis'
        if (!formData.responsable2.telephone.trim())  e.rl2_telephone  = 'Requis'
        if (!formData.responsable2.email?.trim())     e.rl2_email      = 'Requis'
        if (!formData.responsable2.meme_adresse && !formData.responsable2.adresse.trim()) e.rl2_adresse = 'Requis'
      }
    }
    if (s === 3) {
      if (!formData.activite_id) e.activite_id = 'Sélectionnez une activité'
      if (formData.type_inscription === 'cours_annuel' && !formData.offre_id)
        e.offre_id = 'Sélectionnez un forfait'
      // Validation du plan de paiement (section par section, sans croisement)
      if (financial && !formData.lignes_paiement)
        e.paiement_licence = 'Le plan de paiement n\'a pas encore été initialisé, veuillez patienter'
      if (financial && formData.lignes_paiement) {
        const lp      = formData.lignes_paiement
        const licM    = financial.licenceMontant  ?? 0
        const forM    = financial.totalForfait    ?? 0
        const acompteM = financial.acompteMontant ?? 0
        if (licM > 0 && !lp.licence?.mode_reglement)
          e.paiement_licence = 'Sélectionnez un mode de règlement pour la licence'
        if (acompteM > 0 && !lp.acompte?.mode_reglement)
          e.paiement_acompte = 'Sélectionnez un mode de règlement pour l\'acompte'
        if (forM > 0) {
          ;(lp.forfait ?? []).forEach((ligne, idx) => {
            if (!ligne.mode_reglement)
              e[`paiement_forfait_${idx}`] = 'Sélectionnez un mode de règlement'
          })
        }
      }
    }
    return e
  }

  function next() {
    const e = validate(step)
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    if (currentIdx < visibleSteps.length - 1) setStep(visibleSteps[currentIdx + 1])
  }

  function prev() {
    if (currentIdx > 0) setStep(visibleSteps[currentIdx - 1])
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')

    const isStage       = formData.type_inscription !== 'cours_annuel'
    const forfait1      = isStage ? null : (forfaits.find(f => f.id === formData.offre_id) ?? null)
    const forfait2      = isStage ? null : (formData.offre2_id ? forfaits.find(f => f.id === formData.offre2_id) ?? null : null)
    const remiseMontant = Number(formData.remise_montant) || 0
    const { total, licenceMontant, acompteMontant } = isStage
      ? computeFinancial({ prixBase: 0, remiseMontant, age, parametres })
      : computeFinancial({ forfait1, forfait2, remiseMontant, age, parametres })

    // 1. Créer l'adhérent (données personnelles uniquement)
    const { data: adherent, error: err1 } = await supabase
      .from('members')
      .insert({
        club_id:    clubId,
        last_name:  formData.nom.trim(),
        first_name: formData.prenom.trim(),
        email:      formData.email.trim(),
        phone:      formData.telephone.trim(),
        address:    formData.adresse.trim(),
        birth_date: formData.date_naissance,
        galop:      formData.galop,
        droit_image: formData.droit_image,
      })
      .select()
      .single()

    if (err1) { setSubmitError(err1.message); setSubmitting(false); return }

    // 2. Créer l'inscription (données saison)
    const { data: inscription, error: err2 } = await supabase
      .from('enrollments')
      .insert({
        club_id:              clubId,
        member_id:            adherent.id,
        season_id:            saisonCourante?.id ?? null,
        type:                 formData.type_inscription,
        activity_id:          formData.activite_id  || null,
        plan_id:              isStage ? null : (formData.offre_id  || null),
        plan2_id:             isStage ? null : (formData.offre2_id || null),
        discount_amount:      remiseMontant,
        discount_reason:      formData.motif_remise.trim() || null,
        total_amount:         total,
        status:               'pre_inscription',
        reglement_accepte:    true,
        reglement_accepte_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (err2) { setSubmitError(err2.message); setSubmitting(false); return }

    // 2b. Paiements prévus (plan de paiement)
    if (inscription?.id && formData.lignes_paiement) {
      const rows = flattenLignesPaiement(formData.lignes_paiement, inscription.id, licenceMontant, acompteMontant)
      if (rows.length > 0) {
        const { error: errP } = await supabase.from('payments').insert(rows.map(r => ({
          ...r,
          club_id:       clubId,
          enrollment_id: inscription.id,
          inscription_id: undefined,  // champ legacy supprimé
        })))
        if (errP) { setSubmitError(errP.message); setSubmitting(false); return }
      }
    }

    // 3. Responsables légaux si mineur
    if (isMinor) {
      const responsables = [
        { ...formData.responsable1, rang: 1 },
        ...(formData.responsable2 ? [{ ...formData.responsable2, rang: 2 }] : []),
      ].map(r => ({
        club_id:      clubId,
        member_id:    adherent.id,
        rang:         r.rang,
        full_name:    r.nom_prenom.trim(),
        phone:        r.telephone.trim(),
        email:        r.email?.trim() || null,
        address:      r.meme_adresse ? null : (r.adresse?.trim() || null),
        meme_adresse: r.meme_adresse,
      }))
      const { error: err3 } = await supabase.from('guardians').insert(responsables)
      if (err3) { setSubmitError(err3.message); setSubmitting(false); return }
    }

    navigate('/adhesions')
  }

  if (loadingF || loadingC || loadingP) return <LoadingSpinner />

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nouvelle inscription</h1>
      {saisonCourante && (
        <p className="text-sm text-gray-500 mb-6">Saison {saisonCourante.name ?? saisonCourante.libelle}</p>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-1 mb-8">
        {visibleSteps.map((s, i) => {
          const label     = STEP_META[s]
          const isDone    = currentIdx > i
          const isCurrent = step === s
          return (
            <div key={s} className="flex items-center gap-1">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isDone    ? 'bg-brand-500 text-white' :
                  isCurrent ? 'bg-brand-600 text-white' :
                              'bg-gray-200 text-gray-500'
                }`}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span className={`text-sm whitespace-nowrap ${
                  isCurrent ? 'font-medium text-brand-700' :
                  isDone    ? 'text-brand-500' :
                              'text-gray-500'
                }`}>
                  {label}
                </span>
              </div>
              {i < visibleSteps.length - 1 && (
                <span className="text-gray-400 mx-2 text-lg">›</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Contenu */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-8">
        {step === 1 && <Step1Cavalier data={formData} onChange={setField} errors={errors} />}
        {step === 2 && (
          <Step2Responsables data={formData} onChange={setField} errors={errors} adresseAdherent={formData.adresse} />
        )}
        {step === 3 && (
          <Step3ForFait
            data={formData} onChange={setField} errors={errors}
            activites={cours} forfaits={forfaits} parametres={parametres}
            dateNaissance={formData.date_naissance} modesReglement={modesReglement}
            nbFoisAcceptes={nbFoisAcceptes}
            saison={saisonCourante}
            financial={financial}
          />
        )}
        {step === 4 && (
          <Step4Recap
            formData={formData} forfaits={forfaits} activites={cours}
            parametres={parametres} onSubmit={handleSubmit} loading={submitting}
          />
        )}

        {submitError && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Erreur : {submitError}
          </p>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <button
            type="button"
            onClick={prev}
            className={`text-sm text-gray-500 hover:text-gray-700 transition-colors ${currentIdx === 0 ? 'invisible' : ''}`}
          >
            ← Précédent
          </button>
          {step < 4 && (
            <button
              type="button"
              onClick={next}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Suivant →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
