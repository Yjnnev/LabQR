import { STATUS_LABELS } from '../lib/statusLabels'
import { getEffectiveStatus } from '../lib/equipmentStatus'

const STATUS_ORDER = ['available', 'in_use', 'out_of_stock', 'maintenance', 'decommissioned']

export default function StatusSummary({ items, checkoutsByEquipment, activeStatuses, onToggle }) {
  const counts = items.reduce((acc, item) => {
    const checkedOutQuantity = (checkoutsByEquipment[item.id] || []).reduce((sum, c) => sum + c.quantity, 0)
    const status = getEffectiveStatus(item, checkedOutQuantity)
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="status-summary">
      {STATUS_ORDER.map((status) => {
        const isActive = activeStatuses.has(status)
        return (
          <button
            key={status}
            type="button"
            onClick={() => onToggle(status)}
            className={`status-pill status-${status}${isActive ? ' status-pill-active' : ''}`}
          >
            {counts[status] || 0} {STATUS_LABELS[status]}
          </button>
        )
      })}
    </div>
  )
}
