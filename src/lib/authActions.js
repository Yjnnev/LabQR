import { supabase } from './supabaseClient'

export async function signInWithGoogle(redirectTo = window.location.href) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) console.error('Login error:', error.message)
}
