import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { STATUS_LABELS } from '../lib/statusLabels'

export default function ItemPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const [equipment, setEquipment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadItem() {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', id)
        .single()

      if (cancelled) return

      if (error) {
        setError('Item not found.')
        setLoading(false)
        return
      }

      setEquipment(data)
      setLoading(false)

      // log this scan — this row is what the notify-admin webhook watches
      await supabase.from('usage_logs').insert({
        equipment_id: id,
        user_id: session.user.id,
        action: 'viewed',
      })
    }

    loadItem()
    return () => { cancelled = true }
  }, [id, session])

  const handleAction = async (action) => {
    setActionError(null)
    const { error } = await supabase.rpc('checkout_equipment', {
      item_id: id,
      requested_action: action,
    })
    if (error) {
      setActionError(error.message)
      return
    }
    setEquipment((prev) => ({
      ...prev,
      status: action === 'checked_out' ? 'in_use' : 'available',
    }))
  }

  if (loading) return <p className="status-text">Loading item…</p>
  if (error) return <p className="status-text">{error}</p>

  return (
    <div className="item-page">
      <Link to="/browse" className="back-button">← Back to all equipment</Link>
      <div className="item-card">
        <div className="item-card-header">
          <h1>{equipment.name}</h1>
          <span className={`status-pill status-${equipment.status}`}>
            {STATUS_LABELS[equipment.status] || equipment.status}
          </span>
        </div>

        <dl className="equipment-meta">
          {equipment.category && (
            <div><dt>Category</dt><dd>{equipment.category}</dd></div>
          )}
          <div><dt>Location</dt><dd>{equipment.location || '—'}</dd></div>
          <div><dt>Serial #</dt><dd>{equipment.serial_number || '—'}</dd></div>
        </dl>

        {equipment.notes && <p className="item-notes">{equipment.notes}</p>}

        <div className="item-card-actions">
          {equipment.status === 'available' && (
            <button onClick={() => handleAction('checked_out')}>Check out</button>
          )}
          {equipment.status === 'in_use' && (
            <p className="status-text-inline">
              This item is currently checked out. An admin will process the return.
            </p>
          )}
          {equipment.status !== 'available' && equipment.status !== 'in_use' && (
            <p className="error-text">This item isn't available for checkout right now.</p>
          )}
          {actionError && <p className="error-text">{actionError}</p>}
        </div>
      </div>
    </div>
  )
}
