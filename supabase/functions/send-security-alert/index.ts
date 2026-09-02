// ============================================================================
// Edge Function : send-security-alert
// Envoie un email au(x) super-admin(s) dès qu'une ligne est insérée dans
// public.security_alerts (à brancher via un Database Webhook Supabase).
//
// Secrets requis (Supabase > Edge Functions > send-security-alert > Secrets) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (déjà utilisés par send-push)
//   RESEND_API_KEY                             (clé API https://resend.com)
//   ALERT_EMAIL_FROM                           (ex: alerte@tondomaine.com)
//   SECURITY_ALERT_WEBHOOK_SECRET              (secret partagé avec le webhook)
//
// Configuration du webhook (SQL Editor ou Database > Webhooks) :
//   Table: security_alerts · Événement: INSERT
//   URL: https://<projet>.supabase.co/functions/v1/send-security-alert
//   En-tête: x-alert-secret: <SECURITY_ALERT_WEBHOOK_SECRET>
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')
const fromEmail = Deno.env.get('ALERT_EMAIL_FROM') || 'alerte@bataille-des-charos.app'
const webhookSecret = Deno.env.get('SECURITY_ALERT_WEBHOOK_SECRET')!

const supabase = createClient(supabaseUrl, serviceRoleKey)

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Info',
  medium: 'Attention',
  high: 'Alerte',
  critical: 'CRITIQUE',
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (request.headers.get('x-alert-secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = await request.json()
  const alert = payload.record

  if (!alert) {
    return Response.json({ error: 'record manquant dans le payload' }, { status: 400 })
  }

  // Récupère l'email de chaque super-admin
  const { data: superAdmins, error: superAdminsError } = await supabase
    .from('profiles')
    .select('email, pseudo')
    .eq('role', 'super_admin')

  if (superAdminsError) {
    return Response.json({ error: superAdminsError.message }, { status: 500 })
  }

  if (!resendApiKey) {
    // Pas de fournisseur email configuré : on log seulement, l'alerte reste
    // visible in-app (notifications) — ce n'est pas bloquant.
    return Response.json({ sent: 0, note: 'RESEND_API_KEY non configurée : email ignoré.' })
  }

  const severityLabel = SEVERITY_LABEL[alert.severity] || alert.severity
  const subject = `[${severityLabel}] Bataille des Charos — ${alert.type}`
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border-radius:16px;border:1px solid #e5e7eb;">
      <p style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;font-weight:800;color:#FF5A1F;">Alerte sécurité · ${severityLabel}</p>
      <h2 style="margin:8px 0 16px;color:#111827;">${alert.type}</h2>
      <p style="color:#111827;font-size:14px;line-height:1.6;">${alert.message}</p>
      ${alert.actor_pseudo ? `<p style="color:#6b7280;font-size:12px;">Compte concerné : <strong>${alert.actor_pseudo}</strong></p>` : ''}
      <p style="color:#6b7280;font-size:12px;">Détecté le ${new Date(alert.created_at).toLocaleString('fr-FR')}</p>
      <a href="https://bataille-des-charos.app/admin?tab=securite" style="display:inline-block;margin-top:16px;padding:10px 18px;border-radius:10px;background:linear-gradient(135deg,#FF5A1F,#FFB020);color:#fff;text-decoration:none;font-weight:700;font-size:13px;">Ouvrir le panneau de sécurité</a>
    </div>
  `

  let sent = 0
  for (const admin of superAdmins || []) {
    if (!admin.email) continue
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: admin.email,
        subject,
        html,
      }),
    })
    if (res.ok) sent += 1
  }

  return Response.json({ sent })
})
