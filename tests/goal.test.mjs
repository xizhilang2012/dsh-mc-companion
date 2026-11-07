import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldPropose, goalPrompt } from '../lib/goal.mjs'

const now = 10_000_000

test('关着就不提', () => {
  assert.equal(shouldPropose({ enabled: false, now }).propose, false)
})

test('手头有活就别打断', () => {
  assert.deepEqual(shouldPropose({ enabled: true, now, busy: true }), { propose: false, reason: 'busy' })
})

test('预算烧完就不提', () => {
  assert.equal(shouldPropose({ enabled: true, now, budgetLeft: 0 }).reason, 'budget')
})

test('太频繁不提，隔够了才提', () => {
  const base = { enabled: true, intervalMs: 60_000 }
  assert.equal(shouldPropose({ ...base, now, lastProposedAt: now - 30_000 }).reason, 'cooldown')
  assert.equal(shouldPropose({ ...base, now, lastProposedAt: now - 61_000 }).propose, true)
  assert.equal(shouldPropose({ ...base, now }).propose, true)
})

test('提示语带上位置、时间、她的状态', () => {
  const text = goalPrompt({ x: 1, y: 2, z: 3, timeOfDay: 14000, herPresent: true, herDistance: 3.2, herBusy: false })
  assert.match(text, /1, 2, 3/)
  assert.match(text, /天黑了/)
  assert.match(text, /3.2/)
  assert.match(text, /order kind=goto/)
})
