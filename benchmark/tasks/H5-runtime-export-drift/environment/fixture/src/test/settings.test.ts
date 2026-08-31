import test from 'node:test'
import assert from 'node:assert'
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'

test('settings conflict carries the namespace', () => {
  const err = new SettingsConflictError(settingsNamespace('h5-runtime-drift'), 1, 2)
  assert.equal(err.code, 'SETTINGS_CONFLICT')
  assert.equal(err.expected, 1)
})
