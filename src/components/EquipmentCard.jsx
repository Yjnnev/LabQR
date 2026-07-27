import QRCodeCell from './QRCodeCell'
import { STATUS_LABELS } from '../lib/statusLabels'
import { getEffectiveStatus } from '../lib/equipmentStatus'
import { formatDate } from '../lib/formatDate'

export default function EquipmentCard({ item, checkouts, onEdit, onDelete, onReturnCheckout }) {
  const checkedOutQuantity = checkouts.reduce((sum, c) => sum + c.quantity, 0)
  const available = item.total_quantity - checkedOutQuantity
  const effectiveStatus = getEffectiveStatus(item, checkedOutQuantity)

  return (
    <div className="equipment-card">
      {item.thumbnail_url && (
        <img src={item.thumbnail_url} alt={item.name} className="equipment-card-thumbnail" />
      )}

      <div className="equipment-card-header">
        <h3>{item.name}</h3>
        <span className={`status-pill status-${effectiveStatus}`}>
          {STATUS_LABELS[effectiveStatus] || effectiveStatus}
        </span>
      </div>

      <dl className="equipment-meta">
        {item.category && (
          <div><dt>Category</dt><dd>{item.category}</dd></div>
        )}
        {item.location && (
          <div><dt>Location</dt><dd>{item.location}</dd></div>
        )}
        <div><dt>In stock</dt><dd>{available} / {item.total_quantity} available</dd></div>
      </dl>

      {checkouts.length > 0 && (
        <div className="borrower-info">
          <strong>Currently checked out:</strong>
          {checkouts.map((c) => (
            <div key={c.id} className="checkout-row">
              <span>
                {c.borrower?.email || 'Unknown'} — {c.quantity}
                {' '}(since {formatDate(c.checked_out_at)})
              </span>
              <button onClick={() => onReturnCheckout(c.id)}>Mark Returned</button>
            </div>
          ))}
        </div>
      )}

      <div className="equipment-card-footer">
        <QRCodeCell itemId={item.id} itemName={item.name} />

        <div className="equipment-card-actions">
          <button onClick={() => onEdit(item)}>Edit</button>
          <button onClick={() => onDelete(item)}>Delete</button>
        </div>
      </div>
    </div>
  )
}
