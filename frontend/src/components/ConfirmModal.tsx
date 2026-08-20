import Modal from './Modal'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title, message, confirmLabel = 'Διαγραφή', busy, onConfirm, onCancel,
}: ConfirmModalProps) {
  return (
    <Modal onDismiss={onCancel} className="confirm-modal">
      <h3>{title}</h3>
      <p>{message}</p>
      <p className="confirm-actions">
        <button className="danger" disabled={busy} onClick={onConfirm} autoFocus>
          {busy ? 'Παρακαλώ περιμένετε…' : confirmLabel}
        </button>{' '}
        <button onClick={onCancel}>Ακύρωση</button>
      </p>
    </Modal>
  )
}
