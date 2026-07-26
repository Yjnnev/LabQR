import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { uploadPhoto, deletePhotoFile } from '../lib/equipmentPhotos'
import ThumbnailCropper from './ThumbnailCropper'

const emptyForm = {
  name: '',
  category: '',
  total_quantity: 1,
  status: 'available',
  location: '',
  notes: '',
}

function formFromItem(item) {
  if (!item) return emptyForm
  return {
    name: item.name || '',
    category: item.category || '',
    total_quantity: item.total_quantity || 1,
    status: item.status || 'available',
    location: item.location || '',
    notes: item.notes || '',
  }
}

export default function EquipmentFormModal({ item, onClose, onSaved }) {
  const editingId = item?.id ?? null

  const [form, setForm] = useState(() => formFromItem(item))
  const [errorMsg, setErrorMsg] = useState(null)
  const [uploading, setUploading] = useState(false)

  // the untouched snapshot of what was saved when editing started — used to
  // figure out what got removed/replaced, so we know what to delete from storage
  const [originalThumbnail] = useState(item?.thumbnail_url || null)
  const [originalThumbnailFull] = useState(item?.thumbnail_full_url || null)
  const [originalGalleryUrls] = useState(item?.photo_urls || [])

  // the live, editable state shown in the form
  const [existingThumbnail, setExistingThumbnail] = useState(item?.thumbnail_url || null)
  const [existingThumbnailFull, setExistingThumbnailFull] = useState(item?.thumbnail_full_url || null)
  const [existingGalleryUrls, setExistingGalleryUrls] = useState(item?.photo_urls || [])

  // newly picked files, not yet uploaded — thumbnailFile is the cropped version shown
  // everywhere, thumbnailFullFile is the untouched original kept for full-size viewing
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [thumbnailFullFile, setThumbnailFullFile] = useState(null)
  const [galleryFiles, setGalleryFiles] = useState([])
  const [pendingCropFile, setPendingCropFile] = useState(null)

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)
    setUploading(true)

    try {
      const { name, category, total_quantity, status, location, notes } = form

      let thumbnail_url = existingThumbnail
      let thumbnail_full_url = existingThumbnailFull

      if (thumbnailFile) {
        // a new thumbnail is replacing whatever was there before
        thumbnail_url = await uploadPhoto(thumbnailFile)
        thumbnail_full_url = thumbnailFullFile ? await uploadPhoto(thumbnailFullFile) : null
        if (originalThumbnail) await deletePhotoFile(originalThumbnail)
        if (originalThumbnailFull) await deletePhotoFile(originalThumbnailFull)
      } else if (originalThumbnail && !existingThumbnail) {
        // the thumbnail was removed without a replacement
        await deletePhotoFile(originalThumbnail)
        if (originalThumbnailFull) await deletePhotoFile(originalThumbnailFull)
        thumbnail_full_url = null
      }

      let photo_urls = existingGalleryUrls
      if (galleryFiles.length > 0) {
        const uploaded = await Promise.all(galleryFiles.map(uploadPhoto))
        photo_urls = [...photo_urls, ...uploaded]
      }

      // clean up any gallery photos that were removed and never re-added
      const removedGalleryUrls = originalGalleryUrls.filter((u) => !photo_urls.includes(u))
      await Promise.all(removedGalleryUrls.map(deletePhotoFile))

      const payload = {
        name, category, status, location, notes,
        total_quantity: parseInt(total_quantity, 10) || 1,
        thumbnail_url, thumbnail_full_url, photo_urls,
      }

      const action = editingId
        ? supabase.from('equipment').update(payload).eq('id', editingId)
        : supabase.from('equipment').insert(payload)

      const { error } = await action
      if (error) throw error

      onSaved()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setUploading(false)
    }
  }

  const removeExistingGalleryPhoto = (url) => {
    setExistingGalleryUrls((prev) => prev.filter((u) => u !== url))
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="equipment-modal">
        <div className="equipment-modal-header">
          <h3>{editingId ? 'Edit equipment' : 'Add equipment'}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="equipment-form">
          <input name="name" placeholder="Name" value={form.name} onChange={handleChange} required />
          <input name="category" placeholder="Category" value={form.category} onChange={handleChange} />
          <label className="file-field">
            Total quantity owned
            <input
              name="total_quantity"
              type="number"
              min="1"
              placeholder="Total quantity owned"
              value={form.total_quantity}
              onChange={handleChange}
              required
            />
          </label>
          <select name="status" value={form.status} onChange={handleChange}>
            <option value="available">Available</option>
            <option value="maintenance">Maintenance</option>
            <option value="decommissioned">Decommissioned</option>
          </select>
          <input name="location" placeholder="Location" value={form.location} onChange={handleChange} />
          <textarea name="notes" placeholder="Notes" value={form.notes} onChange={handleChange} rows={3} />

          {/* Thumbnail management */}
          <div className="photo-manager">
            <span className="photo-manager-label">Thumbnail</span>

            {existingThumbnail && !thumbnailFile && (
              <div className="existing-photo">
                <img src={existingThumbnail} alt="Current thumbnail" />
                <button type="button" onClick={() => { setExistingThumbnail(null); setExistingThumbnailFull(null) }}>Remove</button>
              </div>
            )}

            {thumbnailFile && (
              <div className="existing-photo">
                <img src={URL.createObjectURL(thumbnailFile)} alt="New thumbnail (cropped)" />
                <button type="button" onClick={() => { setThumbnailFile(null); setThumbnailFullFile(null) }}>Undo</button>
              </div>
            )}

            <label className="file-field">
              {existingThumbnail || thumbnailFile ? 'Replace thumbnail' : 'Upload a thumbnail'}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPendingCropFile(e.target.files[0] || null)}
              />
            </label>
          </div>

          {/* Gallery photo management */}
          <div className="photo-manager">
            <span className="photo-manager-label">Additional photos</span>

            {existingGalleryUrls.length > 0 && (
              <div className="existing-gallery">
                {existingGalleryUrls.map((url) => (
                  <div key={url} className="existing-gallery-item">
                    <img src={url} alt="Existing" />
                    <button type="button" onClick={() => removeExistingGalleryPhoto(url)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <label className="file-field">
              Add more photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setGalleryFiles(Array.from(e.target.files))}
              />
            </label>
            {galleryFiles.length > 0 && (
              <span className="file-field-status">
                {galleryFiles.length} new photo{galleryFiles.length > 1 ? 's' : ''} ready to upload
              </span>
            )}
          </div>

          {errorMsg && <p className="error-text">{errorMsg}</p>}

          <div className="form-actions">
            <button type="submit" disabled={uploading}>
              {uploading ? 'Saving…' : editingId ? 'Update item' : 'Add item'}
            </button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>

        {pendingCropFile && (
          <ThumbnailCropper
            imageFile={pendingCropFile}
            onCancel={() => setPendingCropFile(null)}
            onCropComplete={(croppedFile) => {
              setThumbnailFile(croppedFile)
              setThumbnailFullFile(pendingCropFile)
              setPendingCropFile(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
