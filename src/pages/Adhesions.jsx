import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSaison } from '../contexts/SaisonContext'
import { useAuth } from '../contexts/AuthContext'
import { STATUTS } from '../lib/constants'
import TrashIcon from '../components/TrashIcon'
import LoadingSpinner from '../components/LoadingSpinner'

// ── Icône de tri ─────────────────────────────────────────────────────────────
function SortIcon({ col, sortCol, sortDir }) {
  const active = sortCol === col
  return (
    <span className={`inline-flex flex-col ml-1.5 gap-[2px] ${active ? 'opacity-100' : 'opacity-30'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4" className={`w-1.5 h-1 ${active && sortDir === 'asc' ? 'text-brand-600' : 'text-current'}`} fill="currentColor">
        <path d="M3 0 6 4H0z"/>
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4" className={`w-1.5 h-1 ${active && sortDir === 'desc' ? 'text-brand-600' : 'text-current'}`} fill="currentColor">
        <path d="M3 4 0 0h6z"/>
      </svg>
    </span>
  )
}

export default function Adhesions() {
  const { saisonCourante } = useSaison()
  const { profile } = useAuth()
  const isGerant = profile?.role === 'gérant'

  const [adhesions, setAdhesions]             = useState([])
  const [coursOptions, setCoursOptions]       = useState([])
  const [pointagesCounts, setPointagesCounts] = useState({})
  const [loading, setLoading]                 = useState(true)
  const [search, setSearch]                   = useState('')
  const [filterCours, setFilterCours]         = useState('')
  const [filterStatut, setFilterStatut]       = useState('')
  const [sortCol, setSortCol]                 = useState('created_at')
  const [sortDir, setSortDir]                 = useState('desc')

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
      supabase.from('pointages').select('adherent_id').eq('saison_id', saisonCourante.id),
    ])
    if (adhesionsData) setAdhesions(adhesionsData)
    if (coursData) setCoursOptions(coursData)
    if (pointagesData) {
      const counts = {}
      pointagesData.forEach(p => { counts[p.adherent_id] = (counts[p.adherent_id] || 0) + 1 })
      setPointagesCounts(counts)
    }
    setLoading(false)
  }, [saisonCourante?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleStatutChange(adhesionId, newStatut) {
    if (!isGerant) return
    setAdhesions(prev => prev.map(a => a.id === adhesionId ? { ...a, statut: newStatut } : a))
    await supabase.from('adhesions').update({ statut: newStatut }).eq('id', adhesionId)
  }

  async function handleDelete(adhesion) {
    if (!isGerant) return
    const nom = `${adhesion.adherent?.prenom} ${adhesion.adherent?.nom}`
    if (!window.confirm(`Supprimer l'inscription de ${nom} pour cette saison ?\n\nLa fiche personnelle de l'adhérent sera conservée.`)) return
    await supabase.from('adhesions').delete().eq('id', adhesion.id)
    fetchAll()
  }

  function exportCsv() {
    const headers = ['Nom', 'Prénom', 'Email', 'Téléphone', 'Cours', 'Forfait', 'Statut', 'Séances']
    const rows = filtered.map(a => [
      a.adherent?.nom ?? '', a.adherent?.prenom ?? '', a.adherent?.email ?? '',
      a.adherent?.telephone ?? '', a.cours?.nom ?? '', a.forfait?.libelle ?? '',
      STATUTS[a.statut]?.label ?? a.statut, pointagesCounts[a.adherent_id] ?? 0,
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
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
        case 'statut':  va = a.statut ?? '';              vb = b.statut ?? '';              break
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

  function clearFilters() {
    setSearch(''); setFilterCours(''); setFilterStatut('')
  }

  const hasFilters = search || filterCours || filterStatut

  // Classes de colonne (active = légère teinte brand)
  const thBase = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors group'
  const thCls  = col => `${thBase} ${sortCol === col ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`
  const td     = 'px-4 py-3.5 text-sm text-gray-800 whitespace-nowrap'

  return (
    <div className="p-6 md:p-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Adhérents</h1>
          {saisonCourante && (
            <p className="text-sm text-gray-500 mt-0.5">Saison {saisonCourante.libelle}</p>
          )}
        </div>
        <Link
          to="/adhesions/nouveau"
          className="shrink-0 inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nouvelle inscription
        </Link>
      </div>

      {/* Métriques */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Metric label="Inscrits complets" value={loading ? null : metrics.complets}    accent="green" />
        <Metric label="Pré-inscrits"      value={loading ? null : metrics.preinscrits} accent="amber" />
      </div>

      {/* Barre filtres */}
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        {/* Recherche */}
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Nom, prénom…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm w-48 placeholder:text-gray-400"
          />
        </div>

        {/* Filtre cours */}
        <select
          value={filterCours}
          onChange={e => setFilterCours(e.target.value)}
          className={`rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm transition-colors ${filterCours ? 'border-brand-300 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-white text-gray-700'}`}
        >
          <option value="">Tous les cours</option>
          {coursOptions.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>

        {/* Filtre statut */}
        <select
          value={filterStatut}
          onChange={e => setFilterStatut(e.target.value)}
          className={`rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm transition-colors ${filterStatut ? 'border-brand-300 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-white text-gray-700'}`}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl px-3 py-2 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
            Effacer
          </button>
        )}

        {/* Export */}
        <button
          onClick={exportCsv}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium border border-gray-200 bg-white rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors shadow-sm text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Exporter CSV
        </button>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <p className="text-gray-700 font-medium text-sm">
              {adhesions.length === 0 ? 'Aucune inscription pour cette saison' : 'Aucun résultat'}
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-brand-600 hover:text-brand-800 text-xs font-medium">
                Effacer les filtres
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className={thCls('nom')}     onClick={() => toggleSort('nom')}>
                      <span className="flex items-center">Nom <SortIcon col="nom" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={thCls('prenom')}  onClick={() => toggleSort('prenom')}>
                      <span className="flex items-center">Prénom <SortIcon col="prenom" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={thCls('cours')}   onClick={() => toggleSort('cours')}>
                      <span className="flex items-center">Cours <SortIcon col="cours" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={thCls('forfait')} onClick={() => toggleSort('forfait')}>
                      <span className="flex items-center">Forfait <SortIcon col="forfait" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={thCls('statut')}  onClick={() => toggleSort('statut')}>
                      <span className="flex items-center">Statut <SortIcon col="statut" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={thCls('conso')}   onClick={() => toggleSort('conso')}>
                      <span className="flex items-center">Séances <SortIcon col="conso" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={`${thBase} text-right pr-5 cursor-default hover:bg-transparent text-gray-500`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(a => {
                    const seancesConso = pointagesCounts[a.adherent_id] ?? 0
                    const seancesTotal = a.forfait?.nb_seances ?? null
                    const pct          = seancesTotal ? Math.min(100, (seancesConso / seancesTotal) * 100) : null
                    const statut       = STATUTS[a.statut] ?? STATUTS.creation

                    return (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                        <td className={`${td} font-semibold text-gray-900`}>{a.adherent?.nom ?? <span className="text-gray-500">—</span>}</td>
                        <td className={td}>{a.adherent?.prenom ?? <span className="text-gray-500">—</span>}</td>
                        <td className={td}>{a.cours?.nom ?? <span className="text-gray-500">—</span>}</td>
                        <td className={td}>{a.forfait?.libelle ?? <span className="text-gray-500">—</span>}</td>

                        {/* Statut */}
                        <td className={td}>
                          <select
                            value={a.statut ?? 'creation'}
                            onChange={e => handleStatutChange(a.id, e.target.value)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 ${statut.cls}`}
                          >
                            {Object.entries(STATUTS).map(([v, { label }]) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Conso séances */}
                        <td className={td}>
                          {seancesTotal === null ? (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Annuel</span>
                          ) : (
                            <div className="flex items-center gap-2 min-w-[110px]">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[60px]">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-brand-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium tabular-nums shrink-0 ${pct >= 100 ? 'text-red-600' : pct >= 75 ? 'text-amber-600' : 'text-gray-600'}`}>
                                {seancesConso}/{seancesTotal}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className={`${td} text-right`}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              to={`/adhesions/${a.id}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-white hover:bg-brand-600 px-2.5 py-1 rounded-lg border border-brand-200 hover:border-brand-600 transition-all duration-150"
                            >
                              Voir
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                              </svg>
                            </Link>
                            {isGerant && (
                              <button
                                onClick={() => handleDelete(a)}
                                title="Supprimer l'inscription"
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all duration-150"
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer table */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{filtered.length}</span>{' '}
                inscription{filtered.length > 1 ? 's' : ''}
                {filtered.length !== adhesions.length && (
                  <span className="text-gray-500"> sur {adhesions.length}</span>
                )}
              </p>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors">
                  Effacer les filtres
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, accent }) {
  const styles = {
    green: { num: 'text-emerald-700', light: 'bg-white border-gray-200', dot: 'bg-emerald-500', label: 'text-emerald-700' },
    amber: { num: 'text-amber-700',   light: 'bg-white border-gray-200', dot: 'bg-amber-500',   label: 'text-amber-700'  },
  }
  const s = styles[accent] ?? { num: 'text-gray-900', light: 'bg-white border-gray-200', dot: 'bg-gray-400', label: 'text-gray-600' }
  return (
    <div className={`${s.light} border rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <div className={`w-2 h-2 rounded-full ${s.dot}`} />
      </div>
      <p className={`text-3xl font-bold tabular-nums ${s.num}`}>
        {value === null ? <span className="text-gray-300 animate-pulse">—</span> : value}
      </p>
    </div>
  )
}
