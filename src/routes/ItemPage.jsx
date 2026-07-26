import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { STATUS_LABELS } from '../lib/statusLabels'
import { signInWithGoogle } from '../lib/authActions'
import PhotoGalleryModal from '../components/PhotoGalleryModal'

export default function ItemPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const [equipment, setEquipment] = useState(null)
  const [available, setAvailable] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [galleryIndex, setGalleryIndex] = useState(null)

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

      const { data: availableCount } = await supabase.rpc('available_quantity', { item_id: id })
      if (!cancelled) {
        setAvailable(availableCount ?? 0)
        setLoading(false)
      }
    }

    loadItem()
    return () => { cancelled = true }
  }, [id])

  const handleCheckout = async () => {
    setActionError(null)
    const { error } = await supabase.rpc('checkout_quantity', {
      item_id: id,
      requested_quantity: quantity,
    })
    if (error) {
      setActionError(error.message)
      return
    }
    setAvailable((prev) => prev - quantity)
  }

  if (loading) return <p className="status-text">Loading item…</p>
  if (error) return <p className="status-text">{error}</p>

  const isOverridden = equipment.status === 'maintenance' || equipment.status === 'decommissioned'
  const canCheckOut = !isOverridden && available > 0

  return (
    <div className="item-page">
      <Link to="/browse" className="back-button">← Back to all equipment</Link>
      <div className="item-card">
        {equipment.thumbnail_url && (
          <img src={equipment.thumbnail_url} alt={equipment.name} className="item-hero-photo" />
        )}

        <div className="item-card-header">
          <h1>{equipment.name}</h1>
          <span className={`status-pill status-${isOverridden ? equipment.status : (canCheckOut ? 'available' : 'out_of_stock')}`}>
            {isOverridden ? STATUS_LABELS[equipment.status] : (canCheckOut ? 'Available' : 'Out of stock')}
          </span>
        </div>

        <dl className="equipment-meta">
          {equipment.category && (
            <div><dt>Category</dt><dd>{equipment.category}</dd></div>
          )}
          <div><dt>Location</dt><dd>{equipment.location || '—'}</dd></div>
          <div><dt>In stock</dt><dd>{available} / {equipment.total_quantity} available</dd></div>
        </dl>

        {equipment.notes && <p className="item-notes">{equipment.notes}</p>}

        {equipment.photo_urls && equipment.photo_urls.length > 0 && (
          <div className="item-photo-gallery">
            {equipment.photo_urls.map((url, i) => (
              <button key={url} className="gallery-thumb-button" onClick={() => setGalleryIndex(i)}>
                <img src={url} alt={`${equipment.name} additional view`} />
              </button>
            ))}
          </div>
        )}

        <div className="item-card-actions">
          {isOverridden && (
            <p className="error-text">This item isn't available for checkout right now.</p>
          )}

          {!isOverridden && !canCheckOut && (
            <p className="error-text">Out of stock — none currently available.</p>
          )}

          {!isOverridden && canCheckOut && !session && (
            <>
              <p className="status-text-inline">Sign in to check out this item.</p>
              <div className="guest-auth-buttons">
                <button onClick={() => signInWithGoogle()}>Sign in</button>
                <button onClick={() => signInWithGoogle()}>Sign up</button>
              </div>
            </>
          )}

          {!isOverridden && canCheckOut && session && (
            <div className="checkout-controls">
              {equipment.total_quantity > 1 && (
                <label className="quantity-picker">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max={available}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(available, Number(e.target.value))))}
                  />
                </label>
              )}
              <button onClick={handleCheckout}>Check out</button>
            </div>
          )}

          {actionError && <p className="error-text">{actionError}</p>}
        </div>
      </div>

      {galleryIndex !== null && (
        <PhotoGalleryModal
          photos={equipment.photo_urls}
          startIndex={galleryIndex}
          onClose={() => setGalleryIndex(null)}
        />
      )}
    </div>
  )
}
