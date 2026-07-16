import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href, // bounce back to the exact page (e.g. /item/:id) after login
      },
    })
    if (error) console.error('Login error:', error.message)
  }

  return (
    <div className="status-text">
      <h1>LabQR</h1>
      <p>Sign in with your school Google account to continue.</p>
      <button onClick={handleGoogleLogin}>Sign in with Google</button>
    </div>
  )
}
