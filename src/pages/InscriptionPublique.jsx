import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculateAge, filterForfaitsByAge, computeFinancial, MODES_PAIEMENT } from '../lib/calculs'
import Step1Cavalier     from './inscription/Step1Cavalier'
import Step2Responsables from './inscription/Step2Responsables'

// ── Données initiales ─────────────────────────────────────────────────────────
const INIT_FORM = {
  nom: '', prenom: '', date_naissance: '', email: '', telephone: '', adresse: '',
  galop: '', droit_image: false,
  responsable1: { nom_prenom: '', telephone: '', adresse: '', meme_adresse: false },
  responsable2: null,
  cours_id: '', forfait_id: '',
  mode_paiement: '1_fois', mode_reglement: '',
}

const STEP_META = {
  1: { label: 'Cavalier',        short: '1' },
  2: { label: 'Responsables',    short: '2' },
  3: { label: 'Cours & forfait', short: '3' },
}

const inputCls = err =>
  `w-full rounded-lg border ${err ? 'border-red-400' : 'border-gray-300'} px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500`

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InscriptionPublique() {
  const [phase, setPhase]       = useState('accueil') // 'accueil' | 'form' | 'succes'
  const [step, setStep]         = useState(1)
  const [formData, setFormData] = useState(INIT_FORM)
  const [errors, setErrors]     = useState({})
  const [cours, setCours]       = useState([])
  const [forfaits, setForfaits] = useState([])
  const [parametres, setParametres] = useState({})
  const [modesReglement, setModesReglement] = useState(['Chèque', 'Virement', 'Carte bancaire', 'Espèces'])
  const [saisonActive, setSaisonActive] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown]   = useState(20)

  useEffect(() => {
    Promise.all([
      supabase.from('saisons').select('*').eq('active', true).maybeSingle(),
      supabase.from('forfaits').select('*').order('prix'),
      supabase.from('parametres').select('cle, valeur'),
    ]).then(([{ data: saison }, { data: f }, { data: p }]) => {
      setSaisonActive(saison)
      setForfaits(f ?? [])
      if (p) {
        const map = Object.fromEntries(p.map(x => [x.cle, x.valeur]))
        setParametres(map)
        if (map.modes_reglement) {
          try { setModesReglement(JSON.parse(map.modes_reglement)) } catch {}
        }
      }

      // Fetch cours de la saison active
      if (saison?.id) {
        supabase
          .from('cours')
          .select('id, nom, jour, heure_debut, heure_fin, capacite, niveaux, age_min, age_max')
          .eq('saison_id', saison.id)
          .order('jour')
          .order('heure_debut')
          .then(({ data: c }) => setCours(c ?? []))
      }
    })
  }, [])

  // Countdown après succès
  useEffect(() => {
    if (phase !== 'succes') return
    setCountdown(20)
    const iv = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) { clearInterval(iv); handleReset(); return 20 }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [phase])

  const age        = calculateAge(formData.date_naissance)
  const isMinor    = age !== null && age < 18
  const visibleSteps = isMinor ? [1, 2, 3] : [1, 3]
  const currentIdx   = visibleSteps.indexOf(step)

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

  function setField(name, value) {
    setFormData(prev => ({ ...prev, [name]: value }))
    setErrors(prev => { const n = { ...prev }; delete n[name]; return n })
  }

  function validate() {
    const e = {}
    if (step === 1) {
      if (!formData.nom.trim())           e.nom            = 'Requis'
      if (!formData.prenom.trim())        e.prenom         = 'Requis'
      if (!formData.date_naissance)       e.date_naissance = 'Requis'
      if (!formData.telephone.trim())     e.telephone      = 'Requis'
      if (!formData.email.trim())         e.email          = 'Requis'
      if (!formData.adresse.trim())       e.adresse        = 'Requis'
      if (!formData.galop)               e.galop          = 'Requis'
    }
    if (step === 2) {
      if (!formData.responsable1.nom_prenom.trim()) e.rl1_nom_prenom = 'Requis'
      if (!formData.responsable1.telephone.trim())  e.rl1_telephone  = 'Requis'
      if (!formData.responsable1.meme_adresse && !formData.responsable1.adresse.trim()) e.rl1_adresse = 'Requis'
    }
    if (step === 3) {
      if (!formData.mode_reglement) e.mode_reglement = 'Sélectionnez un mode de règlement'
    }
    return e
  }

  function goNext() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); window.scrollTo(0, 0); return }
    setErrors({})
    if (currentIdx < visibleSteps.length - 1) {
      setStep(visibleSteps[currentIdx + 1])
      window.scrollTo(0, 0)
    } else {
      handleSubmit()
    }
  }

  function goPrev() {
    if (currentIdx === 0) { setPhase('accueil'); return }
    setStep(visibleSteps[currentIdx - 1])
    window.scrollTo(0, 0)
  }

  function handleReset() {
    setFormData(INIT_FORM)
    setErrors({})
    setStep(1)
    setPhase('accueil')
  }

  async function handleSubmit() {
    setSubmitting(true)
    const forfait1 = forfaits.find(f => f.id === formData.forfait_id) ?? null
    const { total } = computeFinancial({ forfait1, forfait2: null, remiseFamille: false, age, parametres })

    // 1. Créer l'adhérent (données personnelles uniquement)
    const { data: adherent, error: err1 } = await supabase
      .from('adherents')
      .insert({
        nom:            formData.nom.trim().toUpperCase(),
        prenom:         formData.prenom.trim(),
        email:          formData.email.trim() || null,
        telephone:      formData.telephone.trim(),
        adresse:        formData.adresse.trim() || null,
        date_naissance: formData.date_naissance,
        galop:          formData.galop,
        droit_image:    formData.droit_image,
      })
      .select()
      .single()

    if (err1) { setSubmitting(false); return }

    // 2. Créer l'adhésion (données saison)
    const { error: err2 } = await supabase
      .from('adhesions')
      .insert({
        adherent_id:    adherent.id,
        saison_id:      saisonActive?.id ?? null,
        cours_id:       formData.cours_id  || null,
        forfait_id:     formData.forfait_id || null,
        mode_paiement:  formData.mode_paiement,
        mode_reglement: formData.mode_reglement,
        statut:         'creation',
        montant_total:  forfait1 ? total : null,
      })

    if (err2) { setSubmitting(false); return }

    // 3. Responsables légaux si mineur
    if (isMinor) {
      const resp = [
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
      await supabase.from('responsables').insert(resp)
    }

    // 4. Email de confirmation (best-effort, pas bloquant)
    if (formData.email) {
      const coursSel = cours.find(c => c.id === formData.cours_id)
      supabase.functions.invoke('confirmation-inscription', {
        body: {
          nom:    formData.nom.trim().toUpperCase(),
          prenom: formData.prenom.trim(),
          email:  formData.email.trim(),
          cours:  coursSel ? `${coursSel.nom} — ${coursSel.jour} ${coursSel.heure_debut?.slice(0, 5)}` : null,
          saison: saisonActive?.libelle ?? '',
        },
      })
    }

    setSubmitting(false)
    setPhase('succes')
    window.scrollTo(0, 0)
  }

  // ── Écran accueil ─────────────────────────────────────────────────────────
  if (phase === 'accueil') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-700 to-brand-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 md:p-12 text-center">
          <div className="text-5xl mb-5">🐴</div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-2">Pré-inscription</h1>
          <p className="text-brand-700 font-semibold mb-1">Saison {saisonActive?.libelle ?? '…'}</p>
          <p className="text-gray-500 text-sm md:text-base mb-10 mt-3 leading-relaxed">
            Remplissez ce formulaire pour pré-inscrire votre enfant ou vous-même.
            Notre équipe vous contactera pour finaliser l'inscription.
          </p>
          <button
            onClick={() => { setPhase('form'); setStep(1) }}
            className="w-full bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-lg md:text-xl font-bold py-4 rounded-2xl shadow-lg transition-all"
          >
            Commencer →
          </button>
          <p className="text-xs text-gray-400 mt-6">
            Déjà inscrit ? Contactez-nous directement.
          </p>
        </div>
      </div>
    )
  }

  // ── Écran succès ──────────────────────────────────────────────────────────
  if (phase === 'succes') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-brand-700 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 md:p-12 text-center">
          <div className="text-6xl mb-5">✅</div>
          <h1 className="text-3xl font-black text-gray-900 mb-3">Merci !</h1>
          <p className="text-gray-600 text-base leading-relaxed mb-2">
            Votre pré-inscription a bien été enregistrée.
          </p>
          <p className="text-gray-400 text-sm mb-10">
            Notre équipe vous contactera prochainement pour confirmer et finaliser votre dossier.
          </p>
          <button
            onClick={handleReset}
            className="w-full bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-lg font-bold py-4 rounded-2xl shadow-lg transition-all mb-4"
          >
            Nouvelle pré-inscription
          </button>
          <p className="text-xs text-gray-400">
            Retour automatique dans {countdown} secondes…
          </p>
        </div>
      </div>
    )
  }

  // ── Formulaire ────────────────────────────────────────────────────────────
  const isLastStep      = currentIdx === visibleSteps.length - 1
  const forfaitsFiltres = filterForfaitsByAge(forfaits, age)
  const forfait1Sel     = forfaits.find(f => f.id === formData.forfait_id) ?? null
  const financial       = forfait1Sel
    ? computeFinancial({ forfait1: forfait1Sel, forfait2: null, remiseFamille: false, age, parametres })
    : null

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-brand-700 text-white px-4 py-4 md:px-8 md:py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-brand-300 text-xs font-medium">Pré-inscription {saisonActive?.libelle ?? '…'}</p>
            <h1 className="text-lg md:text-xl font-bold leading-tight">
              {STEP_META[step]?.label}
            </h1>
          </div>
          {/* Stepper pills */}
          <div className="flex items-center gap-2">
            {visibleSteps.map((s, i) => (
              <div key={s} className={`flex items-center justify-center rounded-full text-xs font-bold transition-all ${
                i < currentIdx
                  ? 'w-7 h-7 bg-brand-400 text-white'
                  : i === currentIdx
                  ? 'w-8 h-8 bg-white text-brand-700'
                  : 'w-7 h-7 bg-brand-600 text-brand-300'
              }`}>
                {i < currentIdx ? '✓' : i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stepper desktop — libellés */}
      <div className="hidden md:block bg-white border-b border-gray-100 px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center py-4 gap-2">
            {visibleSteps.map((s, i) => {
              const isDone    = i < currentIdx
              const isCurrent = s === step
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isDone    ? 'bg-brand-500 text-white' :
                      isCurrent ? 'bg-brand-600 text-white' :
                                  'bg-gray-200 text-gray-500'
                    }`}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    <span className={`text-sm whitespace-nowrap ${
                      isCurrent ? 'font-semibold text-brand-700' :
                      isDone    ? 'text-brand-500' :
                                  'text-gray-400'
                    }`}>
                      {STEP_META[s]?.label}
                    </span>
                  </div>
                  {i < visibleSteps.length - 1 && (
                    <span className="text-gray-300 text-lg mx-1">›</span>
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
                  Cours souhaité <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                {formData.galop && coursFiltres.length < cours.length && (
                  <p className="text-xs text-brand-600 mb-3">
                    Cours filtrés pour le niveau <strong>{formData.galop}</strong>
                    {age !== null ? ` · ${age} ans` : ''}
                  </p>
                )}
                {coursFiltres.length === 0 && cours.length > 0 ? (
                  <p className="text-sm text-gray-400 italic py-2">
                    Aucun cours disponible pour ce niveau — notre équipe vous guidera.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <ChoiceRow
                      selected={!formData.cours_id}
                      onClick={() => setField('cours_id', '')}
                      label="Je ne sais pas encore"
                      sub=""
                    />
                    {coursFiltres.map(c => (
                      <ChoiceRow
                        key={c.id}
                        selected={formData.cours_id === c.id}
                        onClick={() => setField('cours_id', c.id)}
                        label={c.nom}
                        sub={`${c.jour} · ${c.heure_debut?.slice(0, 5)} – ${c.heure_fin?.slice(0, 5)}${c.niveaux?.length ? ' · ' + c.niveaux.join(', ') : ''}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Forfait */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Forfait <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                {age === null && (
                  <p className="text-xs text-gray-400 italic mb-3">Renseignez la date de naissance à l'étape 1 pour voir les forfaits disponibles.</p>
                )}
                {age !== null && forfaitsFiltres.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-2">
                    Aucun forfait disponible pour cet âge — notre équipe vous guidera.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <ChoiceRow
                      selected={!formData.forfait_id}
                      onClick={() => setField('forfait_id', '')}
                      label="Je ne sais pas encore"
                      sub=""
                    />
                    {forfaitsFiltres.map(f => (
                      <ChoiceRow
                        key={f.id}
                        selected={formData.forfait_id === f.id}
                        onClick={() => setField('forfait_id', f.id)}
                        label={f.libelle}
                        sub={`${Number(f.prix)} €${f.nb_seances ? ` · ${f.nb_seances} séances` : ' · Annuel'}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Récapitulatif financier (affiché si forfait sélectionné) */}
              {financial && (
                <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-brand-800 mb-3">Estimation du montant</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>{forfait1Sel.libelle}</span>
                      <span className="font-medium">{financial.prixForfait1} €</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>Licence FFE</span>
                      <span className="font-medium">{financial.licenceMontant} €</span>
                    </div>
                    {financial.remiseAppliquee > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Remise</span>
                        <span className="font-medium">−{financial.remiseAppliquee} €</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold text-brand-900 pt-2 border-t border-brand-200">
                      <span>Total estimé</span>
                      <span>{financial.total} €</span>
                    </div>
                  </div>
                  <p className="text-xs text-brand-600 pt-1">
                    Montant indicatif — à confirmer avec notre équipe.
                  </p>
                </div>
              )}

              {/* Mode de paiement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Mode de paiement souhaité
                </label>
                <div className="space-y-2">
                  {MODES_PAIEMENT.map(m => (
                    <ChoiceRow
                      key={m.value}
                      selected={formData.mode_paiement === m.value}
                      onClick={() => setField('mode_paiement', m.value)}
                      label={m.label}
                      sub=""
                    />
                  ))}
                </div>
              </div>

              {/* Mode de règlement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Mode de règlement *
                </label>
                <div className="space-y-2">
                  {modesReglement.map(m => (
                    <ChoiceRow
                      key={m}
                      selected={formData.mode_reglement === m}
                      onClick={() => setField('mode_reglement', m)}
                      label={m}
                      sub=""
                    />
                  ))}
                </div>
                {errors.mode_reglement && (
                  <p className="text-xs text-red-500 mt-2">{errors.mode_reglement}</p>
                )}
              </div>

            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100 gap-3">
            <button
              type="button"
              onClick={goPrev}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              ← Précédent
            </button>

            <span className="text-xs text-gray-400 hidden sm:block">
              Étape {currentIdx + 1} sur {visibleSteps.length}
            </span>

            <button
              type="button"
              onClick={goNext}
              disabled={submitting}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 active:scale-95 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-all"
            >
              {submitting
                ? 'Envoi en cours…'
                : isLastStep
                ? 'Envoyer mon dossier ✓'
                : 'Suivant →'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Vos données sont utilisées uniquement pour la gestion de votre inscription.
        </p>
      </div>
    </div>
  )
}

// ── Composants ────────────────────────────────────────────────────────────────

function ChoiceRow({ selected, onClick, label, sub }) {
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
      <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
        selected ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
      }`}>
        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
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
