import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSaison } from '../contexts/SaisonContext'

const STATUTS = {
  creation:        { label: 'En création',  cls: 'bg-gray-100 text-gray-600' },
  pre_inscription: { label: 'Pré-inscrit',  cls: 'bg-amber-100 text-amber-700' },
  complete:        { label: 'Inscrit',       cls: 'bg-green-100 text-green-700' },
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}

export default function Adhesions() {
  const { saisonCourante } = useSaison()

  const [adhesions, setAdhesions]           = useState([])
  const [coursOptions, setCoursOptions]     = useState([])
  const [pointagesCounts, setPointagesCounts] = useState({})
  const [loading, setLoading]               = useState(true)
  const [search, setSearch]                 = useState('')
  const [filterCours, setFilterCours]       = useState('')
  const [filterStatut, setFilterStatut]     = useState('')
  const [sortCol, setSortCol]               = useState('created_at')
  const [sortDir, setSortDir]               = useState('desc')

  const fetchAll = useCallback(async () => {
    if (!saisonCourante?.id) return
    setLoading(true)

    const [
      { data: adhesionsData },
      { data: coursData },
      { data: pointagesData },
    ] = await Promise.all([
      supabase
        .from('adhesions')
        .select(`
          *,
          adherent:adherent_id(id, nom, prenom, email, telephone, date_naissance, galop),
          cours:cours_id(id, nom),
          forfait:forfait_id(id, libelle, prix, nb_seances),
          forfait2:forfait2_id(id, libelle, prix, nb_seances)
        `)
        .eq('saison_id', saisonCourante.id)
        .order('created_at', { ascending: false }),
      supabase.from('cours').select('id, nom').eq('saison_id', saisonCourante.id).order('nom'),
      supabase.from('pointages').select('adherent_id'),
    ])

    if (adhesionsData) setAdhesions(adhesionsData)
    if (coursData) setCoursOptions(coursData)
    if (pointagesData) {
      const counts = {}
      pointagesData.forEach(p => {
        counts[p.adherent_id] = (counts[p.adherent_id] || 0) + 1
      })
      setPointagesCounts(counts)
    }
    setLoading(false)
  }, [saisonCourante?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleStatutChange(adhesionId, newStatut) {
    setAdhesions(prev => prev.map(a => a.id === adhesionId ? { ...a, statut: newStatut } : a))
    await supabase.from('adhesions').update({ statut: newStatut }).eq('id', adhesionId)
  }

  async function handleDelete(adhesion) {
    const nom = `${adhesion.adherent?.prenom} ${adhesion.adherent?.nom}`
    if (!window.confirm(`Supprimer l'inscription de ${nom} pour cette saison ?\n\nLa fiche personnelle de l'adhérent sera conservée.`)) return
    await supabase.from('adhesions').delete().eq('id', adhesion.id)
    fetchAll()
  }

  function exportCsv() {
    const headers = ['Nom', 'Prénom', 'Email', 'Téléphone', 'Cours', 'Forfait', 'Statut', 'Séances consommées']
    const rows = filtered.map(a => [
      a.adherent?.nom ?? '',
      a.adherent?.prenom ?? '',
      a.adherent?.email ?? '',
      a.adherent?.telephone ?? '',
      a.cours?.nom ?? '',
      a.forfait?.libelle ?? '',
      STATUTS[a.statut]?.label ?? a.statut,
      pointagesCounts[a.adherent_id] ?? 0,
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `adhesions_${saisonCourante?.libelle ?? 'export'}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Métriques
  const metrics = useMemo(() => ({
    complets:    adhesions.filter(a => a.statut === 'complete').length,
    preinscrits: adhesions.filter(a => a.statut === 'pre_inscription').length,
  }), [adhesions])

  // Filtrage + tri
  const filtered = useMemo(() => {
    let list = [...adhesions]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.adherent?.nom?.toLowerCase().includes(q) ||
        a.adherent?.prenom?.toLowerCase().includes(q)
      )
    }
    if (filterCours)  list = list.filter(a => a.cours_id === filterCours)
    if (filterStatut) list = list.filter(a => a.statut === filterStatut)

    list.sort((a, b) => {
      let va, vb
      switch (sortCol) {
        case 'nom':     va = a.adherent?.nom ?? '';       vb = b.adherent?.nom ?? '';       break
        case 'prenom':  va = a.adherent?.prenom ?? '';    vb = b.adherent?.prenom ?? '';    break
        case 'cours':   va = a.cours?.nom ?? '';          vb = b.cours?.nom ?? '';          break
        case 'forfait': va = a.forfait?.libelle ?? '';    vb = b.forfait?.libelle ?? '';    break
        case 'conso': {
          const nbA = a.forfait?.nb_seances ?? Infinity
          const nbB = b.forfait?.nb_seances ?? Infinity
          va = nbA === 0 ? 0 : (pointagesCounts[a.adherent_id] ?? 0) / nbA
          vb = nbB === 0 ? 0 : (pointagesCounts[b.adherent_id] ?? 0) / nbB
          break
        }
        default: va = a[sortCol] ?? ''; vb = b[sortCol] ?? ''
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [adhesions, search, filterCours, filterStatut, sortCol, sortDir, pointagesCounts])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sortIcon = col => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  const th = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 whitespace-nowrap'
  const td = 'px-4 py-3 text-sm text-gray-800 whitespace-nowrap'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Adhérents</h1>
          {saisonCourante && (
            <p className="text-sm text-gray-400 mt-0.5">Saison {saisonCourante.libelle}</p>
          )}
        </div>
        <Link
          to="/adhesions/nouveau"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Nouvelle inscription
        </Link>
      </div>

      {/* Métriques */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Metric label="Inscrits complets" value={loading ? null : metrics.complets} accent="green" />
        <Metric label="Pré-inscrits"      value={loading ? null : metrics.preinscrits} accent="amber" />
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text"
          placeholder="Rechercher nom, prénom…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-52"
        />
        <select
          value={filterCours}
          onChange={e => setFilterCours(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Tous les cours</option>
          {coursOptions.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select
          value={filterStatut}
          onChange={e => setFilterStatut(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <button
          onClick={exportCsv}
          className="ml-auto text-sm font-medium border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
        >
          ↓ Exporter CSV
        </button>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            {adhesions.length === 0
              ? 'Aucune inscription pour cette saison.'
              : 'Aucun résultat pour ces filtres.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className={th} onClick={() => toggleSort('nom')}>Nom{sortIcon('nom')}</th>
                    <th className={th} onClick={() => toggleSort('prenom')}>Prénom{sortIcon('prenom')}</th>
                    <th className={th} onClick={() => toggleSort('cours')}>Cours{sortIcon('cours')}</th>
                    <th className={th} onClick={() => toggleSort('forfait')}>Forfait{sortIcon('forfait')}</th>
                    <th className={th} onClick={() => toggleSort('statut')}>Statut{sortIcon('statut')}</th>
                    <th className={th} onClick={() => toggleSort('conso')}>Conso séances{sortIcon('conso')}</th>
                    <th className={th + ' text-right pr-6'}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(a => {
                    const seancesConso = pointagesCounts[a.adherent_id] ?? 0
                    const seancesTotal = a.forfait?.nb_seances ?? null
                    const pct          = seancesTotal ? Math.min(100, (seancesConso / seancesTotal) * 100) : null
                    const statut       = STATUTS[a.statut] ?? STATUTS.creation

                    return (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                        <td className={td + ' font-medium'}>{a.adherent?.nom ?? '—'}</td>
                        <td className={td}>{a.adherent?.prenom ?? '—'}</td>
                        <td className={td}>{a.cours?.nom ?? <span className="text-gray-300">—</span>}</td>
                        <td className={td}>{a.forfait?.libelle ?? <span className="text-gray-300">—</span>}</td>

                        {/* Statut inline */}
                        <td className={td}>
                          <select
                            value={a.statut ?? 'creation'}
                            onChange={e => handleStatutChange(a.id, e.target.value)}
                            className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 ${statut.cls}`}
                          >
                            {Object.entries(STATUTS).map(([v, { label }]) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Conso séances */}
                        <td className={td}>
                          {seancesTotal === null ? (
                            <span className="text-xs text-gray-400">Annuel</span>
                          ) : (
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-brand-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 shrink-0">
                                {seancesConso}/{seancesTotal}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className={td + ' text-right'}>
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              to={`/adhesions/${a.id}`}
                              className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                            >
                              Voir
                            </Link>
                            <button
                              onClick={() => handleDelete(a)}
                              title="Supprimer l'inscription"
                              className="text-red-400 hover:text-red-600 transition-colors"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              {filtered.length} inscription{filtered.length > 1 ? 's' : ''}
              {filtered.length !== adhesions.length && ` sur ${adhesions.length}`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, accent }) {
  const accentCls = accent === 'green' ? 'text-green-600' : accent === 'amber' ? 'text-amber-600' : 'text-gray-900'
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accentCls}`}>
        {value === null ? <span className="text-gray-300 animate-pulse">—</span> : value}
      </p>
    </div>
  )
}
