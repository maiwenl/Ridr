import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ROLES = [
  { value: 'gérant',   label: 'Gérant' },
  { value: 'moniteur', label: 'Moniteur' },
  { value: 'visiteur', label: 'Visiteur' },
]

const ROLE_STYLE = {
  gérant:   'bg-brand-100 text-brand-700',
  moniteur: 'bg-violet-100 text-violet-700',
  visiteur: 'bg-gray-100 text-gray-600',
}

export default function Utilisateurs() {
  const { profile: me } = useAuth()
  const [profiles, setProfiles]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState({})
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ nom: '', prenom: '', role: 'moniteur' })
  const [formError, setFormError] = useState('')
  const [creating, setCreating]   = useState(false)

  async function fetchProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('nom')
    setProfiles(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchProfiles() }, [])

  async function handleRoleChange(id, newRole) {
    setSaving(prev => ({ ...prev, [id]: true }))
    await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, role: newRole } : p))
    setSaving(prev => ({ ...prev, [id]: false }))
  }

  async function handleNameChange(id, field, value) {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  async function handleNameBlur(id) {
    const p = profiles.find(p => p.id === id)
    if (!p) return
    setSaving(prev => ({ ...prev, [id]: true }))
    await supabase.from('profiles').update({ nom: p.nom, prenom: p.prenom }).eq('id', id)
    setSaving(prev => ({ ...prev, [id]: false }))
  }

  async function handleCreate() {
    if (!form.nom.trim() || !form.prenom.trim()) {
      setFormError('Nom et prénom requis.')
      return
    }
    setFormError('')
    setCreating(true)
    // Crée uniquement le profil avec un UUID temporaire
    // L'utilisateur devra être invité via Supabase Auth pour se connecter
    // Ici on crée juste la fiche pour qu'elle soit sélectionnable comme moniteur sur un cours
    const { error } = await supabase.from('profiles').insert({
      id:     crypto.randomUUID(),
      nom:    form.nom.trim().toUpperCase(),
      prenom: form.prenom.trim(),
      role:   form.role,
    })
    if (error) {
      setFormError('Erreur lors de la création : ' + error.message)
      setCreating(false)
      return
    }
    setForm({ nom: '', prenom: '', role: 'moniteur' })
    setShowForm(false)
    setCreating(false)
    fetchProfiles()
  }

  const isMe = (id) => id === me?.id

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Gérez les rôles des membres de l'équipe.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError('') }}
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Ajouter
        </button>
      </div>

      {/* Légende rôles */}
      <div className="flex gap-4 mb-6 text-xs text-gray-500">
        <span><span className="font-semibold text-brand-700">Gérant</span> — accès complet</span>
        <span><span className="font-semibold text-violet-700">Moniteur</span> — pointage de ses cours</span>
        <span><span className="font-semibold text-gray-600">Visiteur</span> — consultation</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Prénom</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rôle</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${isMe(p.id) ? 'bg-brand-50/40' : ''}`}>
                  <td className="px-5 py-3">
                    <input
                      value={p.prenom}
                      onChange={e => handleNameChange(p.id, 'prenom', e.target.value)}
                      onBlur={() => handleNameBlur(p.id)}
                      className="text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none w-full"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <input
                      value={p.nom}
                      onChange={e => handleNameChange(p.id, 'nom', e.target.value)}
                      onBlur={() => handleNameBlur(p.id)}
                      className="text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none w-full"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={p.role}
                      onChange={e => handleRoleChange(p.id, e.target.value)}
                      disabled={saving[p.id]}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 ${ROLE_STYLE[p.role] ?? ROLE_STYLE.visiteur}`}
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    {isMe(p.id) ? (
                      <span className="text-xs text-brand-600 font-medium">Vous</span>
                    ) : saving[p.id] ? (
                      <span className="text-xs text-gray-400">Enregistrement…</span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {profiles.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-gray-400">Aucun utilisateur.</p>
          )}
        </div>
      )}

      {/* Note invitation */}
      <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
        <p className="font-medium mb-1">Pour qu'un moniteur puisse se connecter</p>
        <p className="text-xs text-amber-600">
          Invitez-le via <strong>Supabase → Authentication → Users → Invite user</strong> avec son adresse email.
          Son profil sera créé automatiquement, vous n'aurez plus qu'à lui assigner le rôle <strong>Moniteur</strong> ici.
        </p>
      </div>

      {/* Modal ajout rapide */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ajouter un utilisateur</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                <input
                  type="text"
                  value={form.prenom}
                  onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {creating ? 'Création…' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
