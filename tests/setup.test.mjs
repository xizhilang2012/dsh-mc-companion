import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { buildSetup } from '../lib/setup.mjs'

/** 造一个假的插件目录，只有指定文件存在。 */
function fakeRoot({ jar = false, version = '0.0.1-beta.1' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-setup-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'dsh-mc-companion', version }))
  if (jar) {
    const dir = path.join(root, 'mod', 'build', 'libs')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'mc-companion-0.0.1-beta.1.jar'), 'fake')
  }
  return root
}

test('jar 在包里就给出完整路径', () => {
  const root = fakeRoot({ jar: true })
  const info = buildSetup({ root, bridgeConnected: false })
  assert.equal(info.jarExists, true)
  assert.ok(info.jarPath.endsWith('mc-companion-0.0.1-beta.1.jar'))
  assert.equal(info.version, '0.0.1-beta.1')
  assert.ok(info.steps.some((s) => s.detail.includes('mods')))
  fs.rmSync(root, { recursive: true, force: true })
})

test('没有 jar 也要说清去哪儿找', () => {
  const root = fakeRoot({ jar: false })
  const info = buildSetup({ root })
  assert.equal(info.jarExists, false)
  assert.ok(info.steps.some((s) => s.detail.includes('mod/build/libs')))
  fs.rmSync(root, { recursive: true, force: true })
})

test('没连上：problem 里明说是 mod 没装或没进存档', () => {
  const root = fakeRoot({ jar: true })
  const info = buildSetup({ root, bridgeConnected: false })
  assert.ok(info.problems.some((p) => p.includes('没连上')))
  assert.equal(info.bridgeConnected, false)
  fs.rmSync(root, { recursive: true, force: true })
})

test('连上但她不在：提示检查复活开关', () => {
  const root = fakeRoot({ jar: true })
  const info = buildSetup({ root, bridgeConnected: true, herAlive: false, modReported: true })
  assert.ok(info.problems.some((p) => p.includes('复活')))
  fs.rmSync(root, { recursive: true, force: true })
})

test('全通了就没有 problem，四步都 done', () => {
  const root = fakeRoot({ jar: true })
  const info = buildSetup({ root, bridgeConnected: true, herAlive: true, modReported: true })
  assert.deepEqual(info.problems, [])
  assert.ok(info.steps.every((s) => s.done))
  fs.rmSync(root, { recursive: true, force: true })
})

test('给 AI 的说话方式：别一次倒完', () => {
  const root = fakeRoot({ jar: true })
  const info = buildSetup({ root })
  assert.ok(info.howToExplain.includes('别一次'))
  assert.ok(info.howToExplain.includes('启动器'))
  fs.rmSync(root, { recursive: true, force: true })
})
