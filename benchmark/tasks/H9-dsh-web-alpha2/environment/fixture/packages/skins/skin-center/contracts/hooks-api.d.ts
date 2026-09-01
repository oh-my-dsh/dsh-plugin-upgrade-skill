/**
 * Skin hooks escape-hatch API (facets.client), contract
 * "x-org.linxin666.skin-center/v1alpha1".
 *
 * Positioning: hooks are a TRUSTED escape hatch, reviewed and released with
 * this repository, reserved for extreme cases of built-in skins. They are
 * not — and will not evolve into — the default entry for out-of-repo
 * executable extensions; those belong to the Phase 2+ browser facet.
 *
 * Constraints for hooks.mjs:
 *  - default-export the contract function below;
 *  - no top-level side effects (loading the module must not execute anything);
 *  - no module-level mutable state: every skin switch is a NEW activation
 *    identity, and dispose/cleanup is idempotent (may run 0, 1 or N times).
 *
 * import()/apply() errors are caught by the skin-center runtime; the static
 * part of the skin (stylesheet, background media, decoration layers) keeps
 * working.
 *
 * The recommended way to implement interactive enhancements inside hooks is
 * the official slot + ui-primitives APIs — do not invent parallel APIs.
 */

export type SkinThemeName = 'light' | 'dark'

/** Context handed to a skin's hooks on every activation. */
export interface SkinHooksContext {
  /** Manifest id of the activated skin. */
  skinId: string
  /**
   * The id value of the skin-center-owned scope selector
   * `html[data-dsh-skin="<id>"]`. Use it to scope any DOM queries or
   * dynamically created styles; never write the attribute yourself.
   */
  scopeAttr: string
  /** Same-origin URL prefix serving this skin's asset directory. */
  assetBase: string
  /**
   * Read-only handles of the six fixed decoration layers. All layers are
   * pointer-events: none; interactive content must go through official
   * slots/ui-primitives instead.
   */
  layers: {
    background: HTMLElement
    ambient: HTMLElement
    top: HTMLElement
    bottom: HTMLElement
    sidebar: HTMLElement
    foreground: HTMLElement
  }
  theme: {
    get(): SkinThemeName
    /** Subscribe to light/dark changes; returns an unsubscribe function. */
    subscribe(listener: (theme: SkinThemeName) => void): () => void
  }
  /**
   * Register cleanup attached to THIS activation's scope. Called on skin
   * switch (and possibly redundantly); must be idempotent.
   */
  onCleanup(fn: () => void): void
}

/** Contract object returned by defineSkinHooks(). */
export interface SkinHooks {
  apply(ctx: SkinHooksContext): void
  /** Optional; when absent the onCleanup set is used. Idempotent. */
  dispose?(): void
}

/** Default export shape of facets.client.entry (hooks.mjs). */
export default function defineSkinHooks(): SkinHooks
