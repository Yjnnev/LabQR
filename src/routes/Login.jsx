import { signInWithGoogle } from '../lib/authActions'

export default function Login() {
  return (
    <div className="status-text">
      <h1>LabQR</h1>
      <p>Sign in with your school Google account to continue.</p>
      <button onClick={() => signInWithGoogle()}>Sign in with Google</button>
    </div>
  )
}
