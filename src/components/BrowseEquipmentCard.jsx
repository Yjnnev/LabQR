import { Link } from 'react-router-dom'
import { STATUS_LABELS } from '../lib/statusLabels'

export default function BrowseEquipmentCard({ item }) {
  return (
    <Link to={`/item/${item.id}`} className="browse-card">
      {item.thumbnail_url && (
        <img src={item.thumbnail_url} alt={item.name} className="browse-card-thumbnail" />
      )}

      <div className="browse-card-header">
        <h3>{item.name}</h3>
        <span className={`status-pill status-${item.status}`}>
          {STATUS_LABELS[item.status] || item.status}
        </span>
      </div>
      {item.category && <p className="browse-card-detail">{item.category}</p>}
      {item.location && <p className="browse-card-detail">{item.location}</p>}
    </Link>
  )
}
