import test from 'node:test'
import assert from 'node:assert/strict'

import { parseIdentity, parseDiary, appendToWantToSay, splitSections, personaPrompt } from '../lib/identity.mjs'

const CONFIG = {
  persona: { name: '大肥鱼', ownerTitle: '老大', selfClaim: '我' },
  owner: { name: 'xizhilang_2012' },
}

test('读身份：直接吃 bili-whale 的配置结构', () => {
  const id = parseIdentity(CONFIG)
  assert.equal(id.name, '大肥鱼')
  assert.equal(id.ownerTitle, '老大')
  assert.equal(id.ownerName, 'xizhilang_2012')
})

test('读身份：配置缺字段时给默认值', () => {
  const id = parseIdentity(undefined)
  assert.equal(id.name, '大肥鱼')
  assert.equal(id.ownerTitle, '老大')
  assert.equal(id.ownerName, '')
  assert.equal(id.personality, '')
})

test('自由文本人设：personality 会被读出来并截断', () => {
  const id = parseIdentity({ persona: { name: '鲸喜', personality: '喜欢修路，不喜欢下矿' } })
  assert.equal(id.name, '鲸喜')
  assert.equal(id.personality, '喜欢修路，不喜欢下矿')
  const long = parseIdentity({ persona: { personality: 'x'.repeat(5000) } })
  assert.equal(long.personality.length, 1200)
})

test('人设提示：有名字和性格时两段都出现，空的就返回空串', () => {
  const text = personaPrompt({ name: '鲸喜', ownerTitle: '老大', personality: '喜欢修路' })
  assert.ok(text.includes('鲸喜'))
  assert.ok(text.includes('喜欢修路'))
  assert.ok(text.includes('别每句都复述'))
  assert.equal(personaPrompt({}), '')
})

test('按小节切分', () => {
  const sections = splitSections('# 标题\n\n## 想说\n\n- 一\n\n## 暂停记录\n\n内容\n')
  assert.deepEqual(Object.keys(sections), ['想说', '暂停记录'])
})

test('解析日记：取出「想说」，忽略（空）占位', () => {
  const diary = `# 给主人的日记

## 看过

| 时间 | 来源 | 标题 | 内容 | 她的想法 |
| --- | --- | --- | --- | --- |

## 想说

- （空）这轮只让整理日记，没有对外说过一句话。
- 今天他问了一个很难的问题，我没答上来。
`
  const d = parseDiary(diary)
  assert.equal(d.wantToSay.length, 1)
  assert.match(d.wantToSay[0], /很难的问题/)
  assert.equal(d.seenRows.length, 0)
})

test('追加：插到「想说」末尾，不动别的段', () => {
  const before = `# 标题

## 想说

- 第一条

## 暂停记录

- 原样保留
`
  const after = appendToWantToSay(before, '2026-11-06 他掉进了岩浆，第三次了。')
  assert.match(after, /- 第一条\n- 2026-11-06 他掉进了岩浆/)
  assert.match(after, /## 暂停记录\n\n- 原样保留/)
  assert.ok(after.indexOf('岩浆') < after.indexOf('暂停记录'))
})

test('追加：没有「想说」小节就新建', () => {
  const after = appendToWantToSay('# 标题\n\n## 看过\n\n表格\n', '新的一条')
  assert.match(after, /## 想说\n\n- 新的一条/)
})
