/**
 * 四个档位。一档就是一组参数，用户选一档之后还能单独调。
 *
 * 设计原则：
 *   - 越往右，她越主动，也越烧钱
 *   - 每一档都写明"她会不会自己开口 / 会不会自己动 / 会不会调模型"
 *
 * @module mc-companion/lib/level
 */

export const LEVELS = ['quiet', 'companion', 'partner', 'autonomous']

/** 档位 → 参数。顺序有意义：数组里靠后的档位覆盖前面的。 */
export const PRESETS = {
  // 只记账，什么都不做。全部免费。
  quiet: {
    mode: 'quiet',
    autoGoal: false,
    goalIntervalSeconds: 600,
    chattiness: 30,
    wakeBudgetPerHour: 0,
    followOn: false,
  },
  // 在游戏里念短句、跟着你走。不调用模型。
  companion: {
    mode: 'template',
    autoGoal: false,
    goalIntervalSeconds: 600,
    chattiness: 55,
    wakeBudgetPerHour: 0,
    followOn: true,
  },
  // 死亡、指令才叫醒，事件攒摘要。默认档。
  partner: {
    mode: 'speak',
    autoGoal: false,
    goalIntervalSeconds: 300,
    chattiness: 45,
    wakeBudgetPerHour: 8,
    followOn: true,
  },
  // 自己提目标、自己行动。花钱档。
  autonomous: {
    mode: 'speak',
    autoGoal: true,
    goalIntervalSeconds: 120,
    chattiness: 60,
    wakeBudgetPerHour: 20,
    followOn: true,
  },
}

/** 档位说明，面板直接拿来显示。 */
export const LEVEL_INFO = {
  quiet: {
    title: '安静',
    detail: '只记录，不说话也不行动。零成本。',
    cost: '不花钱',
  },
  companion: {
    title: '陪伴',
    detail: '在游戏里念短句、跟着你走。不调用模型。',
    cost: '免费',
  },
  partner: {
    title: '伙伴',
    detail: '你自己死、喊她名字、她到了地方——这些才叫醒模型，其余攒成摘要。',
    cost: '低',
  },
  autonomous: {
    title: '自主',
    detail: '闲下来会自己提目标、自己走过去。每分钟都可能动。',
    cost: '高',
  },
}

/**
 * 取某个档位的参数。未知档位回落到 partner。
 * @param {string} level
 * @returns {object}
 */
export function expandLevel(level) {
  return { ...(PRESETS[level] ?? PRESETS.partner) }
}

/**
 * 规整档位名；不认识的回落。
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function normalizeLevel(value, fallback = 'partner') {
  const text = String(value ?? '').trim()
  return LEVELS.includes(text) ? text : fallback
}
