import {calculateAge, computeFinancial, formatMontant,} from '../../lib/calculs'
import {TYPE_INSCRIPTION} from '../../lib/constants'

function formatDateRange(debut, fin) {
    if (!debut) return '—'
    const d = new Date(debut).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'})
    if (!fin || fin === debut) return d
    const f = new Date(fin).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'})
    return `${d} → ${f}`
}

export default function Step4Recap({formData, forfaits, activites, parametres, onSubmit, loading}) {
    const age = calculateAge(formData.date_naissance)
    const isStage = formData.type_inscription !== 'cours_annuel'

    const forfait1 = isStage ? null : (forfaits.find(f => f.id === formData.offre_id) ?? null)
    const forfait2 = isStage ? null : (formData.offre2_id ? forfaits.find(f => f.id === formData.offre2_id) ?? null : null)
    const activite = activites.find(a => a.id === formData.activite_id) ?? null

    const remiseMontant = Number(formData.remise_montant) || 0
    const {total, totalForfait, licenceMontant, remiseAppliquee, prixForfait1, prixForfait2} = isStage
        ? computeFinancial({prixBase: 0, remiseMontant, age, parametres})
        : computeFinancial({forfait1, forfait2, remiseMontant, age, parametres})

    const typeLabel = TYPE_INSCRIPTION[formData.type_inscription]?.label ?? formData.type_inscription

    return (
        <div className="space-y-6 max-w-xl">

            {/* Cavalier */}
            <Section title="Informations cavalier">
                <Grid>
                    <Info label="Nom" value={formData.nom}/>
                    <Info label="Prénom" value={formData.prenom}/>
                    <Info label="Date de naissance" value={`${formData.date_naissance} (${age} ans)`}/>
                    <Info label="Email" value={formData.email}/>
                    <Info label="Téléphone" value={formData.telephone}/>
                    <Info label="Galop" value={formData.galop}/>
                    <Info label="Droit à l'image" value={formData.droit_image ? 'Oui' : 'Non'}/>
                    <Info label="Adresse" value={formData.adresse}/>
                </Grid>
            </Section>

            {/* Responsables légaux */}
            {age !== null && age < 18 && formData.responsable1 && (
                <Section title="Responsables légaux">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Responsable 1</p>
                    <Grid>
                        <Info label="Nom Prénom" value={formData.responsable1.nom_prenom}/>
                        <Info label="Téléphone" value={formData.responsable1.telephone}/>
                        <Info
                            label="Adresse"
                            value={formData.responsable1.meme_adresse ? 'Même adresse que le cavalier' : formData.responsable1.adresse}
                        />
                    </Grid>
                    {formData.responsable2 && (
                        <>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">Responsable
                                2</p>
                            <Grid>
                                <Info label="Nom Prénom" value={formData.responsable2.nom_prenom}/>
                                <Info label="Téléphone" value={formData.responsable2.telephone}/>
                                <Info
                                    label="Adresse"
                                    value={formData.responsable2.meme_adresse ? 'Même adresse que le cavalier' : formData.responsable2.adresse}
                                />
                            </Grid>
                        </>
                    )}
                </Section>
            )}

            {/* Activité & forfait */}
            <Section title="Inscription">
                <Grid>
                    <Info label="Type" value={typeLabel}/>
                    {activite && (
                        isStage ? (
                            <>
                                <Info label="Activité" value={activite.nom}/>
                                {activite.date_debut && (
                                    <Info label="Dates"
                                          value={formatDateRange(activite.date_debut, activite.date_fin)}/>
                                )}
                                {activite.heure_debut && (
                                    <Info
                                        label="Horaire"
                                        value={`${activite.heure_debut.slice(0, 5)}${activite.heure_fin ? ` – ${activite.heure_fin.slice(0, 5)}` : ''}`}
                                    />
                                )}
                            </>
                        ) : (
                            <Info
                                label="Cours"
                                value={`${activite.nom} — ${activite.jour} ${activite.heure_debut?.slice(0, 5)}–${activite.heure_fin?.slice(0, 5)}`}
                            />
                        )
                    )}
                    {forfait1 && <Info label="Forfait principal" value={forfait1.label ?? forfait1.libelle}/>}
                    {forfait2 && <Info label="2ème forfait" value={forfait2.label ?? forfait2.libelle}/>}
                    {remiseMontant > 0 && (
                        <Info
                            label="Remise"
                            value={`${remiseMontant} €${formData.motif_remise ? ` — ${formData.motif_remise}` : ''}`}
                        />
                    )}
                </Grid>
            </Section>

            {/* Récapitulatif financier */}
            <Section title="Récapitulatif financier">
                <div className="space-y-2 text-sm">
                    {isStage ? (
                        <Row label={activite?.nom ?? 'Stage'} value={`${prixForfait1} €`}/>
                    ) : (
                        <>
                            {forfait1 && <Row label={forfait1.label ?? forfait1.libelle} value={`${prixForfait1} €`}/>}
                            {forfait2 && <Row label={forfait2.label ?? forfait2.libelle} value={`${prixForfait2} €`}/>}
                        </>
                    )}
                    {remiseAppliquee > 0 && <Row label="Remise" value={`−${remiseAppliquee} €`} green/>}
                    {licenceMontant > 0 && (
                        <Row
                            label={`Licence FFE (${age !== null && age < 18 ? '≤ 18 ans' : '> 18 ans'})`}
                            value={`${licenceMontant} €`}
                        />
                    )}
                    <div className="border-t pt-2 mt-1">
                        <Row label="Total général" value={formatMontant(total)} bold/>
                    </div>
                    {/* Plan de paiement */}
                    {formData.lignes_paiement && (
                        <div className="pt-3 border-t">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Plan de
                                paiement prévu</p>
                            {/* Ligne licence */}
                            {licenceMontant > 0 && formData.lignes_paiement.licence?.mode_reglement && (
                                <div className="flex justify-between text-sm py-0.5">
                  <span className="text-gray-500">
                    Licence FFE — {formData.lignes_paiement.licence.mode_reglement}
                      {formData.lignes_paiement.licence.echeance && ` (${new Date(formData.lignes_paiement.licence.echeance + '-01').toLocaleDateString('fr-FR', {
                          month: 'long',
                          year: 'numeric'
                      })})`}
                  </span>
                                    <span className="text-gray-800">{licenceMontant} €</span>
                                </div>
                            )}
                            {/* Lignes forfait */}
                            {(formData.lignes_paiement.forfait ?? []).map((ligne, li) =>
                                ligne.versements.map((v, vi) => {
                                    const multi = ligne.versements.length > 1
                                    const label = multi
                                        ? `Versement ${vi + 1}/${ligne.versements.length} — ${ligne.mode_reglement}`
                                        : ligne.mode_reglement
                                    const moisLabel = v.echeance
                                        ? ` (${new Date(v.echeance + '-01').toLocaleDateString('fr-FR', {
                                            month: 'long',
                                            year: 'numeric'
                                        })})`
                                        : ''
                                    return (
                                        <div key={`${li}-${vi}`} className="flex justify-between text-sm py-0.5">
                                            <span className="text-gray-500">{label}{moisLabel}</span>
                                            <span className="text-gray-800">{v.montant} €</span>
                                        </div>
                                    )
                                })
                            )}</div>
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

function Section({title, children}) {
    return (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
            {children}
        </div>
    )
}

function Grid({children}) {
    return <div className="grid grid-cols-2 gap-x-8 gap-y-3">{children}</div>
}

function Info({label, value}) {
    return (
        <div>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-sm text-gray-900 font-medium">{value || '—'}</p>
        </div>
    )
}

function Row({label, value, bold, green}) {
    return (
        <div className={`flex justify-between ${green ? 'text-green-600' : ''}`}>
            <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
            <span className={bold ? 'font-bold text-gray-900' : 'text-gray-800'}>{value}</span>
        </div>
    )
}
