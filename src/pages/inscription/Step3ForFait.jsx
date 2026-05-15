import {useState} from 'react'
import {calculateAge, filterForfaitsByAge} from '../../lib/calculs'
import {TYPE_INSCRIPTION} from '../../lib/constants'
import {inputCls} from '../../lib/ui'
import PaiementBuilder from './PaiementBuilder'

function formatDateRange(debut, fin) {
    if (!debut) return ''
    const d = new Date(debut).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})
    if (!fin || fin === debut) return d
    const f = new Date(fin).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})
    return `${d} → ${f}`
}

export default function Step3ForFait({
                                         data, onChange, errors,
                                         activites = [],
                                         forfaits = [],
                                         parametres,
                                         dateNaissance,
                                         modesReglement = [],
                                         nbFoisAcceptes = null,
                                         saison = null,
                                         // financial est calculé dans NouvelAdherent et passé ici
                                         financial = null,
                                     }) {
    const [showForfait2, setShowForfait2] = useState(!!data.offre2_id)
    const [showRemise, setShowRemise] = useState(!!(data.remise_montant || data.motif_remise))

    const age = calculateAge(dateNaissance)
    const forfaitsFiltres = filterForfaitsByAge(forfaits, age)

    const allCoursReguliers = activites.filter(a => a.type === 'cours_regulier')
    const coursReguliers = allCoursReguliers.filter(c => {
        const niveauOk = !c.niveaux || c.niveaux.length === 0 || !data.galop || c.niveaux.includes(data.galop)
        const ageOk = age === null
            || ((c.age_min == null || age >= c.age_min) && (c.age_max == null || age <= c.age_max))
        return niveauOk && ageOk
    })
    const stagesDispos = activites.filter(a => a.type === 'stage')

    const isStage = data.type_inscription === 'stage'
    const isAnnuel = data.type_inscription === 'cours_annuel'

    const activiteSelectionnee = activites.find(a => a.id === data.activite_id) ?? null

    const typesDisponibles = [
        {value: 'cours_annuel', label: 'Cours annuel'},
        ...(stagesDispos.length > 0 ? [{value: 'stage', label: 'Stage'}] : []),
    ]

    // Montants pour PaiementBuilder
    const licenceMontant = financial?.licenceMontant ?? 0
    const forfaitMontant = financial?.totalForfait ?? 0
    const acompteMontant = financial?.acompteMontant ?? 0

    return (
        <div className="max-w-xl space-y-5">

            {/* Sélecteur type d'inscription */}
            {typesDisponibles.length > 1 && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type d'inscription *</label>
                    <div className="flex gap-2 flex-wrap">
                        {typesDisponibles.map(t => {
                            const meta = TYPE_INSCRIPTION[t.value]
                            const isActive = data.type_inscription === t.value
                            return (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => {
                                        onChange('type_inscription', t.value)
                                        onChange('activite_id', '')
                                        onChange('offre_id', '')
                                    }}
                                    className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-colors ${
                                        isActive
                                            ? `${meta?.cls ?? ''} shadow-sm`
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Cours annuel ─────────────────────────────────────────────────── */}
            {isAnnuel && (
                <>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cours souhaité *</label>
                        {data.galop && coursReguliers.length < allCoursReguliers.length && (
                            <p className="text-xs text-brand-600 mb-2">
                                Cours filtrés pour le niveau <strong>{data.galop}</strong>
                                {age !== null ? ` · ${age} ans` : ''}
                            </p>
                        )}
                        <select
                            value={data.activite_id}
                            onChange={e => onChange('activite_id', e.target.value)}
                            className={inputCls(errors.activite_id)}
                        >
                            <option value="">Sélectionner un cours…</option>
                            {coursReguliers.map(c => (
                                <option key={c.id} value={c.id} disabled={c.placesRestantes <= 0}>
                                    {c.nom} — {c.jour} {c.heure_debut?.slice(0, 5)}–{c.heure_fin?.slice(0, 5)}
                                    {c.placesRestantes <= 0
                                        ? ' (complet)'
                                        : ` · ${c.placesRestantes} place${c.placesRestantes > 1 ? 's' : ''}`}
                                </option>
                            ))}
                        </select>
                        {errors.activite_id && <p className="text-xs text-red-500 mt-1">{errors.activite_id}</p>}
                        {activiteSelectionnee && (
                            <div className="mt-2">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>{activiteSelectionnee.inscrits} inscrits / {activiteSelectionnee.capacite} places</span>
                                    <span>{activiteSelectionnee.placesRestantes} restante{activiteSelectionnee.placesRestantes > 1 ? 's' : ''}</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div
                                        className={`h-1.5 rounded-full transition-all ${activiteSelectionnee.placesRestantes === 0 ? 'bg-red-500' : 'bg-brand-500'}`}
                                        style={{width: `${Math.min(100, (activiteSelectionnee.inscrits / activiteSelectionnee.capacite) * 100)}%`}}
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
                                {age === null ? "Renseignez la date de naissance à l'étape 1" : 'Aucun forfait disponible pour cet âge'}
                            </p>
                        ) : (
                            <select
                                value={data.offre_id}
                                onChange={e => onChange('offre_id', e.target.value)}
                                className={inputCls(errors.offre_id)}
                            >
                                <option value="">Sélectionner…</option>
                                {forfaitsFiltres.map(f => (
                                    <option key={f.id}
                                            value={f.id}>{f.label ?? f.libelle} — {Number(f.price ?? f.prix)} €</option>
                                ))}
                            </select>
                        )}
                        {errors.offre_id && <p className="text-xs text-red-500 mt-1">{errors.offre_id}</p>}
                    </div>

                    {/* 2ème forfait */}
                    {!showForfait2 ? (
                        <button
                            type="button"
                            onClick={() => setShowForfait2(true)}
                            className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                        >
                            + Ajouter un 2ème forfait <span
                            className="text-gray-500 font-normal">(remise -50 € auto)</span>
                        </button>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-sm font-medium text-gray-700">Deuxième forfait</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForfait2(false);
                                        onChange('offre2_id', '')
                                    }}
                                    className="text-xs text-gray-400 hover:text-red-500"
                                >Supprimer
                                </button>
                            </div>
                            <select
                                value={data.offre2_id}
                                onChange={e => onChange('offre2_id', e.target.value)}
                                className={inputCls(false)}
                            >
                                <option value="">Sélectionner…</option>
                                {forfaitsFiltres.map(f => (
                                    <option key={f.id}
                                            value={f.id}>{f.label ?? f.libelle} — {Number(f.price ?? f.prix)} €</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <RemiseLibre data={data} onChange={onChange} show={showRemise}
                                 onToggle={() => setShowRemise(v => !v)}/>
                </>
            )}

            {/* ── Stage ────────────────────────────────────────────────────────── */}
            {isStage && (
                <>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Stage *</label>
                        {stagesDispos.length === 0 ? (
                            <p className="text-sm text-gray-500 italic py-2 bg-gray-50 rounded-lg px-3">
                                Aucun stage disponible pour cette saison. Créez-en un dans la page Activités.
                            </p>
                        ) : (
                            <select
                                value={data.activite_id}
                                onChange={e => onChange('activite_id', e.target.value)}
                                className={inputCls(errors.activite_id)}
                            >
                                <option value="">Sélectionner un stage…</option>
                                {stagesDispos.map(s => (
                                    <option key={s.id} value={s.id} disabled={s.placesRestantes <= 0}>
                                        {s.nom}
                                        {s.date_debut ? ` — ${formatDateRange(s.date_debut, s.date_fin)}` : ''}
                                        {s.placesRestantes <= 0
                                            ? ' (complet)'
                                            : ` · ${s.placesRestantes} place${s.placesRestantes > 1 ? 's' : ''}`}
                                    </option>
                                ))}
                            </select>
                        )}
                        {errors.activite_id && <p className="text-xs text-red-500 mt-1">{errors.activite_id}</p>}
                        {activiteSelectionnee && (
                            <div
                                className="mt-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5 text-sm space-y-0.5">
                                <p className="font-semibold text-purple-900">{activiteSelectionnee.nom}</p>
                                {activiteSelectionnee.date_debut && (
                                    <p className="text-purple-700">{formatDateRange(activiteSelectionnee.date_debut, activiteSelectionnee.date_fin)}</p>
                                )}
                                {activiteSelectionnee.heure_debut && (
                                    <p className="text-purple-600 text-xs">
                                        {activiteSelectionnee.heure_debut.slice(0, 5)}{activiteSelectionnee.heure_fin ? ` – ${activiteSelectionnee.heure_fin.slice(0, 5)}` : ''}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <RemiseLibre data={data} onChange={onChange} show={showRemise}
                                 onToggle={() => setShowRemise(v => !v)}/>
                </>
            )}

            {/* ── Plan de paiement ─────────────────────────────────────────────── */}
            {(licenceMontant > 0 || forfaitMontant > 0) && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Plan de paiement *</label>
                    <PaiementBuilder
                        licenceMontant={licenceMontant}
                        forfaitMontant={forfaitMontant}
                        acompteMontant={acompteMontant}
                        modesReglement={modesReglement}
                        nbFoisAcceptes={nbFoisAcceptes}
                        saison={saison}
                        value={data.lignes_paiement}
                        onChange={v => onChange('lignes_paiement', v)}
                        errors={errors}
                    />
                </div>
            )}
        </div>
    )
}

function RemiseLibre({data, onChange, show, onToggle}) {
    return (
        <div>
            {!show ? (
                <button
                    type="button"
                    onClick={onToggle}
                    className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                >
                    + Ajouter une remise
                </button>
            ) : (
                <div className="border border-green-200 bg-green-50/40 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Remise</p>
                        <button
                            type="button"
                            onClick={() => {
                                onToggle();
                                onChange('remise_montant', '');
                                onChange('motif_remise', '')
                            }}
                            className="text-xs text-gray-400 hover:text-red-500"
                        >Supprimer
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Montant €"
                            value={data.remise_montant}
                            onChange={e => onChange('remise_montant', e.target.value)}
                            className={inputCls(false)}
                        />
                        <input
                            type="text"
                            placeholder="Motif (famille, fidélité…)"
                            value={data.motif_remise}
                            onChange={e => onChange('motif_remise', e.target.value)}
                            className={inputCls(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
