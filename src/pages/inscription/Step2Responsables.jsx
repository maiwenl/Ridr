import { inputCls } from '../../lib/ui'

export default function Step2Responsables({ data, onChange, errors, adresseAdherent }) {
  function updateRL(key, field, value) {
    onChange(key, { ...data[key], [field]: value })
  }

  return (
    <div className="space-y-8">
      <ResponsableBloc
        title="Responsable légal 1"
        data={data.responsable1}
        prefix="rl1"
        errors={errors}
        adresseAdherent={adresseAdherent}
        onChangeField={(f, v) => updateRL('responsable1', f, v)}
        required
      />

      <div className="border-t pt-6">
        {data.responsable2 === null ? (
          <button
            type="button"
            onClick={() =>
              onChange('responsable2', { nom_prenom: '', telephone: '', adresse: '', meme_adresse: false })
            }
            className="text-sm text-brand-600 hover:text-brand-800 font-medium"
          >
            + Ajouter un second responsable légal
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Responsable légal 2</h3>
              <button
                type="button"
                onClick={() => onChange('responsable2', null)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Supprimer
              </button>
            </div>
            <ResponsableBloc
              title=""
              data={data.responsable2}
              prefix="rl2"
              errors={errors}
              adresseAdherent={adresseAdherent}
              onChangeField={(f, v) => updateRL('responsable2', f, v)}
              required={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ResponsableBloc({ title, data, prefix, errors, adresseAdherent, onChangeField, required }) {
  const req = required ? ' *' : ''

  return (
    <div className="space-y-4">
      {title && <h3 className="text-sm font-semibold text-gray-700">{title}</h3>}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nom et Prénom{req}</label>
        <input
          type="text"
          value={data.nom_prenom}
          onChange={e => onChangeField('nom_prenom', e.target.value)}
          className={inputCls(errors[`${prefix}_nom_prenom`])}
        />
        {errors[`${prefix}_nom_prenom`] && (
          <p className="text-xs text-red-500 mt-1">{errors[`${prefix}_nom_prenom`]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone{req}</label>
        <input
          type="tel"
          value={data.telephone}
          onChange={e => onChangeField('telephone', e.target.value)}
          className={inputCls(errors[`${prefix}_telephone`])}
        />
        {errors[`${prefix}_telephone`] && (
          <p className="text-xs text-red-500 mt-1">{errors[`${prefix}_telephone`]}</p>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.meme_adresse}
            onChange={e => {
              onChangeField('meme_adresse', e.target.checked)
              if (e.target.checked) onChangeField('adresse', adresseAdherent)
              else onChangeField('adresse', '')
            }}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">Même adresse que le cavalier</span>
        </label>

        {!data.meme_adresse && (
          <textarea
            rows={2}
            placeholder="Adresse…"
            value={data.adresse}
            onChange={e => onChangeField('adresse', e.target.value)}
            className={inputCls(errors[`${prefix}_adresse`]) + ' resize-none'}
          />
        )}
        {errors[`${prefix}_adresse`] && (
          <p className="text-xs text-red-500 mt-1">{errors[`${prefix}_adresse`]}</p>
        )}
      </div>
    </div>
  )
}
