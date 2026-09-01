/**
 * Shared task-modal pieces: the overlay shell (backdrop, form, title, error,
 * footer) and the title/description/prompt field trio used by both the
 * NewTaskModal and the EditTaskModal. State stays in the owning modal; these
 * are controlled components.
 */
import type { ReactNode } from 'react'
import { t } from '../locales.ts'
import css from '../board.module.css'

/** Modal overlay: closes on backdrop press, submits through the form. */
export function ModalShell({
  ariaLabel,
  title,
  error,
  pending,
  submitLabel,
  onSubmit,
  onClose,
  children,
}: {
  ariaLabel: string
  title: string
  error: string | undefined
  pending: boolean
  submitLabel: string
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className={css.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <form
        className={css.modal}
        role="dialog"
        aria-label={ariaLabel}
        onSubmit={event => { event.preventDefault(); onSubmit() }}
      >
        <h2 className={css.modalTitle}>{title}</h2>

        {children}

        {error !== undefined && <p className={css.formError}>{error}</p>}

        <footer className={css.modalFooter}>
          <button type="button" className={css.ghostButton} onClick={onClose}>
            {t('new.cancel')}
          </button>
          <button type="submit" className={css.primaryButton} disabled={pending}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  )
}

/** Title + description + prompt fields shared by the new and edit task forms. */
export function TaskContentFields({
  title,
  description,
  prompt,
  onTitleChange,
  onDescriptionChange,
  onPromptChange,
}: {
  title: string
  description: string
  prompt: string
  /** Receives the new title; the owner also clears its error state. */
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onPromptChange: (value: string) => void
}) {
  return (
    <>
      <label className={css.field}>
        <span className={css.fieldLabel}>{t('new.title')}</span>
        <input
          className={css.input}
          value={title}
          autoFocus
          placeholder={t('new.titlePlaceholder')}
          onChange={event => onTitleChange(event.target.value)}
        />
      </label>

      <label className={css.field}>
        <span className={css.fieldLabel}>{t('new.description')}</span>
        <textarea
          className={css.input}
          rows={3}
          value={description}
          placeholder={t('new.descriptionPlaceholder')}
          onChange={event => onDescriptionChange(event.target.value)}
        />
      </label>

      <label className={css.field}>
        <span className={css.fieldLabel}>{t('new.prompt')}</span>
        <textarea
          className={css.input}
          rows={4}
          value={prompt}
          placeholder={t('new.promptPlaceholder')}
          onChange={event => onPromptChange(event.target.value)}
        />
      </label>
    </>
  )
}
