/**
 * One-shot background-preference migration (issue #996): the
 * `skin-background` settings namespace used to be the only store, but the
 * remote pairing channel fences settings.* as loopback-only, so paired
 * desktops read defaults and dropped writes. The values now live in the v2
 * active-state document; on boot the host copies a customized legacy section
 * into it exactly once (later boots see the background key and stop). The
 * legacy namespace stays registered as the official settings page's input
 * face — the browser half keeps listening to it and forwards page edits into
 * the v2 store.
 *
 * "Customized" means at least one field departs from its schema default:
 * resolved settings always carry defaults, so a never-touched section is
 * indistinguishable from an explicit all-defaults section — migrating either
 * is a no-op in behavior, and skipping both keeps the state document clean.
 * Never throws: a failed migration leaves both stores untouched.
 * @module @linxin666/dsh-client-ui-skin-center/background-migration
 */

import { hasCustomSkinBackground, normalizeSkinBackground } from './core/background.ts'
import { readActiveState, writeActiveState } from './active-state.ts'

export interface BackgroundMigrationResult {
  /** Whether legacy settings were copied into the v2 state document. */
  migrated: boolean
  /** Human-readable notes for the host log (empty when nothing happened). */
  notes: string[]
}

/**
 * Run the one-shot migration. Idempotent: once the v2 state carries a
 * background section this is a silent no-op.
 * @param options.activeStatePath - the v2 state document location.
 * @param options.readSettings - thunk resolving the legacy settings section.
 */
export function migrateBackgroundFromSettings(options: {
  activeStatePath: string
  readSettings: () => unknown
}): BackgroundMigrationResult {
  const notes: string[] = []
  const result: BackgroundMigrationResult = { migrated: false, notes }
  try {
    if (readActiveState(options.activeStatePath).background !== null) return result
    const legacy = normalizeSkinBackground(options.readSettings())
    if (!hasCustomSkinBackground(legacy)) return result
    writeActiveState(options.activeStatePath, { background: legacy })
    result.migrated = true
    notes.push('migrated the skin-background settings section into the v2 active state')
    return result
  } catch (error) {
    notes.push(`background migration failed closed: ${(error as Error)?.message ?? error}`)
    return result
  }
}
