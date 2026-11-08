import test from 'node:test'
import assert from 'node:assert/strict'

import { TIERS, highestTier, nextTier, tierToolId, progressPrompt } from '../lib/progress.mjs'

test('档次是从低到高的固定顺序', () => {
  assert.deepEqual(TIERS.map((t) => t.id), ['wood', 'stone', 'iron', 'diamond', 'netherite'])
  assert.equal(tierToolId('stone'), 'minecraft:stone_pickaxe')
})

test('看物品认档：有镐才算进了这一档', () => {
  assert.equal(highestTier([]), null)
  assert.equal(highestTier(['minecraft:wooden_pickaxe']).id, 'wood')
  assert.equal(highestTier(['minecraft:wooden_pickaxe', 'minecraft:stone_pickaxe']).id, 'stone')
  // 只有斧头也算这一档（工具不只是镐）
  assert.equal(highestTier(['minecraft:iron_axe']).id, 'iron')
  // 不相干的东西不算
  assert.equal(highestTier(['minecraft:oak_log', 'minecraft:dirt']), null)
})

test('下一档：空手从木开始，最高档没有下一步', () => {
  assert.equal(nextTier(null).id, 'wood')
  assert.equal(nextTier('wood').id, 'stone')
  assert.equal(nextTier('stone').id, 'iron')
  assert.equal(nextTier('netherite'), null)
})

test('提示里会说清下一档要什么', () => {
  const bare = progressPrompt({ herBag: { items: [] }, playerInv: { items: [] } })
  assert.ok(bare.includes('木')) 
  assert.ok(bare.includes('gather'))

  const stone = progressPrompt({
    herBag: { items: [{ id: 'minecraft:stone_pickaxe', count: 1 }] },
    playerInv: { items: [] },
    held: 'minecraft:stone_pickaxe',
  })
  assert.ok(stone.includes('石'))
  assert.ok(stone.includes('铁'))
  assert.ok(stone.includes('熔炉'))          // 铁这一步要烧
  assert.ok(stone.includes('minecraft:stone_pickaxe'))
})

test('空输入不炸', () => {
  assert.ok(typeof progressPrompt() === 'string')
})
