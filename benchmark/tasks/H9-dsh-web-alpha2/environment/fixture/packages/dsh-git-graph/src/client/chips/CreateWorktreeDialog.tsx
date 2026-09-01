/**
 * The create-worktree dialog: name input with the sanitizer mirror for
 * instant feedback, a base-branch picker (default: the checkout's current
 * branch), and readable rejection copy. Success registers the worktree as a
 * workspace and starts a new session in it (the owner owns that flow).
 * @module dsh-git-graph/client/chips/CreateWorktreeDialog
 */

import { useState } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { sanitizeWorktreeName } from '../../core/git-command.ts'
import type { BranchRow, WorktreeAddResult } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import { errorMessage } from './error-copy.ts'
import { Backdrop } from './Chip.tsx'
import css from './context.module.css'

/** Props of the create-worktree dialog. */
export interface CreateWorktreeDialogProps {
  /** Local branches for the base picker. */
  branches: BranchRow[]
  /** The checkout's current branch (the picker default); empty when detached. */
  currentBranch: string
  /** The create flow: host worktree-add, then workspace registration + session start. */
  onCreate: (name: string, baseRef: string | undefined) => Promise<WorktreeAddResult>
  /** Close the dialog (cancel or after a successful create). */
  onClose: () => void
  t: Translate<GitGraphKey>
}

/**
 * The create-worktree-and-start-session dialog.
 * @param props - see {@link CreateWorktreeDialogProps}.
 */
export function CreateWorktreeDialog({ branches, currentBranch, onCreate, onClose, t }: CreateWorktreeDialogProps) {
  const [name, setName] = useState('')
  const [baseRef, setBaseRef] = useState(currentBranch)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sanitized = sanitizeWorktreeName(name)

  const submit = (): void => {
    if (pending) return
    if (sanitized === null) {
      setError(t('error.invalidWorktreeName'))
      return
    }
    setPending(true)
    setError(null)
    void onCreate(sanitized, baseRef === '' ? undefined : baseRef).then((result) => {
      if (result.ok) {
        onClose()
        return
      }
      setError(errorMessage(result.error, t))
    }).finally(() => { setPending(false) })
  }

  return (
    <>
      <Backdrop onClose={onClose} />
      <div className={css.dialog} role="dialog" aria-label={t('worktree.dialog.title')} data-gitgraph-worktree-dialog>
        <h3 className={css.dialogTitle}>{t('worktree.dialog.title')}</h3>
        <p className={css.dialogDescription}>{t('worktree.dialog.description')}</p>
        <div className={css.dialogField}>
          <label className={css.dialogLabel} htmlFor="git-graph-worktree-name">
            {t('worktree.dialog.nameLabel')}
          </label>
          <input
            id="git-graph-worktree-name"
            className={css.dialogInput}
            value={name}
            onChange={(event) => { setName(event.target.value) }}
            placeholder={t('worktree.dialog.namePlaceholder')}
            onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
            autoFocus
          />
        </div>
        <div className={css.dialogField} style={{ marginTop: 10 }}>
          <label className={css.dialogLabel} htmlFor="git-graph-worktree-base">
            {t('worktree.dialog.baseLabel')}
          </label>
          <select
            id="git-graph-worktree-base"
            className={css.dialogInput}
            value={baseRef}
            onChange={(event) => { setBaseRef(event.target.value) }}
          >
            {branches.map(branch => (
              <option key={branch.name} value={branch.name}>{branch.name}</option>
            ))}
          </select>
        </div>
        {error !== null && <div className={css.dialogError}>{error}</div>}
        <div className={css.dialogActions}>
          <button type="button" className={css.dialogButton} onClick={onClose}>
            {t('worktree.dialog.cancel')}
          </button>
          <button
            type="button"
            className={css.dialogButtonPrimary}
            onClick={submit}
            disabled={pending || name.trim() === ''}
          >
            {t('worktree.dialog.confirm')}
          </button>
        </div>
      </div>
    </>
  )
}