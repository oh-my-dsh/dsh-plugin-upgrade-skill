/**
 * One-time failed-pairing notice: a fixed toast rendered on the phone after
 * a QR accept failed (invalid/used token or a network error). Mounted by
 * the client apply with a plain React root — no slot machinery for a
 * transient diagnostic.
 */
import { useEffect, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './remote.module.css'

/** Notice props: localized copy. */
export interface PairFailedNoticeProps {
  t: TranslateNS<'remote'>
}

/**
 * Render the failed-pair toast (auto-dismisses).
 * @param props - localized copy.
 * @returns the toast element.
 */
export function PairFailedNotice({ t }: PairFailedNoticeProps) {  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => { setVisible(false) }, 8000)
    return () => { window.clearTimeout(timer) }
  }, [])
  if (!visible) return null
  return (
    <div className={css.notice} role="alert">
      <p className={css.noticeTitle}>{t('pair.failed.title')}</p>
      <p className={css.noticeDetail}>{t('pair.failed.detail')}</p>
    </div>
  )
}
