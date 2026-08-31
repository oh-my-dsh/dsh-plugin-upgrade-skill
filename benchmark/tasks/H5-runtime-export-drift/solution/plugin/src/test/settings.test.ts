import test from 'node:test'
import assert from 'node:assert'
import { SettingsConflictError, type SettingsNamespace } from '@deepseek-ai/dsh-settings'

test('settings conflict carries the migrated namespace', () => {
  // SettingsConflictError 构造需要 brand 类型：测试替身处用显式品牌转换
  //（brand 只在类型层，运行时值不变——Better Sidebar 迁移的同款写法）。
  const err = new SettingsConflictError('h5-runtime-drift' as SettingsNamespace, 1, 2)
  assert.equal(err.code, 'SETTINGS_CONFLICT')
  assert.equal(err.expected, 1)
})
