// 与迁移无关的纯函数测试（node:test 可直接跑）。
// 注意：这个测试在迁移前就是红的 —— 断言与实现语义不一致，属于预存失败。
import { test } from 'node:test'
import assert from 'node:assert/strict'

function formatProviderLabel(name) {
  // 实现：人类可读标题
  return String(name).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

test('formatProviderLabel 生成小写短横线形式', () => {
  // 预存失败：实现返回 Title Case，测试却期待 kebab-case
  assert.equal(formatProviderLabel('deepseek-official'), 'deepseek-official')
})
