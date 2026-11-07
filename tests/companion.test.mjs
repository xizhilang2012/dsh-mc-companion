import test from 'node:test'
import assert from 'node:assert/strict'

import { parseLine, readNewEvents } from '../lib/log-tail.mjs'
import { shouldSpeak, markSpoke, cooldownFor, WEIGHTS } from '../lib/chattiness.mjs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('日志行：聊天、死亡、成就、进出', () => {
  const chat = parseLine('[12:34:56] [Server thread/INFO]: <Steve> 我掉岩浆了')
  assert.equal(chat.kind, 'chat')
  assert.equal(chat.player, 'Steve')
  assert.equal(chat.text, '我掉岩浆了')

  const death = parseLine('[12:35:01] [Server thread/INFO]: Steve tried to swim in lava')
  assert.equal(death.kind, 'death')
  assert.equal(death.player, 'Steve')

  const adv = parseLine('[12:36:00] [Server thread/INFO]: Steve has made the advancement [Stone Age]')
  assert.equal(adv.kind, 'advancement')
  assert.equal(adv.detail, 'Stone Age')

  assert.equal(parseLine('[12:37:00] [Server thread/INFO]: Alex joined the game').kind, 'join')
  assert.equal(parseLine('[12:37:30] [Server thread/INFO]: Alex left the game').kind, 'leave')
})

test('不认识的行返回 undefined', () => {
  assert.equal(parseLine('[12:34:56] [Server thread/INFO]: Saving the game'), undefined)
  assert.equal(parseLine('随便一行'), undefined)
})

test('增量读日志：只读新增部分，跨行不重复', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-'))
  const file = join(dir, 'latest.log')
  try {
    writeFileSync(file, '[10:00:00] [Server thread/INFO]: <A> 一\n[10:00:01] [Server thread/INFO]: <B> 二\n')
    const first = await readNewEvents({ path: file, offset: 0 })
    assert.equal(first.events.length, 2)
    const second = await readNewEvents({ path: file, offset: first.offset })
    assert.equal(second.events.length, 0)

    writeFileSync(file, '[10:00:00] [Server thread/INFO]: <A> 一\n[10:00:01] [Server thread/INFO]: <B> 二\n[10:00:02] [Server thread/INFO]: <C> 三\n')
    const third = await readNewEvents({ path: file, offset: second.offset })
    assert.equal(third.events.length, 1)
    assert.equal(third.events[0].player, 'C')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('活跃度 0 = 完全沉默', () => {
  const r = shouldSpeak({ event: { kind: 'death' }, chattiness: 0, rng: () => 0 })
  assert.equal(r.speak, false)
  assert.equal(r.reason, 'silent-mode')
})

test('活跃度越高冷却越短', () => {
  assert.ok(cooldownFor(0) > cooldownFor(50))
  assert.ok(cooldownFor(50) > cooldownFor(100))
  assert.equal(cooldownFor(100), 8000)
})

test('冷却期内不说话', () => {
  const now = 1_000_000
  const r = shouldSpeak({
    event: { kind: 'chat' }, chattiness: 100, now,
    state: { lastSpokeAt: now - 1000 }, rng: () => 0,
  })
  assert.equal(r.speak, false)
  assert.equal(r.reason, 'cooldown')
})

test('同样的随机数，权重高的事件更容易开口', () => {
  const now = 1_000_000
  const args = { chattiness: 60, now, state: {}, rng: () => 0.5 }
  const death = shouldSpeak({ ...args, event: { kind: 'death' } })
  const leave = shouldSpeak({ ...args, event: { kind: 'leave' } })
  assert.equal(death.speak, true)   // 0.60 * 1.00 = 0.60 > 0.5
  assert.equal(leave.speak, false)  // 0.60 * 0.25 = 0.15 < 0.5
  assert.equal(WEIGHTS.death, 1.0)
})

test('五分钟内最多三次，防止刷屏', () => {
  const now = 1_000_000
  const state = markSpoke(markSpoke(markSpoke({}, now - 3000).lastSpokeAt === undefined ? {} : {}), now)
  const busy = { lastSpokeAt: now - 100000, spokeTimes: [now - 20000, now - 10000, now - 5000] }
  const r = shouldSpeak({ event: { kind: 'death' }, chattiness: 100, now, state: busy, rng: () => 0 })
  assert.equal(r.speak, false)
  assert.equal(r.reason, 'burst-limit')
})
