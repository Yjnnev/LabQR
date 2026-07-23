import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import EquipmentCard from '../components/EquipmentCard'

const emptyForm = {
  name: '',
  category: '',
  serial_number: '',
  status: 'available',
  location: '',
  notes: '',
  thumbnail_url: null,
  photo_urls: [],
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

export default function AdminDashboard() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [galleryFiles, setGalleryFiles] = useState([])
  const [uploading, setUploading] = useState(false)

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)
    setUploading(true)

    try {
      const { name, category, serial_number, status, location, notes } = form
      let { thumbnail_url, photo_urls } = form

      // only upload if the admin actually picked new files — otherwise
      // keep whatever URLs were already saved (important when editing)
      if (thumbnailFile) {
        thumbnail_url = await uploadPhoto(thumbnailFile)
      }
      if (galleryFiles.length > 0) {
        const uploaded = await Promise.all(galleryFiles.map(uploadPhoto))
        photo_urls = [...(photo_urls || []), ...uploaded]
      }

      const payload = { name, category, serial_number, status, location, notes, thumbnail_url, photo_urls }

      const action = editingId
        ? supabase.from('equipment').update(payload).eq('id', editingId)
        : supabase.from('equipment').insert(payload)

      const { error } = await action
      if (error) throw error

      setForm(emptyForm)
      setThumbnailFile(null)
      setGalleryFiles([])
      setEditingId(null)
      loadItems()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleEdit = (item) => {
    setForm({ ...emptyForm, ...item })
    setEditingId(item.id)
    setThumbnailFile(null)
    setGalleryFiles([])
  }

  const handleCancelEdit = () => {
    setForm(emptyForm)
    setEditingId(null)
    setThumbnailFile(null)
    setGalleryFiles([])
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this item permanently?')) return
    const { error } = await supabase.from('equipment').delete().eq('id', id)
    if (error) setErrorMsg(error.message)
    else loadItems()
  }

  const handleMarkReturned = async (id) => {
    const { error } = await supabase.rpc('checkout_equipment', {
      item_id: id,
      requested_action: 'returned',
    })
    if (error) setErrorMsg(error.message)
    else loadItems()
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

        <label className="file-field">
          Thumbnail photo (shown on the card)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setThumbnailFile(e.target.files[0] || null)}
          />
        </label>

        <label className="file-field">
          Additional photos (shown on the item page)
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setGalleryFiles(Array.from(e.target.files))}
          />
        </label>

        <div className="form-actions">
          <button type="submit" disabled={uploading}>
            {uploading ? 'Saving…' : editingId ? 'Update item' : 'Add item'}
          </button>
          {editingId && <button type="button" onClick={handleCancelEdit}>Cancel</button>}
        </div>
      </form>

      {errorMsg && <p className="error-text">{errorMsg}</p>}

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
