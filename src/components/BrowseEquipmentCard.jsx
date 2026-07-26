import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STATUS_LABELS } from '../lib/statusLabels'
import PhotoGalleryModal from './PhotoGalleryModal'

export default function BrowseEquipmentCard({ item }) {
  const [showFull, setShowFull] = useState(false)

  const openFullImage = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setShowFull(true)
  }

  return (
    <>
      <Link to={`/item/${item.id}`} className="browse-card">
        {item.thumbnail_url && (
          <span
            className="browse-card-thumbnail-zoom"
            role="button"
            tabIndex={0}
            onClick={openFullImage}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFullImage(e) }}
            aria-label={`View full-size photo of ${item.name}`}
          >
            <img src={item.thumbnail_url} alt={item.name} className="browse-card-thumbnail" />
          </span>
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

      {showFull && (
        <PhotoGalleryModal
          photos={[item.thumbnail_full_url || item.thumbnail_url]}
          startIndex={0}
          onClose={() => setShowFull(false)}
        />
      )}
    </>
  )
}
