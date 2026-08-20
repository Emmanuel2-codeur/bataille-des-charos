import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BellRing, CheckCheck, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'


// ============================================================
// DATES
// ============================================================

function relativeDate(date) {
  const diff = Date.now() - new Date(date).getTime()

  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`

  const hours = Math.floor(minutes / 60)

  if (hours < 24) return `Il y a ${hours} h`

  const days = Math.floor(hours / 24)

  if (days < 7) return `Il y a ${days} j`

  return new Date(date).toLocaleDateString('fr-FR')
}


// ============================================================
// ICONES
// ============================================================

function iconFor(type) {
  if (type === 'match_in_progress') return '🔴'
  if (type === 'match_live') return '🔴'
  if (type === 'match_completed') return '🏆'
  if (type === 'match_scheduled') return '⚔️'
  if (type === 'comment_reply') return '↩️'
  if (type === 'comment') return '💬'
  if (type === 'reaction') return '❤️'
  if (type === 'approval') return '🎉'

  return '📢'
}


// ============================================================
// VAPID
// ============================================================

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat(
    (4 - (base64String.length % 4)) % 4
  )

  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)

  return Uint8Array.from(
    [...rawData].map(char => char.charCodeAt(0))
  )
}


// ============================================================
// SERVICE WORKER
// ============================================================

async function getPushRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker non supporté par ce navigateur.')
  }

  if (!window.isSecureContext) {
    throw new Error(
      'Les notifications Push nécessitent HTTPS ou localhost.'
    )
  }

  console.log('[Notifications] Enregistrement du Service Worker...')

  const registration = await navigator.serviceWorker.register(
    '/sw.js',
    {
      scope: '/',
      updateViaCache: 'none',
    }
  )

  console.log(
    '[Notifications] Service Worker enregistré:',
    registration.scope
  )

  // On attend qu'un Service Worker actif soit disponible.
  if (!registration.active) {
    console.log(
      '[Notifications] Attente de l’activation du Service Worker...'
    )

    await navigator.serviceWorker.ready
  }

  return registration
}


// ============================================================
// ACTIVATION PUSH
// ============================================================

async function enableBrowserPush(userId) {
  console.log('[Notifications] 🔔 Début activation Push')

  try {
    // ----------------------------------------------------------
    // Vérifications navigateur
    // ----------------------------------------------------------

    if (!('Notification' in window)) {
      throw new Error(
        'Les notifications navigateur ne sont pas supportées.'
      )
    }

    if (!('serviceWorker' in navigator)) {
      throw new Error(
        'Les Service Workers ne sont pas supportés.'
      )
    }

    if (!('PushManager' in window)) {
      throw new Error(
        'Les notifications Push ne sont pas supportées.'
      )
    }

    if (!window.isSecureContext) {
      throw new Error(
        'Le site doit être en HTTPS ou fonctionner sur localhost.'
      )
    }


    // ----------------------------------------------------------
    // VAPID
    // ----------------------------------------------------------

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY

    if (!publicKey) {
      throw new Error(
        'VITE_VAPID_PUBLIC_KEY est absente du fichier .env'
      )
    }

    console.log('[Notifications] ✅ Clé VAPID trouvée')


    // ----------------------------------------------------------
    // Permission
    // ----------------------------------------------------------

    let permission = Notification.permission

    console.log(
      '[Notifications] Permission actuelle:',
      permission
    )

    if (permission === 'default') {
      permission = await Notification.requestPermission()

      console.log(
        '[Notifications] Permission obtenue:',
        permission
      )
    }

    if (permission !== 'granted') {
      throw new Error(
        `Permission notifications refusée: ${permission}`
      )
    }


    // ----------------------------------------------------------
    // SERVICE WORKER
    // ----------------------------------------------------------

    const registration = await getPushRegistration()

    console.log(
      '[Notifications] Service Worker actif:',
      !!registration.active
    )


    // ----------------------------------------------------------
    // SUBSCRIPTION
    // ----------------------------------------------------------

    let subscription =
      await registration.pushManager.getSubscription()

    if (subscription) {
      console.log(
        '[Notifications] Subscription existante trouvée.'
      )
    }

    if (!subscription) {
      console.log(
        '[Notifications] Création de la subscription Push...'
      )

      subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToUint8Array(publicKey),
        })

      console.log(
        '[Notifications] ✅ Subscription créée.'
      )
    }


    // ----------------------------------------------------------
    // DONNÉES
    // ----------------------------------------------------------

    const json = subscription.toJSON()

    if (
      !json.endpoint ||
      !json.keys?.p256dh ||
      !json.keys?.auth
    ) {
      throw new Error(
        'La subscription Push est invalide.'
      )
    }


    // ----------------------------------------------------------
    // SUPABASE
    // ----------------------------------------------------------

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        {
          onConflict: 'endpoint',
        }
      )

    if (error) {
      console.error(
        '[Notifications] Erreur Supabase:',
        error
      )

      throw error
    }

    console.log(
      '[Notifications] 🎉 Push activé avec succès !'
    )

    return true

  } catch (error) {

    console.error(
      '[Notifications] ❌ Erreur activation Push:',
      error
    )

    return false
  }
}


// ============================================================
// COMPOSANT
// ============================================================

export default function NotificationCenter() {

  const { session } = useAuth()

  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  const unread = useMemo(
    () => items.filter(item => !item.read_at).length,
    [items]
  )


  // ==========================================================
  // CHARGEMENT NOTIFICATIONS
  // ==========================================================

  const load = useCallback(async () => {

    if (!session?.user?.id) {
      setItems([])
      return
    }

    setLoading(true)

    try {

      const { data, error } = await supabase
        .from('notifications')
        .select(
          'id, type, title, body, link, entity_id, read_at, created_at'
        )
        .eq('recipient_id', session.user.id)
        .order('created_at', {
          ascending: false,
        })
        .limit(40)

      if (error) {
        console.error(
          '[Notifications] Erreur chargement:',
          error
        )

        return
      }

      setItems(data || [])

    } finally {

      setLoading(false)
    }

  }, [session?.user?.id])


  // ==========================================================
  // REALTIME
  // ==========================================================

  useEffect(() => {

    if (!session?.user?.id) {
      setItems([])
      return undefined
    }

    let disposed = false

    const userId = session.user.id

    const channelName =
      `notifications-${userId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`

    console.log(
      '[Notifications] Connexion Realtime:',
      channelName
    )

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        payload => {

          if (disposed) return

          const notification = payload.new

          console.log(
            '[Notifications] 🔔 Nouvelle notification:',
            notification
          )

          setItems(current =>
            [notification, ...current].slice(0, 40)
          )

          // Notification système uniquement si la permission
          // a déjà été accordée.
          if (
            document.visibilityState === 'visible' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {

              new Notification(
                notification.title,
                {
                  body: notification.body,
                  icon: '/logo.jpg',
                }
              )

            } catch (error) {

              console.warn(
                '[Notifications] Notification système impossible:',
                error
              )
            }
          }
        }
      )
      .subscribe(status => {

        console.log(
          '[Notifications] Realtime:',
          status
        )

      })


    load()


    return () => {

      disposed = true

      console.log(
        '[Notifications] Déconnexion Realtime'
      )

      void supabase.removeChannel(channel)

    }

  }, [session?.user?.id, load])


  // ==========================================================
  // MARQUER LU
  // ==========================================================

  const markRead = async id => {

    const readAt = new Date().toISOString()

    const { error } = await supabase
      .from('notifications')
      .update({
        read_at: readAt,
      })
      .eq('id', id)

    if (error) {
      console.error(
        '[Notifications] Erreur markRead:',
        error
      )

      return
    }

    setItems(current =>
      current.map(item =>
        item.id === id
          ? {
              ...item,
              read_at: readAt,
            }
          : item
      )
    )
  }


  // ==========================================================
  // TOUT MARQUER LU
  // ==========================================================

  const markAllRead = async () => {

    if (!session?.user?.id) return

    const readAt = new Date().toISOString()

    const { error } = await supabase
      .from('notifications')
      .update({
        read_at: readAt,
      })
      .eq('recipient_id', session.user.id)
      .is('read_at', null)

    if (error) {

      console.error(
        '[Notifications] Erreur markAllRead:',
        error
      )

      return
    }

    setItems(current =>
      current.map(item => ({
        ...item,
        read_at: item.read_at || readAt,
      }))
    )
  }


  // ==========================================================
  // ACTIVER PUSH
  // ==========================================================

  const activatePush = async () => {

    if (pushLoading) return

    console.log(
      '[Notifications] 🔔 Bouton activation cliqué'
    )

    setPushLoading(true)

    const ok = await enableBrowserPush(
      session.user.id
    )

    setPushLoading(false)

    if (ok) {

      console.log(
        '[Notifications] ✅ Push activé'
      )

      // Petit test local
      try {

        new Notification(
          'Notifications activées 🔔',
          {
            body: 'Tu recevras maintenant les notifications du tournoi.',
            icon: '/logo.jpg',
          }
        )

      } catch {
        // Rien
      }

    } else {

      console.log(
        '[Notifications] ❌ Push non activé'
      )
    }
  }


  // ==========================================================
  // PAS CONNECTÉ
  // ==========================================================

  if (!session) {
    return null
  }


  // ==========================================================
  // UI
  // ==========================================================

  return (

    <div className="relative">

      <button
        onClick={() => setOpen(value => !value)}
        className="notification-trigger"
        aria-label={
          `Notifications${
            unread
              ? `, ${unread} non lues`
              : ''
          }`
        }
        aria-expanded={open}
      >

        {unread > 0
          ? <BellRing size={18} />
          : <Bell size={18} />
        }

        {unread > 0 && (
          <span className="notification-count">
            {unread > 99 ? '99+' : unread}
          </span>
        )}

      </button>


      {open && (

        <>

          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Fermer les notifications"
            onClick={() => setOpen(false)}
          />


          <div className="notification-panel z-50">

            {/* HEADER */}

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-700">

              <div>

                <p className="font-bold text-sm">
                  Notifications
                </p>

                <p className="text-xs text-ink-600">

                  {unread
                    ? `${unread} non lue${
                        unread > 1 ? 's' : ''
                      }`
                    : 'Tout est à jour'
                  }

                </p>

              </div>


              <div className="flex items-center gap-1">

                <button
                  onClick={activatePush}
                  disabled={pushLoading}
                  className="notification-mini-btn"
                  title="Activer les notifications système"
                >

                  <BellRing
                    size={15}
                    className={
                      pushLoading
                        ? 'animate-pulse'
                        : ''
                    }
                  />

                </button>


                <button
                  onClick={markAllRead}
                  className="notification-mini-btn"
                  title="Tout marquer comme lu"
                >

                  <CheckCheck size={15} />

                </button>


                <button
                  onClick={() => setOpen(false)}
                  className="notification-mini-btn"
                  title="Fermer"
                >

                  <X size={15} />

                </button>

              </div>

            </div>


            {/* LISTE */}

            <div className="max-h-[min(70vh,520px)] overflow-y-auto">

              {loading ? (

                <div className="p-8 text-center text-sm text-ink-600">
                  Chargement…
                </div>

              ) : items.length === 0 ? (

                <div className="p-8 text-center">

                  <div className="w-12 h-12 rounded-2xl bg-charo-orange/10 text-charo-orange mx-auto flex items-center justify-center mb-3">

                    <Bell size={20} />

                  </div>

                  <p className="font-semibold text-sm">
                    Aucune notification
                  </p>

                  <p className="text-xs text-ink-600 mt-1">
                    Les actualités du tournoi apparaîtront ici.
                  </p>

                </div>

              ) : (

                items.map(item => (

                  <Link
                    key={item.id}
                    to={item.link || '/'}
                    onClick={() => {

                      if (!item.read_at) {
                        markRead(item.id)
                      }

                      setOpen(false)

                    }}
                    className={
                      `notification-item ${
                        item.read_at
                          ? ''
                          : 'is-unread'
                      }`
                    }
                  >

                    <span className="notification-icon">
                      {iconFor(item.type)}
                    </span>

                    <span className="min-w-0 flex-1">

                      <span className="block font-semibold text-sm text-ink-950">
                        {item.title}
                      </span>

                      <span className="block text-xs text-ink-600 mt-0.5 leading-relaxed">
                        {item.body}
                      </span>

                      <span className="block text-[10px] text-ink-600 mt-1.5">
                        {relativeDate(item.created_at)}
                      </span>

                    </span>


                    {!item.read_at && (
                      <span className="w-2 h-2 rounded-full bg-charo-orange shrink-0 mt-2" />
                    )}

                  </Link>

                ))

              )}

            </div>

          </div>

        </>

      )}

    </div>
  )
}