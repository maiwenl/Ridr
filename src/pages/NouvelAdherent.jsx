import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForfaits } from '../hooks/useForfaits'
import { useCours } from '../hooks/useCours'
import { useParametres } from '../hooks/useParametres'
import { calculateAge, computeFinancial } from '../lib/calculs'
import { supabase } from '../lib/supabase'
import { useSaison } from '../contexts/SaisonContext'
import Step1Cavalier from './inscription/Step1Cavalier'
import Step2Responsables from './inscription/Step2Responsables'
import Step3ForFait from './inscription/Step3ForFait'
import Step4Recap from './inscription/Step4Recap'

const INIT_FORM = {
  nom: '', prenom: '', date_naissance: '', email: '', telephone: '', adresse: '',
  galop: '', droit_image: false,
  responsable1: { nom_prenom: '', telephone: '', adresse: '', meme_adresse: false },
  responsable2: null,
  cours_id: '', forfait_id: '', forfait2_id: '',
  remise_famille: false, remise_famille_nom: '',
  mode_paiement: '1_fois', mode_reglement: '',
}

const STEP_META = {
  1: 'Cavalier',
  2: 'Responsables légaux',
  3: 'Cours & forfait',
  4: 'Récapitulatif',
}

export default function NouvelAdherent() {
  const navigate = useNavigate()
  const { saisonCourante } = useSaison()
  const { forfaits, loading: loadingF } = useForfaits()
  const { cours, loading: loadingC }   = useCours(saisonCourante?.id ?? null)
  const { parametres, modesReglement, loading: loadingP } = useParametres()

  const [step, setStep]         = useState(1)
  const [formData, setFormData] = useState(INIT_FORM)
  const [errors, setErrors]     = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const age     = calculateAge(formData.date_naissance)
  const isMinor = age !== null && age < 18

  const visibleSteps = isMinor ? [1, 2, 3, 4] : [1, 3, 4]
  const currentIdx   = visibleSteps.indexOf(step)

  function setField(name, value) {
    setFormData(prev => ({ ...prev, [name]: value }))
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
      if (!formData.responsable1.meme_adresse && !formData.responsable1.adresse.trim()) e.rl1_adresse = 'Requis'
    }
    if (s === 3) {
      if (!formData.cours_id)        e.cours_id        = 'Sélectionnez un cours'
      if (!formData.forfait_id)      e.forfait_id      = 'Sélectionnez un forfait'
      if (!formData.mode_reglement)  e.mode_reglement  = 'Sélectionnez un mode de règlement'
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

    const forfait1 = forfaits.find(f => f.id === formData.forfait_id)  ?? null
    const forfait2 = formData.forfait2_id ? forfaits.find(f => f.id === formData.forfait2_id) ?? null : null
    const { total } = computeFinancial({ forfait1, forfait2, remiseFamille: formData.remise_famille, age, parametres })

    // 1. Créer l'adhérent (données personnelles uniquement)
    const { data: adherent, error: err1 } = await supabase
      .from('adherents')
      .insert({
        nom:            formData.nom.trim(),
        prenom:         formData.prenom.trim(),
        email:          formData.email.trim(),
        telephone:      formData.telephone.trim(),
        adresse:        formData.adresse.trim(),
        date_naissance: formData.date_naissance,
        galop:          formData.galop,
        droit_image:    formData.droit_image,
      })
      .select()
      .single()

    if (err1) { setSubmitError(err1.message); setSubmitting(false); return }

    // 2. Créer l'adhésion (données saison)
    const { error: err2 } = await supabase
      .from('adhesions')
      .insert({
        adherent_id:        adherent.id,
        saison_id:          saisonCourante?.id ?? null,
        cours_id:           formData.cours_id   || null,
        forfait_id:         formData.forfait_id  || null,
        forfait2_id:        formData.forfait2_id || null,
        remise_famille:     formData.remise_famille,
        remise_famille_nom: formData.remise_famille_nom || null,
        mode_paiement:      formData.mode_paiement,
        mode_reglement:     formData.mode_reglement,
        montant_total:      total,
        statut:             'creation',
      })

    if (err2) { setSubmitError(err2.message); setSubmitting(false); return }

    // 3. Responsables légaux si mineur
    if (isMinor) {
      const responsables = [
        { ...formData.responsable1, rang: 1 },
        ...(formData.responsable2 ? [{ ...formData.responsable2, rang: 2 }] : []),
      ].map(r => ({
        adherent_id:  adherent.id,
        rang:         r.rang,
        nom_prenom:   r.nom_prenom.trim(),
        telephone:    r.telephone.trim(),
        adresse:      r.meme_adresse ? null : (r.adresse?.trim() || null),
        meme_adresse: r.meme_adresse,
      }))
      const { error: err3 } = await supabase.from('responsables').insert(responsables)
      if (err3) { setSubmitError(err3.message); setSubmitting(false); return }
    }

    navigate('/adhesions')
  }

  if (loadingF || loadingC || loadingP) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nouvelle inscription</h1>
      {saisonCourante && (
        <p className="text-sm text-gray-400 mb-6">Saison {saisonCourante.libelle}</p>
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
                              'text-gray-400'
                }`}>
                  {label}
                </span>
              </div>
              {i < visibleSteps.length - 1 && (
                <span className="text-gray-300 mx-2 text-lg">›</span>
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
            cours={cours} forfaits={forfaits} parametres={parametres}
            dateNaissance={formData.date_naissance} modesReglement={modesReglement}
          />
        )}
        {step === 4 && (
          <Step4Recap
            formData={formData} forfaits={forfaits} cours={cours}
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
