/**
 * Safe reconciliation helpers for the legacy skin-background settings scope.
 *
 * The scope's resolved value contains schema defaults, while its raw user layer
 * contains only fields explicitly stored by the user. The v2 active-state
 * document is authoritative, so a scope update may merge only those raw fields
 * into the live background values.
 */
import {
  normalizeSkinBackground,
  SKIN_BACKGROUND_FIELDS,
  type SkinBackgroundConfig,
} from './background.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Return the known, explicitly stored skin-background fields from a user layer. */
export function extractSkinBackgroundUserLayer(value: unknown): SkinBackgroundConfig | null {
  if (!isRecord(value)) return null
  const normalized = normalizeSkinBackground(value)
  const knownFields = Object.keys(normalized) as Array<keyof SkinBackgroundConfig>
  if (knownFields.length === 0) return null
  const owned: SkinBackgroundConfig = {}
  for (const field of knownFields) {
    ;(owned as Record<string, unknown>)[field] = normalized[field]
  }
  return owned
}

/**
 * Build a v2-safe patch from the raw user layer. Absent fields, including
 * schema-default fields absent from the user layer, never enter the patch.
 */
export function skinBackgroundUserPatch(current: SkinBackgroundConfig, user: unknown): SkinBackgroundConfig | null {
  const userConfig = extractSkinBackgroundUserLayer(user)
  if (userConfig === null) return null
  const patch: SkinBackgroundConfig = {}
  for (const field of SKIN_BACKGROUND_FIELDS) {
    if (!Object.hasOwn(userConfig, field)) continue
    const value = userConfig[field]
    if (value === undefined || value === current[field]) continue
    ;(patch as Record<string, unknown>)[field] = value
  }
  return Object.keys(patch).length === 0 ? null : patch
}

export interface SkinBackgroundScopeSnapshot {
  revision: number | undefined
  user: unknown
}

export interface SkinBackgroundScopeReconcileResult {
  accepted: boolean
  revision: number | undefined
  lastUserJson: string
  patch: SkinBackgroundConfig | null
}

/** Deterministic serialization of the user layer for content-based dedup. */
export function serializeSkinBackgroundUserLayer(user: unknown): string {
  const extracted = extractSkinBackgroundUserLayer(user)
  return extracted === null ? '' : JSON.stringify(extracted)
}

/**
 * Accept a scope publication only when its namespace revision is new AND the
 * user layer has actually changed. A revision bump with identical user-layer
 * content is a replay (settings-mirror resync, WS reconnect, or another
 * plugin writing to the global settings document) and must not overwrite the
 * authoritative v2 state.
 */
export function reconcileSkinBackgroundScope(
  current: SkinBackgroundConfig,
  snapshot: SkinBackgroundScopeSnapshot,
  lastRevision: number | undefined,
  lastUserJson: string | undefined,
): SkinBackgroundScopeReconcileResult {
  const currentUserJson = serializeSkinBackgroundUserLayer(snapshot.user)
  if (
    snapshot.revision === undefined
    || snapshot.revision === lastRevision
    || currentUserJson === lastUserJson
    || currentUserJson === ''
  ) {
    return {
      accepted: false,
      revision: snapshot.revision ?? lastRevision,
      lastUserJson: currentUserJson,
      patch: null,
    }
  }
  return {
    accepted: true,
    revision: snapshot.revision,
    lastUserJson: currentUserJson,
    patch: skinBackgroundUserPatch(current, snapshot.user),
  }
}
