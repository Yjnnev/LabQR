import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function MyBorrows() {
  const { session } = useAuth()
  const [checkouts, setCheckouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [activeOnly, setActiveOnly] = useState(false)

  useEffect(() => {
    if (!session?.user) return

    const loadCheckouts = async () => {
      setLoading(true)
      setErrorMsg(null)

      const { data, error } = await supabase
        .from('checkouts')
        .select(`
          id,
          quantity,
          checked_out_at,
          returned_at,
          equipment ( name, category, location )
        `)
        .eq('user_id', session.user.id)
        .order('checked_out_at', { ascending: false })

      if (error) setErrorMsg(error.message)
      else setCheckouts(data)

      setLoading(false)
    }

    loadCheckouts()
  }, [session])

  const filtered = useMemo(() => {
    if (!activeOnly) return checkouts
    return checkouts.filter((c) => !c.returned_at)
  }, [checkouts, activeOnly])

  return (
    <div className="browse-page">
      <h1>My Borrowed Equipment</h1>

      <label className="borrowers-toggle">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => setActiveOnly(e.target.checked)}
        />
        Currently borrowed only
      </label>

      {errorMsg && <p className="error-text">{errorMsg}</p>}

      {loading ? (
        <p className="status-text">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="status-text">
          {activeOnly
            ? "You don't have anything checked out right now."
            : "You haven't borrowed anything yet."}
        </p>
      ) : (
        <table className="equipment-table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Qty</th>
              <th>Checked out</th>
              <th>Status</th>
              <th>Returned</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.equipment?.name || 'Unknown item'}
                  {c.equipment?.location && (
                    <>
                      <br />
                      <span className="borrowers-email">{c.equipment.location}</span>
                    </>
                  )}
                </td>
                <td>{c.quantity}</td>
                <td>{new Date(c.checked_out_at).toLocaleString()}</td>
                <td>
                  <span className={`status-pill ${c.returned_at ? 'status-available' : 'status-in_use'}`}>
                    {c.returned_at ? 'Returned' : 'Checked out'}
                  </span>
                </td>
                <td>{c.returned_at ? new Date(c.returned_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
