// The equipment.status column only ever holds 'available', 'out_of_stock',
// 'maintenance', or 'decommissioned' — the checkout DB functions never set
// 'in_use', since "available" still means "some quantity remains," even if
// part of the stock is checked out. This derives a more useful status for
// display purposes: an item with some (but not all) of its stock checked
// out shows as 'in_use' instead of a flat 'available'.
export function getEffectiveStatus(item, checkedOutQuantity) {
  if (item.status === 'maintenance' || item.status === 'decommissioned') {
    return item.status
  }

  const available = item.total_quantity - checkedOutQuantity

  if (available <= 0) return 'out_of_stock'
  if (checkedOutQuantity > 0) return 'in_use'
  return 'available'
}
