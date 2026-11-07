import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readSessionState, writeSessionState, bootstrapText, newSessionId } from '../lib/session.mjs'

test('没有文件时返回 null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcs-'))
  try {
    assert.equal(readSessionState(join(dir, 'none.json')), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('写完能读回来；坏文件当没有', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcs-'))
  const file = join(dir, 's.json')
  try {
    assert.equal(writeSessionState({ id: 'abc', bootstrappedAt: 1 }, file), true)
    assert.deepEqual(readSessionState(file), { id: 'abc', bootstrappedAt: 1 })

    writeFileSync(file, 'not json', 'utf8')
    assert.equal(readSessionState(file), null)

    writeFileSync(file, '{"id":""}', 'utf8')
    assert.equal(readSessionState(file), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('会话 id 是 uuid 形态且不重复', () => {
  const a = newSessionId()
  const b = newSessionId()
  assert.match(a, /^[0-9a-f-]{36}$/)
  assert.notEqual(a, b)
})

test('开场白简短，讲清身份和能干的事', () => {
  const text = bootstrapText({ name: '大肥鱼', ownerTitle: '老大' })
  assert.match(text, /大肥鱼/)
  assert.match(text, /老大/)
  assert.match(text, /order kind=goto/)
  assert.match(text, /say/)
  assert.ok(text.length < 400, '开场白要短，别把调试历史带进去')
  assert.ok(!text.includes('mod'), '不该提改代码的事')
})
