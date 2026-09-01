/**
 * Cluster tab: run one command across many hosts (aliases / environment /
 * tags filters) and inspect per-host results. Stdout/stderr render in
 * collapsed <details> blocks; status renders as a colored badge.
 */
import { useState } from 'react'
import type { SshApi } from '../api.ts'
import type { ClusterResult } from '../../protocol.ts'
import { errorMessage, tt } from './helpers.ts'
import css from './panel.module.css'

/** Cluster tab props. */
export interface ClusterTabProps {
  api: SshApi
}

/** Split a comma-separated input into a trimmed, non-empty string list. */
function splitList(text: string): string[] {
  return text.split(',').map(part => part.trim()).filter(part => part !== '')
}

/** The cluster execution tab. */
export function ClusterTab({ api }: ClusterTabProps) {
  const [command, setCommand] = useState('')
  const [aliases, setAliases] = useState('')
  const [environment, setEnvironment] = useState('')
  const [tags, setTags] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ClusterResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    if (command.trim() === '' || running) return
    if (!window.confirm(tt('cluster.confirm'))) return
    setRunning(true)
    setError(null)
    try {
      const aliasList = splitList(aliases)
      const tagList = splitList(tags)
      const outcome = await api.cluster({
        command: command.trim(),
        aliases: aliasList.length > 0 ? aliasList : undefined,
        environment: environment.trim() === '' ? undefined : environment.trim(),
        tags: tagList.length > 0 ? tagList : undefined,
      })
      setResults(outcome)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className={css.fillBody}>
      <div className={css.clusterForm}>
        <label className={css.field}>
          <span className={css.fieldLabel}>{tt('cluster.command')}</span>
          <textarea className={css.input + ' ' + css.commandInput} value={command} onChange={event => { setCommand(event.target.value) }} />
        </label>
        <div className={css.clusterFilters}>
          <input className={css.input} placeholder={tt('cluster.aliases')} value={aliases} onChange={event => { setAliases(event.target.value) }} />
          <input className={css.input} placeholder={tt('cluster.environment')} value={environment} onChange={event => { setEnvironment(event.target.value) }} />
          <input className={css.input} placeholder={tt('cluster.tags')} value={tags} onChange={event => { setTags(event.target.value) }} />
        </div>
        <div>
          <button type="button" className={css.primaryButton} disabled={running || command.trim() === ''} onClick={() => { void run() }}>{tt('cluster.run')}</button>
        </div>
      </div>
      {error !== null && <div className={css.banner} data-kind="error">{tt('common.error', { error })}</div>}
      {results === null && error === null && <div className={css.empty}>{tt('cluster.empty')}</div>}
      {results !== null && results.length === 0 && <div className={css.empty}>{tt('cluster.noMatch')}</div>}
      {results !== null && results.length > 0 && (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th>{tt('cluster.col.alias')}</th>
                <th>{tt('cluster.col.status')}</th>
                <th>{tt('cluster.col.exit')}</th>
                <th>{tt('cluster.col.stdout')}</th>
                <th>{tt('cluster.col.stderr')}</th>
                <th>{tt('cluster.col.error')}</th>
                <th>{tt('cluster.col.duration')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map(result => {
                const status = result.ok ? 'ok' : result.timedOut === true ? 'timeout' : 'fail'
                const label = result.ok ? tt('cluster.ok') : result.timedOut === true ? tt('cluster.timeout') : tt('cluster.fail')
                return (
                  <tr key={result.alias}>
                    <td className={css.mono}>{result.alias}</td>
                    <td><span className={css.badge} data-status={status}>{label}</span></td>
                    <td className={css.mono}>{result.exitCode ?? '-'}</td>
                    <td>
                      {result.stdout !== undefined && result.stdout !== '' && (
                        <details className={css.cellDetails}>
                          <summary>{tt('cluster.col.stdout')}</summary>
                          <pre className={css.cellPre}>{result.stdout}</pre>
                        </details>
                      )}
                    </td>
                    <td>
                      {result.stderr !== undefined && result.stderr !== '' && (
                        <details className={css.cellDetails}>
                          <summary>{tt('cluster.col.stderr')}</summary>
                          <pre className={css.cellPre}>{result.stderr}</pre>
                        </details>
                      )}
                    </td>
                    <td className={css.cellMuted}>{result.error ?? ''}</td>
                    <td className={css.mono}>{result.durationMs !== undefined ? result.durationMs + ' ms' : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
