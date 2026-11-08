import test from 'node:test'
import assert from 'node:assert/strict'

import { flattenPlan, describePlan, suggestTarget } from '../lib/plan.mjs'

// 一棵典型的树：想做石镐，缺木镐 → 缺木头 → 缺石头
const TREE = {
  id: 'minecraft:stone_pickaxe',
  kind: 'craft',
  missing: 1,
  needs: [
    {
      id: 'minecraft:cobblestone',
      kind: 'gather',
      missing: 3,
    },
    {
      id: 'minecraft:stick',
      kind: 'craft',
      missing: 2,
      needs: [
        { id: 'minecraft:oak_planks', kind: 'gather', missing: 1 },
      ],
    },
  ],
}

test('拍平成步骤：材料先弄到手，再做这一层', () => {
  const { steps } = flattenPlan(TREE)
  assert.deepEqual(steps.map((s) => `${s.action}:${s.args.item ?? s.args.what}`), [
    'gather:stone',
    'gather:log',
    'craft:minecraft:stick',
    'craft:minecraft:stone_pickaxe',
  ])
})

test('已有材料（kind=have）直接跳过', () => {
  const { steps } = flattenPlan({
    id: 'minecraft:stick', kind: 'craft', missing: 1,
    needs: [{ id: 'minecraft:oak_planks', kind: 'have' }],
  })
  assert.deepEqual(steps.map((s) => s.action), ['craft'])
})

test('做不了的东西进 asks，并且会去重', () => {
  const { steps, asks } = flattenPlan({
    id: 'minecraft:iron_pickaxe', kind: 'craft', missing: 1,
    needs: [
      { id: 'minecraft:iron_ingot', kind: 'ask', missing: 3 },
      { id: 'minecraft:stick', kind: 'ask', missing: 2 },
      { id: 'minecraft:iron_ingot', kind: 'ask', missing: 3 },
    ],
  })
  assert.equal(steps.length, 1)
  assert.deepEqual(asks, ['minecraft:iron_ingot ×3', 'minecraft:stick ×2'])
})

test('连续砍树合并成一条并记次数', () => {
  const { steps } = flattenPlan({
    id: 'x', kind: 'craft', missing: 1,
    needs: [
      { id: 'minecraft:oak_log', kind: 'gather' },
      { id: 'minecraft:oak_log', kind: 'gather' },
      { id: 'minecraft:oak_log', kind: 'gather' },
    ],
  })
  assert.equal(steps.filter((s) => s.action === 'gather').length, 1)
  assert.equal(steps[0].args.times, 3)
})

test('提示词里的步骤带序号、能直接抄', () => {
  const { steps, asks } = flattenPlan(TREE)
  const text = describePlan(steps, asks)
  assert.ok(text.includes('1. mc_companion action=gather what=stone'))
  assert.ok(text.includes('action=craft item=minecraft:stone_pickaxe'))
  assert.ok(text.includes('再 plan 一次'))
})

test('建议目标：从木镐开始往上（只是建议）', () => {
  assert.equal(suggestTarget({ herBag: { items: [] } }), 'minecraft:wooden_pickaxe')
  assert.equal(
    suggestTarget({ herBag: { items: [{ id: 'minecraft:wooden_pickaxe', count: 1 }] } }),
    'minecraft:stone_pickaxe',
  )
  assert.equal(
    suggestTarget({ herBag: { items: [{ id: 'minecraft:stone_pickaxe', count: 1 }] } }),
    'minecraft:iron_pickaxe',
  )
  assert.equal(
    suggestTarget({ herBag: { items: [{ id: 'minecraft:iron_pickaxe', count: 1 }] } }),
    null,
  )
})

test('铁矿：要下矿挖（what=iron），不是砍树也不是挖石头', () => {
  const { steps } = flattenPlan({ id: 'minecraft:iron_ingot', kind: 'smelt', count: 3,
    ore: 'minecraft:raw_iron', fuel: 'minecraft:coal' })
  assert.equal(steps.length, 1)
  assert.equal(steps[0].action, 'smelt')
  assert.equal(steps[0].args.item, 'minecraft:iron_ingot')
  assert.equal(steps[0].args.count, 3)

  const ore = flattenPlan({ id: 'minecraft:raw_iron', kind: 'gather' })
  assert.equal(ore.steps[0].args.what, 'iron')
})

test('铁镐整棵树：挖铁矿 → 烧 → 做', () => {
  const tree = {
    id: 'minecraft:iron_pickaxe', kind: 'craft', missing: 1,
    needs: [
      { id: 'minecraft:iron_ingot', kind: 'smelt', count: 3 },
      { id: 'minecraft:stick', kind: 'have' },
    ],
  }
  const { steps } = flattenPlan(tree)
  assert.deepEqual(steps.map((s) => s.action), ['smelt', 'craft'])
  assert.equal(steps[0].args.item, 'minecraft:iron_ingot')
  assert.equal(steps[1].args.item, 'minecraft:iron_pickaxe')
})
