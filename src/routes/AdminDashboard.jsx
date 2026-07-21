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
}

export default function AdminDashboard() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const loadItems = async () => {
    // embed the borrower's profile (email) via the checked_out_by foreign key
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

    // don't send read-only/joined fields back on update
    const { name, category, serial_number, status, location, notes } = form
    const payload = { name, category, serial_number, status, location, notes }

    const action = editingId
      ? supabase.from('equipment').update(payload).eq('id', editingId)
      : supabase.from('equipment').insert(payload)

    const { error } = await action
    if (error) return setErrorMsg(error.message)

    setForm(emptyForm)
    setEditingId(null)
    loadItems()
  }

  const handleEdit = (item) => {
    setForm(item)
    setEditingId(item.id)
  }

  const handleCancelEdit = () => {
    setForm(emptyForm)
    setEditingId(null)
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
        <input name="Count" placeholder="Count" value={form.serial_number} onChange={handleChange} />
        <select name="status" value={form.status} onChange={handleChange}>
          <option value="available">Available</option>
          <option value="in_use">In use</option>
          <option value="maintenance">Maintenance</option>
          <option value="decommissioned">Decommissioned</option>
        </select>
        <input name="location" placeholder="Location" value={form.location} onChange={handleChange} />
        <input name="notes" placeholder="Notes" value={form.notes} onChange={handleChange} />

        <div className="form-actions">
          <button type="submit">{editingId ? 'Update item' : 'Add item'}</button>
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
