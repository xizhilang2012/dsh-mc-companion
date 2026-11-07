/**
 * 把游戏事件翻译成中文的一句话。
 *
 * 直接把 "was slain by Zombie" 丢给 agent，它读起来像游戏日志，
 * 不像"她看见了一件事"。所以这里统一成人话。
 *
 * @module mc-companion/lib/phrase
 */

const DEATH_CAUSES = [
  [/was slain by (.+)/i, (m) => `被${m[1]}打死了`],
  [/was shot by (.+)/i, (m) => `被${m[1]}射死了`],
  [/was blown up by (.+)/i, (m) => `被${m[1]}炸死了`],
  [/was killed by (.+)/i, (m) => `被${m[1]}打死了`],
  [/fell from a high place/i, () => '从高处摔死了'],
  [/fell into lava/i, () => '掉进岩浆了'],
  [/tried to swim in lava/i, () => '在岩浆里游泳，死了'],
  [/drowned/i, () => '淹死了'],
  [/burned to death/i, () => '烧死了'],
  [/hit the ground too hard/i, () => '摔死了'],
  [/starved to death/i, () => '饿死了'],
  [/withered away/i, () => '凋零了'],
]

/**
 * @param {{kind: string, player?: string, name?: string, detail?: string, text?: string}} event
 * @returns {string} 一句中文，不含句号
 */
export function phrase(event) {
  const who = event.player ?? event.name ?? '老大'
  const detail = String(event.detail ?? '')

  if (event.kind === 'death') {
    for (const [pattern, build] of DEATH_CAUSES) {
      const match = pattern.exec(detail)
      if (match) return `${who} ${build(match)}`
    }
    return detail === '' ? `${who}死了` : `${who} ${detail}`
  }

  if (event.kind === 'advancement') {
    return detail === '' ? `${who} 拿到了一个成就` : `${who} 拿到了成就「${detail}」`
  }

  if (event.kind === 'chat') {
    // 游戏原文可能是 "<wangzhixi> 你好"，别再套一层名字
    const said = String(event.text ?? '').replace(/^<[^>]+>\s*/, '').trim()
    return said === '' ? `${who} 说了句什么` : said
  }

  if (event.kind === 'join') return `${who} 进来了`
  if (event.kind === 'leave') return `${who} 走了`
  return detail || `${who} ${event.kind}`
}
