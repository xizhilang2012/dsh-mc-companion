import test from 'node:test'
import assert from 'node:assert/strict'

import { moodFor, applyMood } from '../lib/mood.mjs'

const at = (hour) => new Date(2026, 10, 6, hour, 0, 0).getTime()

test('白天正常', () => {
  const m = moodFor({ now: at(15) })
  assert.equal(m.tone, 'normal')
  assert.equal(m.cooldownFactor, 1)
  assert.equal(m.hint, '')
})

test('深夜变困：话更少', () => {
  const m = moodFor({ now: at(3) })
  assert.equal(m.tone, 'sleepy')
  assert.ok(m.cooldownFactor > 1)
  assert.match(m.hint, /睡觉/)
})

test('连续死亡优先于深夜，且不调侃', () => {
  const m = moodFor({ now: at(3), deathsInWindow: 4 })
  assert.equal(m.tone, 'worried')
  assert.ok(m.cooldownFactor < 1)
  assert.match(m.hint, /别调侃/)
})

test('状态叠加到冷却上', () => {
  assert.equal(applyMood(10000, { cooldownFactor: 1.5 }), 15000)
  assert.equal(applyMood(10000, undefined), 10000)
})
