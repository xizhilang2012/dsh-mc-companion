import test from 'node:test'
import assert from 'node:assert/strict'

import { parseNeed, parseNeeds, buildQuestion, needsSatisfied, itemName } from '../lib/request.mjs'

test('解析一条需求：id ×数量', () => {
  assert.deepEqual(parseNeed('minecraft:iron_ingot ×3'), { id: 'minecraft:iron_ingot', count: 3 })
  assert.deepEqual(parseNeed('minecraft:coal'), { id: 'minecraft:coal', count: 1 })
  assert.equal(parseNeed('  '), null)
})

test('多条需求去重并把数量加起来', () => {
  const needs = parseNeeds(['minecraft:iron_ingot ×2', 'minecraft:stick ×1', 'minecraft:iron_ingot ×1'])
  assert.equal(needs.length, 2)
  assert.equal(needs.find((n) => n.id === 'minecraft:iron_ingot').count, 3)
})

test('问句：用问句、带数量和用途，允拒绝', () => {
  const q = buildQuestion([{ id: 'minecraft:iron_ingot', count: 3 }], 'minecraft:iron_pickaxe')
  assert.ok(q.includes('你有多余的'))
  assert.ok(q.includes('铁锭×3'))
  assert.ok(q.includes('铁镐'))
  assert.ok(q.endsWith('？') || q.includes('吗'))
  assert.ok(q.includes('没有的话我就去做别的'))
})

test('没需求就不问', () => {
  assert.equal(buildQuestion([]), '')
  assert.equal(buildQuestion(null), '')
})

test('判断给了没有：够了 / 不够 / 没有', () => {
  const need = [{ id: 'minecraft:iron_ingot', count: 3 }]
  assert.equal(needsSatisfied(need, { items: [{ id: 'minecraft:iron_ingot', count: 3 }] }), true)
  assert.equal(needsSatisfied(need, { items: [{ id: 'minecraft:iron_ingot', count: 2 }] }), false)
  assert.equal(needsSatisfied(need, { items: [] }), false)
  assert.equal(needsSatisfied([], { items: [] }), true)
})

test('常见物品有中文名，不认识的回落成 id', () => {
  assert.equal(itemName('minecraft:iron_ingot'), '铁锭')
  assert.equal(itemName('somemod:magic_core'), 'somemod:magic_core')
})
