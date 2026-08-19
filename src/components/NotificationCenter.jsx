import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BellRing, CheckCheck, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

async function enableBrowserPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!publicKey) return false

  const registration = await navigator.serviceWorker.register('/sw.js')
  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission

  if (permission !== 'granted') return false

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

  await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }, { onConflict: 'endpoint' })

  return true
}

export default function NotificationCenter() {
  const { session } = useAuth()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items])

  const load = useCallback(async () => {
    if (!session?.user?.id) {
      setItems([])
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, link, entity_id, read_at, created_at')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(40)
    setItems(data || [])
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    load()
    if (!session?.user?.id) return undefined

    const channel = supabase
      .channel(`notifications-${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${session.user.id}`,
      }, (payload) => {
        const notification = payload.new
        setItems((current) => [notification, ...current].slice(0, 40))

        if (document.visibilityState === 'visible' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(notification.title, {
              body: notification.body,
              icon: '/logo.jpg',
            })
          } catch {
            // Le centre intégré reste disponible si la notification système échoue.
          }
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, load])

  useEffect(() => {
    if (!session?.user?.id) return
    const asked = window.localStorage.getItem('charos-push-asked')
    if (asked) return

    // On ne demande pas la permission immédiatement au chargement :
    // le bouton "Activer les notifications" ouvre cette demande.
  }, [session?.user?.id])

  if (!session) return null

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
  }

  const markAllRead = async () => {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', session.user.id)
      .is('read_at', null)
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
  }

  const activatePush = async () => {
    try {
      window.localStorage.setItem('charos-push-asked', '1')
      const ok = await enableBrowserPush(session.user.id)
      if (!ok && 'Notification' in window && Notification.permission === 'granted') {
        // Permission accordée mais VAPID non configuré : les notifications
        // intégrées restent actives.
      }
    } catch (error) {
      console.warn('[Notifications] Push non activé:', error)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="notification-trigger"
        aria-label={`Notifications${unread ? `, ${unread} non lues` : ''}`}
        aria-expanded={open}
      >
        {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Fermer les notifications" onClick={() => setOpen(false)} />
          <div className="notification-panel z-50">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-700">
              <div>
                <p className="font-bold text-sm">Notifications</p>
                <p className="text-xs text-ink-600">{unread ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est à jour'}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={activatePush} className="notification-mini-btn" title="Activer les notifications système">
                  <BellRing size={15} />
                </button>
                <button onClick={markAllRead} className="notification-mini-btn" title="Tout marquer comme lu">
                  <CheckCheck size={15} />
                </button>
                <button onClick={() => setOpen(false)} className="notification-mini-btn" title="Fermer">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="max-h-[min(70vh,520px)] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-sm text-ink-600">Chargement…</div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-charo-orange/10 text-charo-orange mx-auto flex items-center justify-center mb-3">
                    <Bell size={20} />
                  </div>
                  <p className="font-semibold text-sm">Aucune notification</p>
                  <p className="text-xs text-ink-600 mt-1">Les actualités du tournoi apparaîtront ici.</p>
                </div>
              ) : items.map((item) => (
                <Link
                  key={item.id}
                  to={item.link || '/'}
                  onClick={() => {
                    if (!item.read_at) markRead(item.id)
                    setOpen(false)
                  }}
                  className={`notification-item ${item.read_at ? '' : 'is-unread'}`}
                >
                  <span className="notification-icon">{iconFor(item.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-sm text-ink-950">{item.title}</span>
                    <span className="block text-xs text-ink-600 mt-0.5 leading-relaxed">{item.body}</span>
                    <span className="block text-[10px] text-ink-600 mt-1.5">{relativeDate(item.created_at)}</span>
                  </span>
                  {!item.read_at && <span className="w-2 h-2 rounded-full bg-charo-orange shrink-0 mt-2" />}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
