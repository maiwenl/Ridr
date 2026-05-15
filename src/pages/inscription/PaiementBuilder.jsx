import { useEffect, useMemo } from 'react'
import { inputCls } from '../../lib/ui'
import { NB_FOIS_OPTIONS as NB_FOIS_ALL } from '../../lib/constants'

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Mois couvrant la saison : septembre anneeDebut → août anneeFin.
 * Fallback si non fourni : septembre de l'année en cours → août suivante.
 */
function buildMonths(anneeDebut, anneeFin) {
  const startYear = anneeDebut ?? new Date().getFullYear()
  const endYear   = anneeFin   ?? startYear + 1
  const months = []
  // septembre de anneeDebut à août de anneeFin
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? 9  : 1
    const mEnd   = y === endYear   ? 8  : 12
    for (let m = mStart; m <= mEnd; m++) {
      const d = new Date(y, m - 1, 1)
      months.push({
        value: `${y}-${String(m).padStart(2, '0')}`,
        label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      })
    }
  }
  return months
}

/**
 * Répartit `total` en `n` parties avec montants entiers si possible.
 * Stratégie : chaque versement = round(total/n), le dernier absorbe la différence.
 * Ex : 451€ / 3 → [150, 150, 151]   450€ / 3 → [150, 150, 150]
 */
function splitAmount(total, n) {
  const base = Math.round(total / n)
  const last = Math.round((total - base * (n - 1)) * 100) / 100
  // Le montant différent (arrondi) en premier, les montants égaux ensuite
  const amounts = Array.from({ length: n - 1 }, () => base)
  return last >= base ? [last, ...amounts] : [...amounts, last]
}

/** Génère `n` versements avec mois consécutifs et montants répartis */
function makeVersements(total, n, months, startIdx = 0) {
  const amounts = splitAmount(total, n)
  return amounts.map((montant, i) => ({
    id:       genId(),
    echeance: months[Math.min(startIdx + i, months.length - 1)]?.value ?? '',
    montant,
  }))
}

/** Construit l'état initial des lignes de paiement */
function buildInitial(licenceMontant, forfaitMontant, acompteMontant, months) {
  const solde = Math.max(0, Math.round((forfaitMontant - acompteMontant) * 100) / 100)
  return {
    licence: { mode_reglement: '', echeance: '' },
    acompte: { mode_reglement: '', echeance: '' },
    forfait: solde > 0 ? [{
      id:             genId(),
      mode_reglement: '',
      montant:        solde,
      versements:     [{ id: genId(), echeance: '', montant: solde }],
    }] : [],
  }
}

// ── Composant principal ───────────────────────────────────────────────────────
/**
 * PaiementBuilder — builder de plan de paiement prévu.
 *
 * Props :
 *   licenceMontant    : number   — montant de la licence FFE (0 si stage)
 *   forfaitMontant    : number   — montant du forfait net de remise
 *   modesReglement    : string[] — modes disponibles (Chèque, Virement, …)
 *   nbFoisAcceptes    : number[] — options de versements autorisées (depuis paramètres)
 *   value             : object | null — état contrôlé { licence, forfait }
 *   onChange          : (newValue) => void
 *   errors            : object   — clés paiement_licence, paiement_forfait_0, …
 */
export default function PaiementBuilder({
  licenceMontant = 0,
  forfaitMontant = 0,
  acompteMontant = 0,
  modesReglement = [],
  nbFoisAcceptes = null,
  saison = null,
  value,
  onChange,
  errors = {},
}) {
  const NB_FOIS_OPTIONS = nbFoisAcceptes && nbFoisAcceptes.length > 0
    ? NB_FOIS_ALL.filter(n => nbFoisAcceptes.includes(n))
    : NB_FOIS_ALL
  const months = useMemo(
    () => buildMonths(saison?.start_year ?? saison?.annee_debut, saison?.end_year ?? saison?.annee_fin),
    [saison?.start_year, saison?.end_year, saison?.annee_debut, saison?.annee_fin],
  )

  // Initialisation automatique quand value est null ou que les totaux changent
  useEffect(() => {
    if (!value) {
      onChange(buildInitial(licenceMontant, forfaitMontant, acompteMontant, months))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenceMontant, forfaitMontant, acompteMontant])

  if (!value) return null   // en attente d'initialisation

  const { licence, acompte = { mode_reglement: '', echeance: '' }, forfait } = value

  // ── Helpers de mutation ───────────────────────────────────────────────────
  function setLicence(key, val) {
    onChange({ ...value, licence: { ...licence, [key]: val } })
  }

  function setAcompte(key, val) {
    onChange({ ...value, acompte: { ...acompte, [key]: val } })
  }

  function updateLigne(id, patch) {
    onChange({
      ...value,
      forfait: forfait.map(l => l.id === id ? { ...l, ...patch } : l),
    })
  }

  function setNbFois(id, n) {
    const ligne = forfait.find(l => l.id === id)
    if (!ligne) return
    const versements = n === 1
      ? [{ id: genId(), echeance: '', montant: ligne.montant }]
      : makeVersements(ligne.montant, n, months)
    updateLigne(id, { versements })
  }

  function setLigneMontant(id, newMontant) {
    const ligne = forfait.find(l => l.id === id)
    if (!ligne) return
    const n = ligne.versements.length
    const versements = n === 1
      ? [{ ...ligne.versements[0], montant: newMontant }]
      : makeVersements(newMontant, n, months)
    updateLigne(id, { montant: newMontant, versements })
  }

  function setVersement(ligneId, vId, key, val) {
    onChange({
      ...value,
      forfait: forfait.map(l =>
        l.id === ligneId
          ? { ...l, versements: l.versements.map(v => v.id === vId ? { ...v, [key]: val } : v) }
          : l
      ),
    })
  }

  function addLigne() {
    const saisi   = forfait.reduce((s, l) => s + Number(l.montant ?? 0), 0)
    const restant = Math.round((forfaitMontant - saisi) * 100) / 100
    onChange({
      ...value,
      forfait: [...forfait, {
        id:             genId(),
        mode_reglement: '',
        montant:        Math.max(0, restant),
        versements:     [{ id: genId(), echeance: '', montant: Math.max(0, restant) }],
      }],
    })
  }

  function removeLigne(id) {
    onChange({ ...value, forfait: forfait.filter(l => l.id !== id) })
  }

  // ── Calculs récap ─────────────────────────────────────────────────────────
  const soldeForfait       = Math.max(0, Math.round((forfaitMontant - acompteMontant) * 100) / 100)
  const totalForfaitSaisi  = forfait.reduce((s, l) => s + Number(l.montant ?? 0), 0)
  const restantForfait     = Math.round((soldeForfait - totalForfaitSaisi) * 100) / 100
  const totalGlobal        = totalForfaitSaisi + acompteMontant + (licenceMontant > 0 ? licenceMontant : 0)
  const attendu            = forfaitMontant + licenceMontant
  const isBalanced         = Math.abs(totalGlobal - attendu) < 0.02

  return (
    <div className="space-y-4">

      {/* ── Licence FFE ────────────────────────────────────────────────────── */}
      {licenceMontant > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 flex justify-between items-center border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Licence FFE</span>
            <span className="text-sm font-bold text-gray-700">{licenceMontant} €</span>
          </div>
          <div className="p-3 flex flex-wrap gap-2 items-center">
            <select
              value={licence.mode_reglement}
              onChange={e => setLicence('mode_reglement', e.target.value)}
              className={`${inputCls(errors.paiement_licence)} flex-1 min-w-[140px]`}
            >
              <option value="">Mode de règlement…</option>
              {modesReglement.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={licence.echeance ?? ''}
              onChange={e => setLicence('echeance', e.target.value)}
              className={`${inputCls(false)} flex-1 min-w-[140px] text-sm`}
            >
              <option value="">Mois prévu (optionnel)…</option>
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {errors.paiement_licence && (
            <p className="text-xs text-red-500 px-4 pb-2">{errors.paiement_licence}</p>
          )}
        </div>
      )}

      {/* ── Acompte ────────────────────────────────────────────────────────── */}
      {acompteMontant > 0 && forfaitMontant > 0 && (
        <div className="rounded-xl border border-amber-200 overflow-hidden">
          <div className="bg-amber-50 px-4 py-2.5 flex justify-between items-center border-b border-amber-100">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Acompte</span>
            <span className="text-sm font-bold text-amber-800">{acompteMontant} €</span>
          </div>
          <div className="p-3 flex flex-wrap gap-2 items-center">
            <select
              value={acompte.mode_reglement}
              onChange={e => setAcompte('mode_reglement', e.target.value)}
              className={`${inputCls(errors.paiement_acompte)} flex-1 min-w-[140px]`}
            >
              <option value="">Mode de règlement…</option>
              {modesReglement.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={acompte.echeance ?? ''}
              onChange={e => setAcompte('echeance', e.target.value)}
              className={`${inputCls(false)} flex-1 min-w-[140px] text-sm`}
            >
              <option value="">Mois prévu (optionnel)…</option>
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── Solde forfait ──────────────────────────────────────────────────── */}
      {forfaitMontant > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 flex justify-between items-center border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {acompteMontant > 0 ? 'Solde forfait' : 'Forfait'}
            </span>
            <span className="text-sm font-bold text-gray-700">{soldeForfait} €</span>
          </div>

          <div className="p-3 space-y-3">
            {forfait.map((ligne, idx) => {
              const nbFois = ligne.versements.length
              return (
                <div
                  key={ligne.id}
                  className="border border-gray-100 rounded-lg p-3 space-y-2.5 bg-white"
                >
                  {/* Ligne principale */}
                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Mode */}
                    <select
                      value={ligne.mode_reglement}
                      onChange={e => updateLigne(ligne.id, { mode_reglement: e.target.value })}
                      className={`${inputCls(errors[`paiement_forfait_${idx}`])} flex-1 min-w-[120px]`}
                    >
                      <option value="">Mode…</option>
                      {modesReglement.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    {/* Montant */}
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.montant}
                        onChange={e => setLigneMontant(ligne.id, Number(e.target.value))}
                        className={`${inputCls(false)} w-28 pr-7 text-right`}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">€</span>
                    </div>

                    {/* Nb fois */}
                    <select
                      value={nbFois}
                      onChange={e => setNbFois(ligne.id, Number(e.target.value))}
                      className={`${inputCls(false)} w-28`}
                    >
                      {NB_FOIS_OPTIONS.map(n => (
                        <option key={n} value={n}>{n === 1 ? '1 fois' : `${n} fois`}</option>
                      ))}
                    </select>

                    {/* Supprimer */}
                    {forfait.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLigne(ligne.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        title="Supprimer cette ligne"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {errors[`paiement_forfait_${idx}`] && (
                    <p className="text-xs text-red-500">{errors[`paiement_forfait_${idx}`]}</p>
                  )}

                  {/* Versements (nb_fois > 1) */}
                  {nbFois > 1 && (
                    <div className="pl-3 border-l-2 border-gray-100 space-y-2">
                      {ligne.versements.map((v, vi) => (
                        <div key={v.id} className="flex flex-wrap gap-2 items-center">
                          <span className="text-[11px] text-gray-400 w-24 shrink-0">
                            Versement {vi + 1}/{nbFois}
                          </span>
                          <select
                            value={v.echeance}
                            onChange={e => setVersement(ligne.id, v.id, 'echeance', e.target.value)}
                            className={`${inputCls(false)} flex-1 min-w-[130px] text-sm`}
                          >
                            <option value="">Mois…</option>
                            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={v.montant}
                              onChange={e => setVersement(ligne.id, v.id, 'montant', Number(e.target.value))}
                              className={`${inputCls(false)} w-24 pr-7 text-right text-sm`}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">€</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Reste à ventiler */}
            {Math.abs(restantForfait) > 0.01 && (
              <p className={`text-xs font-medium px-1 ${restantForfait > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                {restantForfait > 0
                  ? `Reste à ventiler : ${restantForfait} €`
                  : `Dépassement de ${Math.abs(restantForfait)} €`}
              </p>
            )}

            {/* Bouton ajouter une ligne */}
            {restantForfait > 0.01 && (
              <button
                type="button"
                onClick={addLigne}
                className="w-full text-sm text-brand-600 hover:text-brand-700 border border-dashed border-brand-200 hover:border-brand-400 rounded-lg py-2.5 transition-colors font-medium"
              >
                + Ajouter une ligne de paiement
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Total global ───────────────────────────────────────────────────── */}
      {(licenceMontant > 0 || forfaitMontant > 0) && (
        <div className={`flex justify-between items-center text-sm font-semibold px-1 ${
          isBalanced ? 'text-emerald-600' : 'text-amber-600'
        }`}>
          <span>Total planifié</span>
          <span>
            {totalGlobal.toFixed(2)} € / {attendu.toFixed(2)} €
            {isBalanced && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 inline ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Export du helper de transformation pour le submit ─────────────────────────
/**
 * Aplatit les lignes de paiement en rows à insérer dans paiements.
 * @param {object} lignes       — valeur du PaiementBuilder
 * @param {string} inscriptionId
 * @param {number} licenceMontant
 */
export function flattenLignesPaiement(lignes, inscriptionId, licenceMontant, acompteMontant = 0) {
  if (!lignes) return []
  const rows = []

  // Licence
  if (licenceMontant > 0 && lignes.licence?.mode_reglement) {
    rows.push({
      type:           'divers',
      amount:         licenceMontant,
      payment_method: lignes.licence.mode_reglement,
      ...(lignes.licence.echeance ? { paid_at: `${lignes.licence.echeance}-01` } : {}),
      label:          'Licence FFE',
      status:         'planifie',
    })
  }

  // Acompte
  if (acompteMontant > 0 && lignes.acompte?.mode_reglement) {
    rows.push({
      type:           'acompte',
      amount:         acompteMontant,
      payment_method: lignes.acompte.mode_reglement,
      ...(lignes.acompte.echeance ? { paid_at: `${lignes.acompte.echeance}-01` } : {}),
      label:          'Acompte',
      status:         'planifie',
    })
  }

  // Forfait
  for (const ligne of (lignes.forfait ?? [])) {
    if (!ligne.mode_reglement) continue
    const multi = ligne.versements.length > 1
    for (let i = 0; i < ligne.versements.length; i++) {
      const v = ligne.versements[i]
      rows.push({
        type:           'solde',
        amount:         v.montant,
        payment_method: ligne.mode_reglement,
        ...(v.echeance ? { paid_at: `${v.echeance}-01` } : {}),
        label:          multi ? `Versement ${i + 1}/${ligne.versements.length}` : null,
        status:         'planifie',
      })
    }
  }

  return rows.filter(r => Number(r.amount) > 0)
}
