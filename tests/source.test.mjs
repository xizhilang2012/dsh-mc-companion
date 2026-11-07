import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveSource, personaCandidates, diaryCandidates } from '../lib/source.mjs'

test('明确配置优先于候选', () => {
  const got = resolveSource({
    explicit: '/custom/me.json',
    candidates: ['/a', '/b'],
    exists: (p) => p === '/custom/me.json' || p === '/a',
  })
  assert.equal(got, '/custom/me.json')
})

test('明确配置指向不存在的文件时不回退（避免悄悄用别人的）', () => {
  const got = resolveSource({
    explicit: '/missing.json',
    candidates: ['/a'],
    exists: (p) => p === '/a',
  })
  assert.equal(got, '')
})

test('没有明确配置就按候选顺序先到先得', () => {
  const got = resolveSource({
    explicit: '',
    candidates: ['/a', '/b', '/c'],
    exists: (p) => p === '/b' || p === '/c',
  })
  assert.equal(got, '/b')
})

test('一个都没有就返回空', () => {
  assert.equal(resolveSource({ candidates: ['/a', '/b'], exists: () => false }), '')
})

test('候选里包含通用约定，不只认某一家', () => {
  const personas = personaCandidates('C:\\Users\\x')
  const diaries = diaryCandidates('C:\\Users\\x')
  assert.ok(personas.some((p) => p.endsWith('bili-whale.config.json')))
  assert.ok(personas.some((p) => p.endsWith('persona.json')))
  assert.ok(diaries.some((d) => d.endsWith('whale-diary.md')))
  assert.ok(diaries.some((d) => d.endsWith('diary.md')))
})
