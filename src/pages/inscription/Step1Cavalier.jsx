import { calculateAge, GALOPS } from '../../lib/calculs'
import { inputCls } from '../../lib/ui'

export default function Step1Cavalier({ data, onChange, errors }) {
  const age = calculateAge(data.date_naissance)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom" error={errors.nom}>
          <input
            type="text"
            value={data.nom}
            onChange={e => onChange('nom', e.target.value)}
            className={inputCls(errors.nom)}
          />
        </Field>
        <Field label="Prénom" error={errors.prenom}>
          <input
            type="text"
            value={data.prenom}
            onChange={e => onChange('prenom', e.target.value)}
            className={inputCls(errors.prenom)}
          />
        </Field>
      </div>

      <Field label="Date de naissance" error={errors.date_naissance}>
        <input
          type="date"
          value={data.date_naissance}
          onChange={e => onChange('date_naissance', e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className={inputCls(errors.date_naissance)}
        />
        {age !== null && (
          <p className="text-xs text-gray-500 mt-1">
            Âge calculé :{' '}
            <span className="font-semibold text-brand-700">{age} ans</span>
            {age < 18 && <span className="ml-2 text-blue-600">(mineur — responsables légaux requis)</span>}
          </p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email" error={errors.email}>
          <input
            type="email"
            value={data.email}
            onChange={e => onChange('email', e.target.value)}
            className={inputCls(errors.email)}
          />
        </Field>
        <Field label="Téléphone" error={errors.telephone}>
          <input
            type="tel"
            value={data.telephone}
            onChange={e => onChange('telephone', e.target.value)}
            className={inputCls(errors.telephone)}
          />
        </Field>
      </div>

      <Field label="Adresse" error={errors.adresse}>
        <textarea
          rows={2}
          value={data.adresse}
          onChange={e => onChange('adresse', e.target.value)}
          className={inputCls(errors.adresse) + ' resize-none'}
        />
      </Field>

      <Field label="Niveau / Galop" error={errors.galop}>
        <select
          value={data.galop}
          onChange={e => onChange('galop', e.target.value)}
          className={inputCls(errors.galop)}
        >
          <option value="">Sélectionner…</option>
          {GALOPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </Field>

      <div>
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <button
            type="button"
            onClick={() => onChange('droit_image', !data.droit_image)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              data.droit_image ? 'bg-brand-600' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              data.droit_image ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <span className="text-sm text-gray-700">
            Droit à l'image —{' '}
            <span className="font-medium">{data.droit_image ? 'Oui' : 'Non'}</span>
          </span>
        </label>
      </div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label} *</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
