import test from 'node:test'
import assert from 'node:assert/strict'

import { PREFERENCES, PREFERENCE_INFO, normalizePreference, preferencePrompt } from '../lib/preference.mjs'

test('每种偏好都有说明和具体建议', () => {
  for (const id of PREFERENCES) {
    if (id === 'custom') continue          // 自定义的内容由玩家写，没有固定建议
    const info = PREFERENCE_INFO[id]
    assert.ok(info, id)
    assert.ok(info.title && info.detail, id)
    assert.ok(info.likes.length > 0, id)
    assert.ok(info.sample.length > 10, `${id} 的建议要具体到能执行`)
  }
})

test('自定义偏好：有内容就用玩家的原话，空着就说按自己判断', () => {
  const withText = preferencePrompt('custom', '喜欢在夜里钓鱼，白天修路')
  assert.ok(withText.includes('喜欢在夜里钓鱼，白天修路'))
  const empty = preferencePrompt('custom', '   ')
  assert.ok(empty.includes('还没填内容'))
})

test('未知偏好回落到黏人', () => {
  assert.equal(normalizePreference('乱写'), 'company')
  assert.equal(normalizePreference('build'), 'build')
  assert.equal(normalizePreference(''), 'company')
})

test('提示里带性子、喜好和一条可执行建议', () => {
  const text = preferencePrompt('build')
  assert.match(text, /喜欢建筑/)
  assert.match(text, /收集木头|攒/)
  assert.match(text, /平坦/)
})

test('不同偏好给出的建议不一样', () => {
  const build = preferencePrompt('build')
  const guard = preferencePrompt('guard')
  assert.notEqual(build, guard)
  assert.match(guard, /敌人|打/)
})

test('偏好串不会太长（要塞进每次唤醒的提示里）', () => {
  for (const id of PREFERENCES) {
    assert.ok(preferencePrompt(id).length < 200, id)
  }
})
