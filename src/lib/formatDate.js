// All checkout timestamps are shown in Philippine time (GMT+8) regardless of
// the viewer's own device/timezone, since that's where the lab operates —
// otherwise an admin checking the dashboard while traveling would see a
// different time than someone viewing it in Manila, for the same event.
const TIME_ZONE = 'Asia/Manila'

export function formatDateTime(dateString) {
  return new Date(dateString).toLocaleString('en-PH', {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-PH', {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
  })
}
