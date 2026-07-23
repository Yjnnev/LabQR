import { useState } from 'react'

export default function PhotoGalleryModal({ photos, startIndex, onClose }) {
  const [index, setIndex] = useState(startIndex)

  const showPrev = () => setIndex((i) => (i === 0 ? photos.length - 1 : i - 1))
  const showNext = () => setIndex((i) => (i === photos.length - 1 ? 0 : i + 1))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="gallery-modal" onClick={(e) => e.stopPropagation()}>
        <button className="gallery-close" onClick={onClose} aria-label="Close">✕</button>

        {photos.length > 1 && (
          <button className="gallery-nav gallery-prev" onClick={showPrev} aria-label="Previous photo">‹</button>
        )}

        <img src={photos[index]} alt="Equipment" className="gallery-modal-image" />

        {photos.length > 1 && (
          <button className="gallery-nav gallery-next" onClick={showNext} aria-label="Next photo">›</button>
        )}
      </div>
    </div>
  )
}
