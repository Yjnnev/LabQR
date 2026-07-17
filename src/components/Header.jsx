import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { signInWithGoogle } from '../lib/authActions'

export default function Header() {
  const { session, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <header className="app-header">
      <Link to="/" className="app-header-brand">LabQR</Link>

      <div className="app-header-user">
        {session ? (
          <>
            {profile?.role === 'admin' && (
              <Link to="/admin" className="app-header-link">Admin Dashboard</Link>
            )}
            <span className="app-header-email">
              {profile?.full_name || session.user.email}
              {profile?.role === 'admin' && <span className="role-tag">Admin</span>}
            </span>
            <button onClick={handleSignOut}>Log out</button>
          </>
        ) : (
          <>
            <button onClick={() => signInWithGoogle()}>Sign in</button>
            <button onClick={() => signInWithGoogle()}>Sign up</button>
          </>
        )}
      </div>
    </header>
  )
}
