import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import BrowseEquipmentCard from '../components/BrowseEquipmentCard'

export default function BrowseEquipment() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    async function loadItems() {
      const { data, error } = await supabase
        .from('equipment')
        .select('id, name, category, status, location, serial_number')
        .order('name', { ascending: true })

      if (error) setError(error.message)
      else setItems(data)
      setLoading(false)
    }
    loadItems()
  }, [])

  const categories = ['all', ...new Set(items.map((i) => i.category).filter(Boolean))]

  const filtered = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'all' || item.category === category
    return matchesSearch && matchesCategory
  })

  if (loading) return <p className="status-text">Loading equipment…</p>
  if (error) return <p className="status-text">{error}</p>

  return (
    <div className="browse-page">
      <h1>Browse Equipment</h1>

      <div className="browse-controls">
        <input
          type="text"
          placeholder="Search equipment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="status-text">No equipment matches your search.</p>
      ) : (
        <div className="browse-grid">
          {filtered.map((item) => (
            <BrowseEquipmentCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
