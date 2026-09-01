/**
 * DSH host version parsing and comparison for the update compatibility
 * check. The declared minimum lives in the published package manifest under
 * `dsh.engines.dsh`, falling back to the top-level `engines.dsh`; the only
 * supported form is `>=X.Y.Z[-prerelease]`.
 *
 * Comparison deliberately uses plain semver ordering instead of
 * `semver.satisfies`: npm's prerelease rule only allows a prerelease version
 * to satisfy a comparator set carrying a prerelease on the same
 * major.minor.patch tuple, which would reject a newer host line (0.1.1-rc.2)
 * against a declared `>=0.1.0-rc.8` — exactly the cross-cohort upgrade path
 * this check must allow. Everything here is pure and tolerant of untrusted
 * input: a malformed value means "cannot verify", which the callers treat as
 * a fail-closed verdict when a requirement was declared (issue #754).
 * @module @linxin666/dsh-client-ui-plugin-manager/core
 */

/** One parsed DSH host or package version. */
export interface DshVersion {
  major: number
  minor: number
  patch: number
  /** Prerelease identifiers, numeric identifiers kept as numbers (semver order). */
  prerelease: readonly (number | string)[]
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/**
 * Parse a DSH host or package version string.
 * @param value - e.g. `0.1.0-rc.8`, `v1.2.3`.
 * @returns the parsed version, or undefined when malformed.
 */
export function parseDshVersion(value: string): DshVersion | undefined {
  const match = VERSION_PATTERN.exec(value.trim())
  if (match === null) return undefined
  const prereleaseParts = match[4] === undefined ? [] : match[4].split('.')
  if (prereleaseParts.some(part => part === '')) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: prereleaseParts.map(part => /^\d+$/.test(part) ? Number(part) : part),
  }
}

/**
 * Compare two version strings by semver order (a release is newer than any
 * prerelease of the same tuple).
 * @returns -1 / 0 / 1, or undefined when either side is malformed.
 */
export function compareVersions(left: string, right: string): number | undefined {
  const a = parseDshVersion(left)
  const b = parseDshVersion(right)
  if (a === undefined || b === undefined) return undefined
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * Semver prerelease ordering: numeric identifiers compare numerically,
 * numeric identifiers rank below alphanumeric ones, alphanumeric identifiers
 * compare lexically, and a longer list wins when the shared prefix is equal.
 */
function comparePrerelease(left: readonly (number | string)[], right: readonly (number | string)[]): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    if (typeof a === 'number' && typeof b === 'number') {
      if (a !== b) return a < b ? -1 : 1
    } else if (typeof a === 'number') {
      return -1
    } else if (typeof b === 'number') {
      return 1
    } else if (a !== b) {
      return a < b ? -1 : 1
    }
  }
  return 0
}

const MINIMUM_RANGE_PATTERN = /^>=\s*(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/

/**
 * Whether a host version satisfies a declared `>=X.Y.Z[-prerelease]` minimum.
 * @param host - the running DSH host version.
 * @param minimum - the declared minimum; any form other than `>=<semver>`
 * (plain semver, `^`, `~`, multi-comparator ranges, empty) returns undefined.
 * @returns true / false, or undefined when the host version is malformed or
 * the minimum uses an unsupported form — callers treat undefined as
 * "cannot verify" and fail closed for declared requirements.
 */
export function meetsMinimumDsh(host: string, minimum: string): boolean | undefined {
  const match = MINIMUM_RANGE_PATTERN.exec(minimum.trim())
  if (match === null) return undefined
  const compared = compareVersions(host, match[1])
  if (compared === undefined) return undefined
  return compared >= 0
}

/**
 * The bare minimum version for display: strips the `>=` operator (and an
 * optional leading `v`) from a declared requirement so UI copy that already
 * contains the comparison operator renders `0.1.1-rc.1` instead of
 * `>= >=0.1.1-rc.1`. Unsupported range forms render unchanged.
 * @param minimum - the declared minimum range.
 * @returns the version portion for display.
 */
export function displayMinimumVersion(minimum: string): string {
  const match = MINIMUM_RANGE_PATTERN.exec(minimum.trim())
  return match === null ? minimum.trim() : match[1].replace(/^v/, '')
}

/**
 * Read the declared DSH minimum from a published registry manifest:
 * `dsh.engines.dsh` first, top-level `engines.dsh` as the fallback.
 * Defensive against malformed or untrusted metadata: anything that is not a
 * non-empty string reads as absent.
 * @param manifest - the decoded registry version manifest.
 * @returns the declared minimum, or undefined when not declared.
 */
export function dshRequirementOf(manifest: { dsh?: unknown; engines?: unknown }): string | undefined {
  const dshEngines = (manifest.dsh as { engines?: unknown } | undefined)?.engines as { dsh?: unknown } | undefined
  const engines = (manifest.engines as { dsh?: unknown } | undefined)?.dsh
  const value = dshEngines?.dsh ?? engines
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}
