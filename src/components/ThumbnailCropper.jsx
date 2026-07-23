import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImageFile } from '../lib/cropImage'

export default function ThumbnailCropper({ imageFile, onCancel, onCropComplete }) {
  const [imageSrc] = useState(() => URL.createObjectURL(imageFile))
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  // release the temporary object URL once this dialog closes
  useEffect(() => () => URL.revokeObjectURL(imageSrc), [imageSrc])

  const handleCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = async () => {
    const croppedFile = await getCroppedImageFile(imageSrc, croppedAreaPixels, imageFile.name)
    onCropComplete(croppedFile)
  }

  return (
    <div className="modal-overlay">
      <div className="crop-modal">
        <h3>Crop thumbnail</h3>

        <div className="crop-area">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <label className="crop-zoom-label">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>

        <div className="crop-modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={handleConfirm}>Use this crop</button>
        </div>
      </div>
    </div>
  )
}
