import { supabase } from './supabaseClient'
import { MAX_ATTACHMENT_SIZE, STORAGE_BUCKET } from '../config'

function safeFileName(name) {
  return (name || 'fichier')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-120)
}

export async function uploadPublicFile(file, folder) {
  if (!file) return { data: null, error: new Error('Aucun fichier sélectionné.') }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { data: null, error: new Error('Le fichier est trop volumineux. Taille maximale : 10 Mo.') }
  }

  const path = `${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })

  if (error) return { data: null, error }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return {
    data: {
      url: data.publicUrl,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      path,
    },
    error: null,
  }
}
