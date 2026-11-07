import test from 'node:test'
import assert from 'node:assert/strict'

import { phrase } from '../lib/phrase.mjs'

test('死亡原因翻成人话', () => {
  assert.equal(phrase({ kind: 'death', player: 'wangxizhi', detail: 'was slain by Zombie' }), 'wangxizhi 被Zombie打死了')
  assert.equal(phrase({ kind: 'death', player: 'wangxizhi', detail: 'tried to swim in lava' }), 'wangxizhi 在岩浆里游泳，死了')
  assert.equal(phrase({ kind: 'death', player: 'a', detail: 'drowned' }), 'a 淹死了')
})

test('成就带书名号', () => {
  assert.equal(phrase({ kind: 'advancement', player: 'a', detail: 'Stone Age' }), 'a 拿到了成就「Stone Age」')
})

test('聊天与进出', () => {
  assert.equal(phrase({ kind: 'chat', player: 'a', text: '在吗' }), '在吗')
  assert.equal(phrase({ kind: 'chat', player: 'a', text: '<a> 在吗' }), '在吗')
  assert.equal(phrase({ kind: 'join', player: 'a' }), 'a 进来了')
  assert.equal(phrase({ kind: 'leave', player: 'a' }), 'a 走了')
})

test('没见过的死亡原因原样保留', () => {
  assert.equal(phrase({ kind: 'death', player: 'a', detail: 'was eaten by a whale' }), 'a was eaten by a whale')
})
