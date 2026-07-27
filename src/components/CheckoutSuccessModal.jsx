export default function CheckoutSuccessModal({ message, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="checkout-success-modal" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-success-icon">✓</div>
        <p>{message}</p>
        <button type="button" onClick={onClose}>Nice!</button>
      </div>
    </div>
  )
}
