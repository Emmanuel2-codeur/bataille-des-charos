import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Heart, MessageCircle, Send, Trash2, Pencil, Megaphone,
  Flame, ThumbsUp, Sparkles, LoaderCircle, Paperclip, FileText,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'
import { uploadPublicFile } from '../lib/storage'
import { useAuth } from '../lib/AuthContext'

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip'

const REACTIONS = [
  { key: 'like', label: 'J’aime', emoji: '👍', icon: ThumbsUp },
  { key: 'love', label: 'J’adore', emoji: '❤️', icon: Heart },
  { key: 'fire', label: '🔥', emoji: '🔥', icon: Flame },
  { key: 'wow', label: 'Wow', emoji: '✨', icon: Sparkles },
]

const CATEGORY_META = {
  information: { label: 'Information', emoji: '📢' },
  match: { label: 'Match', emoji: '⚔️' },
  result: { label: 'Résultat', emoji: '🏆' },
  event: { label: 'Événement', emoji: '🔥' },
}

function formatDate(date) {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function Avatar({ profile, size = 'md' }) {
  const initials = (profile?.pseudo || 'CH').slice(0, 2).toUpperCase()
  const cls = size === 'sm' ? 'w-8 h-8 text-[10px]' : 'w-10 h-10 text-xs'
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt="" className={`${cls} rounded-full object-cover border border-ink-700 shrink-0`} />
  ) : (
    <div className={`${cls} rounded-full bg-charo-orange/10 text-charo-orange flex items-center justify-center font-extrabold shrink-0`}>
      {initials}
    </div>
  )
}

function Attachment({ url, name, type, size }) {
  if (!url) return null
  const isImage = type?.startsWith('image/')
  return isImage ? (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-3 rounded-2xl overflow-hidden border border-ink-700 max-w-xl">
      <img src={url} alt={name || ''} className="max-h-[420px] w-full object-cover" loading="lazy" />
    </a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-3 rounded-xl border border-ink-700 bg-white px-3 py-2.5 hover:border-charo-orange transition-colors max-w-xl">
      <span className="w-9 h-9 rounded-lg bg-charo-orange/10 text-charo-orange flex items-center justify-center shrink-0"><FileText size={17} /></span>
      <span className="min-w-0">
        <span className="block text-sm font-bold truncate">{name || 'Pièce jointe'}</span>
        <span className="block text-[11px] text-ink-600">{formatFileSize(size)} · Ouvrir le fichier</span>
      </span>
    </a>
  )
}

function ReactionBar({ table, targetId, userId, reactions, onChanged }) {
  const [picker, setPicker] = useState(false)
  const mine = reactions.find((reaction) => reaction.user_id === userId)

  const counts = useMemo(() => REACTIONS.reduce((acc, item) => {
    acc[item.key] = reactions.filter((reaction) => reaction.reaction === item.key).length
    return acc
  }, {}), [reactions])

  const toggle = async (reaction) => {
    if (!userId) return
    const key = table === 'announcement_reactions' ? 'announcement_id' : 'comment_id'
    let result
    if (mine?.reaction === reaction) {
      result = await supabase.from(table).delete().eq(key, targetId).eq('user_id', userId)
    } else if (mine) {
      result = await supabase.from(table).update({ reaction }).eq(key, targetId).eq('user_id', userId)
    } else {
      result = await supabase.from(table).insert({ [key]: targetId, user_id: userId, reaction })
    }
    if (result?.error) console.error('[Reaction]', result.error)
    setPicker(false)
    onChanged?.()
  }

  const total = reactions.length
  return (
    <div className="relative flex items-center gap-2">
      <button type="button" onClick={() => userId && setPicker((value) => !value)} className={`social-action ${mine ? 'text-charo-orange bg-charo-orange/5' : ''}`} title={userId ? 'Réagir' : 'Connecte-toi pour réagir'}>
        {mine ? <span className="text-base">{REACTIONS.find((r) => r.key === mine.reaction)?.emoji}</span> : <Heart size={16} />}
        <span>{total || 'J’aime'}</span>
      </button>
      {picker && (
        <div className="reaction-picker">
          {REACTIONS.map((reaction) => <button key={reaction.key} type="button" onClick={() => toggle(reaction.key)} title={reaction.label}><span>{reaction.emoji}</span></button>)}
        </div>
      )}
      {total > 0 && (
        <div className="flex -space-x-1.5">
          {REACTIONS.filter((r) => counts[r.key] > 0).map((r) => <span key={r.key} className="w-5 h-5 rounded-full bg-white border border-ink-700 flex items-center justify-center text-[10px]" title={`${counts[r.key]} ${r.label}`}>{r.emoji}</span>)}
        </div>
      )}
    </div>
  )
}

function AttachmentPicker({ file, onChange, disabled = false }) {
  const inputRef = useRef(null)
  return (
    <>
      <input ref={inputRef} type="file" accept={FILE_ACCEPT} className="hidden" disabled={disabled} onChange={(e) => onChange(e.target.files?.[0] || null)} />
      <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="attachment-button" title="Ajouter une image ou un fichier">
        <Paperclip size={15} />
      </button>
      {file && (
        <span className="attachment-chip" title={file.name}>
          <Paperclip size={12} /> {file.name}
          <button type="button" onClick={() => onChange(null)} aria-label="Retirer la pièce jointe">×</button>
        </span>
      )}
    </>
  )
}

function CommentNode({ comment, comments, reactions, user, isAdmin, onRefresh, depth = 0 }) {
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.content)
  const [reply, setReply] = useState('')
  const [replyFile, setReplyFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const children = comments.filter((item) => item.parent_id === comment.id)

  const saveEdit = async () => {
    if (!text.trim()) return
    setSaving(true); setError('')
    const { error: updateError } = await supabase.from('comments').update({ content: text.trim() }).eq('id', comment.id)
    if (updateError) setError(updateError.message)
    else { setEditing(false); onRefresh() }
    setSaving(false)
  }

  const sendReply = async () => {
    if (!reply.trim() || !user) return
    setSaving(true); setError('')
    let attachment = null
    if (replyFile) {
      const result = await uploadPublicFile(replyFile, `comments/${comment.announcement_id}`)
      if (result.error) { setError(result.error.message); setSaving(false); return }
      attachment = result.data
    }
    const { error: insertError } = await supabase.from('comments').insert({
      announcement_id: comment.announcement_id,
      user_id: user.id,
      parent_id: comment.id,
      content: reply.trim(),
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
      attachment_size: attachment?.size || null,
    })
    if (insertError) setError(insertError.message)
    else { setReply(''); setReplyFile(null); setReplying(false); onRefresh() }
    setSaving(false)
  }

  const remove = async () => {
    if (!window.confirm('Supprimer ce commentaire et ses réponses ?')) return
    const { error: deleteError } = await supabase.from('comments').delete().eq('id', comment.id)
    if (deleteError) setError(deleteError.message)
    else onRefresh()
  }

  const commentReactions = reactions.filter((reaction) => reaction.comment_id === comment.id)
  return (
    <div className={`${depth > 0 ? 'ml-5 sm:ml-10 border-l-2 border-ink-700 pl-3 sm:pl-4' : ''}`}>
      <div className="flex gap-3 py-3">
        <Avatar profile={comment.profile} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="inline-block max-w-full rounded-2xl bg-ink-800 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-ink-950">{comment.profile?.pseudo || 'Joueur'}</span>
              {comment.profile?.role === 'admin' && <span className="admin-pill">ADMIN</span>}
            </div>
            {editing ? (
              <div className="mt-2">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="social-input" />
                <div className="flex gap-2 mt-2">
                  <button onClick={saveEdit} disabled={saving} className="btn-primary !px-3 !py-2 text-xs">Enregistrer</button>
                  <button onClick={() => setEditing(false)} className="btn-outline !px-3 !py-2 text-xs">Annuler</button>
                </div>
              </div>
            ) : <p className="text-sm text-ink-950 whitespace-pre-wrap break-words mt-1">{comment.content}</p>}
            <Attachment url={comment.attachment_url} name={comment.attachment_name} type={comment.attachment_type} size={comment.attachment_size} />
          </div>

          <div className="flex flex-wrap items-center gap-1 mt-1.5 ml-1">
            <ReactionBar table="comment_reactions" targetId={comment.id} userId={user?.id} reactions={commentReactions} onChanged={onRefresh} />
            {user && <button type="button" onClick={() => setReplying((value) => !value)} className="social-action"><MessageCircle size={15} /> Répondre</button>}
            <span className="text-[10px] text-ink-600 px-2">{formatDate(comment.created_at)}</span>
            {(user?.id === comment.user_id || isAdmin) && <>
              <button type="button" onClick={() => setEditing(true)} className="social-action" title="Modifier"><Pencil size={13} /></button>
              <button type="button" onClick={remove} className="social-action text-red-500" title="Supprimer"><Trash2 size={13} /></button>
            </>}
          </div>

          {replying && (
            <div className="mt-3 rounded-2xl border border-ink-700 bg-white p-2.5">
              <div className="flex gap-2">
                <Avatar profile={user?.user_metadata ? { pseudo: user.user_metadata.full_name || 'Moi', avatar_url: user.user_metadata.avatar_url } : null} size="sm" />
                <div className="flex-1 relative">
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={1000} placeholder={`Répondre à ${comment.profile?.pseudo || 'ce joueur'}…`} className="social-input pr-12" />
                  <button type="button" onClick={sendReply} disabled={saving || !reply.trim()} className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-charo-orange text-white flex items-center justify-center disabled:opacity-40"><Send size={14} /></button>
                </div>
              </div>
              <div className="mt-2 ml-10 flex flex-wrap items-center gap-2">
                <AttachmentPicker file={replyFile} onChange={setReplyFile} disabled={saving} />
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          {children.length > 0 && <div className="mt-1">{children.map((child) => <CommentNode key={child.id} comment={child} comments={comments} reactions={reactions} user={user} isAdmin={isAdmin} onRefresh={onRefresh} depth={depth + 1} />)}</div>}
        </div>
      </div>
    </div>
  )
}

function AnnouncementCard({ announcement, user, isAdmin }) {
  const [comments, setComments] = useState([])
  const [reactions, setReactions] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentFile, setCommentFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const loadSocial = useCallback(async () => {
    const [{ data: commentRows, error: commentsError }, { data: reactionRows, error: reactionsError }] = await Promise.all([
      supabase.from('comments').select('id, announcement_id, user_id, parent_id, content, attachment_url, attachment_name, attachment_type, attachment_size, created_at, updated_at, profile:profiles!comments_user_id_fkey(id, pseudo, avatar_url, role)').eq('announcement_id', announcement.id).order('created_at', { ascending: true }),
      supabase.from('announcement_reactions').select('announcement_id, user_id, reaction, created_at').eq('announcement_id', announcement.id),
    ])
    if (commentsError) console.error('[Comments]', commentsError)
    if (reactionsError) console.error('[Reactions]', reactionsError)
    setComments(commentRows || [])
    setReactions(reactionRows || [])
    setLoading(false)
  }, [announcement.id])

  useEffect(() => {
    loadSocial()
    const channel = supabase
      .channel(`announcement-social-${announcement.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `announcement_id=eq.${announcement.id}` }, loadSocial)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcement_reactions', filter: `announcement_id=eq.${announcement.id}` }, loadSocial)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_reactions' }, loadSocial)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [announcement.id, loadSocial])

  const publishComment = async (event) => {
    event.preventDefault()
    if (!user || !commentText.trim()) return
    setSending(true); setError('')
    let attachment = null
    if (commentFile) {
      const result = await uploadPublicFile(commentFile, `comments/${announcement.id}`)
      if (result.error) { setError(result.error.message); setSending(false); return }
      attachment = result.data
    }
    const { error: insertError } = await supabase.from('comments').insert({
      announcement_id: announcement.id,
      user_id: user.id,
      content: commentText.trim(),
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
      attachment_size: attachment?.size || null,
    })
    if (insertError) {
      console.error('[Comment publication]', insertError)
      setError(`Impossible d'envoyer le commentaire : ${insertError.message}`)
    } else {
      setCommentText('')
      setCommentFile(null)
      await loadSocial()
    }
    setSending(false)
  }

  const roots = comments.filter((comment) => !comment.parent_id)
  const category = CATEGORY_META[announcement.category] || CATEGORY_META.information

  return (
    <article className="social-post">
      <div className="flex items-start gap-3">
        <Avatar profile={{ pseudo: 'MÉCHANTCHARO', avatar_url: announcement.author?.avatar_url }} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-lg">{announcement.title || category.label}</h2>
            <span className="category-pill">{category.emoji} {category.label}</span>
          </div>
          <p className="text-xs text-ink-600 mt-1">{formatDate(announcement.created_at)}</p>
        </div>
      </div>

      <p className="mt-4 text-[15px] leading-7 text-ink-950 whitespace-pre-wrap">{announcement.body}</p>
      {announcement.image_url && <div className="mt-4 rounded-2xl overflow-hidden border border-ink-700"><img src={announcement.image_url} alt="" className="w-full max-h-[520px] object-cover" loading="lazy" /></div>}

      <div className="mt-4 pt-3 border-t border-ink-700">
        <div className="flex items-center justify-between text-xs text-ink-600 mb-2">
          <span>{reactions.length ? `${reactions.length} réaction${reactions.length > 1 ? 's' : ''}` : ''}</span>
          <span>{comments.length ? `${comments.length} commentaire${comments.length > 1 ? 's' : ''}` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <ReactionBar table="announcement_reactions" targetId={announcement.id} userId={user?.id} reactions={reactions} onChanged={loadSocial} />
          <button type="button" className="social-action" onClick={() => document.getElementById(`comment-${announcement.id}`)?.focus()}><MessageCircle size={16} /> Commenter</button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? <div className="py-4 text-xs text-ink-600 flex items-center gap-2"><LoaderCircle size={14} className="animate-spin" /> Chargement des commentaires…</div> : roots.length > 0 ? <div>{roots.map((comment) => <CommentNode key={comment.id} comment={comment} comments={comments} reactions={reactions} user={user} isAdmin={isAdmin} onRefresh={loadSocial} />)}</div> : <p className="text-xs text-ink-600 py-2">Aucun commentaire pour le moment.</p>}
      </div>

      {user ? (
        <form onSubmit={publishComment} className="mt-4 rounded-2xl border border-ink-700 bg-ink-800 p-2.5">
          <div className="flex gap-2">
            <Avatar profile={{ pseudo: user.user_metadata?.full_name || 'Moi', avatar_url: user.user_metadata?.avatar_url }} size="sm" />
            <div className="flex-1 relative">
              <textarea id={`comment-${announcement.id}`} value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={2} maxLength={1000} placeholder="Écris un commentaire…" className="social-input pr-12" />
              <button type="submit" disabled={sending || !commentText.trim()} className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-charo-orange text-white flex items-center justify-center disabled:opacity-40"><Send size={14} /></button>
            </div>
          </div>
          <div className="mt-2 ml-10 flex flex-wrap items-center gap-2">
            <AttachmentPicker file={commentFile} onChange={setCommentFile} disabled={sending} />
            <span className="text-[11px] text-ink-600">Images ou fichiers · 10 Mo max</span>
          </div>
          {error && <p className="text-xs text-red-600 mt-2 ml-10">{error}</p>}
        </form>
      ) : <p className="mt-4 text-xs text-ink-600 rounded-xl bg-ink-800 p-3">Connecte-toi pour commenter et réagir aux annonces.</p>}
    </article>
  )
}

export default function Annonces() {
  const { session, isAdmin } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('announcements')
      .select('id, title, body, published, category, image_url, author_id, created_at, author:profiles!announcements_author_id_fkey(id, pseudo, avatar_url, role)')
      .eq('published', true)
      .order('created_at', { ascending: false })
    setAnnouncements(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase.channel('announcements-page').on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  return (
    <div className="min-h-screen bg-ink-800">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-10 md:py-16">
        <div className="mb-8">
          <span className="eyebrow"><Megaphone size={12} /> Actualités de la guilde</span>
          <h1 className="font-display text-4xl md:text-5xl mt-3">Annonces</h1>
          <p className="text-ink-600 mt-3">Les publications officielles de la Bataille des Charos, avec réactions et discussions de la communauté.</p>
        </div>
        {loading ? <div className="card p-10 flex items-center justify-center gap-2 text-ink-600"><LoaderCircle className="animate-spin" size={18} /> Chargement…</div> : announcements.length === 0 ? <div className="card p-10 text-center"><Megaphone className="mx-auto text-charo-orange mb-3" size={28} /><h2 className="font-bold text-lg">Aucune annonce pour le moment</h2><p className="text-sm text-ink-600 mt-2">Les prochaines publications de l’administration apparaîtront ici.</p></div> : <div className="space-y-6">{announcements.map((announcement) => <AnnouncementCard key={announcement.id} announcement={announcement} user={session?.user} isAdmin={isAdmin} />)}</div>}
      </main>
      <Footer />
    </div>
  )
}
