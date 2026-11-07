/**
 * 她的状态：什么时候她会不太一样。
 *
 * 不是给玩家看的数值，是给 agent 的一段提示——
 * 让同一句话在深夜和下午听起来不是一个人。
 *
 * @module mc-companion/lib/mood
 */

/** 夜里这个点之后算"困了"（本地时间，24 小时制）。 */
const NIGHT_START = 0
const NIGHT_END = 6

/**
 * @param {{now?: number, deathsInWindow?: number, chattiness?: number}} input
 * @returns {{tone: 'sleepy'|'worried'|'normal', cooldownFactor: number, hint: string}}
 */
export function moodFor(input = {}) {
  const now = input.now ?? Date.now()
  const hour = new Date(now).getHours()
  const deaths = Number(input.deathsInWindow ?? 0)

  if (deaths >= 3) {
    return {
      tone: 'worried',
      cooldownFactor: 0.8,
      hint: '他刚连续死了好几次。别调侃，说点实在的，或者干脆安静陪着。',
    }
  }

  if (hour >= NIGHT_START && hour < NIGHT_END) {
    return {
      tone: 'sleepy',
      cooldownFactor: 1.6,
      hint: '现在是你也想睡觉的钟点。话更少、更轻，别说教。',
    }
  }

  return { tone: 'normal', cooldownFactor: 1, hint: '' }
}

/** 把状态叠加到冷却时间上。 */
export function applyMood(cooldownMs, mood) {
  return Math.round(cooldownMs * (mood?.cooldownFactor ?? 1))
}
