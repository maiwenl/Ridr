import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSaison } from '../contexts/SaisonContext'
import LoadingSpinner from '../components/LoadingSpinner'

// ── Icônes ────────────────────────────────────────────────────────────────────
function Icon({ d, className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         strokeWidth={1.6} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

const ICO = {
  euro:    'M14.25 7.756a4.5 4.5 0 1 0 0 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  users:   'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
  alert:   'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  arrow:   'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3',
  clock:   'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  chevL:   'M15.75 19.5 8.25 12l7.5-7.5',
  chevR:   'M8.25 4.5l7.5 7.5-7.5 7.5',
  calendar:'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
}

// ── Helpers généraux ──────────────────────────────────────────────────────────
function fmt(n) {
  return Number(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function pct(n, total) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Calcule le statut de règlement d'une liste d'inscriptions (même logique qu'Adhesions.jsx)
function reglementStatut(inscriptions) {
  const montantTotal = inscriptions.reduce((s, i) => s + Number(i.montant_total ?? 0), 0)
  if (montantTotal === 0) return 'nc'
  const paiements = inscriptions.flatMap(i => i.paiements ?? [])
  const encaisse  = paiements.filter(p => p.statut === 'encaisse' && p.type !== 'remboursement').reduce((s, p) => s + Number(p.montant), 0)
  const rembourse = paiements.filter(p => p.statut === 'encaisse' && p.type === 'remboursement').reduce((s, p) => s + Number(p.montant), 0)
  const recuM     = paiements.filter(p => p.statut === 'recu').reduce((s, p) => s + Number(p.montant), 0)
  const net = Math.round((encaisse - rembourse) * 100) / 100
  const tot = Math.round(montantTotal * 100) / 100
  if (net >= tot)                return 'solde'
  if (net + recuM >= tot)        return 'recu'
  if (net > 0 || recuM > 0)     return 'partiel'
  return 'nonRegle'
}

// ── Helpers semaine ───────────────────────────────────────────────────────────
function getMonday(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

const JOUR_TO_INDEX = {
  lundi: 0, mardi: 1, mercredi: 2, jeudi: 3,
  vendredi: 4, samedi: 5, dimanche: 6,
}

const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// ── Styles par type d'activité ────────────────────────────────────────────────
const TYPE_STYLE = {
  cours_regulier: {
    bg:     'bg-brand-50',
    border: 'border-brand-200',
    text:   'text-brand-800',
    sub:    'text-brand-500',
    dot:    'bg-brand-400',
    label:  'Cours',
  },
  stage: {
    bg:     'bg-amber-50',
    border: 'border-amber-200',
    text:   'text-amber-800',
    sub:    'text-amber-500',
    dot:    'bg-amber-400',
    label:  'Stage',
  },
  concours: {
    bg:     'bg-purple-50',
    border: 'border-purple-200',
    text:   'text-purple-800',
    sub:    'text-purple-500',
    dot:    'bg-purple-400',
    label:  'Concours',
  },
  evenement: {
    bg:     'bg-emerald-50',
    border: 'border-emerald-200',
    text:   'text-emerald-800',
    sub:    'text-emerald-500',
    dot:    'bg-emerald-400',
    label:  'Évènement',
  },
}

// ── Composants UI ─────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, accent = 'brand' }) {
  const accents = {
    brand:   'bg-brand-50 text-brand-600 border-brand-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber:   'bg-amber-50 text-amber-600 border-amber-100',
    red:     'bg-red-50 text-red-600 border-red-100',
    sky:     'bg-sky-50 text-sky-600 border-sky-100',
    slate:   'bg-slate-50 text-slate-500 border-slate-100',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${accents[accent]}`}>
        <Icon d={icon} className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-sm text-gray-500 mt-1">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{children}</h2>
  )
}

function Badge({ children, cls }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{children}</span>
}

function ProgressBar({ value, max, colorClass = 'bg-brand-500' }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${p}%` }} />
    </div>
  )
}

// ── Constantes de la grille horaire ──────────────────────────────────────────
const HOUR_START   = 8
const HOUR_END     = 20
const PX_PER_HOUR  = 64  // px pour 1 heure

function timeToMinutes(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesToTop(minutes) {
  return ((minutes - HOUR_START * 60) / 60) * PX_PER_HOUR
}

// ── Layout de collision (événements simultanés côte à côte) ──────────────────
/**
 * Pour une liste d'événements d'une même journée, calcule _col et _groupCols
 * afin de les afficher côte à côte quand ils se chevauchent.
 *
 * Algorithme glouton :
 *  1. Trier par heure de début (puis fin décroissante pour les plus longs en premier)
 *  2. Placer chaque événement dans la première colonne libre
 *  3. _groupCols = max(_col + 1) parmi tous les événements qui chevauchent
 */
function computeLayout(events) {
  if (!events.length) return []

  const ev = events.map(e => ({
    ...e,
    _start: timeToMinutes(e.heure_debut) ?? 0,
    _end:   e.heure_fin ? timeToMinutes(e.heure_fin) : (timeToMinutes(e.heure_debut) ?? 0) + 60,
    _col:   0,
    _groupCols: 1,
  })).sort((a, b) => a._start - b._start || b._end - a._end)

  // Assigner les colonnes
  const colEnds = [] // colEnds[i] = heure de fin du dernier event dans la colonne i
  for (const e of ev) {
    const col = colEnds.findIndex(end => end <= e._start)
    if (col === -1) {
      e._col = colEnds.length
      colEnds.push(e._end)
    } else {
      e._col = col
      colEnds[col] = e._end
    }
  }

  // Calculer _groupCols pour chaque event = max(_col+1) parmi ses chevauchants
  for (const e of ev) {
    e._groupCols = ev.reduce((max, other) =>
      (other._start < e._end && other._end > e._start)
        ? Math.max(max, other._col + 1)
        : max
    , 1)
  }

  return ev
}

// ── Vue hebdomadaire ──────────────────────────────────────────────────────────
function WeeklyView({ activites }) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const days    = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = days[6]

  const sameMonth = weekStart.getMonth() === weekEnd.getMonth()
  const weekLabel = sameMonth
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
    : `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const isCurrentWeek = isSameDay(weekStart, getMonday(new Date()))

  // Heure courante pour le trait rouge
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showNowLine = isCurrentWeek &&
    nowMinutes >= HOUR_START * 60 && nowMinutes <= HOUR_END * 60

  // Événements par jour → séparés en toute-la-journée (sans heure) et positionnés (avec heure)
  const eventsByDay = useMemo(() => {
    return days.map(day => {
      const dayIndex = day.getDay() === 0 ? 6 : day.getDay() - 1
      const dayName  = Object.keys(JOUR_TO_INDEX).find(k => JOUR_TO_INDEX[k] === dayIndex)

      const all = activites.filter(a => {
        if (a.type === 'cours_regulier') return a.jour?.toLowerCase() === dayName
        if (!a.date_debut) return false
        const start = new Date(a.date_debut); start.setHours(0, 0, 0, 0)
        const end   = a.date_fin ? new Date(a.date_fin) : new Date(a.date_debut); end.setHours(23, 59, 59, 999)
        return day >= start && day <= end
      })

      const timed  = computeLayout(all.filter(a => a.heure_debut))
      const allDay = all.filter(a => !a.heure_debut)

      return { day, timed, allDay }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, activites])

  const hasAllDay  = eventsByDay.some(d => d.allDay.length > 0)
  const gridHeight = (HOUR_END - HOUR_START) * PX_PER_HOUR
  const hours      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

  const TIME_COL_W = 40 // px de la colonne des heures

  return (
    <div>
      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(w => addDays(w, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Icon d={ICO.chevL} className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[200px] text-center select-none">
            {weekLabel}
          </span>
          <button
            onClick={() => setWeekStart(w => addDays(w, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Icon d={ICO.chevR} className="w-4 h-4" />
          </button>
        </div>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 rounded-lg px-3 py-1.5 hover:bg-brand-50 transition-colors"
          >
            Aujourd'hui
          </button>
        )}
      </div>

      {/* ── Scroll horizontal sur mobile ────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-5 sm:mx-0 px-5 sm:px-0">
        <div style={{ minWidth: 480 }}>

          {/* ── En-têtes des jours ──────────────────────────────────────────── */}
          <div className="flex">
            {/* Spacer colonne horaire */}
            <div style={{ width: TIME_COL_W, flexShrink: 0 }} />
            {/* Jours */}
            {eventsByDay.map(({ day }) => {
              const isToday  = isSameDay(day, today)
              const dayIndex = day.getDay() === 0 ? 6 : day.getDay() - 1
              return (
                <div key={day.toISOString()} className="flex-1 flex flex-col items-center pb-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? 'text-brand-600' : 'text-gray-400'}`}>
                    {JOURS_COURTS[dayIndex]}
                  </span>
                  <div className={`w-7 h-7 mt-0.5 rounded-full flex items-center justify-center text-sm font-bold ${
                    isToday ? 'bg-brand-600 text-white' : 'text-gray-600'
                  }`}>
                    {day.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Ligne "journée entière" (événements sans heure) ─────────────── */}
          {hasAllDay && (
            <div className="flex border-t border-gray-100">
              <div style={{ width: TIME_COL_W, flexShrink: 0 }} className="flex items-start justify-end pr-2 pt-1">
                <span className="text-[9px] text-gray-400 uppercase tracking-wider">Journée</span>
              </div>
              {eventsByDay.map(({ day, allDay }) => (
                <div key={day.toISOString()} className="flex-1 border-l border-gray-100 p-1 space-y-0.5 min-h-[28px]">
                  {allDay.map(a => {
                    const s = TYPE_STYLE[a.type] ?? TYPE_STYLE.cours_regulier
                    return (
                      <div
                        key={a.id}
                        title={`${a.nom}${a.inscrits ? ` · ${a.inscrits}${a.capacite ? '/' + a.capacite : ''} inscrits` : ''}`}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded truncate border ${s.bg} ${s.text} ${s.border}`}
                      >
                        {a.nom}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── Grille horaire ──────────────────────────────────────────────── */}
          <div
            className="flex border-t border-gray-100 overflow-y-auto"
            style={{ maxHeight: 460 }}
          >
            {/* Étiquettes d'heures */}
            <div style={{ width: TIME_COL_W, flexShrink: 0, height: gridHeight, position: 'relative' }}>
              {hours.map(h => (
                <div
                  key={h}
                  className="absolute right-2 text-[10px] text-gray-400 leading-none select-none"
                  style={{ top: (h - HOUR_START) * PX_PER_HOUR - 5 }}
                >
                  {h}h
                </div>
              ))}
            </div>

            {/* Colonnes des jours */}
            <div className="flex-1 relative" style={{ height: gridHeight }}>
              {/* Lignes horizontales de la grille */}
              {hours.map(h => (
                <div key={`line-${h}`}>
                  {/* Ligne pleine à l'heure */}
                  <div
                    className="absolute inset-x-0 border-t border-gray-100 pointer-events-none"
                    style={{ top: (h - HOUR_START) * PX_PER_HOUR }}
                  />
                  {/* Tirets à la demi-heure */}
                  <div
                    className="absolute inset-x-0 border-t border-dashed border-gray-50 pointer-events-none"
                    style={{ top: (h - HOUR_START) * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                  />
                </div>
              ))}

              {/* Trait de l'heure courante */}
              {showNowLine && (
                <div
                  className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                  style={{ top: minutesToTop(nowMinutes) }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 -ml-1" />
                  <div className="flex-1 border-t-2 border-red-400" />
                </div>
              )}

              {/* Colonnes des jours avec événements */}
              <div className="absolute inset-0 grid grid-cols-7">
                {eventsByDay.map(({ day, timed }) => (
                  <div
                    key={day.toISOString()}
                    className="relative border-l border-gray-100 first:border-l-0"
                  >
                    {timed.map(a => {
                      const startMin  = a._start
                      const endMin    = a._end
                      const top       = minutesToTop(Math.max(startMin, HOUR_START * 60))
                      const bottom    = minutesToTop(Math.min(endMin,   HOUR_END   * 60))
                      const height    = Math.max(bottom - top, 22)
                      const s         = TYPE_STYLE[a.type] ?? TYPE_STYLE.cours_regulier
                      const full      = a.capacite && a.inscrits >= a.capacite
                      // Positionnement côte à côte en cas de chevauchement
                      const colW      = 100 / a._groupCols
                      const leftPct   = a._col * colW
                      const GAP       = a._groupCols > 1 ? 1 : 0 // px de marge entre colonnes

                      return (
                        <div
                          key={a.id}
                          title={`${a.nom} · ${a.heure_debut?.slice(0,5)}${a.heure_fin ? '–' + a.heure_fin.slice(0,5) : ''} · ${a.inscrits}${a.capacite ? '/' + a.capacite : ''} inscrits`}
                          className={`absolute rounded border overflow-hidden ${s.bg} ${s.border}`}
                          style={{
                            top,
                            height,
                            left:  `calc(${leftPct}% + ${GAP}px)`,
                            width: `calc(${colW}% - ${GAP * 2}px)`,
                          }}
                        >
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.dot}`} />
                          <div className="pl-2 pr-1 py-0.5">
                            <p className={`text-[10px] font-semibold leading-tight truncate ${s.text}`}>
                              {a.nom}
                            </p>
                            {height >= 36 && (
                              <p className={`text-[9px] leading-tight ${s.sub}`}>
                                {a.heure_debut.slice(0, 5)}{a.heure_fin ? `–${a.heure_fin.slice(0, 5)}` : ''}
                              </p>
                            )}
                            {height >= 50 && (
                              <p className={`text-[9px] ${s.sub}`}>
                                {a.inscrits}{a.capacite ? `/${a.capacite}` : ''}
                                {full ? ' · Complet' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Légende ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
        {Object.entries(TYPE_STYLE).map(([type, s]) => (
          <span key={type} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { saisonCourante } = useSaison()
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState(null)

  const fetchAll = useCallback(async () => {
    if (!saisonCourante?.id) return
    setLoading(true)

    const [
      { data: enrollmentsRaw },
      { data: activitesRaw },
    ] = await Promise.all([
      supabase
        .from('enrollments')
        .select('id, status, total_amount, member_id, activity_id, created_at, paiements:payments(id, amount, status, type)')
        .eq('season_id', saisonCourante.id),
      supabase
        .from('activities')
        .select('id, nom, type, start_date, end_date, start_time, end_time, jour, capacite')
        .eq('season_id', saisonCourante.id)
        .order('type')
        .order('nom'),
    ])

    // Normalize for legacy field names
    const inscriptions = (enrollmentsRaw ?? []).map(e => ({
      ...e,
      statut: e.status ?? e.statut,
      montant_total: e.total_amount ?? e.montant_total,
      adherent_id: e.member_id,
      activite_id: e.activity_id,
      paiements: (e.paiements ?? []).map(p => ({
        ...p,
        montant: p.amount ?? p.montant,
        statut: p.status ?? p.statut,
      })),
    }))
    const activites = (activitesRaw ?? []).map(a => ({
      ...a,
      date_debut: a.start_date ?? a.date_debut,
      date_fin: a.end_date ?? a.date_fin,
      heure_debut: a.start_time ?? a.heure_debut,
      heure_fin: a.end_time ?? a.heure_fin,
    }))
    setData({ inscriptions, activites })
    setLoading(false)
  }, [saisonCourante?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const stats = useMemo(() => {
    if (!data) return null
    const { inscriptions, activites } = data

    // ── Adhérents uniques ────────────────────────────────────────────────────
    const adherentsSet = new Set(inscriptions.map(i => i.adherent_id))
    const nbAdherents  = adherentsSet.size

    // ── Statuts dossiers ─────────────────────────────────────────────────────
    const byAdherent = {}
    for (const i of inscriptions) {
      if (!byAdherent[i.adherent_id]) byAdherent[i.adherent_id] = []
      byAdherent[i.adherent_id].push(i)
    }
    const PRIO = { pre_inscription: 0, valide: 1, complete: 2 }
    let nbPreInscription = 0, nbEnCours = 0, nbComplete = 0
    for (const inscs of Object.values(byAdherent)) {
      const worst = inscs.reduce((w, i) =>
        (PRIO[i.statut] ?? 1) < (PRIO[w] ?? 1) ? i.statut : w
      , inscs[0].statut)
      if (worst === 'pre_inscription') nbPreInscription++
      else if (worst === 'valide')     nbEnCours++
      else                             nbComplete++
    }

    // ── Règlements ───────────────────────────────────────────────────────────
    let reglSolde = 0, reglPrevus = 0, reglPartiel = 0, reglNonRegle = 0
    for (const inscs of Object.values(byAdherent)) {
      const s = reglementStatut(inscs)
      if (s === 'solde')         reglSolde++
      else if (s === 'recu')     reglPrevus++
      else if (s === 'partiel')  reglPartiel++
      else if (s === 'nonRegle') reglNonRegle++
    }

    // ── Finances ─────────────────────────────────────────────────────────────
    const allPaiements  = inscriptions.flatMap(i => i.paiements ?? [])
    const totalDu       = inscriptions.reduce((s, i) => s + Number(i.montant_total ?? 0), 0)
    const encaisse      = allPaiements.filter(p => (p.statut === 'encaisse' || p.statut === 'recu') && p.type !== 'remboursement').reduce((s, p) => s + Number(p.montant), 0)
    const rembourse     = allPaiements.filter(p => (p.statut === 'encaisse' || p.statut === 'recu') && p.type === 'remboursement').reduce((s, p) => s + Number(p.montant), 0)
    const prevu         = allPaiements.filter(p => p.statut === 'planifie').reduce((s, p) => s + Number(p.montant), 0)
    const totalEncaisse = Math.round((encaisse - rembourse) * 100) / 100
    const resteAPercevo = Math.max(0, Math.round((totalDu - totalEncaisse - prevu) * 100) / 100)

    // ── Activités (avec comptage inscrits) ───────────────────────────────────
    const inscByActivite = {}
    for (const i of inscriptions) {
      if (!inscByActivite[i.activite_id]) inscByActivite[i.activite_id] = 0
      inscByActivite[i.activite_id]++
    }

    const activitesWithInscrits = activites.map(a => ({
      ...a,
      inscrits: inscByActivite[a.id] ?? 0,
    }))

    const cours = activitesWithInscrits.filter(a => a.type === 'cours_regulier')

    const today  = new Date()
    const stages = activitesWithInscrits.filter(a => a.type === 'stage').map(a => ({
      ...a,
      isPast:   a.date_fin ? new Date(a.date_fin) < today : false,
      isFuture: a.date_debut ? new Date(a.date_debut) > today : false,
    })).sort((a, b) => {
      if (!a.date_debut && !b.date_debut) return 0
      if (!a.date_debut) return 1
      if (!b.date_debut) return -1
      return new Date(a.date_debut) - new Date(b.date_debut)
    })

    return {
      nbAdherents, nbPreInscription, nbEnCours, nbComplete,
      reglSolde, reglPrevus, reglPartiel, reglNonRegle,
      totalDu, totalEncaisse, prevu, resteAPercevo,
      cours, stages,
      activitesWithInscrits,
    }
  }, [data])

  if (!saisonCourante) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Aucune saison sélectionnée
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-8">

      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-0.5">Saison {saisonCourante.name ?? saisonCourante.libelle}</p>
      </div>

      {loading || !stats ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* ── KPI principaux ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={ICO.users}
              label="Adhérents inscrits"
              value={stats.nbAdherents}
              accent="brand"
            />
            <KpiCard
              icon={ICO.euro}
              label="Total encaissé"
              value={fmt(stats.totalEncaisse)}
              sub={`sur ${fmt(stats.totalDu)} attendu`}
              accent="emerald"
            />
            <KpiCard
              icon={ICO.clock}
              label="Chèques remis"
              value={fmt(stats.prevu)}
              sub="non encore déposés"
              accent="sky"
            />
            <KpiCard
              icon={ICO.alert}
              label="Reste à percevoir"
              value={fmt(stats.resteAPercevo)}
              sub="hors chèques remis"
              accent={stats.resteAPercevo > 0 ? 'red' : 'slate'}
            />
          </div>

          {/* ── Vue semaine ───────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle>Planning de la semaine</SectionTitle>
            <WeeklyView activites={stats.activitesWithInscrits} />
          </div>

          {/* ── Dossiers + Règlements ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Statuts dossiers */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <SectionTitle>Statut des dossiers</SectionTitle>
              <div className="space-y-3">
                {[
                  { label: 'Dossiers complets',           value: stats.nbComplete,         color: 'bg-emerald-500', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' },
                  { label: 'En cours de création',        value: stats.nbEnCours,          color: 'bg-amber-400',   textColor: 'text-amber-700',   bgColor: 'bg-amber-50' },
                  { label: 'Pré-inscriptions en attente', value: stats.nbPreInscription,   color: 'bg-red-400',     textColor: 'text-red-700',     bgColor: 'bg-red-50' },
                ].map(({ label, value, color, textColor, bgColor }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                    <span className="text-sm text-gray-600 flex-1">{label}</span>
                    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${bgColor} ${textColor}`}>{value}</span>
                  </div>
                ))}
              </div>
              {stats.nbPreInscription > 0 && (
                <Link
                  to="/adhesions"
                  className="mt-4 flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Voir les pré-inscriptions
                  <Icon d={ICO.arrow} className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {/* Règlements */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <SectionTitle>Règlement des adhérents</SectionTitle>
              <div className="space-y-3">
                {[
                  { label: 'Soldés',               value: stats.reglSolde,    color: 'bg-emerald-500', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' },
                  { label: 'Chèques remis',        value: stats.reglPrevus,   color: 'bg-sky-400',     textColor: 'text-sky-700',     bgColor: 'bg-sky-50' },
                  { label: 'Partiellement réglé',  value: stats.reglPartiel,  color: 'bg-amber-400',   textColor: 'text-amber-700',   bgColor: 'bg-amber-50' },
                  { label: 'Non réglé',            value: stats.reglNonRegle, color: 'bg-red-400',     textColor: 'text-red-700',     bgColor: 'bg-red-50' },
                ].map(({ label, value, color, textColor, bgColor }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                    <span className="text-sm text-gray-600 flex-1">{label}</span>
                    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${bgColor} ${textColor}`}>{value}</span>
                  </div>
                ))}
              </div>

              {stats.totalDu > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-50 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Encaissé</span>
                    <span className="font-semibold text-gray-700">{pct(stats.totalEncaisse, stats.totalDu)} %</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${pct(stats.totalEncaisse, stats.totalDu)}%` }}
                    />
                    <div
                      className="h-full bg-sky-400 transition-all"
                      style={{ width: `${pct(stats.prevu, stats.totalDu)}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Encaissé</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />Chèques remis</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Cours réguliers ───────────────────────────────────────────────── */}
          {stats.cours.length > 0 && (
            <div>
              <SectionTitle>Cours réguliers — Taux de remplissage</SectionTitle>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Cours</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Horaire</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Inscrits</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell w-40">Remplissage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.cours.map(c => {
                      const full     = c.capacite && c.inscrits >= c.capacite
                      const ratio    = c.capacite ? c.inscrits / c.capacite : null
                      const barColor = ratio === null ? 'bg-gray-200' : ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-400' : 'bg-emerald-500'
                      return (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <span className="font-medium text-gray-800">{c.nom}</span>
                            {full && <Badge cls="ml-2 bg-red-100 text-red-600">Complet</Badge>}
                          </td>
                          <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">
                            {c.jour && <span className="capitalize">{c.jour} </span>}
                            {c.heure_debut && <span>{c.heure_debut.slice(0, 5)}{c.heure_fin ? `–${c.heure_fin.slice(0, 5)}` : ''}</span>}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-700">
                            {c.inscrits}{c.capacite ? <span className="text-gray-400 font-normal">/{c.capacite}</span> : ''}
                          </td>
                          <td className="px-5 py-3 hidden md:table-cell">
                            <ProgressBar value={c.inscrits} max={c.capacite ?? c.inscrits} colorClass={barColor} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Stages ───────────────────────────────────────────────────────── */}
          {stats.stages.length > 0 && (
            <div>
              <SectionTitle>Stages</SectionTitle>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Stage</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Dates</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Inscrits</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.stages.map(s => {
                      const full = s.capacite && s.inscrits >= s.capacite
                      let statusBadge
                      if (s.isPast)        statusBadge = <Badge cls="bg-gray-100 text-gray-500">Terminé</Badge>
                      else if (s.isFuture) statusBadge = <Badge cls="bg-sky-100 text-sky-700">À venir</Badge>
                      else                 statusBadge = <Badge cls="bg-emerald-100 text-emerald-700">En cours</Badge>
                      return (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <span className="font-medium text-gray-800">{s.nom}</span>
                            {full && <Badge cls="ml-2 bg-red-100 text-red-600">Complet</Badge>}
                          </td>
                          <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">
                            {s.date_debut || s.date_fin
                              ? `${formatDate(s.date_debut)}${s.date_fin ? ` → ${formatDate(s.date_fin)}` : ''}`
                              : '—'}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-700">
                            {s.inscrits}{s.capacite ? <span className="text-gray-400 font-normal">/{s.capacite}</span> : ''}
                          </td>
                          <td className="px-5 py-3 text-center hidden md:table-cell">{statusBadge}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Lien bas de page ─────────────────────────────────────────────── */}
          <div className="flex justify-center pb-2">
            <Link
              to="/adhesions"
              className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              Voir tous les adhérents
              <Icon d={ICO.arrow} className="w-4 h-4" />
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
