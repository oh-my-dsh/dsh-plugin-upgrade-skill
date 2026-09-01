// Identical to the shared vitest config; re-exported like the shared
// tsdown build preset instead of maintaining a drifting copy. Relative
// paths inside (setupFiles, include) resolve against this package root.
export { default } from '../../shared/vitest.config.ts'
