/**
 * Generic confirm dialog used by destructive actions (task delete).
 */
import { t } from '../locales.ts'
import css from '../board.module.css'

/** Confirm overlay props. */
export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  /** Render the confirm button in the danger style. */
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Small confirm overlay. */
export function ConfirmDialog({ title, message, confirmLabel, danger, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <div className={css.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div className={css.modal} role="alertdialog" aria-label={title}>
        <h2 className={css.modalTitle}>{title}</h2>
        <p className={css.confirmMessage}>{message}</p>
        <footer className={css.modalFooter}>
          <button type="button" className={css.ghostButton} onClick={onCancel}>
            {t('delete.cancel')}
          </button>
          <button
            type="button"
            className={danger ? css.dangerButton : css.primaryButton}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
