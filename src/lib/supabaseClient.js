import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabase

try {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant(e) dans .env')
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey)
} catch (err) {
  console.warn(
    '[Supabase] Client non initialisé — copiez .env.example en .env et renseignez vos clés. Détail:',
    err.message,
  )

  const notConfigured = async () => ({
    data: null,
    error: new Error('Supabase non configuré : vérifiez votre fichier .env'),
  })

  supabase = {
    auth: {
      signInWithOtp: notConfigured,
      signInWithOAuth: notConfigured,
      signOut: notConfigured,
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({
      select: notConfigured,
      insert: notConfigured,
      update: notConfigured,
      delete: notConfigured,
    }),
  }
}

export { supabase }

export async function signInWithEmail(email) {
  const cleanEmail = email?.trim()

  if (!cleanEmail) {
    return { error: new Error('Veuillez renseigner votre adresse email.') }
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: `${window.location.origin}/profil`,
      shouldCreateUser: true,
    },
  })

  if (error) {
    alert(`Connexion impossible : ${error.message}`)
  }

  return { data, error }
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/profil`,
    },
  })

  if (error) alert(`Connexion impossible : ${error.message}`)
  return { error }
}

export async function signOut() {
  return supabase.auth.signOut()
}
