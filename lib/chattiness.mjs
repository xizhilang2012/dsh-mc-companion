/**
 * 对话活跃度：决定「这一下该不该开口」。
 *
 * 一个 0–100 的滑杆，映射到三件事：
 *   1. 冷却 —— 越活跃间隔越短（300s → 8s）
 *   2. 命中率 —— 活跃度 × 事件权重
 *   3. 单位时间上限 —— 防止连续事件把她说爆
 *
 * 纯函数，rng 可注入，方便测试。
 *
 * @module mc-companion/lib/chattiness
 */

/** 不同事件值得开口的程度。死亡最值得，进出服务器最不值得。 */
export const WEIGHTS = {
  death: 1.0,
  advancement: 0.85,
  chat: 0.55,
  join: 0.3,
  leave: 0.25,
}

const MIN_COOLDOWN_MS = 8000
const MAX_COOLDOWN_MS = 300000
const WINDOW_MS = 5 * 60 * 1000
const MAX_PER_WINDOW = 3

/** 0–100 的活跃度线性映射到冷却时间（对数感，越往上越密）。 */
export function cooldownFor(chattiness) {
  const t = Math.max(0, Math.min(100, Number(chattiness) || 0)) / 100
  const eased = t ** 0.6
  return Math.round(MAX_COOLDOWN_MS - eased * (MAX_COOLDOWN_MS - MIN_COOLDOWN_MS))
}

/**
 * 判断这一刻该不该说话。
 *
 * @param {{
 *   event: {kind: string},
 *   chattiness: number,
 *   state?: {lastSpokeAt?: number, spokeTimes?: number[]},
 *   rng?: () => number,
 *   cooldownFactor?: number,
 *   now?: number
 * }} input
 * @returns {{speak: boolean, reason: string, weight: number, cooldownMs: number}}
 */
export function shouldSpeak(input) {
  const chattiness = Math.max(0, Math.min(100, Number(input.chattiness) || 0))
  const now = input.now ?? Date.now()
  const rng = input.rng ?? Math.random
  const state = input.state ?? {}
  const weight = WEIGHTS[input.event?.kind] ?? 0.4
  const cooldownMs = input.cooldownOverride > 0
    ? input.cooldownOverride
    : Math.round(cooldownFor(chattiness) * (input.cooldownFactor ?? 1))

  if (chattiness === 0) {
    return { speak: false, reason: 'silent-mode', weight, cooldownMs }
  }

  // 死亡可以插队：冷却减半，但不会完全无视
  const effectiveCooldown = input.event?.kind === 'death' ? cooldownMs / 2 : cooldownMs
  const sinceLast = state.lastSpokeAt === undefined ? Infinity : now - state.lastSpokeAt
  if (sinceLast < effectiveCooldown) {
    return { speak: false, reason: 'cooldown', weight, cooldownMs: effectiveCooldown }
  }

  const recent = (state.spokeTimes ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    return { speak: false, reason: 'burst-limit', weight, cooldownMs: effectiveCooldown }
  }

  const probability = (chattiness / 100) * weight
  if (rng() >= probability) {
    return { speak: false, reason: 'rolled-out', weight, cooldownMs: effectiveCooldown }
  }

  return { speak: true, reason: 'speak', weight, cooldownMs: effectiveCooldown }
}

/** 记一次开口，返回新的 state。 */
export function markSpoke(state, now = Date.now()) {
  const spokeTimes = [...(state.spokeTimes ?? []), now].filter((t) => now - t < WINDOW_MS)
  return { lastSpokeAt: now, spokeTimes }
}
