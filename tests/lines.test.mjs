import test from 'node:test'
import assert from 'node:assert/strict'

import { pickLine } from '../lib/lines.mjs'

test('死亡有专门的句子，且不说教', () => {
  for (let i = 0; i < 20; i++) {
    const line = pickLine({ kind: 'death', rng: () => i / 20 })
    assert.ok(line.length > 0 && line.length <= 12)
    assert.ok(!line.includes('应该'))
  }
})

test('不同状态给不同语气', () => {
  const sleepy = pickLine({ kind: 'death', tone: 'sleepy', rng: () => 0 })
  const worried = pickLine({ kind: 'death', tone: 'worried', rng: () => 0 })
  assert.notEqual(sleepy, worried)
  assert.match(worried, /急|歇|捡/)
})

test('未知事件类型回落到聊天池', () => {
  const line = pickLine({ kind: 'unknown-kind', rng: () => 0 })
  assert.ok(typeof line === 'string' && line.length > 0)
})
