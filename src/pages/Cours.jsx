import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCours } from '../hooks/useCours'
import { supabase } from '../lib/supabase'
import { GALOPS } from '../lib/calculs'
import { useAuth } from '../contexts/AuthContext'
import { useSaison } from '../contexts/SaisonContext'
import { STATUTS } from '../lib/constants'
import { inputCls } from '../lib/ui'
import TrashIcon from '../components/TrashIcon'
import LoadingSpinner from '../components/LoadingSpinner'

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const JOUR_ORDER = Object.fromEntries(JOURS.map((j, i) => [j, i]))

const INIT_FORM = {
  nom: '', jour: '', heure_debut: '', heure_fin: '',
  niveaux: [], capacite: '', description: '', moniteur_id: '',
}

function SortIcon({ col, sortCol, sortDir }) {
  const active = sortCol === col
  return (
    <span className={`inline-flex flex-col ml-1.5 gap-[2px] ${active ? 'opacity-100' : 'opacity-30'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4" className={`w-1.5 h-1 ${active && sortDir === 'asc' ? 'text-brand-600' : 'text-current'}`} fill="currentColor"><path d="M3 0 6 4H0z"/></svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4" className={`w-1.5 h-1 ${active && sortDir === 'desc' ? 'text-brand-600' : 'text-current'}`} fill="currentColor"><path d="M3 4 0 0h6z"/></svg>
    </span>
  )
}

export default function Cours() {
  const { profile } = useAuth()
  const isGerant = profile?.role === 'gérant'
  const { saisonCourante } = useSaison()

  const { cours, loading, refetch } = useCours(saisonCourante?.id ?? null)
  const [moniteurs, setMoniteurs]   = useState([])

  // ── Tri + filtre ───────────────────────────────────────────────────────────
  const [sortCol, setSortCol]   = useState('jour')
  const [sortDir, setSortDir]   = useState('asc')
  const [filterJour, setFilterJour] = useState('')

  // ── Panneau fiche ──────────────────────────────────────────────────────────
  const [selectedCours, setSelectedCours] = useState(null)
  const [ficheTab, setFicheTab]           = useState('infos')
  const [eleves, setEleves]               = useState([])
  const [loadingEleves, setLoadingEleves] = useState(false)

  // ── Formulaire (dans la fiche + modal création) ────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm]             = useState(INIT_FORM)
  const [errors, setErrors]         = useState({})
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, nom, prenom')
      .eq('role', 'moniteur')
      .order('nom')
      .then(({ data }) => setMoniteurs(data ?? []))
  }, [])

  // ── Fiche cours ────────────────────────────────────────────────────────────
  async function openFiche(c) {
    setSelectedCours(c)
    setFicheTab('infos')
    setErrors({})
    setForm({
      nom:         c.nom,
      jour:        c.jour,
      heure_debut: c.heure_debut?.slice(0, 5) ?? '',
      heure_fin:   c.heure_fin?.slice(0, 5) ?? '',
      niveaux:     c.niveaux ?? [],
      capacite:    String(c.capacite),
      description: c.description ?? '',
      moniteur_id: c.moniteur_id ?? '',
    })
    // Charger les élèves via adhesions
    setLoadingEleves(true)
    const { data } = await supabase
      .from('adhesions')
      .select('id, statut, adherent:adherent_id(id, nom, prenom, galop)')
      .eq('cours_id', c.id)
      .eq('saison_id', saisonCourante?.id ?? '')
    // Tri côté client par nom
    const sorted = (data ?? []).sort((a, b) =>
      (a.adherent?.nom ?? '').localeCompare(b.adherent?.nom ?? '')
    )
    setEleves(sorted)
    setLoadingEleves(false)
  }

  function closeFiche() {
    setSelectedCours(null)
    setEleves([])
  }

  // ── Création ───────────────────────────────────────────────────────────────
  function openCreate() {
    setForm(INIT_FORM)
    setErrors({})
    setShowCreate(true)
  }

  // ── Champs ─────────────────────────────────────────────────────────────────
  function setField(name, value) {
    setForm(prev => ({ ...prev, [name]: value }))
    setErrors(prev => { const next = { ...prev }; delete next[name]; return next })
  }

  function toggleNiveau(g) {
    setForm(prev => ({
      ...prev,
      niveaux: prev.niveaux.includes(g)
        ? prev.niveaux.filter(n => n !== g)
        : [...prev.niveaux, g],
    }))
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate() {
    const e = {}
    if (!form.nom.trim()) e.nom = 'Requis'
    if (!form.jour) e.jour = 'Requis'
    if (!form.heure_debut) e.heure_debut = 'Requis'
    if (!form.heure_fin) e.heure_fin = 'Requis'
    if (!form.capacite || isNaN(Number(form.capacite)) || Number(form.capacite) < 1)
      e.capacite = 'Entier > 0 requis'
    return e
  }

  // ── Sauvegarde ─────────────────────────────────────────────────────────────
  async function handleSave(editingId = null) {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)

    const payload = {
      nom:         form.nom.trim(),
      jour:        form.jour,
      heure_debut: form.heure_debut,
      heure_fin:   form.heure_fin,
      niveaux:     form.niveaux,
      capacite:    Number(form.capacite),
      description: form.description.trim() || null,
      moniteur_id: form.moniteur_id || null,
      saison_id:   saisonCourante?.id ?? null,
    }

    if (editingId) {
      await supabase.from('cours').update(payload).eq('id', editingId)
    } else {
      await supabase.from('cours').insert(payload)
    }

    setSaving(false)
    setShowCreate(false)
    await refetch()

    // Rafraîchir la fiche si on était en édition
    if (editingId) {
      const updated = await supabase.from('cours').select('*, moniteur:moniteur_id(id, nom, prenom)').eq('id', editingId).single()
      if (updated.data) {
        const counts = cours.find(c => c.id === editingId)
        setSelectedCours({ ...updated.data, inscrits: counts?.inscrits ?? 0, placesRestantes: (updated.data.capacite - (counts?.inscrits ?? 0)) })
      }
    }
  }

  // ── Suppression ────────────────────────────────────────────────────────────
  async function handleDelete(c) {
    const msg = c.inscrits > 0
      ? `${c.inscrits} adhérent(s) sont inscrits à ce cours. Supprimer quand même ?`
      : `Supprimer le cours "${c.nom}" ?`
    if (!window.confirm(msg)) return
    await supabase.from('cours').delete().eq('id', c.id)
    closeFiche()
    refetch()
  }

  // ── Tri + filtre ───────────────────────────────────────────────────────────
  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const coursFiltres = useMemo(() => {
    let list = filterJour ? cours.filter(c => c.jour === filterJour) : [...cours]
    list.sort((a, b) => {
      let va, vb
      switch (sortCol) {
        case 'jour': {
          const jDiff = (JOUR_ORDER[a.jour] ?? 99) - (JOUR_ORDER[b.jour] ?? 99)
          if (jDiff !== 0) return sortDir === 'asc' ? jDiff : -jDiff
          va = a.heure_debut ?? ''; vb = b.heure_debut ?? ''; break
        }
        case 'nom':       va = a.nom ?? '';            vb = b.nom ?? '';            break
        case 'moniteur':  va = a.moniteur?.prenom ?? ''; vb = b.moniteur?.prenom ?? ''; break
        case 'places':    va = a.inscrits / (a.capacite || 1); vb = b.inscrits / (b.capacite || 1); break
        default:          va = a[sortCol] ?? '';        vb = b[sortCol] ?? ''
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [cours, filterJour, sortCol, sortDir])

  const thBase = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors'
  const thCls  = col => `${thBase} ${sortCol === col ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`
  const td = 'px-4 py-3.5 text-sm text-gray-800'

  return (
    <div className="p-6 md:p-8 flex gap-6 min-h-full">

      {/* ── Colonne principale ───────────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 transition-all ${selectedCours ? 'hidden md:block' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestion des cours</h1>
            {saisonCourante && <p className="text-sm text-gray-500 mt-0.5">Saison {saisonCourante.libelle}</p>}
          </div>
          {isGerant && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-150"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nouveau cours
            </button>
          )}
        </div>

        {/* Filtre jour */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilterJour('')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!filterJour ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
          >
            Tous
          </button>
          {JOURS.filter(j => cours.some(c => c.jour === j)).map(j => (
            <button
              key={j}
              onClick={() => setFilterJour(j === filterJour ? '' : j)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${filterJour === j ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              {j}
            </button>
          ))}
        </div>

        {/* Tableau */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : coursFiltres.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium text-sm">
                {cours.length === 0 ? 'Aucun cours créé' : 'Aucun cours ce jour-là'}
              </p>
              {filterJour && <button onClick={() => setFilterJour('')} className="text-brand-600 hover:text-brand-800 text-xs font-medium">Voir tous les jours</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className={thCls('jour')}     onClick={() => toggleSort('jour')}>
                        <span className="flex items-center">Jour <SortIcon col="jour" sortCol={sortCol} sortDir={sortDir} /></span>
                      </th>
                      <th className={`${thBase} text-gray-500 cursor-default hover:bg-transparent`}>Horaire</th>
                      <th className={thCls('nom')}      onClick={() => toggleSort('nom')}>
                        <span className="flex items-center">Cours <SortIcon col="nom" sortCol={sortCol} sortDir={sortDir} /></span>
                      </th>
                      <th className={`${thBase} text-gray-500 cursor-default hover:bg-transparent`}>Niveaux</th>
                      <th className={thCls('moniteur')} onClick={() => toggleSort('moniteur')}>
                        <span className="flex items-center">Moniteur <SortIcon col="moniteur" sortCol={sortCol} sortDir={sortDir} /></span>
                      </th>
                      <th className={thCls('places')}   onClick={() => toggleSort('places')}>
                        <span className="flex items-center">Places <SortIcon col="places" sortCol={sortCol} sortDir={sortDir} /></span>
                      </th>
                      <th className={`${thBase} text-gray-500 cursor-default hover:bg-transparent text-right pr-5`}>Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {coursFiltres.map(c => {
                      const pct        = Math.min(100, (c.inscrits / c.capacite) * 100)
                      const complet    = c.placesRestantes <= 0
                      const quasi      = pct > 75 && !complet
                      const isSelected = selectedCours?.id === c.id

                      return (
                        <tr
                          key={c.id}
                          onClick={() => openFiche(c)}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                        >
                          {/* Jour */}
                          <td className={td}>
                            <span className="inline-flex items-center text-xs font-bold text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-md">
                              {c.jour}
                            </span>
                          </td>

                          {/* Horaire */}
                          <td className={`${td} text-gray-600 tabular-nums font-medium`}>
                            {c.heure_debut?.slice(0, 5)} – {c.heure_fin?.slice(0, 5)}
                          </td>

                          {/* Nom */}
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{c.nom}</span>
                              {complet && (
                                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">Complet</span>
                              )}
                            </div>
                          </td>

                          {/* Niveaux */}
                          <td className={td}>
                            {c.niveaux?.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {c.niveaux.map(n => (
                                  <span key={n} className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded-full font-medium">
                                    {n}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>

                          {/* Moniteur */}
                          <td className={`${td} text-gray-600`}>
                            {c.moniteur ? c.moniteur.prenom : <span className="text-gray-500">—</span>}
                          </td>

                          {/* Places */}
                          <td className={td}>
                            <div className="flex items-center gap-2 min-w-[110px]">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[50px]">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${complet ? 'bg-red-500' : quasi ? 'bg-amber-400' : 'bg-brand-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium tabular-nums shrink-0 ${complet ? 'text-red-600' : quasi ? 'text-amber-600' : 'text-gray-600'}`}>
                                {c.inscrits}/{c.capacite}
                              </span>
                            </div>
                          </td>

                          {/* Action */}
                          <td className={`${td} text-right pr-5`} onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => openFiche(c)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-white hover:bg-brand-600 px-2.5 py-1 rounded-lg border border-brand-200 hover:border-brand-600 transition-all duration-150"
                            >
                              Voir
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{coursFiltres.length}</span> cours
                  {filterJour && <span className="text-gray-500"> · {filterJour}</span>}
                </p>
                {filterJour && (
                  <button onClick={() => setFilterJour('')} className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                    Tous les jours
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Panneau fiche cours ──────────────────────────────────────────── */}
      {selectedCours && (
        <div className="w-full md:w-[420px] shrink-0">
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm sticky top-6 max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden">

            {/* Header fiche */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-brand-600 font-semibold uppercase tracking-wide mb-0.5">
                  {selectedCours.jour} · {selectedCours.heure_debut?.slice(0, 5)} – {selectedCours.heure_fin?.slice(0, 5)}
                </p>
                <h2 className="text-base font-bold text-gray-900 leading-tight truncate">{selectedCours.nom}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {selectedCours.placesRestantes <= 0 ? (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Complet</span>
                  ) : (
                    <span className="text-xs text-gray-500">{selectedCours.placesRestantes} place{selectedCours.placesRestantes > 1 ? 's' : ''} restante{selectedCours.placesRestantes > 1 ? 's' : ''}</span>
                  )}
                  <span className="text-xs text-gray-500">{selectedCours.inscrits} inscrit{selectedCours.inscrits > 1 ? 's' : ''}</span>
                </div>
              </div>
              <button
                onClick={closeFiche}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 shrink-0"
              >
                ×
              </button>
            </div>

            {/* Onglets */}
            <div className="flex border-b border-gray-100 px-4">
              {[
                { key: 'infos', label: 'Informations' },
                { key: 'eleves', label: `Élèves (${loadingEleves ? '…' : eleves.length})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFicheTab(tab.key)}
                  className={`py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                    ficheTab === tab.key
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contenu onglet */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Onglet Informations ─────────────────────────────── */}
              {ficheTab === 'infos' && (
                <div className="px-5 py-4 space-y-4">
                  {/* Nom */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nom du cours *</label>
                    <input
                      type="text"
                      value={form.nom}
                      onChange={e => setField('nom', e.target.value)}
                      disabled={!isGerant}
                      className={inputCls(errors.nom) + (!isGerant ? ' bg-gray-50' : '')}
                    />
                    {errors.nom && <p className="text-xs text-red-500 mt-1">{errors.nom}</p>}
                  </div>

                  {/* Jour */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Jour *</label>
                    <select
                      value={form.jour}
                      onChange={e => setField('jour', e.target.value)}
                      disabled={!isGerant}
                      className={inputCls(errors.jour) + (!isGerant ? ' bg-gray-50' : '')}
                    >
                      <option value="">Sélectionner…</option>
                      {JOURS.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                    {errors.jour && <p className="text-xs text-red-500 mt-1">{errors.jour}</p>}
                  </div>

                  {/* Horaires */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Début *</label>
                      <input
                        type="time"
                        value={form.heure_debut}
                        onChange={e => setField('heure_debut', e.target.value)}
                        disabled={!isGerant}
                        className={inputCls(errors.heure_debut) + (!isGerant ? ' bg-gray-50' : '')}
                      />
                      {errors.heure_debut && <p className="text-xs text-red-500 mt-1">{errors.heure_debut}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fin *</label>
                      <input
                        type="time"
                        value={form.heure_fin}
                        onChange={e => setField('heure_fin', e.target.value)}
                        disabled={!isGerant}
                        className={inputCls(errors.heure_fin) + (!isGerant ? ' bg-gray-50' : '')}
                      />
                      {errors.heure_fin && <p className="text-xs text-red-500 mt-1">{errors.heure_fin}</p>}
                    </div>
                  </div>

                  {/* Niveaux */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Niveaux concernés</label>
                    <div className="flex flex-wrap gap-1.5">
                      {GALOPS.map(g => (
                        <button
                          key={g}
                          type="button"
                          disabled={!isGerant}
                          onClick={() => isGerant && toggleNiveau(g)}
                          className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                            form.niveaux.includes(g)
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400 hover:text-brand-700'
                          } ${!isGerant ? 'cursor-default opacity-70' : ''}`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Capacité */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de places *</label>
                    <input
                      type="number"
                      min="1"
                      value={form.capacite}
                      onChange={e => setField('capacite', e.target.value)}
                      disabled={!isGerant}
                      className={inputCls(errors.capacite) + (!isGerant ? ' bg-gray-50' : '')}
                    />
                    {errors.capacite && <p className="text-xs text-red-500 mt-1">{errors.capacite}</p>}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={form.description}
                      onChange={e => setField('description', e.target.value)}
                      disabled={!isGerant}
                      className={inputCls(false) + ' resize-none' + (!isGerant ? ' bg-gray-50' : '')}
                      placeholder="Informations complémentaires…"
                    />
                  </div>

                  {/* Moniteur */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Moniteur</label>
                    <select
                      value={form.moniteur_id}
                      onChange={e => setField('moniteur_id', e.target.value)}
                      disabled={!isGerant}
                      className={inputCls(false) + (!isGerant ? ' bg-gray-50' : '')}
                    >
                      <option value="">— Aucun —</option>
                      {moniteurs.map(m => (
                        <option key={m.id} value={m.id}>{m.prenom}</option>
                      ))}
                    </select>
                  </div>

                  {/* Actions fiche */}
                  {isGerant && (
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => handleSave(selectedCours.id)}
                        disabled={saving}
                        className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                      <button
                        onClick={() => handleDelete(selectedCours)}
                        title="Supprimer le cours"
                        className="text-red-400 hover:text-red-600 p-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Onglet Élèves ───────────────────────────────────── */}
              {ficheTab === 'eleves' && (
                <div className="px-5 py-4">
                  {loadingEleves ? (
                    <LoadingSpinner />
                  ) : eleves.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">
                      <p className="text-2xl mb-2">🐴</p>
                      Aucun élève inscrit à ce cours.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {eleves.map(e => {
                        const statut = STATUTS[e.statut] ?? STATUTS.creation
                        return (
                          <Link
                            key={e.id}
                            to={`/adhesions/${e.id}`}
                            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 leading-tight">
                                {e.adherent?.nom} <span className="font-normal">{e.adherent?.prenom}</span>
                              </p>
                              {e.adherent?.galop && (
                                <p className="text-xs text-gray-500 mt-0.5">{e.adherent.galop}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statut.cls}`}>
                                {statut.label}
                              </span>
                              <span className="text-gray-400 group-hover:text-brand-500 text-xs transition-colors">→</span>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal création ───────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-lg font-semibold text-gray-900">Nouveau cours</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du cours *</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={e => setField('nom', e.target.value)}
                  className={inputCls(errors.nom)}
                  placeholder="Ex : Galop 3-4 — Samedi matin"
                  autoFocus
                />
                {errors.nom && <p className="text-xs text-red-500 mt-1">{errors.nom}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jour *</label>
                <select
                  value={form.jour}
                  onChange={e => setField('jour', e.target.value)}
                  className={inputCls(errors.jour)}
                >
                  <option value="">Sélectionner…</option>
                  {JOURS.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
                {errors.jour && <p className="text-xs text-red-500 mt-1">{errors.jour}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heure de début *</label>
                  <input type="time" value={form.heure_debut} onChange={e => setField('heure_debut', e.target.value)} className={inputCls(errors.heure_debut)} />
                  {errors.heure_debut && <p className="text-xs text-red-500 mt-1">{errors.heure_debut}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heure de fin *</label>
                  <input type="time" value={form.heure_fin} onChange={e => setField('heure_fin', e.target.value)} className={inputCls(errors.heure_fin)} />
                  {errors.heure_fin && <p className="text-xs text-red-500 mt-1">{errors.heure_fin}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Niveaux concernés <span className="font-normal text-gray-500">(optionnel)</span></label>
                <div className="flex flex-wrap gap-2">
                  {GALOPS.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleNiveau(g)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        form.niveaux.includes(g)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400 hover:text-brand-700'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de places *</label>
                <input
                  type="number" min="1"
                  value={form.capacite}
                  onChange={e => setField('capacite', e.target.value)}
                  className={inputCls(errors.capacite)}
                  placeholder="Ex : 10"
                />
                {errors.capacite && <p className="text-xs text-red-500 mt-1">{errors.capacite}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="font-normal text-gray-500">(optionnel)</span></label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  className={inputCls(false) + ' resize-none'}
                  placeholder="Informations complémentaires…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Moniteur <span className="font-normal text-gray-500">(optionnel)</span></label>
                <select
                  value={form.moniteur_id}
                  onChange={e => setField('moniteur_id', e.target.value)}
                  className={inputCls(false)}
                >
                  <option value="">— Aucun —</option>
                  {moniteurs.map(m => (
                    <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button
                onClick={() => setShowCreate(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => handleSave(null)}
                disabled={saving}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Création…' : 'Créer le cours'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
