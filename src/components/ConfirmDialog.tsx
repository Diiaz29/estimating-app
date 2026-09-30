import Modal from './Modal'
interface Props { title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }
export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  return <Modal title={title} description={message} onClose={onCancel} className="confirm-modal">
    <div className="app-modal-actions">
      <button autoFocus data-modal-autofocus type="button" onClick={onCancel} className="index-secondary">Cancel</button>
      <button type="button" onClick={onConfirm} className={confirmLabel === 'Delete' ? 'modal-danger' : 'index-primary'}>{confirmLabel}</button>
    </div>
  </Modal>
}
