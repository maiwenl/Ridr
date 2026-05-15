// ── Utilitaires semaine ISO ──────────────────────────────────────────────────

/** Retourne le numéro de semaine ISO et l'année ISO pour une date. */
export function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return {
        num: Math.ceil((((d - yearStart) / 86400000) + 1) / 7),
        year: d.getUTCFullYear(),
    }
}

/** Clé de semaine ISO au format "YYYY-Www". */
export function weekKey(date) {
    const {num, year} = getISOWeek(date)
    return `${year}-W${String(num).padStart(2, '0')}`
}

/**
 * Compte les semaines actives restantes dans la saison à partir d'aujourd'hui.
 * Retourne null si aucun calendrier n'est configuré.
 */
export function countActiveWeeksRemaining(cal) {
    const finVal = cal?.end_date ?? cal?.fin
    if (!finVal) return null
    const today = new Date()
    const fin = new Date(finVal)
    if (today > fin) return 0

    const inactive = new Set(cal.inactive_weeks ?? cal.semaines_inactives ?? [])
    let count = 0

    // Lundi de la semaine courante (UTC)
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    const dow = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() - dow + 1)

    while (d <= fin) {
        if (!inactive.has(weekKey(d))) count++
        d.setUTCDate(d.getUTCDate() + 7)
    }
    return count
}

// ─────────────────────────────────────────────────────────────────────────────

export const GALOPS = ['Débutant', 'Galop 1', 'Galop 2', 'Galop 3', 'Galop 4', 'Galop 5', 'Galop 6', 'Galop 7']

export const MODES_PAIEMENT = [
    {value: '1_fois', label: '1 fois — paiement intégral'},
    {value: '3_fois', label: '3 fois — 3 versements égaux'},
    {value: '10_fois', label: '10 fois — mensualités sept. → juin'},
]

export const MODES_REGLEMENT = [
    {value: 'cheque', label: 'Chèque'},
    {value: 'virement', label: 'Virement'},
    {value: 'carte', label: 'Carte bancaire'},
]

export function calculateAge(dateNaissance) {
    if (!dateNaissance) return null
    const today = new Date()
    const birth = new Date(dateNaissance)
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age
}

export function filterForfaitsByAge(forfaits, age) {
    if (age === null) return []
    return forfaits.filter(f => {
        const minOk = (f.min_age ?? f.age_min) === null || age >= (f.min_age ?? f.age_min)
        const maxOk = (f.max_age ?? f.age_max) === null || age <= (f.max_age ?? f.age_max)
        return minOk && maxOk
    })
}

/**
 * Calcule le total financier d'une inscription.
 * - cours_annuel : forfait(s) + licence FFE - remiseMontant
 * - stage : prixBase (getStagePrix(activite.tarif, formule, isAdherent)) - remiseMontant, sans licence
 *
 * La remise est libre (montant saisi manuellement), pas de logique conditionnelle.
 */
export function computeFinancial({forfait1, forfait2, prixBase, remiseMontant, age, parametres}) {
    const remise = Math.max(0, Number(remiseMontant ?? 0))

    if (prixBase !== undefined) {
        // Stage : pas de licence FFE
        const prixForfait1 = Number(prixBase ?? 0)
        const totalForfait = Math.max(0, prixForfait1 - remise)
        return {
            total: totalForfait,
            totalForfait,
            licenceMontant: 0,
            remiseAppliquee: remise,
            prixForfait1,
            prixForfait2: 0
        }
    }

    // Cours annuel : licence FFE incluse
    const licenceMontant = age !== null && age <= 18
        ? Number(parametres.licence_mineur ?? 25)
        : Number(parametres.licence_majeur ?? 36)

    const prixForfait1 = forfait1 ? Number(forfait1.price ?? forfait1.prix) : 0
    const prixForfait2 = forfait2 ? Number(forfait2.price ?? forfait2.prix) : 0
    const totalForfait = Math.max(0, prixForfait1 + prixForfait2 - remise)
    const total = totalForfait + licenceMontant
    const acompteMontant = Number(parametres?.acompte_montant ?? 0)

    return {total, totalForfait, licenceMontant, acompteMontant, remiseAppliquee: remise, prixForfait1, prixForfait2}
}

export function computeEcheancier(totalForfait, licenceMontant, modePaiement) {
    const round2 = n => Math.round(n * 100) / 100
    const licenceEntry = {label: 'Licence FFE', montant: licenceMontant}

    if (modePaiement === '1_fois') {
        return [
            licenceEntry,
            {label: 'Forfait', montant: totalForfait},
        ]
    }
    if (modePaiement === '3_fois') {
        const m = round2(totalForfait / 3)
        return [
            licenceEntry,
            ...[1, 2, 3].map(n => ({label: `Versement ${n}/3`, montant: m})),
        ]
    }
    if (modePaiement === '10_fois') {
        const m = round2(totalForfait / 10)
        const mois = [
            ['Septembre', 2026], ['Octobre', 2026], ['Novembre', 2026], ['Décembre', 2026],
            ['Janvier', 2027], ['Février', 2027], ['Mars', 2027], ['Avril', 2027],
            ['Mai', 2027], ['Juin', 2027],
        ]
        return [
            licenceEntry,
            ...mois.map(([month, year]) => ({label: `1er ${month} ${year}`, montant: m})),
        ]
    }
    return []
}

export function formatModePaiement(m) {
    return m === '1_fois' ? '1 fois' : m === '3_fois' ? '3 fois' : '10 fois'
}

export function formatModeReglement(m) {
    return m === 'cheque' ? 'Chèque' : m === 'virement' ? 'Virement' : 'Carte bancaire'
}

export function formatMontant(n) {
    return Number(n).toLocaleString('fr-FR') + ' €'
}

/**
 * Retourne le prix d'un stage en fonction de la formule et du statut adhérent.
 * @param {object|null} tarif    - objet tarifs_stage (activite.tarif)
 * @param {string}      formule  - 'journee' | 'matin' | 'apres_midi'
 * @param {boolean}     isAdherent
 */
export function getStagePrix(tarif, formule, isAdherent) {
    if (!tarif) return null
    const isDemi = formule === 'matin' || formule === 'apres_midi'
    if (isDemi) {
        return isAdherent
            ? tarif.prix_demi_journee_adherent
            : tarif.prix_demi_journee_non_adherent
    }
    return isAdherent
        ? tarif.prix_journee_adherent
        : tarif.prix_journee_non_adherent
}

/**
 * Calcule les totaux encaissés / reste à payer à partir d'une liste de paiements.
 * Les remboursements sont déduits du total encaissé.
 */
export function computePaiements(paiements, montantTotal) {
    const recus = paiements.filter(p => (p.status ?? p.statut) === 'encaisse' || (p.status ?? p.statut) === 'recu')
    const encaisse = recus.filter(p => p.type !== 'remboursement').reduce((s, p) => s + Number(p.amount ?? p.montant), 0)
    const rembourse = recus.filter(p => p.type === 'remboursement').reduce((s, p) => s + Number(p.amount ?? p.montant), 0)
    const totalEncaisse = Math.round((encaisse - rembourse) * 100) / 100
    const resteADu = montantTotal != null ? Math.max(0, Math.round((montantTotal - totalEncaisse) * 100) / 100) : null
    const estSolde = montantTotal != null && montantTotal > 0 && resteADu === 0
    return {totalEncaisse, resteADu, estSolde}
}
