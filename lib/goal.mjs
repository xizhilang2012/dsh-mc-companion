/**
 * 该不该让她自己提一个目标。
 *
 * 三个条件同时满足才问：
 *   1. 开关打开（这个会花钱）
 *   2. 她手头没活（有目标就别打断）
 *   3. 距上次提目标过了足够久，且本小时预算没烧完
 *
 * @module mc-companion/lib/goal
 */

/**
 * @param {{
 *   enabled: boolean,
 *   now?: number,
 *   lastProposedAt?: number,
 *   intervalMs?: number,
 *   busy?: boolean,
 *   budgetLeft?: number,
 * }} input
 * @returns {{propose: boolean, reason: string}}
 */
export function shouldPropose(input) {
  const now = input.now ?? Date.now()
  const interval = Math.max(10000, Number(input.intervalMs ?? 180000))
  if (input.enabled !== true) return { propose: false, reason: 'off' }
  if (input.busy === true) return { propose: false, reason: 'busy' }
  if (Number(input.budgetLeft ?? 1) <= 0) return { propose: false, reason: 'budget' }
  const last = Number(input.lastProposedAt ?? 0)
  if (last > 0 && now - last < interval) return { propose: false, reason: 'cooldown' }
  return { propose: true, reason: 'idle' }
}

/** 到点之后的提示语：把现场和能做的事一起给她。 */
export function goalPrompt(snapshot) {
  const s = snapshot ?? {}
  const where = s.x != null && s.z != null ? `${s.x}, ${s.y}, ${s.z}` : '未知位置'
  const time = Number.isFinite(s.timeOfDay) ? describeTime(s.timeOfDay) : ''
  const her = s.herPresent === true
    ? `她在你旁边 ${s.herDistance ?? '?'} 格${s.herBusy ? '（正在走）' : '（闲着）'}`
    : '她不在场'
  const lines = [
    `🐟 你闲下来了。${where}${time ? `，${time}` : ''}；${her}。`,
    `（自己想想要做什么：`,
    `  派活用 mc_companion action=order kind=goto x= y= z= / follow / halt，`,
    `  或者什么都不做；想说就说一句 action=say。）`,
  ]
  return lines.join('\n')
}

function describeTime(timeOfDay) {
  const t = Number(timeOfDay) % 24000
  if (t < 1000) return '刚天亮'
  if (t < 6000) return '上午'
  if (t < 12000) return '中午'
  if (t < 13000) return '下午'
  if (t < 18000) return '天黑了'
  if (t < 23000) return '深夜'
  return '快天亮了'
}
