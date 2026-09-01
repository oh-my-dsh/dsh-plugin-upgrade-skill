import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Package version identity for the machine-side halves.
 *
 * The version always comes from the package.json next to the compiled module
 * (one level above lib/ for built bundles and src/ for repo runs), so a
 * published bump is picked up without touching hardcoded literals. The
 * Supervisor reports this version and the CLI pins the rescue-capsule install
 * spec to it; the Web console compares it with the host half's own version to
 * detect a stale Supervisor after an update.
 * @module @linxin666/dsh-doctor/agent
 */

/** Read the version of the package owning a module file. */
export function packageVersionAt(moduleFilePath: string): string {
  try {
    const raw = JSON.parse(readFileSync(join(dirname(moduleFilePath), '..', 'package.json'), 'utf8')) as { version?: unknown }
    if (typeof raw.version === 'string' && raw.version !== '') return raw.version
  } catch {
    // Fall through to the neutral fallback.
  }
  return '0.0.0'
}

/** Version of the package the current module belongs to (bundled-aware). */
export function currentPackageVersion(): string {
  return packageVersionAt(fileURLToPath(import.meta.url))
}
