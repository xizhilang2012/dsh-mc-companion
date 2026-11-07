import test from 'node:test'
import assert from 'node:assert/strict'

import { buildBundle, parseBundle, bundleToPersonaConfig, bundleToDiary } from '../lib/memory.mjs'

test('导出只带身份、几句想法和设置', () => {
  const bundle = buildBundle({
    identity: { name: '大肥鱼', ownerTitle: '老大', ownerName: 'x', selfClaim: '我' },
    wantToSay: ['一', '二', '三', '四', '五', '六', '七'],
    paused: true,
    settings: { chattiness: 40 },
    now: 0,
  })
  assert.equal(bundle.format, 'mc-companion-memory@1')
  assert.equal(bundle.identity.name, '大肥鱼')
  assert.equal(bundle.recentThoughts.length, 5)
  assert.equal(bundle.recentThoughts.at(-1), '七')
  assert.equal(bundle.paused, true)
})

test('导入：格式不对直接拒绝', () => {
  assert.equal(parseBundle('{}').ok, false)
  assert.equal(parseBundle('不是 json').ok, false)
  assert.equal(parseBundle({ format: 'other' }).ok, false)
})

test('导入：没有名字拒绝', () => {
  const bad = parseBundle({ format: 'mc-companion-memory@1', identity: { name: '  ' } })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /名字/)
})

test('导入成功时字段被规整', () => {
  const good = parseBundle({
    format: 'mc-companion-memory@1',
    identity: { name: ' 小鱼 ', ownerTitle: '', ownerName: 'a', selfClaim: '' },
    recentThoughts: 'not-an-array',
    paused: 'yes',
  })
  assert.equal(good.ok, true)
  assert.equal(good.bundle.identity.name, '小鱼')
  assert.deepEqual(good.bundle.recentThoughts, [])
  assert.equal(good.bundle.paused, false)
})

test('能生成人设配置和日记文本', () => {
  const { bundle } = parseBundle({
    format: 'mc-companion-memory@1',
    exportedAt: '2026-01-01T00:00:00.000Z',
    identity: { name: '小鱼', ownerTitle: '老大', ownerName: 'a', selfClaim: '我' },
    recentThoughts: ['想他了'],
  })
  const config = bundleToPersonaConfig(bundle)
  assert.equal(config.persona.name, '小鱼')
  assert.equal(config.owner.name, 'a')
  const diary = bundleToDiary(bundle)
  assert.match(diary, /## 想说/)
  assert.match(diary, /- 想他了/)
})
