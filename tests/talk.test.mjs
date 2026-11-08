import test from 'node:test'
import assert from 'node:assert/strict'

import { TALK_LEVELS, normalizeTalkLevel, talkRules } from '../lib/talk.mjs'

test('三档话量，未知回落到正常', () => {
  assert.deepEqual(TALK_LEVELS, ['quiet', 'normal', 'chatty'])
  assert.equal(normalizeTalkLevel('chatty'), 'chatty')
  assert.equal(normalizeTalkLevel('乱写'), 'normal')
  assert.equal(normalizeTalkLevel(undefined), 'normal')
})

test('话少：要求安静、短', () => {
  const text = talkRules('quiet')
  assert.ok(text.includes('能不说就不说'))
  assert.ok(text.includes('12 字'))
})

test('正常：被问要回、做完说结果', () => {
  const text = talkRules('normal')
  assert.ok(text.includes('被问到要回'))
  assert.ok(text.includes('20 字'))
})

test('话多：允许主动说，但不许刷屏', () => {
  const text = talkRules('chatty')
  assert.ok(text.includes('多说一点'))
  assert.ok(text.includes('30 字'))
  assert.ok(text.includes('别连着刷屏'))
})

test('任何一档都不许沉默到被问也不回（except quiet 也要回）', () => {
  for (const level of TALK_LEVELS) {
    assert.ok(talkRules(level).includes('被问到'), level)
  }
})
