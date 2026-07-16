import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function Header() {
  const { session, profile, signOut } = useAuth()

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
    if (error) console.error('Login error:', error.message)
  }

  return (
    <header className="app-header">
      <Link to="/" className="app-header-brand">LabQR</Link>

      <div className="app-header-user">
        {session ? (
          <>
            <Link to="/browse" className="app-header-link">Browse Equipment</Link>
            {profile?.role === 'admin' && (
              <Link to="/admin" className="app-header-link">Admin Dashboard</Link>
            )}
            <span className="app-header-email">
              {profile?.full_name || session.user.email}
              {profile?.role === 'admin' && <span className="role-tag">Admin</span>}
            </span>
            <button onClick={signOut}>Log out</button>
          </>
        ) : (
          <button onClick={handleGoogleLogin}>Log in</button>
        )}
      </div>
    </header>
  )
}
