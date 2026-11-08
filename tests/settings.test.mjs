import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeSettings, toStored, budgetLeft, clampInt } from '../lib/settings.mjs'

test('夹紧数字，坏值回落', () => {
  assert.equal(clampInt(150, 0, 100, 55), 100)
  assert.equal(clampInt(-3, 0, 100, 55), 0)
  assert.equal(clampInt('abc', 0, 100, 55), 55)
  assert.equal(clampInt(33.6, 0, 100, 55), 34)
})

test('整份设置规整：名字空缺回默认，模式非法回 speak', () => {
  const s = normalizeSettings({ displayName: '   ', mode: '乱写', chattiness: 999 })
  assert.equal(s.displayName, '大肥鱼')
  assert.equal(s.mode, 'speak')
  assert.equal(s.chattiness, 100)
})

test('名字太长截断，自定义的保留', () => {
  const s = normalizeSettings({ displayName: '一二三四五六七八九十一二三四五六七八九十一二三四五六' })
  assert.ok(s.displayName.length <= 24)
  assert.equal(normalizeSettings({ displayName: '小鱼' }).displayName, '小鱼')
})

test('只存认识的键', () => {
  const stored = toStored({ chattiness: 40, foo: 'bar', mode: 'quiet' })
  assert.deepEqual(Object.keys(stored).sort(), ['autoGoal', 'bodyType', 'chattiness', 'cooldownMs', 'diaryFile', 'displayName', 'goalIntervalSeconds', 'hideWake', 'level', 'mode', 'personaFile', 'preference', 'preferenceCustom', 'talkLevel', 'respectPause', 'dropOnDeath', 'revive', 'sheInvulnerable', 'skinPath', 'wakeBudgetPerHour'].sort())
  assert.equal(stored.foo, undefined)
})

test('一小时预算：超了就归零，过期的滚出去', () => {
  const now = 1_000_000_000
  const times = [now - 1000, now - 2000, now - 3_600_001]
  assert.equal(budgetLeft(times, 5, now), 3)
  assert.equal(budgetLeft(times, 2, now), 0)
  assert.equal(budgetLeft(times, 0, now), 0)
})
