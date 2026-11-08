import test from 'node:test'
import assert from 'node:assert/strict'

import { autonomyRules, classifyNeed, isQuestion } from '../lib/autonomy.mjs'

test('木头这一条链她自己就能解决', () => {
  for (const id of ['minecraft:oak_log', 'minecraft:oak_planks', 'minecraft:stick', 'minecraft:crafting_table']) {
    assert.equal(classifyNeed(id).kind, 'self', id)
  }
})

test('石头/土/沙自己挖，但要提醒先做木镐', () => {
  const need = classifyNeed('minecraft:cobblestone')
  assert.equal(need.kind, 'self')
  assert.ok(need.how.includes('镐'))
})

test('木工具自己做，石工具要先去挖圆石', () => {
  assert.equal(classifyNeed('minecraft:wooden_pickaxe').kind, 'self')
  assert.equal(classifyNeed('minecraft:stone_pickaxe').kind, 'self')
})

test('铁/钻石这种代价大的，才算该问玩家', () => {
  assert.equal(classifyNeed('minecraft:iron_ingot').kind, 'costly')
  assert.equal(classifyNeed('minecraft:diamond').kind, 'costly')
})

test('要烧的东西她做不了', () => {
  assert.equal(classifyNeed('minecraft:glass').kind, 'costly')
  assert.equal(classifyNeed('minecraft:furnace').kind, 'costly')
})

test('不认识的物品：先说"不确定"', () => {
  assert.equal(classifyNeed('somemod:magic_core').kind, 'unknown')
  assert.equal(classifyNeed('').kind, 'unknown')
})

test('规则里写清了顺序：自己弄 → 再问，而且要用问句', () => {
  const text = autonomyRules()
  assert.ok(text.includes('自己弄'))
  assert.ok(text.includes('问句'))
  assert.ok(text.includes('不要') && text.includes('给我'))     // 反例写出来了
})

test('认问句：带问号或"吗/有没有/能不能"', () => {
  assert.equal(isQuestion('你有多余的铁锭吗？'), true)
  assert.equal(isQuestion('有铁锭吗'), true)
  assert.equal(isQuestion('你能借我点煤吗'), true)
  assert.equal(isQuestion('给我铁锭'), false)
  assert.equal(isQuestion('我去砍树了'), false)
  assert.equal(isQuestion('   '), false)
})
