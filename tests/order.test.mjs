import test from 'node:test'
import assert from 'node:assert/strict'

import { isOrder, stripPrefix } from '../lib/order.mjs'

const names = ['大肥鱼', '同伴']

test('喊名字才算叫她', () => {
  assert.equal(isOrder({ text: '大肥鱼，过来', names }), true)
  assert.equal(isOrder({ text: '同伴你在哪', names }), true)
  assert.equal(isOrder({ text: '大肥鱼', names }), true)
})

test('没喊名字的，哪怕像指令也不理', () => {
  assert.equal(isOrder({ text: '移动到这来', names }), false)
  assert.equal(isOrder({ text: '过来', names }), false)
  assert.equal(isOrder({ text: '我要移动到那边去', names }), false)
})

test('闲聊里提到名字也算在叫她', () => {
  assert.equal(isOrder({ text: '大肥鱼今天好安静', names }), true)
})

test('剥掉游戏前缀再判断', () => {
  assert.equal(stripPrefix('<wangzhixi> 大肥鱼过来'), '大肥鱼过来')
  assert.equal(isOrder({ text: '<wangzhixi> 大肥鱼过来', names }), true)
})

test('空文本、没有名字配置时不炸', () => {
  assert.equal(isOrder({}), false)
  assert.equal(isOrder({ text: '大肥鱼', names: [] }), false)
  assert.equal(isOrder({ text: '   ', names }), false)
})
