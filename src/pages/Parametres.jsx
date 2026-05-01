import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useSaison } from '../contexts/SaisonContext'

// ── Utilitaires semaines ISO ──────────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return {
    num:  Math.ceil((((d - yearStart) / 86400000) + 1) / 7),
    year: d.getUTCFullYear(),
  }
}

function getMondayOfISOWeek(num, year) {
  const jan4    = new Date(Date.UTC(year, 0, 4))
  const jan4day = jan4.getUTCDay() || 7
  const monday  = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - jan4day + 1 + (num - 1) * 7)
  return monday
}

function generateWeeks(debutStr, finStr) {
  if (!debutStr || !finStr) return []
  const debut = new Date(debutStr)
  const fin   = new Date(finStr)
  if (debut > fin) return []
  const { num, year } = getISOWeek(debut)
  let current = getMondayOfISOWeek(num, year)
  const weeks = []
  while (current <= fin) {
    const { num: w, year: y } = getISOWeek(current)
    const sunday = new Date(current)
    sunday.setUTCDate(sunday.getUTCDate() + 6)
    weeks.push({ key: `${y}-W${String(w).padStart(2, '0')}`, num: w, year: y, start: new Date(current), end: sunday })
    current = new Date(current)
    current.setUTCDate(current.getUTCDate() + 7)
  }
  return weeks
}

function groupByMonth(weeks) {
  const map = new Map()
  weeks.forEach(w => {
    const k     = `${w.start.getUTCFullYear()}-${w.start.getUTCMonth()}`
    const label = w.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    if (!map.has(k)) map.set(k, { label, weeks: [] })
    map.get(k).weeks.push(w)
  })
  return [...map.values()]
}

const fmtShort = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// ── Modes de règlement par défaut ─────────────────────────────────────────────
const REGLEMENT_DEFAUT = ['Chèque', 'Virement', 'Carte bancaire', 'Espèces']

// ── Forfait vide ─────────────────────────────────────────────────────────────
const INIT_FORFAIT = { libelle: '', prix: '', nb_seances: '', age_min: '', age_max: '' }

// ── Page Paramètres ───────────────────────────────────────────────────────────

export default function Parametres() {
  const { saisons, creerSaison, setActive: setSaisonActive, refreshSaisons } = useSaison()

  // ── Saisons
  const [newAnnee, setNewAnnee]           = useState('')
  const [creantSaison, setCreantSaison]   = useState(false)
  const [saisonError, setSaisonError]     = useState('')
  const [togglingActive, setTogglingActive] = useState(null)

  const [loading, setLoading] = useState(true)

  // ── Calendrier
  const [debut, setDebut]         = useState('')
  const [fin, setFin]             = useState('')
  const [inactives, setInactives] = useState(new Set())
  const [savingSaison, setSavingSaison] = useState(false)
  const [savedSaison, setSavedSaison]   = useState(false)

  // ── Licence & remises
  const [licenceMineur, setLicenceMineur]       = useState('25')
  const [licenceMajeur, setLicenceMajeur]       = useState('36')
  const [remise2Forfait, setRemise2Forfait]     = useState('50')
  const [savingTarifs, setSavingTarifs]         = useState(false)
  const [savedTarifs, setSavedTarifs]           = useState(false)

  // ── Modes de règlement
  const [reglements, setReglements]             = useState([])
  const [newReglement, setNewReglement]         = useState('')
  const [savingRegl, setSavingRegl]             = useState(false)
  const [savedRegl, setSavedRegl]               = useState(false)

  // ── Forfaits
  const [forfaits, setForfaits]                 = useState([])
  const [loadingForfaits, setLoadingForfaits]   = useState(true)
  const [showForfaitForm, setShowForfaitForm]   = useState(false)
  const [editingForfait, setEditingForfait]     = useState(null)
  const [forfaitForm, setForfaitForm]           = useState(INIT_FORFAIT)
  const [forfaitErrors, setForfaitErrors]       = useState({})
  const [savingForfait, setSavingForfait]       = useState(false)

  // ── Chargement initial
  useEffect(() => {
    supabase.from('parametres').select('cle, valeur').then(({ data }) => {
      if (data) {
        const map = Object.fromEntries(data.map(p => [p.cle, p.valeur]))
        if (map.calendrier_saison) {
          try {
            const cal = JSON.parse(map.calendrier_saison)
            setDebut(cal.debut ?? '')
            setFin(cal.fin ?? '')
            setInactives(new Set(cal.inactives ?? []))
          } catch {}
        }
        if (map.licence_mineur)      setLicenceMineur(map.licence_mineur)
        if (map.licence_majeur)      setLicenceMajeur(map.licence_majeur)
        if (map.remise_2eme_forfait) setRemise2Forfait(map.remise_2eme_forfait)
        if (map.modes_reglement) {
          try { setReglements(JSON.parse(map.modes_reglement)) } catch {}
        } else {
          setReglements(REGLEMENT_DEFAUT)
        }
      } else {
        setReglements(REGLEMENT_DEFAUT)
      }
      setLoading(false)
    })

    supabase.from('forfaits').select('*').order('prix').then(({ data }) => {
      setForfaits(data ?? [])
      setLoadingForfaits(false)
    })
  }, [])

  // ── Calendrier
  const weeks  = useMemo(() => generateWeeks(debut, fin), [debut, fin])
  const groups = useMemo(() => groupByMonth(weeks), [weeks])
  const nbActives = weeks.length - inactives.size

  function toggleWeek(key) {
    setInactives(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleAllWeeks(active) {
    if (active) setInactives(new Set())
    else setInactives(new Set(weeks.map(w => w.key)))
  }

  async function saveSaison() {
    setSavingSaison(true)
    const payload = { debut, fin, inactives: [...inactives] }
    await supabase.from('parametres').upsert(
      { cle: 'calendrier_saison', valeur: JSON.stringify(payload) },
      { onConflict: 'cle' }
    )
    setSavingSaison(false)
    setSavedSaison(true)
    setTimeout(() => setSavedSaison(false), 2000)
  }

  // ── Tarifs & remises
  async function saveTarifs() {
    setSavingTarifs(true)
    await Promise.all([
      supabase.from('parametres').upsert({ cle: 'licence_mineur',      valeur: licenceMineur },      { onConflict: 'cle' }),
      supabase.from('parametres').upsert({ cle: 'licence_majeur',      valeur: licenceMajeur },      { onConflict: 'cle' }),
      supabase.from('parametres').upsert({ cle: 'remise_2eme_forfait', valeur: remise2Forfait },     { onConflict: 'cle' }),
    ])
    setSavingTarifs(false)
    setSavedTarifs(true)
    setTimeout(() => setSavedTarifs(false), 2000)
  }

  // ── Modes de règlement
  async function saveReglements(list) {
    setSavingRegl(true)
    await supabase.from('parametres').upsert(
      { cle: 'modes_reglement', valeur: JSON.stringify(list) },
      { onConflict: 'cle' }
    )
    setSavingRegl(false)
    setSavedRegl(true)
    setTimeout(() => setSavedRegl(false), 1500)
  }

  function addReglement() {
    const val = newReglement.trim()
    if (!val || reglements.includes(val)) return
    const next = [...reglements, val]
    setReglements(next)
    setNewReglement('')
    saveReglements(next)
  }

  function removeReglement(r) {
    const next = reglements.filter(x => x !== r)
    setReglements(next)
    saveReglements(next)
  }

  // ── Forfaits CRUD
  function openCreateForfait() {
    setEditingForfait(null)
    setForfaitForm(INIT_FORFAIT)
    setForfaitErrors({})
    setShowForfaitForm(true)
  }

  function openEditForfait(f) {
    setEditingForfait(f.id)
    setForfaitForm({
      libelle:    f.libelle,
      prix:       String(f.prix),
      nb_seances: f.nb_seances !== null ? String(f.nb_seances) : '',
      age_min:    f.age_min !== null ? String(f.age_min) : '',
      age_max:    f.age_max !== null ? String(f.age_max) : '',
    })
    setForfaitErrors({})
    setShowForfaitForm(true)
  }

  function validateForfait() {
    const e = {}
    if (!forfaitForm.libelle.trim())                                      e.libelle = 'Requis'
    if (!forfaitForm.prix || isNaN(Number(forfaitForm.prix)))             e.prix    = 'Nombre requis'
    return e
  }

  async function saveForfait() {
    const e = validateForfait()
    if (Object.keys(e).length) { setForfaitErrors(e); return }
    setSavingForfait(true)

    const payload = {
      libelle:    forfaitForm.libelle.trim(),
      prix:       Number(forfaitForm.prix),
      nb_seances: forfaitForm.nb_seances !== '' ? Number(forfaitForm.nb_seances) : null,
      age_min:    forfaitForm.age_min    !== '' ? Number(forfaitForm.age_min)    : null,
      age_max:    forfaitForm.age_max    !== '' ? Number(forfaitForm.age_max)    : null,
    }

    if (editingForfait) {
      await supabase.from('forfaits').update(payload).eq('id', editingForfait)
    } else {
      await supabase.from('forfaits').insert(payload)
    }

    const { data } = await supabase.from('forfaits').select('*').order('prix')
    setForfaits(data ?? [])
    setSavingForfait(false)
    setShowForfaitForm(false)
  }

  async function deleteForfait(f) {
    if (!window.confirm(`Supprimer le forfait "${f.libelle}" ?`)) return
    await supabase.from('forfaits').delete().eq('id', f.id)
    setForfaits(prev => prev.filter(x => x.id !== f.id))
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  async function handleCreerSaison() {
    setSaisonError('')
    const annee = parseInt(newAnnee, 10)
    if (!annee || annee < 2000 || annee > 2100) {
      setSaisonError("Saisissez une année valide (ex : 2027)")
      return
    }
    const libelle = `${annee}-${annee + 1}`
    if (saisons.find(s => s.libelle === libelle)) {
      setSaisonError(`La saison ${libelle} existe déjà`)
      return
    }
    setCreantSaison(true)
    try {
      await creerSaison(annee)
      setNewAnnee('')
    } catch (e) {
      setSaisonError(e.message)
    }
    setCreantSaison(false)
  }

  async function handleSetActive(saisonId) {
    setTogglingActive(saisonId)
    await setSaisonActive(saisonId)
    setTogglingActive(null)
  }

  return (
    <div className="p-8 max-w-5xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>

      {/* ── Saisons ── */}
      <Section title="Saisons">
        <div className="space-y-2 mb-5">
          {saisons.length === 0 && (
            <p className="text-sm text-gray-400 italic">Aucune saison créée.</p>
          )}
          {saisons.map(s => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 gap-3">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900">{s.libelle}</span>
                {s.active && (
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-semibold">
                    ✦ Active (inscription publique)
                  </span>
                )}
              </div>
              {!s.active && (
                <button
                  onClick={() => handleSetActive(s.id)}
                  disabled={togglingActive === s.id}
                  className="text-xs text-gray-500 hover:text-brand-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand-300 transition-colors disabled:opacity-50"
                >
                  {togglingActive === s.id ? 'Activation…' : 'Rendre active'}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Créer une nouvelle saison */}
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Nouvelle saison — année de début">
            <input
              type="number"
              min="2020"
              max="2100"
              value={newAnnee}
              onChange={e => { setNewAnnee(e.target.value); setSaisonError('') }}
              onKeyDown={e => e.key === 'Enter' && handleCreerSaison()}
              placeholder="Ex : 2027"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
            />
          </Field>
          <div className="pb-0.5">
            {newAnnee && !isNaN(parseInt(newAnnee)) && (
              <p className="text-xs text-gray-400 mb-1.5">
                Créera la saison <strong>{newAnnee}-{parseInt(newAnnee) + 1}</strong>
              </p>
            )}
            <button
              onClick={handleCreerSaison}
              disabled={creantSaison}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {creantSaison ? 'Création…' : '+ Créer la saison'}
            </button>
          </div>
        </div>
        {saisonError && (
          <p className="text-sm text-red-500 mt-2">{saisonError}</p>
        )}
        <p className="text-xs text-gray-400 mt-3">
          La saison <strong>active</strong> est celle utilisée pour le formulaire de pré-inscription public.
          Les cours et adhérents créés sont toujours liés à la saison sélectionnée dans la barre latérale.
        </p>
      </Section>

      {/* ── Calendrier de la saison ── */}
      <Section title="Calendrier de la saison">
        <div className="flex items-end gap-4 mb-6 flex-wrap">
          <Field label="Date de début">
            <input type="date" value={debut} onChange={e => setDebut(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </Field>
          <Field label="Date de fin">
            <input type="date" value={fin} onChange={e => setFin(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </Field>
          {weeks.length > 0 && (
            <div className="pb-0.5 text-sm text-gray-500">
              <span className="font-semibold text-brand-700">{nbActives}</span> semaines actives
              <span className="text-gray-300 mx-2">·</span>
              {weeks.length} au total
            </div>
          )}
        </div>

        {weeks.length === 0 ? (
          <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Renseignez les dates de début et de fin pour générer le calendrier.
          </div>
        ) : (
          <>
            <div className="flex gap-3 mb-5">
              <button onClick={() => toggleAllWeeks(true)}
                className="text-xs text-gray-500 hover:text-brand-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand-300 transition-colors">
                Tout cocher
              </button>
              <button onClick={() => toggleAllWeeks(false)}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 transition-colors">
                Tout décocher
              </button>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex items-center gap-1 min-w-max">
                {groups.map((group, gi) => (
                  <div key={group.label} className="flex items-center gap-1">
                    <div className={`flex flex-col items-center ${gi > 0 ? 'ml-2' : ''}`}>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 whitespace-nowrap capitalize">
                        {group.label.replace(/\s\d{4}/, '')}
                      </span>
                      <div className="flex gap-1">
                        {group.weeks.map(w => {
                          const active = !inactives.has(w.key)
                          return (
                            <button key={w.key} onClick={() => toggleWeek(w.key)}
                              title={`Semaine ${w.num} · ${fmtShort(w.start)} – ${fmtShort(w.end)}`}
                              className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all select-none border ${
                                active ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                              }`}>
                              {w.num}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {gi < groups.length - 1 && <div className="w-px h-10 bg-gray-200 ml-2 self-end mb-0" />}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 pt-5 border-t border-gray-100">
              <button onClick={saveSaison} disabled={savingSaison}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                {savingSaison ? 'Enregistrement…' : 'Enregistrer le calendrier'}
              </button>
              {savedSaison && <span className="text-sm text-green-600 font-medium">✓ Enregistré</span>}
            </div>
          </>
        )}
      </Section>

      {/* ── Forfaits ── */}
      <Section title="Forfaits">
        {loadingForfaits ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : (
          <>
            {forfaits.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">Aucun forfait créé.</p>
            ) : (
              <div className="mb-4 rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Libellé</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Prix</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Séances</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Âge</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {forfaits.map(f => (
                      <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{f.libelle}</td>
                        <td className="px-4 py-3 text-gray-700">{Number(f.prix)} €</td>
                        <td className="px-4 py-3 text-gray-500">
                          {f.nb_seances !== null ? `${f.nb_seances} séances` : <span className="italic text-gray-400">Annuel</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {f.age_min !== null || f.age_max !== null
                            ? [f.age_min !== null ? `${f.age_min} ans` : null, f.age_max !== null ? `${f.age_max} ans` : null]
                                .filter(Boolean).join(' – ')
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEditForfait(f)}
                              className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
                              Modifier
                            </button>
                            <button onClick={() => deleteForfait(f)}
                              className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={openCreateForfait}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + Nouveau forfait
            </button>
          </>
        )}
      </Section>

      {/* ── Licence FFE & Remises ── */}
      <Section title="Licence FFE & Remises">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
          <Field label="Licence FFE — mineur (€)">
            <input type="number" min="0" value={licenceMineur} onChange={e => setLicenceMineur(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </Field>
          <Field label="Licence FFE — majeur (€)">
            <input type="number" min="0" value={licenceMajeur} onChange={e => setLicenceMajeur(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </Field>
          <Field label="Remise 2ème forfait / famille (€)">
            <input type="number" min="0" value={remise2Forfait} onChange={e => setRemise2Forfait(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveTarifs} disabled={savingTarifs}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
            {savingTarifs ? 'Enregistrement…' : 'Enregistrer les tarifs'}
          </button>
          {savedTarifs && <span className="text-sm text-green-600 font-medium">✓ Enregistré</span>}
        </div>
      </Section>

      {/* ── Modes de règlement ── */}
      <Section title="Modes de règlement">
        <div className="flex flex-wrap gap-2 mb-4">
          {reglements.map(r => (
            <div key={r} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1.5">
              <span className="text-sm text-gray-700">{r}</span>
              <button onClick={() => removeReglement(r)}
                className="text-gray-400 hover:text-red-500 transition-colors text-xs leading-none"
                title="Supprimer">
                ×
              </button>
            </div>
          ))}
          {reglements.length === 0 && (
            <p className="text-sm text-gray-400 italic">Aucun mode de règlement configuré.</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ajouter un mode…"
            value={newReglement}
            onChange={e => setNewReglement(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addReglement()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-52"
          />
          <button onClick={addReglement}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Ajouter
          </button>
          {savedRegl && <span className="text-sm text-green-600 font-medium self-center">✓ Enregistré</span>}
        </div>
      </Section>

      {/* ── Modal forfait ── */}
      {showForfaitForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingForfait ? 'Modifier le forfait' : 'Nouveau forfait'}
              </h2>
              <button onClick={() => setShowForfaitForm(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Libellé */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Libellé *</label>
                <input type="text" value={forfaitForm.libelle}
                  onChange={e => setForfaitForm(f => ({ ...f, libelle: e.target.value }))}
                  className={`w-full rounded-lg border ${forfaitErrors.libelle ? 'border-red-400' : 'border-gray-300'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500`}
                  placeholder="Ex : Galop 1-3 — 30 séances" autoFocus />
                {forfaitErrors.libelle && <p className="text-xs text-red-500 mt-1">{forfaitErrors.libelle}</p>}
              </div>

              {/* Prix */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix (€) *</label>
                <input type="number" min="0" value={forfaitForm.prix}
                  onChange={e => setForfaitForm(f => ({ ...f, prix: e.target.value }))}
                  className={`w-full rounded-lg border ${forfaitErrors.prix ? 'border-red-400' : 'border-gray-300'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500`}
                  placeholder="Ex : 450" />
                {forfaitErrors.prix && <p className="text-xs text-red-500 mt-1">{forfaitErrors.prix}</p>}
              </div>

              {/* Nombre de séances */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de séances <span className="font-normal text-gray-400">(vide = annuel illimité)</span>
                </label>
                <input type="number" min="0" value={forfaitForm.nb_seances}
                  onChange={e => setForfaitForm(f => ({ ...f, nb_seances: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Ex : 30" />
              </div>

              {/* Tranche d'âge */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tranche d'âge <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input type="number" min="0" value={forfaitForm.age_min}
                      onChange={e => setForfaitForm(f => ({ ...f, age_min: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Âge min" />
                  </div>
                  <div>
                    <input type="number" min="0" value={forfaitForm.age_max}
                      onChange={e => setForfaitForm(f => ({ ...f, age_max: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Âge max" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowForfaitForm(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                Annuler
              </button>
              <button onClick={saveForfait} disabled={savingForfait}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors">
                {savingForfait ? 'Enregistrement…' : editingForfait ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-5">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
