import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { deletePhotoFile } from '../lib/equipmentPhotos'
import { getEffectiveStatus } from '../lib/equipmentStatus'
import EquipmentCard from '../components/EquipmentCard'
import EquipmentFormModal from '../components/EquipmentFormModal'
import StatusSummary from '../components/StatusSummary'
import AdminNav from '../components/AdminNav'
import ScrollToTopButton from '../components/ScrollToTopButton'

export default function AdminDashboard() {
  const [items, setItems] = useState([])
  const [errorMsg, setErrorMsg] = useState(null)
  const [checkoutsByEquipment, setCheckoutsByEquipment] = useState({})
  const [search, setSearch] = useState('')
  const [activeStatuses, setActiveStatuses] = useState(new Set())

  // undefined = modal closed, null = adding a new item, {...item} = editing that item
  const [modalItem, setModalItem] = useState(undefined)

  const loadItems = async () => {
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) setErrorMsg(error.message)
    else setItems(data)

    const { data: activeCheckouts, error: checkoutError } = await supabase
      .from('checkouts')
      .select('id, equipment_id, quantity, checked_out_at, borrower:profiles!user_id(email, full_name)')
      .is('returned_at', null)

    if (checkoutError) {
      setErrorMsg(checkoutError.message)
      return
    }

    const grouped = {}
    for (const checkout of activeCheckouts) {
      if (!grouped[checkout.equipment_id]) grouped[checkout.equipment_id] = []
      grouped[checkout.equipment_id].push(checkout)
    }
    setCheckoutsByEquipment(grouped)
  }

  useEffect(() => { loadItems() }, [])

  const handleAddNew = () => setModalItem(null)
  const handleEdit = (item) => setModalItem(item)
  const closeModal = () => setModalItem(undefined)
  const handleSaved = () => {
    closeModal()
    loadItems()
  }

  const handleDelete = async (item) => {
    if (!confirm('Delete this item permanently?')) return

    const { error } = await supabase.from('equipment').delete().eq('id', item.id)
    if (error) {
      setErrorMsg(error.message)
      return
    }

    // clean up its photos from storage too, now that the row is gone
    const filesToDelete = [item.thumbnail_url, item.thumbnail_full_url, ...(item.photo_urls || [])].filter(Boolean)
    await Promise.all(filesToDelete.map(deletePhotoFile))

    loadItems()
  }

  const handleReturnCheckout = async (checkoutId) => {
    const { error } = await supabase.rpc('return_checkout', { checkout_id: checkoutId })
    if (error) setErrorMsg(error.message)
    else loadItems()
  }

  const toggleStatus = (status) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()

    return items.filter((item) => {
      const checkedOutQuantity = (checkoutsByEquipment[item.id] || []).reduce((sum, c) => sum + c.quantity, 0)
      const effectiveStatus = getEffectiveStatus(item, checkedOutQuantity)

      if (activeStatuses.size > 0 && !activeStatuses.has(effectiveStatus)) return false
      if (!term) return true

      const haystack = [item.name, item.category, item.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [items, search, activeStatuses, checkoutsByEquipment])

  return (
    <div className="admin-dashboard">
      <h1>LabQR Admin</h1>
      <AdminNav />

      <StatusSummary
        items={items}
        checkoutsByEquipment={checkoutsByEquipment}
        activeStatuses={activeStatuses}
        onToggle={toggleStatus}
      />

      <div className="admin-toolbar">
        <input
          type="text"
          placeholder="Search by name, category, or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-search"
        />
        <button type="button" onClick={handleAddNew}>Add equipment</button>
      </div>

      {errorMsg && <p className="error-text">{errorMsg}</p>}

      {modalItem !== undefined && (
        <EquipmentFormModal
          item={modalItem}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}

      {filteredItems.length === 0 ? (
        <p className="status-text">No equipment matches.</p>
      ) : (
        <div className="equipment-grid">
          {filteredItems.map((item) => (
            <EquipmentCard
              key={item.id}
              item={item}
              checkouts={checkoutsByEquipment[item.id] || []}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReturnCheckout={handleReturnCheckout}
            />
          ))}
        </div>
      )}

      <ScrollToTopButton />
    </div>
  )
}
