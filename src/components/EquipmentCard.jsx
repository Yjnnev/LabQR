import QRCodeCell from './QRCodeCell'
import { STATUS_LABELS } from '../lib/statusLabels'

export default function EquipmentCard({ item, onEdit, onDelete, onMarkReturned }) {
  const borrowerEmail = item.borrower?.email
  const borrowedAt = item.checked_out_at
    ? new Date(item.checked_out_at).toLocaleString()
    : null

  return (
    <div className="equipment-card">
      {item.thumbnail_url && (
        <img src={item.thumbnail_url} alt={item.name} className="equipment-card-thumbnail" />
      )}

      <div className="equipment-card-header">
        <h3>{item.name}</h3>
        <span className={`status-pill status-${item.status}`}>
          {STATUS_LABELS[item.status] || item.status}
        </span>
      </div>

      <dl className="equipment-meta">
        {item.category && (
          <div><dt>Category</dt><dd>{item.category}</dd></div>
        )}
        {item.location && (
          <div><dt>Location</dt><dd>{item.location}</dd></div>
        )}
        {item.serial_number && (
          <div><dt>Current Item Count</dt><dd>{item.serial_number}</dd></div>
        )}
      </dl>

      {item.status === 'in_use' && borrowerEmail && (
        <div className="borrower-info">
          <p><strong>Checked out by:</strong> {borrowerEmail}</p>
          <p><strong>Since:</strong> {borrowedAt}</p>
        </div>
      )}

      <div className="equipment-card-footer">
        <QRCodeCell itemId={item.id} itemName={item.name} />

        <div className="equipment-card-actions">
          <button onClick={() => onEdit(item)}>Edit</button>
          <button onClick={() => onDelete(item.id)}>Delete</button>
          {item.status === 'in_use' && (
            <button onClick={() => onMarkReturned(item.id)}>Mark Returned</button>
          )}
        </div>
      </div>
    </div>
  )
}
