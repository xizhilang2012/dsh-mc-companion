import test from 'node:test'
import assert from 'node:assert/strict'

import { runMake, describeStep } from '../lib/make.mjs'

/** 一个假的游戏世界：第 i 轮用 script[i] 的 plan 和 exec 结果。 */
function fakeWorld(script) {
  const calls = []
  let i = 0
  return {
    calls,
    plan: async () => script[Math.min(i, script.length - 1)].plan,
    exec: async (step) => {
      calls.push(step)
      const entry = script[Math.min(i, script.length - 1)]
      i += 1
      return entry.exec ?? { ok: true }
    },
  }
}

test('一轮做完：plan 说没步骤就算完成', async () => {
  const world = fakeWorld([{ plan: { steps: [] } }])
  const out = await runMake(world)
  assert.equal(out.done, true)
  assert.equal(out.rounds, 1)
  assert.deepEqual(out.did, [])
})

test('采集 → 加工 → 拿手上，全部自己跑完', async () => {
  const script = [
    { plan: { steps: [{ action: 'gather', args: { what: 'log', radius: 32 } }] } },
    { plan: { steps: [{ action: 'craft', args: { item: 'minecraft:stick' } }] } },
    { plan: { steps: [{ action: 'craft', args: { item: 'minecraft:wooden_pickaxe' } }] } },
    { plan: { steps: [{ action: 'equip', args: { item: 'minecraft:wooden_pickaxe' } }] } },
    { plan: { steps: [] } },
  ]
  const world = fakeWorld(script)
  const out = await runMake(world)
  assert.equal(out.done, true)
  assert.equal(out.did.length, 4)
  assert.ok(out.did[0].includes('去采木头'))
  assert.ok(out.did[3].includes('拿到手上'))
})

test('执行失败就停下，并带上原因（不许静默继续）', async () => {
  const world = fakeWorld([
    { plan: { steps: [{ action: 'gather', args: { what: 'stone', radius: 32 } }] }, exec: { ok: false, detail: '周围 32 格里没有石头' } },
  ])
  const out = await runMake(world)
  assert.equal(out.done, false)
  assert.equal(out.lastError, '周围 32 格里没有石头')
})

test('要问人的步骤：停下来，把问题攒下来给模型', async () => {
  const world = fakeWorld([
    { plan: { steps: [{ action: 'ask', args: { item: 'minecraft:iron_ingot', count: 3 } }], asks: ['minecraft:iron_ingot ×3'] } },
  ])
  const out = await runMake(world)
  assert.equal(out.done, false)
  assert.ok(out.asks.some((a) => a.includes('iron_ingot')))
  assert.equal(out.lastError, '需要玩家提供材料')
})

test('轮数用完不会无限转', async () => {
  let n = 0
  const out = await runMake({
    maxRounds: 3,
    plan: async () => {
      n += 1
      return { steps: [{ action: 'gather', args: { what: 'log' } }] }
    },
    exec: async () => ({ ok: true }),
  })
  assert.equal(out.rounds, 3)
  assert.equal(n, 3)
  assert.equal(out.done, false)
  assert.ok(out.lastError.includes('轮数'))
})

test('描述步骤用中文，能直接给人看', () => {
  assert.ok(describeStep({ action: 'gather', args: { what: 'stone', radius: 32 } }).includes('石头'))
  assert.ok(describeStep({ action: 'craft', args: { item: 'minecraft:stick' } }).includes('minecraft:stick'))
  assert.ok(describeStep({ action: 'equip', args: { item: 'minecraft:stone_pickaxe' } }).includes('拿到手上'))
})
