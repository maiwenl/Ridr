import { useState } from 'react'
import {
  calculateAge, filterForfaitsByAge, MODES_PAIEMENT,
} from '../../lib/calculs'

import { inputCls } from '../../lib/ui'

export default function Step3ForFait({ data, onChange, errors, cours, forfaits, parametres, dateNaissance, modesReglement = [] }) {
  const [showForfait2, setShowForfait2] = useState(!!data.forfait2_id)

  const age             = calculateAge(dateNaissance)
  const forfaitsFiltres = filterForfaitsByAge(forfaits, age)
  const coursSel        = cours.find(c => c.id === data.cours_id) ?? null

  return (
    <div className="max-w-xl space-y-5">

      {/* Cours */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cours souhaité *</label>
        <select
          value={data.cours_id}
          onChange={e => onChange('cours_id', e.target.value)}
          className={inputCls(errors.cours_id)}
        >
          <option value="">Sélectionner un cours…</option>
          {cours.map(c => (
            <option key={c.id} value={c.id} disabled={c.placesRestantes <= 0}>
              {c.nom} — {c.jour} {c.heure_debut?.slice(0, 5)}–{c.heure_fin?.slice(0, 5)}
              {c.placesRestantes <= 0
                ? ' (complet)'
                : ` · ${c.placesRestantes} place${c.placesRestantes > 1 ? 's' : ''}`}
            </option>
          ))}
        </select>
        {errors.cours_id && <p className="text-xs text-red-500 mt-1">{errors.cours_id}</p>}
        {coursSel && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{coursSel.inscrits} inscrits / {coursSel.capacite} places</span>
              <span>{coursSel.placesRestantes} restantes</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${coursSel.placesRestantes === 0 ? 'bg-red-500' : 'bg-brand-500'}`}
                style={{ width: `${Math.min(100, (coursSel.inscrits / coursSel.capacite) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Forfait principal */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Forfait principal *</label>
        {forfaitsFiltres.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-2">
            {age === null
              ? "Renseignez la date de naissance à l'étape 1"
              : 'Aucun forfait disponible pour cet âge'}
          </p>
        ) : (
          <select
            value={data.forfait_id}
            onChange={e => onChange('forfait_id', e.target.value)}
            className={inputCls(errors.forfait_id)}
          >
            <option value="">Sélectionner…</option>
            {forfaitsFiltres.map(f => (
              <option key={f.id} value={f.id}>
                {f.libelle} — {Number(f.prix)} €
              </option>
            ))}
          </select>
        )}
        {errors.forfait_id && <p className="text-xs text-red-500 mt-1">{errors.forfait_id}</p>}
      </div>

      {/* 2ème forfait */}
      {!showForfait2 ? (
        <button
          type="button"
          onClick={() => setShowForfait2(true)}
          className="text-sm text-brand-600 hover:text-brand-800 font-medium"
        >
          + Ajouter un 2ème forfait <span className="text-gray-500 font-normal">(remise -50 € auto)</span>
        </button>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">Deuxième forfait</label>
            <button
              type="button"
              onClick={() => { setShowForfait2(false); onChange('forfait2_id', '') }}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              Supprimer
            </button>
          </div>
          <select
            value={data.forfait2_id}
            onChange={e => onChange('forfait2_id', e.target.value)}
            className={inputCls(false)}
          >
            <option value="">Sélectionner…</option>
            {forfaitsFiltres.map(f => (
              <option key={f.id} value={f.id}>
                {f.libelle} — {Number(f.prix)} €
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Remise famille */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.remise_famille}
            onChange={e => onChange('remise_famille', e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            Bénéficie de la remise famille <span className="text-gray-500">(-50 €)</span>
          </span>
        </label>
        {data.remise_famille && (
          <input
            type="text"
            placeholder="Nom du 1er inscrit de la famille"
            value={data.remise_famille_nom}
            onChange={e => onChange('remise_famille_nom', e.target.value)}
            className={inputCls(false) + ' ml-6 !w-[calc(100%-1.5rem)]'}
          />
        )}
      </div>

      {/* Mode paiement */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Mode de paiement *</label>
        <div className="space-y-2">
          {MODES_PAIEMENT.map(m => (
            <label key={m.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode_paiement"
                value={m.value}
                checked={data.mode_paiement === m.value}
                onChange={() => onChange('mode_paiement', m.value)}
                className="text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">{m.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Mode règlement */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Mode de règlement *</label>
        <select
          value={data.mode_reglement}
          onChange={e => onChange('mode_reglement', e.target.value)}
          className={inputCls(errors.mode_reglement)}
        >
          <option value="">Sélectionner…</option>
          {modesReglement.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {errors.mode_reglement && <p className="text-xs text-red-500 mt-1">{errors.mode_reglement}</p>}
      </div>
    </div>
  )
}
