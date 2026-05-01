export const GALOPS = ['Débutant', 'Galop 1', 'Galop 2', 'Galop 3', 'Galop 4', 'Galop 5', 'Galop 6', 'Galop 7']

export const MODES_PAIEMENT = [
  { value: '1_fois', label: '1 fois — paiement intégral' },
  { value: '3_fois', label: '3 fois — 3 versements égaux' },
  { value: '10_fois', label: '10 fois — mensualités sept. → juin' },
]

export const MODES_REGLEMENT = [
  { value: 'cheque', label: 'Chèque' },
  { value: 'virement', label: 'Virement' },
  { value: 'carte', label: 'Carte bancaire' },
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
    const minOk = f.age_min === null || age >= f.age_min
    const maxOk = f.age_max === null || age <= f.age_max
    return minOk && maxOk
  })
}

export function computeFinancial({ forfait1, forfait2, remiseFamille, age, parametres }) {
  const licenceMontant = age !== null && age < 18
    ? Number(parametres.licence_mineur ?? 25)
    : Number(parametres.licence_majeur ?? 36)

  const remiseMontant = Number(parametres.remise_2eme_forfait ?? 50)

  const prixForfait1 = forfait1 ? Number(forfait1.prix) : 0
  const prixForfait2 = forfait2 ? Number(forfait2.prix) : 0

  let remiseAppliquee = 0
  if (forfait2) {
    remiseAppliquee = remiseMontant
  } else if (remiseFamille) {
    remiseAppliquee = remiseMontant
  }

  const total = prixForfait1 + prixForfait2 - remiseAppliquee + licenceMontant

  return { total, licenceMontant, remiseAppliquee, prixForfait1, prixForfait2 }
}

export function computeEcheancier(total, modePaiement) {
  const round2 = n => Math.round(n * 100) / 100
  if (modePaiement === '1_fois') {
    return [{ label: 'Paiement intégral', montant: total }]
  }
  if (modePaiement === '3_fois') {
    const m = round2(total / 3)
    return [1, 2, 3].map(n => ({ label: `Versement ${n}/3`, montant: m }))
  }
  if (modePaiement === '10_fois') {
    const m = round2(total / 10)
    const mois = [
      ['Septembre', 2026], ['Octobre', 2026], ['Novembre', 2026], ['Décembre', 2026],
      ['Janvier', 2027], ['Février', 2027], ['Mars', 2027], ['Avril', 2027],
      ['Mai', 2027], ['Juin', 2027],
    ]
    return mois.map(([month, year]) => ({ label: `1er ${month} ${year}`, montant: m }))
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
