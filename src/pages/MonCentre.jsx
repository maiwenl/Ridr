import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const CHAMPS = [
  {
    section: 'Informations générales',
    fields: [
      { key: 'name',        label: 'Nom du centre',    type: 'text',     placeholder: 'Ex. Centre Équestre du Val', required: true },
      { key: 'address',     label: 'Adresse',          type: 'textarea', placeholder: '12 chemin des Écuries\n75000 Paris' },
      { key: 'phone',       label: 'Téléphone',        type: 'tel',      placeholder: '01 23 45 67 89' },
      { key: 'email',       label: 'Email de contact', type: 'email',    placeholder: 'contact@moncentre.fr' },
      { key: 'website',     label: 'Site web',         type: 'url',      placeholder: 'https://moncentre.fr' },
    ],
  },
  {
    section: 'Identifiants officiels',
    fields: [
      { key: 'siret',      label: 'N° SIRET',          type: 'text', placeholder: '123 456 789 00012' },
      { key: 'ffe_number', label: 'N° affiliation FFE', type: 'text', placeholder: 'Ex. 75-1234' },
    ],
  },
  {
    section: 'Présentation',
    fields: [
      { key: 'description', label: 'Description courte', type: 'textarea', placeholder: 'Quelques mots sur votre centre, visibles sur le formulaire de pré-inscription…' },
    ],
  },
]

const ALL_KEYS = CHAMPS.flatMap(s => s.fields.map(f => f.key))
const INIT_FORM = Object.fromEntries(ALL_KEYS.map(k => [k, '']))

export default function MonCentre() {
  const { clubId, profile } = useAuth()
  const [form, setForm]       = useState({ ...INIT_FORM, name: profile?.club?.name ?? '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!clubId) return
    supabase
      .from('clubs')
      .select(ALL_KEYS.join(', '))
      .eq('id', clubId)
      .single()
      .then(({ data }) => {
        if (data) setForm(prev => ({ ...prev, ...Object.fromEntries(ALL_KEYS.map(k => [k, data[k] ?? ''])) }))
        setLoading(false)
      })
  }, [clubId])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const updates = Object.fromEntries(
      ALL_KEYS.map(k => [k, form[k]?.trim() || null])
    )
    // name ne peut pas être null
    if (!updates.name) { setError('Le nom du centre est requis.'); setSaving(false); return }

    const { error: err } = await supabase
      .from('clubs')
      .update(updates)
      .eq('id', clubId)

    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const nomCentre = profile?.club?.name || form.name?.trim() || 'Mon centre'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{nomCentre}</h1>
            <p className="text-sm text-gray-500">Informations du centre équestre</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {CHAMPS.map(({ section, fields }) => (
          <div key={section} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">{section}</h2>
            </div>
            <div className="px-6 py-5 space-y-5">
              {fields.map(({ key, label, type, placeholder, required }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {label}
                    {!required && <span className="ml-1.5 text-xs font-normal text-gray-400">(facultatif)</span>}
                  </label>
                  {type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={form[key] ?? ''}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none transition"
                    />
                  ) : (
                    <input
                      type={type}
                      value={form[key] ?? ''}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      required={required}
                      className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between pt-2">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && !error && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Enregistré
            </span>
          )}
          {!error && !saved && <span />}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all duration-150 active:scale-[0.98]"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Enregistrement…
              </>
            ) : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  )
}
