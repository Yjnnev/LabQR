import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import EquipmentCard from '../components/EquipmentCard'
import ThumbnailCropper from '../components/ThumbnailCropper'

const emptyForm = {
  name: '',
  category: '',
  serial_number: '',
  status: 'available',
  location: '',
  notes: '',
}

// uploads one file to the equipment-photos bucket and returns its public URL
async function uploadPhoto(file) {
  const path = `${crypto.randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('equipment-photos')
    .upload(path, file)

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('equipment-photos').getPublicUrl(path)
  return data.publicUrl
}

// pulls the storage path back out of a public URL so we can delete the file
function extractStoragePath(url) {
  const marker = '/equipment-photos/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}

async function deletePhotoFile(url) {
  const path = extractStoragePath(url)
  if (!path) return
  await supabase.storage.from('equipment-photos').remove([path])
}

export default function AdminDashboard() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [uploading, setUploading] = useState(false)

  // the untouched snapshot of what was saved when editing started — used to
  // figure out what got removed/replaced, so we know what to delete from storage
  const [originalThumbnail, setOriginalThumbnail] = useState(null)
  const [originalGalleryUrls, setOriginalGalleryUrls] = useState([])

  // the live, editable state shown in the form
  const [existingThumbnail, setExistingThumbnail] = useState(null)
  const [existingGalleryUrls, setExistingGalleryUrls] = useState([])

  // newly picked files, not yet uploaded
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [galleryFiles, setGalleryFiles] = useState([])
  const [pendingCropFile, setPendingCropFile] = useState(null)

  const loadItems = async () => {
    const { data, error } = await supabase
      .from('equipment')
      .select('*, borrower:profiles!checked_out_by(email, full_name)')
      .order('created_at', { ascending: false })

    if (error) setErrorMsg(error.message)
    else setItems(data)
  }

  useEffect(() => { loadItems() }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const resetPhotoState = () => {
    setThumbnailFile(null)
    setGalleryFiles([])
    setPendingCropFile(null)
    setExistingThumbnail(null)
    setExistingGalleryUrls([])
    setOriginalThumbnail(null)
    setOriginalGalleryUrls([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)
    setUploading(true)

    try {
      const { name, category, serial_number, status, location, notes } = form

      let thumbnail_url = existingThumbnail

      if (thumbnailFile) {
        // a new thumbnail is replacing whatever was there before
        thumbnail_url = await uploadPhoto(thumbnailFile)
        if (originalThumbnail) await deletePhotoFile(originalThumbnail)
      } else if (originalThumbnail && !existingThumbnail) {
        // the thumbnail was removed without a replacement
        await deletePhotoFile(originalThumbnail)
      }

      let photo_urls = existingGalleryUrls
      if (galleryFiles.length > 0) {
        const uploaded = await Promise.all(galleryFiles.map(uploadPhoto))
        photo_urls = [...photo_urls, ...uploaded]
      }

      // clean up any gallery photos that were removed and never re-added
      const removedGalleryUrls = originalGalleryUrls.filter((u) => !photo_urls.includes(u))
      await Promise.all(removedGalleryUrls.map(deletePhotoFile))

      const payload = { name, category, serial_number, status, location, notes, thumbnail_url, photo_urls }

      const action = editingId
        ? supabase.from('equipment').update(payload).eq('id', editingId)
        : supabase.from('equipment').insert(payload)

      const { error } = await action
      if (error) throw error

      setForm(emptyForm)
      resetPhotoState()
      setEditingId(null)
      loadItems()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleEdit = (item) => {
    setForm({
      name: item.name || '',
      category: item.category || '',
      serial_number: item.serial_number || '',
      status: item.status || 'available',
      location: item.location || '',
      notes: item.notes || '',
    })
    setEditingId(item.id)
    setThumbnailFile(null)
    setGalleryFiles([])
    setPendingCropFile(null)
    setExistingThumbnail(item.thumbnail_url || null)
    setExistingGalleryUrls(item.photo_urls || [])
    setOriginalThumbnail(item.thumbnail_url || null)
    setOriginalGalleryUrls(item.photo_urls || [])
  }

  const handleCancelEdit = () => {
    setForm(emptyForm)
    setEditingId(null)
    resetPhotoState()
  }

  const handleDelete = async (item) => {
    if (!confirm('Delete this item permanently?')) return

    const { error } = await supabase.from('equipment').delete().eq('id', item.id)
    if (error) {
      setErrorMsg(error.message)
      return
    }

    // clean up its photos from storage too, now that the row is gone
    const filesToDelete = [item.thumbnail_url, ...(item.photo_urls || [])].filter(Boolean)
    await Promise.all(filesToDelete.map(deletePhotoFile))

    loadItems()
  }

  const handleMarkReturned = async (id) => {
    const { error } = await supabase.rpc('checkout_equipment', {
      item_id: id,
      requested_action: 'returned',
    })
    if (error) setErrorMsg(error.message)
    else loadItems()
  }

  const removeExistingGalleryPhoto = (url) => {
    setExistingGalleryUrls((prev) => prev.filter((u) => u !== url))
  }

  return (
    <div className="admin-dashboard">
      <h1>LabQR Admin</h1>

      <form onSubmit={handleSubmit} className="equipment-form">
        <input name="name" placeholder="Name" value={form.name} onChange={handleChange} required />
        <input name="category" placeholder="Category" value={form.category} onChange={handleChange} />
        <input name="serial_number" placeholder="Current Item Count" value={form.serial_number} onChange={handleChange} />
        <select name="status" value={form.status} onChange={handleChange}>
          <option value="available">Available</option>
          <option value="in_use">In use</option>
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
              <button type="button" onClick={() => setExistingThumbnail(null)}>Remove</button>
            </div>
          )}

          {thumbnailFile && (
            <div className="existing-photo">
              <img src={URL.createObjectURL(thumbnailFile)} alt="New thumbnail (cropped)" />
              <button type="button" onClick={() => setThumbnailFile(null)}>Undo</button>
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

        <div className="form-actions">
          <button type="submit" disabled={uploading}>
            {uploading ? 'Saving…' : editingId ? 'Update item' : 'Add item'}
          </button>
          {editingId && <button type="button" onClick={handleCancelEdit}>Cancel</button>}
        </div>
      </form>

      {errorMsg && <p className="error-text">{errorMsg}</p>}

      {pendingCropFile && (
        <ThumbnailCropper
          imageFile={pendingCropFile}
          onCancel={() => setPendingCropFile(null)}
          onCropComplete={(croppedFile) => {
            setThumbnailFile(croppedFile)
            setPendingCropFile(null)
          }}
        />
      )}

      <div className="equipment-grid">
        {items.map((item) => (
          <EquipmentCard
            key={item.id}
            item={item}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onMarkReturned={handleMarkReturned}
          />
        ))}
      </div>
    </div>
  )
}
