import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

// Renders a QR code that encodes /item/:id, plus a button to save it as a PNG
// (so admins can print it and stick it on the physical equipment).
export default function QRCodeCell({ itemId, itemName }) {
  const canvasRef = useRef(null)
  const url = `${window.location.origin}/item/${itemId}`

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 96, margin: 1 })
    }
  }, [url])

  const handleDownload = () => {
    const link = document.createElement('a')
    link.download = `${itemName.replace(/\s+/g, '-').toLowerCase()}-qr.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="qr-cell">
      <canvas ref={canvasRef} />
      <button type="button" onClick={handleDownload}>Download</button>
    </div>
  )
}
