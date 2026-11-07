/**
 * 读 Minecraft 服务器日志，把每一行解析成事件。
 *
 * 用日志而不是改服务端插件：零侵入，玩家不用装任何东西，
 * 关掉这个 DSH 插件服务器也照常跑。
 *
 * @module mc-companion/lib/log-tail
 */
import { open, stat } from 'node:fs/promises'

/** 一行日志的通用前缀：`[12:34:56] [Server thread/INFO]: ` */
const PREFIX = /^\[(\d{2}):(\d{2}):(\d{2})\]\s+\[[^\]]+\]:\s?(.*)$/

const DEATH = /^(.+?) (was slain by|was shot by|was blown up by|drowned|burned to death|fell from|fell into|tried to swim in lava|hit the ground too hard|starved to death|withered away|was killed by)/

const ADVANCEMENT = /^(.+?) has (made the advancement|completed the challenge|reached the goal) \[(.+?)\]/

const JOIN = /^(.+?) joined the game$/
const LEAVE = /^(.+?) left the game$/

const CHAT = /^<([^>]+)>\s(.+)$/

/**
 * 把一行日志解析成事件；不认识的行返回 undefined。
 *
 * @param {string} line
 * @returns {{kind: string, player?: string, text?: string, detail?: string, time?: string} | undefined}
 */
export function parseLine(line) {
  const match = PREFIX.exec(String(line ?? ''))
  if (!match) return undefined
  const [, hh, mm, ss, body] = match
  const time = `${hh}:${mm}:${ss}`

  let m
  if ((m = CHAT.exec(body))) return { kind: 'chat', player: m[1], text: m[2], time }
  if ((m = DEATH.exec(body))) return { kind: 'death', player: m[1].trim(), detail: m[2], time }
  if ((m = ADVANCEMENT.exec(body))) return { kind: 'advancement', player: m[1].trim(), detail: m[3], time }
  if ((m = JOIN.exec(body))) return { kind: 'join', player: m[1].trim(), time }
  if ((m = LEAVE.exec(body))) return { kind: 'leave', player: m[1].trim(), time }
  return undefined
}

/**
 * 从某个偏移开始读新内容，按行回调。
 *
 * @param {{path: string, offset?: number}} options
 * @returns {Promise<{events: object[], offset: number}>}
 */
export async function readNewEvents(options) {
  let info
  try {
    info = await stat(options.path)
  } catch {
    return { events: [], offset: options.offset ?? 0, missing: true }
  }

  let offset = options.offset ?? 0
  // 日志被轮转（文件变小）就从头读
  if (info.size < offset) offset = 0
  if (info.size === offset) return { events: [], offset }

  const handle = await open(options.path, 'r')
  try {
    const length = info.size - offset
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, offset)
    const text = buffer.toString('utf8')
    const lastBreak = text.lastIndexOf('\n')
    if (lastBreak < 0) return { events: [], offset }
    const complete = text.slice(0, lastBreak)
    const events = complete
      .split('\n')
      .map(parseLine)
      .filter((event) => event !== undefined)
    return { events, offset: offset + Buffer.byteLength(complete, 'utf8') + 1 }
  } finally {
    await handle.close()
  }
}

/**
 * 持续跟读日志。
 *
 * @param {{path: string, onEvent: (event: object) => void, intervalMs?: number}} options
 * @returns {{stop: () => void}}
 */
export function tail(options) {
  const intervalMs = options.intervalMs ?? 1000
  let offset = 0
  let stopped = false

  const tick = async () => {
    if (stopped) return
    try {
      const result = await readNewEvents({ path: options.path, offset })
      offset = result.offset
      for (const event of result.events) {
        try {
          options.onEvent(event)
        } catch {
          // 单个事件处理失败不该中断跟读
        }
      }
    } catch {
      // 读失败（文件锁、权限）下一轮再试
    }
  }

  const timer = setInterval(tick, intervalMs)
  void tick()
  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
