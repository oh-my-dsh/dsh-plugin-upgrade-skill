/**
 * Send-to-Harness dialog for the dsh-doctor recovery console.
 *
 * Shows the composed troubleshooting prompt (failure summary plus error stack)
 * in an editable textarea, offers copy-to-clipboard, and queues the prompt
 * into the CURRENT DSH session when one is open. The dialog never touches the
 * supervisor state; a missing current session simply disables sending and
 * explains why.
 * @module @linxin666/dsh-doctor/client
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { HarnessTarget } from './harness-send.ts'
import { copyText } from './clipboard.ts'
import css from './doctor.module.css'

/** Props of the send-to-Harness dialog. */
export interface HarnessSendDialogProps {
  t: TranslateNS<'doctor'>
  /** Whether the dialog is shown. */
  open: boolean
  /** Initial prompt text; re-seeded whenever the dialog opens. */
  initialText: string
  /** Current session target, undefined when none is open. */
  target: HarnessTarget | undefined
  /** Whether a send is possible right now (target present and not busy). */
  canSend: boolean
  /** A send is crossing the wire. */
  busy: boolean
  /** Last send failure reason, when any. */
  error: string | undefined
  onClose: () => void
  onSend: (text: string) => void
}

/**
 * Render the dialog; returns null when closed. Text is local state seeded on
 * open, so edits survive re-renders but never leak into later openings.
 */
export function HarnessSendDialog(props: HarnessSendDialogProps): ReactNode {
  const { t, open } = props
  const [text, setText] = useState(props.initialText)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setText(props.initialText)
      setCopied(false)
    }
    // Re-seed only on open; a view refresh while open must not clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const copy = (): void => {
    void copyText(text).then(ok => { setCopied(ok) })
  }

  return (
    <div className={css.dialogBackdrop} role="presentation" onClick={props.onClose}>
      <div
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('harness.title')}
        onClick={event => { event.stopPropagation() }}
      >
        <h3 className={css.dialogTitle}>{t('harness.title')}</h3>
        <p className={css.hint}>{t('harness.subtitle')}</p>
        <label className={css.dialogLabel} htmlFor="harness-prompt-text">{t('harness.prompt')}</label>
        <textarea
          id="harness-prompt-text"
          className={css.dialogTextarea}
          value={text}
          onChange={event => { setText(event.target.value) }}
          spellCheck={false}
        />
        <div className={css.dialogTarget} data-dsh-part="harness-target">
          <span>{t('harness.target')}</span>
          <span className={css.dialogTargetValue}>
            {props.target !== undefined ? props.target.label : t('harness.noTarget')}
          </span>
        </div>
        {props.error !== undefined && <p className={css.errorLine} role="status">{props.error}</p>}
        <div className={css.actionRow}>
          <button type="button" className={css.button} disabled={props.busy} onClick={copy}>
            {copied ? t('harness.copied') : t('harness.copy')}
          </button>
          <button
            type="button"
            className={css.button}
            data-variant="primary"
            disabled={props.busy || !props.canSend || text.trim() === ''}
            onClick={() => { props.onSend(text) }}
          >
            {props.busy ? t('harness.sending') : t('harness.send')}
          </button>
          <button type="button" className={css.button} disabled={props.busy} onClick={props.onClose}>
            {t('harness.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
