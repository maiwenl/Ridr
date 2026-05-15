import {useEffect, useRef, useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import {supabase} from '../lib/supabase'
import {inputCls} from '../lib/ui'
import {useAuth} from '../contexts/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'

// Client sans persistance de session — pour créer des comptes sans déconnecter le gérant
const supabaseSignUp = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}}
)

function genPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    return Array.from({length: 10}, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const ROLES = [
    {value: 'gérant', label: 'Gérant'},
    {value: 'moniteur', label: 'Moniteur'},
]

const ROLE_STYLE = {
    gérant: 'bg-brand-100 text-brand-700',
    moniteur: 'bg-violet-100 text-violet-700',
}

const INIT_FORM = {prenom: '', nom: '', email: '', role: 'moniteur'}

export default function Utilisateurs() {
    const {profile: me, clubId} = useAuth()
    const [profiles, setProfiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState({})
    const savedSnapshot = useRef({}) // id → { last_name, first_name } at last save

    // Modal ajout
    const [showModal, setShowModal] = useState(false)
    const [form, setForm] = useState(INIT_FORM)
    const [errors, setErrors] = useState({})
    const [creating, setCreating] = useState(false)
    const [success, setSuccess] = useState(null) // { email, tempPwd }
    const [copied, setCopied] = useState('') // clé du bouton copié

    async function fetchProfiles() {
        const {data} = await supabase.from('profiles').select('*').order('last_name')
        const list = (data ?? []).map(p => ({
            ...p,
            nom: p.last_name ?? p.nom,
            prenom: p.first_name ?? p.prenom,
        }))
        setProfiles(list)
        savedSnapshot.current = Object.fromEntries(list.map(p => [p.id, {nom: p.nom, prenom: p.prenom}]))
        setLoading(false)
    }

    useEffect(() => {
        fetchProfiles()
    }, [])

    // ── Édition inline nom/prénom
    function handleNameChange(id, field, value) {
        setProfiles(prev => prev.map(p => p.id === id ? {...p, [field]: value} : p))
    }

    async function handleNameBlur(id) {
        const p = profiles.find(p => p.id === id)
        if (!p) return
        const snap = savedSnapshot.current[id]
        if (snap && snap.nom === p.nom && snap.prenom === p.prenom) return
        setSaving(prev => ({...prev, [id]: true}))
        await supabase.from('profiles').update({last_name: p.nom, first_name: p.prenom}).eq('id', id)
        savedSnapshot.current[id] = {nom: p.nom, prenom: p.prenom}
        setSaving(prev => ({...prev, [id]: false}))
    }

    async function handleRoleChange(id, newRole) {
        setSaving(prev => ({...prev, [id]: true}))
        await supabase.from('profiles').update({role: newRole}).eq('id', id)
        setProfiles(prev => prev.map(p => p.id === id ? {...p, role: newRole} : p))
        setSaving(prev => ({...prev, [id]: false}))
    }

    // ── Création compte
    function openModal() {
        setForm(INIT_FORM)
        setErrors({})
        setSuccess(null)
        setShowModal(true)
    }

    function validate() {
        const e = {}
        if (!form.prenom.trim()) e.prenom = 'Requis'
        if (!form.nom.trim()) e.nom = 'Requis'
        if (!form.email.trim()) e.email = 'Requis'
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email invalide'
        return e
    }

    async function handleCreate() {
        const e = validate()
        if (Object.keys(e).length) {
            setErrors(e);
            return
        }
        setErrors({})
        setCreating(true)

        const tempPwd = genPassword()

        // 1. Créer le compte auth sans toucher à la session courante
        const {data: authData, error: authError} = await supabaseSignUp.auth.signUp({
            email: form.email.trim().toLowerCase(),
            password: tempPwd,
            options: {data: {first_name: form.prenom.trim(), last_name: form.nom.trim().toUpperCase()}},
        })

        if (authError) {
            setErrors({
                global: authError.message.toLowerCase().includes('already')
                    ? 'Un compte existe déjà avec cet email.'
                    : authError.message
            })
            setCreating(false)
            return
        }

        const userId = authData.user?.id
        if (!userId) {
            setErrors({global: 'Création du compte échouée. Réessayez.'})
            setCreating(false)
            return
        }

        // 2. Créer le profil lié au club du gérant
        const {error: profileError} = await supabase.from('profiles').insert({
            user_id: userId,
            club_id: clubId,
            first_name: form.prenom.trim(),
            last_name: form.nom.trim().toUpperCase(),
            role: form.role,
        })

        if (profileError) {
            setErrors({global: 'Compte créé mais profil non associé : ' + profileError.message})
            setCreating(false)
            return
        }

        const newProfile = {
            id: userId,
            first_name: form.prenom.trim(),
            last_name: form.nom.trim().toUpperCase(),
            prenom: form.prenom.trim(),
            nom: form.nom.trim().toUpperCase(),
            role: form.role,
        }
        setProfiles(prev => [...prev, newProfile].sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '')))
        savedSnapshot.current[userId] = {nom: newProfile.nom, prenom: newProfile.prenom}
        setCreating(false)
        setSuccess({email: form.email.trim().toLowerCase(), tempPwd})
    }

    function copyToClipboard(text, key) {
        navigator.clipboard.writeText(text)
        setCopied(key)
        setTimeout(() => setCopied(''), 2000)
    }

    const isMe = (id) => id === me?.id

    return (
        <div className="p-8 max-w-3xl">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Gérez les membres de l&apos;équipe et leurs accès.</p>
                </div>
                <button
                    onClick={openModal}
                    className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                    + Ajouter
                </button>
            </div>

            {/* Légende rôles */}
            <div className="flex gap-4 mb-6 text-xs text-gray-500 flex-wrap">
                <span><span className="font-semibold text-brand-700">Gérant</span> — accès complet</span>
                <span><span className="font-semibold text-violet-700">Moniteur</span> — pointage de ses cours</span>
            </div>

            {/* Table */}
            {loading ? <LoadingSpinner/> : (
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
                            <tr key={p.id}
                                className={`hover:bg-gray-50 transition-colors ${isMe(p.id) ? 'bg-brand-50/40' : ''}`}>
                                <td className="px-5 py-3">
                                    <input
                                        value={p.prenom ?? ''}
                                        onChange={e => handleNameChange(p.id, 'prenom', e.target.value)}
                                        onBlur={() => handleNameBlur(p.id)}
                                        className="text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none w-full"
                                    />
                                </td>
                                <td className="px-5 py-3">
                                    <input
                                        value={p.nom ?? ''}
                                        onChange={e => handleNameChange(p.id, 'nom', e.target.value)}
                                        onBlur={() => handleNameBlur(p.id)}
                                        className="text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none w-full"
                                    />
                                </td>
                                <td className="px-5 py-3">
                                    <select
                                        value={p.role}
                                        onChange={e => handleRoleChange(p.id, e.target.value)}
                                        disabled={saving[p.id] || isMe(p.id)}
                                        className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 ${ROLE_STYLE[p.role] ?? ROLE_STYLE.visiteur}`}
                                    >
                                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </td>
                                <td className="px-5 py-3">
                                    {isMe(p.id) ? (
                                        <span className="text-xs text-brand-600 font-medium">Vous</span>
                                    ) : saving[p.id] ? (
                                        <span className="text-xs text-gray-500">Enregistrement…</span>
                                    ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>

                    {profiles.length === 0 && (
                        <p className="px-5 py-10 text-center text-sm text-gray-500">Aucun utilisateur.</p>
                    )}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

                        {/* Header modal */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {success ? 'Compte créé !' : 'Nouvel utilisateur'}
                            </h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-500 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl leading-none"
                            >
                                ×
                            </button>
                        </div>

                        {success ? (
                            /* ── Écran succès ── */
                            <div className="px-6 py-5">
                                <div
                                    className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50 border-2 border-green-200 mx-auto mb-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-green-600"
                                         fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round"
                                              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                                    </svg>
                                </div>
                                <p className="text-center text-sm text-gray-600 mb-4">
                                    Compte créé pour <span
                                    className="font-semibold text-gray-900">{success.email}</span>.
                                    <br/>Transmettez ces identifiants à la personne.
                                </p>

                                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-3 space-y-2">
                                    <div>
                                        <p className="text-xs text-gray-500 mb-0.5">Email</p>
                                        <p className="text-sm font-semibold text-gray-800">{success.email}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 mb-0.5">Mot de passe temporaire</p>
                                        <div className="flex items-center gap-2">
                                            <code
                                                className="flex-1 text-base font-bold text-gray-900 tracking-widest">{success.tempPwd}</code>
                                            <button
                                                onClick={() => copyToClipboard(success.tempPwd, 'pwd')}
                                                className={`text-xs font-medium px-2.5 py-1.5 border rounded-lg transition-colors shrink-0 ${copied === 'pwd' ? 'bg-green-50 border-green-200 text-green-700' : 'text-brand-600 hover:text-brand-800 border-brand-200 hover:bg-brand-50'}`}
                                            >
                                                {copied === 'pwd' ? '✓ Copié !' : 'Copier'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 mb-4">
                                    <a
                                        href={`mailto:${success.email}?subject=Votre%20acc%C3%A8s%20StableConnect&body=Bonjour%2C%0A%0AVoici%20vos%20identifiants%20pour%20acc%C3%A9der%20%C3%A0%20StableConnect%20%3A%0A%0AEmail%20%3A%20${encodeURIComponent(success.email)}%0AMot%20de%20passe%20%3A%20${encodeURIComponent(success.tempPwd)}%0A%0AConnectez-vous%20sur%20%3A%20${encodeURIComponent(window.location.origin)}%0A%0APensez%20%C3%A0%20changer%20votre%20mot%20de%20passe%20apr%C3%A8s%20la%20premi%C3%A8re%20connexion.`}
                                        className="flex-1 text-center text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 py-2 rounded-lg transition-colors"
                                    >
                                        Envoyer par email
                                    </a>
                                    <button
                                        onClick={() => copyToClipboard(`Email : ${success.email}\nMot de passe : ${success.tempPwd}`, 'both')}
                                        className={`flex-1 text-sm font-medium py-2 border rounded-lg transition-colors ${copied === 'both' ? 'bg-green-50 border-green-200 text-green-700' : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-200'}`}
                                    >
                                        {copied === 'both' ? '✓ Copié !' : 'Copier les deux'}
                                    </button>
                                </div>

                                <button
                                    onClick={() => setShowModal(false)}
                                    className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                                >
                                    Fermer
                                </button>
                            </div>
                        ) : (
                            /* ── Formulaire ── */
                            <div className="px-6 py-5 space-y-4">
                                {/* Prénom + Nom */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                                        <input
                                            type="text"
                                            value={form.prenom}
                                            onChange={e => setForm(f => ({...f, prenom: e.target.value}))}
                                            className={inputCls(errors.prenom)}
                                            autoFocus
                                        />
                                        {errors.prenom && <p className="text-xs text-red-500 mt-1">{errors.prenom}</p>}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                                        <input
                                            type="text"
                                            value={form.nom}
                                            onChange={e => setForm(f => ({...f, nom: e.target.value}))}
                                            className={inputCls(errors.nom)}
                                        />
                                        {errors.nom && <p className="text-xs text-red-500 mt-1">{errors.nom}</p>}
                                    </div>
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={e => setForm(f => ({...f, email: e.target.value}))}
                                        placeholder="prenom.nom@exemple.fr"
                                        className={inputCls(errors.email)}
                                    />
                                    {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                                </div>

                                {/* Rôle */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                                    <div className="flex gap-2">
                                        {ROLES.map(r => (
                                            <button
                                                key={r.value}
                                                type="button"
                                                onClick={() => setForm(f => ({...f, role: r.value}))}
                                                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                                    form.role === r.value
                                                        ? ROLE_STYLE[r.value] + ' border-transparent ring-2 ring-offset-1 ' + (r.value === 'gérant' ? 'ring-brand-400' : r.value === 'moniteur' ? 'ring-violet-400' : 'ring-gray-400')
                                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                                }`}
                                            >
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1.5">
                                        {form.role === 'gérant' && 'Accès complet à toutes les fonctionnalités.'}
                                        {form.role === 'moniteur' && 'Peut uniquement faire le pointage de ses cours.'}
                                    </p>
                                </div>

                                {errors.global && (
                                    <div
                                        className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <svg xmlns="http://www.w3.org/2000/svg"
                                             className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24"
                                             strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
                                        </svg>
                                        <p className="text-xs text-red-600">{errors.global}</p>
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-1">
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={creating}
                                        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        {creating && (
                                            <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg"
                                                 fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10"
                                                        stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor"
                                                      d="M4 12a8 8 0 018-8v8z"/>
                                            </svg>
                                        )}
                                        {creating ? 'Création…' : 'Créer le compte'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
