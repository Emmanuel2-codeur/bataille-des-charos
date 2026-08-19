import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'npm

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:eadande2@gmail.com'
const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET')!

webpush.setVapidDetails(subject, publicKey, privateKey)
const supabase = createClient(supabaseUrl, serviceRoleKey)

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (request.headers.get('x-push-secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = await request.json()
  const notificationId = payload.notification_id || payload.record?.id

  if (!notificationId) {
    return Response.json({ error: 'notification_id manquant' }, { status: 400 })
  }

  const { data: notification, error: notificationError } = await supabase
    .from('notifications')
    .select('id, recipient_id, title, body, link')
    .eq('id', notificationId)
    .single()

  if (notificationError) {
    return Response.json({ error: notificationError.message }, { status: 500 })
  }

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', notification.recipient_id)

  const result = { sent: 0, removed: 0 }

  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify({
          title: notification.title,
          body: notification.body,
          url: notification.link || '/annonces',
          icon: '/logo.jpg',
          badge: '/logo.jpg',
          tag: notification.type || 'charos-notification',
        }),
      )
      result.sent += 1
    } catch (error) {
      const statusCode = error?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
        result.removed += 1
      }
      console.error('[send-push]', error)
    }
  }

  return Response.json(result)
})
