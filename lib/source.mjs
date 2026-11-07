/**
 * 身份与记忆的来源。
 *
 * 不做"只认 bili-whale"这种事——别人的机器上可能装着别的陪伴插件，
 * 或者根本没有任何插件，只是自己写了一份人设。
 *
 * 解析顺序：
 *   1. 配置里明确写了的路径（personaFile / diaryFile）
 *   2. 本机常见的几个位置，先到先得
 *   3. 都没有 → 中性默认（同伴 / 无日记）
 *
 * @module mc-companion/lib/source
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 常见的人设文件位置，按优先级排。 */
export function personaCandidates(home = homedir()) {
  const dsh = join(home, '.dsh')
  return [
    join(dsh, 'bili-whale.config.json'), // 养鱼插件
    join(dsh, 'persona.json'), // 通用约定
    join(dsh, 'companion.json'),
    join(home, '.bili-ai', 'persona.md'), // 另一种常见落法（Markdown）
  ]
}

/** 常见的日记位置。 */
export function diaryCandidates(home = homedir()) {
  const dsh = join(home, '.dsh')
  return [
    join(dsh, 'whale-diary.md'), // 养鱼插件
    join(dsh, 'diary.md'), // 通用约定
    join(dsh, 'companion-diary.md'),
  ]
}

/**
 * 先看明确配置，再按候选顺序找第一个存在的。
 *
 * @param {{explicit?: string, candidates: string[], exists?: (p: string) => boolean}} input
 * @returns {string} 找到的路径，或空字符串
 */
export function resolveSource(input) {
  const exists = input.exists ?? existsSync
  const explicit = String(input.explicit ?? '').trim()
  if (explicit !== '') return exists(explicit) ? explicit : ''
  for (const candidate of input.candidates) {
    if (exists(candidate)) return candidate
  }
  return ''
}
