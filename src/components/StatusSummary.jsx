import { STATUS_LABELS } from '../lib/statusLabels'

const STATUS_ORDER = ['available', 'in_use', 'out_of_stock', 'maintenance', 'decommissioned']

export default function StatusSummary({ items, activeStatuses, onToggle }) {
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1
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
