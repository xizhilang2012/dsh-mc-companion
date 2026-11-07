import test from 'node:test'
import assert from 'node:assert/strict'

import { LEVELS, PRESETS, expandLevel, normalizeLevel, LEVEL_INFO } from '../lib/level.mjs'

test('四个档位都有预设和说明', () => {
  assert.deepEqual(LEVELS, ['quiet', 'companion', 'partner', 'autonomous'])
  for (const level of LEVELS) {
    assert.ok(PRESETS[level], level)
    assert.ok(LEVEL_INFO[level], level)
  }
})

test('越往右越主动，也越贵', () => {
  const sizes = LEVELS.map((l) => PRESETS[l].wakeBudgetPerHour)
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] >= sizes[i - 1], `${LEVELS[i]} 的预算不该比上一档少`)
  }
})

test('安静档完全不花钱', () => {
  const quiet = expandLevel('quiet')
  assert.equal(quiet.mode, 'quiet')
  assert.equal(quiet.autoGoal, false)
  assert.equal(quiet.wakeBudgetPerHour, 0)
})

test('陪伴档不调用模型', () => {
  assert.equal(expandLevel('companion').mode, 'template')
})

test('自主档会自己提目标', () => {
  const auto = expandLevel('autonomous')
  assert.equal(auto.mode, 'speak')
  assert.equal(auto.autoGoal, true)
  assert.ok(auto.goalIntervalSeconds <= 180)
})

test('未知档位回落，且不会返回共享引用', () => {
  assert.equal(normalizeLevel('乱写'), 'partner')
  assert.equal(normalizeLevel('quiet'), 'quiet')
  const a = expandLevel('partner')
  a.mode = 'quiet'
  assert.equal(expandLevel('partner').mode, 'speak', '不该改到预设本体')
})
