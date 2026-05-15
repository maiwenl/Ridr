import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function row(label: string, value: string | null): string {
  if (!value) return ''
  return `
    <tr>
      <td style="padding:8px 12px;color:#6b7280;font-size:14px;white-space:nowrap">${label}</td>
      <td style="padding:8px 12px;color:#111827;font-size:14px;font-weight:600">${value}</td>
    </tr>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const raw     = await req.json()
  const nom     = escapeHtml(raw.nom)
  const prenom  = escapeHtml(raw.prenom)
  const email   = raw.email?.trim() ?? ''
  const saison  = escapeHtml(raw.saison)
  const cours       = raw.cours       ? escapeHtml(raw.cours)       : null
  const forfait     = raw.forfait     ? escapeHtml(raw.forfait)     : null
  const galop       = raw.galop       ? escapeHtml(raw.galop)       : null
  const licence_ffe = raw.licence_ffe ? escapeHtml(raw.licence_ffe) : null
  const club        = raw.club        ? escapeHtml(raw.club)        : null
  const montant = raw.montant != null
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(raw.montant)
    : null

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ ok: false, error: 'Email invalide' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const recapRows = [
    row('Cavalier', `${prenom} ${nom}`),
    row('Saison', saison),
    row('Niveau (galop)', galop),
    row('Licence FFE', licence_ffe),
    row('Cours souhaité', cours),
    row('Forfait', forfait),
    row('Montant estimé', montant),
  ].join('')

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- En-tête -->
        <tr>
          <td style="background:#1e293b;padding:32px 36px">
            <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase">${club ?? 'Le club'} · Saison ${saison}</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.2">Pré-inscription enregistrée</h1>
          </td>
        </tr>

        <!-- Corps -->
        <tr>
          <td style="padding:32px 36px">
            <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.6">
              Bonjour <strong>${prenom}</strong>,<br>
              Votre pré-inscription pour la saison <strong>${saison}</strong> a bien été prise en compte.
            </p>

            <!-- Récapitulatif -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px">
              <div style="background:#f1f5f9;padding:10px 16px;border-bottom:1px solid #e2e8f0">
                <p style="margin:0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Récapitulatif de votre demande</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${recapRows}
              </table>
            </div>

            <!-- Encart validation -->
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#92400e">En attente de validation</p>
              <p style="margin:0;font-size:14px;color:#b45309;line-height:1.5">
                Votre dossier va être examiné par nos moniteurs. Vous recevrez une confirmation définitive dès qu'il sera validé.
              </p>
            </div>

            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">
              En cas de question, n'hésitez pas à nous contacter directement.<br><br>
              À très bientôt ${club ? `au <strong style="color:#374151">${club}</strong>` : 'au club'} !
            </p>
          </td>
        </tr>

        <!-- Pied de page -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Ce mail a été envoyé automatiquement suite à votre pré-inscription en ligne.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev',
      to: email,
      subject: `Pré-inscription enregistrée${club ? ` · ${club}` : ''} — Saison ${saison}`,
      html,
    }),
  })

  const data = await res.json()
  return new Response(JSON.stringify({ ok: res.ok, data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
