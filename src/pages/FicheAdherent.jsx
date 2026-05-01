import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useParametres } from '../hooks/useParametres'
import {
  calculateAge, computeFinancial, computeEcheancier,
  formatMontant, formatModePaiement,
} from '../lib/calculs'

const STATUTS = {
  creation:        { label: 'En création', cls: 'bg-gray-100 text-gray-600' },
  pre_inscription: { label: 'Pré-inscrit', cls: 'bg-amber-100 text-amber-700' },
  complete:        { label: 'Inscrit',      cls: 'bg-green-100 text-green-700' },
}

export default function FicheAdherent() {
  const { id } = useParams() // id = adhesion.id
  const { parametres } = useParametres()

  const [adhesion, setAdhesion]           = useState(null)
  const [autresAdhesions, setAutresAdhesions] = useState([])
  const [responsables, setResponsables]   = useState([])
  const [pointages, setPointages]         = useState([])
  const [coursInscrits, setCoursInscrits] = useState(0)
  const [loading, setLoading]             = useState(true)
  const [notFound, setNotFound]           = useState(false)

  useEffect(() => {
    async function fetchAll() {
      // Fetch l'adhésion avec toutes les données jointes
      const { data, error } = await supabase
        .from('adhesions')
        .select(`
          *,
          saison:saison_id(id, libelle),
          adherent:adherent_id(id, nom, prenom, email, telephone, adresse, date_naissance, galop, droit_image, created_at),
          cours:cours_id(*),
          forfait:forfait_id(*),
          forfait2:forfait2_id(*)
        `)
        .eq('id', id)
        .single()

      if (error || !data) { setNotFound(true); setLoading(false); return }
      setAdhesion(data)

      const adherentId = data.adherent_id

      // Toutes les autres adhésions de cet adhérent (historique)
      const { data: autresData } = await supabase
        .from('adhesions')
        .select('id, statut, saison:saison_id(libelle), cours:cours_id(nom), forfait:forfait_id(libelle)')
        .eq('adherent_id', adherentId)
        .neq('id', id)
        .order('created_at', { ascending: false })

      setAutresAdhesions(autresData ?? [])

      // Responsables légaux
      const { data: respData } = await supabase
        .from('responsables')
        .select('*')
        .eq('adherent_id', adherentId)
        .order('rang')

      setResponsables(respData ?? [])

      // Pointages de cet adhérent (toutes saisons)
      const { data: pointagesData } = await supabase
        .from('pointages')
        .select('id, date')
        .eq('adherent_id', adherentId)
        .order('date', { ascending: false })

      setPointages(pointagesData ?? [])

      // Nombre d'inscrits dans le même cours (pour cette adhesion)
      if (data.cours_id) {
        const { count } = await supabase
          .from('adhesions')
          .select('*', { count: 'exact', head: true })
          .eq('cours_id', data.cours_id)
          .eq('saison_id', data.saison_id)
        setCoursInscrits(count ?? 0)
      }

      setLoading(false)
    }

    fetchAll()
  }, [id])

  async function handleStatutChange(newStatut) {
    setAdhesion(prev => ({ ...prev, statut: newStatut }))
    await supabase.from('adhesions').update({ statut: newStatut }).eq('id', id)
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 font-medium">Inscription introuvable</p>
        <Link to="/adhesions" className="text-brand-600 hover:text-brand-800 text-sm mt-2 inline-block">
          ← Retour à la liste
        </Link>
      </div>
    )
  }

  const adherent  = adhesion.adherent
  const age       = calculateAge(adherent.date_naissance)
  const isMinor   = age !== null && age < 18
  const forfait1  = adhesion.forfait  ?? null
  const forfait2  = adhesion.forfait2 ?? null
  const cours     = adhesion.cours    ?? null

  const { total, licenceMontant, remiseAppliquee, prixForfait1, prixForfait2 } = computeFinancial({
    forfait1, forfait2, remiseFamille: adhesion.remise_famille, age, parametres,
  })
  const echeancier = computeEcheancier(total, adhesion.mode_paiement)

  const seancesConso    = pointages.length
  const seancesTotal    = forfait1?.nb_seances ?? null
  const pct             = seancesTotal ? Math.min(100, (seancesConso / seancesTotal) * 100) : null
  const placesRestantes = cours ? cours.capacite - coursInscrits : null

  const statut = STATUTS[adhesion.statut] ?? STATUTS.creation

  return (
    <div className="p-8 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link to="/adhesions" className="text-sm text-gray-400 hover:text-gray-600 mb-1 inline-block">
            ← Retour à la liste
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {adherent.prenom} {adherent.nom}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {adhesion.saison && (
              <span className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded-full font-medium">
                Saison {adhesion.saison.libelle}
              </span>
            )}
            <p className="text-sm text-gray-400">
              Inscrit le {new Date(adhesion.created_at).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <select
            value={adhesion.statut ?? 'creation'}
            onChange={e => handleStatutChange(e.target.value)}
            className={`text-sm font-medium px-3 py-1.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 ${statut.cls}`}
          >
            {Object.entries(STATUTS).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* ── Colonne principale ── */}
        <div className="col-span-2 space-y-5">

          {/* Cavalier */}
          <Section title="Informations cavalier">
            <Grid>
              <Info label="Nom"               value={adherent.nom} />
              <Info label="Prénom"            value={adherent.prenom} />
              <Info label="Date de naissance"
                value={`${new Date(adherent.date_naissance).toLocaleDateString('fr-FR')} — ${age} ans`} />
              <Info label="Galop"             value={adherent.galop} />
              <Info label="Email"             value={adherent.email} />
              <Info label="Téléphone"         value={adherent.telephone} />
              <Info label="Droit à l'image"   value={adherent.droit_image ? 'Oui' : 'Non'} />
              <Info label="Adresse"           value={adherent.adresse} full />
            </Grid>
          </Section>

          {/* Responsables légaux */}
          {isMinor && responsables.length > 0 && (
            <Section title="Responsables légaux">
              {responsables.map((r, i) => (
                <div key={r.id} className={i > 0 ? 'mt-5 pt-5 border-t border-gray-100' : ''}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Responsable {r.rang}
                  </p>
                  <Grid>
                    <Info label="Nom Prénom" value={r.nom_prenom} />
                    <Info label="Téléphone"  value={r.telephone} />
                    <Info label="Adresse"
                      value={r.meme_adresse ? 'Même adresse que le cavalier' : r.adresse}
                      full />
                  </Grid>
                </div>
              ))}
            </Section>
          )}

          {/* Cours */}
          {cours && (
            <Section title="Cours">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">{cours.nom}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {cours.jour} · {cours.heure_debut?.slice(0, 5)} – {cours.heure_fin?.slice(0, 5)}
                  </p>
                  {cours.niveaux?.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {cours.niveaux.map(n => (
                        <span key={n} className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded-full">
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {placesRestantes !== null && (
                  <div className="shrink-0 text-right min-w-[140px]">
                    <p className="text-xs text-gray-500 mb-1.5">
                      {coursInscrits} / {cours.capacite} inscrits
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${placesRestantes === 0 ? 'bg-red-500' : 'bg-brand-500'}`}
                        style={{ width: `${Math.min(100, (coursInscrits / cours.capacite) * 100)}%` }}
                      />
                    </div>
                    <p className={`text-xs mt-1 ${placesRestantes === 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                      {placesRestantes === 0 ? 'Complet' : `${placesRestantes} place${placesRestantes > 1 ? 's' : ''} restante${placesRestantes > 1 ? 's' : ''}`}
                    </p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Conso séances */}
          <Section title="Consommation des séances">
            {seancesTotal === null ? (
              <p className="text-sm text-gray-500">Forfait annuel — séances illimitées</p>
            ) : (
              <>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">
                    {seancesConso} séance{seancesConso > 1 ? 's' : ''} effectuée{seancesConso > 1 ? 's' : ''}
                  </span>
                  <span className={`font-semibold ${pct >= 100 ? 'text-red-600' : pct >= 75 ? 'text-amber-600' : 'text-brand-700'}`}>
                    {seancesConso} / {seancesTotal}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div
                    className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-brand-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {pointages.length > 0 ? (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Dernières séances pointées
                    </p>
                    <div className="space-y-1.5">
                      {pointages.slice(0, 8).map(p => (
                        <div key={p.id} className="flex items-center text-sm">
                          <span className="w-2 h-2 rounded-full bg-brand-400 mr-3 shrink-0" />
                          <span className="text-gray-600">
                            {new Date(p.date).toLocaleDateString('fr-FR', {
                              weekday: 'long', day: 'numeric', month: 'long',
                            })}
                          </span>
                        </div>
                      ))}
                      {pointages.length > 8 && (
                        <p className="text-xs text-gray-400 pl-5 pt-1">
                          + {pointages.length - 8} séances antérieures
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">Aucune séance pointée pour l'instant.</p>
                )}
              </>
            )}
          </Section>

          {/* Historique des saisons */}
          {autresAdhesions.length > 0 && (
            <Section title="Historique des saisons">
              <div className="space-y-2">
                {autresAdhesions.map(a => (
                  <Link
                    key={a.id}
                    to={`/adhesions/${a.id}`}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">
                        Saison {a.saison?.libelle ?? '—'}
                      </span>
                      {a.cours?.nom && (
                        <span className="text-xs text-gray-400 ml-2">· {a.cours.nom}</span>
                      )}
                      {a.forfait?.libelle && (
                        <span className="text-xs text-gray-400 ml-2">· {a.forfait.libelle}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUTS[a.statut]?.cls ?? ''}`}>
                        {STATUTS[a.statut]?.label ?? a.statut}
                      </span>
                      <span className="text-gray-300 group-hover:text-brand-500 text-xs transition-colors">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* ── Colonne financière ── */}
        <div className="space-y-5">
          <Section title="Récapitulatif financier">
            <div className="space-y-2 text-sm">
              {forfait1 && <Row label={forfait1.libelle} value={`${prixForfait1} €`} />}
              {forfait2 && <Row label={forfait2.libelle} value={`${prixForfait2} €`} />}
              {remiseAppliquee > 0 && (
                <Row label="Remise" value={`−${remiseAppliquee} €`} green />
              )}
              <Row
                label={`Licence FFE ${age < 18 ? '(< 18 ans)' : '(≥ 18 ans)'}`}
                value={`${licenceMontant} €`}
              />
              <div className="border-t pt-2 mt-1">
                <Row label="Total général" value={formatMontant(total)} bold />
              </div>
              <div className="border-t pt-2 space-y-1.5">
                <Row label="Paiement"  value={formatModePaiement(adhesion.mode_paiement)} />
                <Row label="Règlement" value={adhesion.mode_reglement ?? '—'} />
              </div>
              {adhesion.remise_famille && (
                <div className="border-t pt-2">
                  <p className="text-xs text-gray-400 mb-0.5">Remise famille</p>
                  <p className="text-gray-700">{adhesion.remise_famille_nom || '—'}</p>
                </div>
              )}
            </div>
          </Section>

          {adhesion.mode_paiement !== '1_fois' && (
            <Section title={`Échéancier (${adhesion.mode_paiement === '3_fois' ? '3 fois' : '10 fois'})`}>
              <div className="space-y-2">
                {echeancier.map((e, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-500">{e.label}</span>
                    <span className="font-medium text-gray-800">{e.montant} €</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Grid({ children }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
}

function Info({ label, value, full }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  )
}

function Row({ label, value, bold, green }) {
  return (
    <div className={`flex justify-between gap-2 ${green ? 'text-green-600' : ''}`}>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-500'}>{label}</span>
      <span className={`text-right ${bold ? 'font-bold text-gray-900' : 'text-gray-800'}`}>{value}</span>
    </div>
  )
}
