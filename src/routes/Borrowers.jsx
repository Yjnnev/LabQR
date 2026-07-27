import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatDateTime } from '../lib/formatDate'
import AdminNav from '../components/AdminNav'

export default function Borrowers() {
  const [checkouts, setCheckouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)

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
        equipment ( name, category ),
        borrower:profiles!user_id ( full_name, email ),
        returned_by_profile:profiles!returned_by ( full_name )
      `)
      .order('checked_out_at', { ascending: false })

    if (error) setErrorMsg(error.message)
    else setCheckouts(data)

    setLoading(false)
  }

  useEffect(() => { loadCheckouts() }, [])

  const handleReturnCheckout = async (checkoutId) => {
    const { error } = await supabase.rpc('return_checkout', { checkout_id: checkoutId })
    if (error) setErrorMsg(error.message)
    else loadCheckouts()
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    return checkouts.filter((c) => {
      if (activeOnly && c.returned_at) return false
      if (!term) return true

      const haystack = [
        c.borrower?.full_name,
        c.borrower?.email,
        c.equipment?.name,
        c.equipment?.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [checkouts, search, activeOnly])

  return (
    <div className="admin-dashboard">
      <h1>LabQR Admin</h1>
      <AdminNav />

      <div className="borrowers-toolbar">
        <input
          type="text"
          placeholder="Search by borrower or equipment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="borrowers-search"
        />
        <label className="borrowers-toggle">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Currently out only
        </label>
      </div>

      {errorMsg && <p className="error-text">{errorMsg}</p>}

      {loading ? (
        <p className="status-text">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="status-text">No checkouts match.</p>
      ) : (
        <table className="equipment-table">
          <thead>
            <tr>
              <th>Borrower</th>
              <th>Equipment</th>
              <th>Qty</th>
              <th>Checked out</th>
              <th>Status</th>
              <th>Returned</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.borrower?.full_name || 'Unknown'}
                  <br />
                  <span className="borrowers-email">{c.borrower?.email}</span>
                </td>
                <td>
                  {c.equipment?.name || 'Unknown item'}
                  {c.equipment?.category && (
                    <>
                      <br />
                      <span className="borrowers-email">{c.equipment.category}</span>
                    </>
                  )}
                </td>
                <td>{c.quantity}</td>
                <td>{formatDateTime(c.checked_out_at)}</td>
                <td>
                  <span className={`status-pill ${c.returned_at ? 'status-available' : 'status-in_use'}`}>
                    {c.returned_at ? 'Returned' : 'Checked out'}
                  </span>
                </td>
                <td>
                  {c.returned_at ? (
                    <>
                      {formatDateTime(c.returned_at)}
                      {c.returned_by_profile?.full_name && (
                        <>
                          <br />
                          <span className="borrowers-email">by {c.returned_by_profile.full_name}</span>
                        </>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {!c.returned_at && (
                    <button onClick={() => handleReturnCheckout(c.id)}>Mark Returned</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
