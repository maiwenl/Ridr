import {
  calculateAge, computeFinancial, computeEcheancier,
  MODES_PAIEMENT, formatMontant,
} from '../../lib/calculs'

export default function Step4Recap({ formData, forfaits, cours, parametres, onSubmit, loading }) {
  const age      = calculateAge(formData.date_naissance)
  const forfait1 = forfaits.find(f => f.id === formData.forfait_id) ?? null
  const forfait2 = formData.forfait2_id ? forfaits.find(f => f.id === formData.forfait2_id) ?? null : null
  const coursSel = cours.find(c => c.id === formData.cours_id) ?? null

  const { total, licenceMontant, remiseAppliquee, prixForfait1, prixForfait2 } = computeFinancial({
    forfait1, forfait2, remiseFamille: formData.remise_famille, age, parametres,
  })

  const echeancier     = computeEcheancier(total, formData.mode_paiement)
  const modeLabel      = MODES_PAIEMENT.find(m => m.value === formData.mode_paiement)?.label
  const reglementLabel = formData.mode_reglement // déjà un libellé lisible venant des paramètres BDD

  return (
    <div className="space-y-6 max-w-xl">

      {/* Cavalier */}
      <Section title="Informations cavalier">
        <Grid>
          <Info label="Nom"               value={formData.nom} />
          <Info label="Prénom"            value={formData.prenom} />
          <Info label="Date de naissance" value={`${formData.date_naissance} (${age} ans)`} />
          <Info label="Email"             value={formData.email} />
          <Info label="Téléphone"         value={formData.telephone} />
          <Info label="Galop"             value={formData.galop} />
          <Info label="Droit à l'image"   value={formData.droit_image ? 'Oui' : 'Non'} />
          <Info label="Adresse"           value={formData.adresse} />
        </Grid>
      </Section>

      {/* Responsables (mineurs) */}
      {age !== null && age < 18 && formData.responsable1 && (
        <Section title="Responsables légaux">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Responsable 1</p>
          <Grid>
            <Info label="Nom Prénom" value={formData.responsable1.nom_prenom} />
            <Info label="Téléphone"  value={formData.responsable1.telephone} />
            <Info
              label="Adresse"
              value={formData.responsable1.meme_adresse ? 'Même adresse que le cavalier' : formData.responsable1.adresse}
            />
          </Grid>
          {formData.responsable2 && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">Responsable 2</p>
              <Grid>
                <Info label="Nom Prénom" value={formData.responsable2.nom_prenom} />
                <Info label="Téléphone"  value={formData.responsable2.telephone} />
                <Info
                  label="Adresse"
                  value={formData.responsable2.meme_adresse ? 'Même adresse que le cavalier' : formData.responsable2.adresse}
                />
              </Grid>
            </>
          )}
        </Section>
      )}

      {/* Cours & forfait */}
      <Section title="Cours & forfait">
        <Grid>
          <Info
            label="Cours"
            value={coursSel
              ? `${coursSel.nom} — ${coursSel.jour} ${coursSel.heure_debut?.slice(0, 5)}–${coursSel.heure_fin?.slice(0, 5)}`
              : '—'}
          />
          <Info label="Forfait principal" value={forfait1?.libelle ?? '—'} />
          {forfait2 && <Info label="2ème forfait" value={forfait2.libelle} />}
          {formData.remise_famille && (
            <Info
              label="Remise famille"
              value={`Oui${formData.remise_famille_nom ? ` (${formData.remise_famille_nom})` : ''}`}
            />
          )}
        </Grid>
      </Section>

      {/* Récapitulatif financier */}
      <Section title="Récapitulatif financier">
        <div className="space-y-2 text-sm">
          {forfait1 && <Row label={forfait1.libelle} value={`${prixForfait1} €`} />}
          {forfait2 && <Row label={forfait2.libelle} value={`${prixForfait2} €`} />}
          {remiseAppliquee > 0 && <Row label="Remise" value={`−${remiseAppliquee} €`} green />}
          <Row
            label={`Licence FFE (${age !== null && age < 18 ? '≤ 18 ans' : '> 18 ans'})`}
            value={`${licenceMontant} €`}
          />
          <div className="border-t pt-2 mt-1">
            <Row label="Total général" value={formatMontant(total)} bold />
          </div>
          <div className="pt-3 border-t space-y-1">
            <Row label="Mode de paiement"  value={modeLabel} />
            <Row label="Mode de règlement" value={reglementLabel} />
          </div>
          {formData.mode_paiement !== '1_fois' && (
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Échéancier</p>
              {echeancier.map((e, i) => (
                <div key={i} className="flex justify-between text-sm py-0.5">
                  <span className="text-gray-600">{e.label}</span>
                  <span className="text-gray-800">{e.montant} €</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <button
        type="button"
        onClick={onSubmit}
        disabled={loading}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-colors"
      >
        {loading ? 'Enregistrement en cours…' : "Valider l'inscription"}
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Grid({ children }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-3">{children}</div>
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 font-medium">{value || '—'}</p>
    </div>
  )
}

function Row({ label, value, bold, green }) {
  return (
    <div className={`flex justify-between ${green ? 'text-green-600' : ''}`}>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={bold ? 'font-bold text-gray-900' : 'text-gray-800'}>{value}</span>
    </div>
  )
}
