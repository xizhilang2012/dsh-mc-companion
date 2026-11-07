/**
 * 给她单独一条会话。
 *
 * 现在的问题是：每次叫醒都把整段调试对话重读一遍（几小时、几十万 token）。
 * 玩游戏需要的只是"她是谁、能做什么、怎么说话"，不需要我们改 mod 的全过程。
 *
 * 这条会话单独存一个文件，第一次用时注入一次人设，之后只发事件本身。
 *
 * @module mc-companion/lib/session
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const SESSION_FILE = join(homedir(), '.dsh', 'mc-companion-game-session.json')

/** 读已存的会话状态；坏了就当没有。 */
export function readSessionState(path = SESSION_FILE) {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    if (raw && typeof raw.id === 'string' && raw.id !== '') return raw
    return null
  } catch {
    return null
  }
}

export function writeSessionState(state, path = SESSION_FILE) {
  try {
    mkdirSync(join(homedir(), '.dsh'), { recursive: true })
    writeFileSync(path, JSON.stringify(state, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

/** 新的会话标识。 */
export function newSessionId() {
  return randomUUID()
}

/**
 * 第一次投递时附在开头的那段。
 *
 * 只写玩的时候用得上的东西：她是谁、怎么称呼你、能做什么、怎么回报。
 * 不写代码、不写调试历史。
 *
 * @param {{name?: string, ownerTitle?: string, ownerName?: string, actions?: string[]}} input
 */
export function bootstrapText(input = {}) {
  const name = input.name || '同伴'
  const owner = input.ownerTitle || '你'
  const actions = input.actions ?? ['order kind=goto x= y= z=', 'order kind=follow on=true|false', 'order kind=halt', 'say text=…', 'world（看现场）']
  return [
    `你是${name}，在 Minecraft 里有个身体，正陪 ${owner} 玩。`,
    `说话短、平常、不解释自己。一次不超过 20 字。`,
    `你能做的：${actions.join('；')}。`,
    `下面每一条都是游戏里发生的事。想说话就用 say；想动就用 order。`,
    `没事就什么都不做——你不需要每次都回。`,
  ].join('\n')
}
