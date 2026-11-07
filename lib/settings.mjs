/**
 * 面板能调的设置：读写都走这里，好测。
 *
 * 存到 ~/.dsh/mc-companion-settings.json，插进 DEFAULTS 之上、cordis 配置之下：
 *   默认值 < 面板保存 < cordis.patch.yml（手改的优先）
 *
 * @module mc-companion/lib/settings
 */

export const MODES = ['speak', 'template', 'quiet']

/** 面板认的键；其余一律忽略，避免把整个 config 写进文件。 */
export const SETTING_KEYS = [
  'chattiness',
  'cooldownMs',
  'displayName',
  'mode',
  'wakeBudgetPerHour',
  'hideWake',
  'respectPause',
  'personaFile',
  'diaryFile',
  'bodyType',
  'level',
  'autoGoal',
  'goalIntervalSeconds',
]

import { normalizeLevel } from './level.mjs'

export function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * 把面板提交的内容规整成合法设置。
 *
 * @param {unknown} raw
 * @param {object} [fallback]
 */
export function normalizeSettings(raw, fallback = {}) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const pick = (key) => (input[key] !== undefined ? input[key] : fallback[key])

  const name = String(pick('displayName') ?? '').trim()
  const mode = MODES.includes(pick('mode')) ? pick('mode') : (fallback.mode ?? 'speak')

  return {
    chattiness: clampInt(pick('chattiness'), 0, 100, 55),
    cooldownMs: clampInt(pick('cooldownMs'), 0, 600000, 0),
    displayName: name === '' ? '大肥鱼' : name.slice(0, 24),
    mode,
    wakeBudgetPerHour: clampInt(pick('wakeBudgetPerHour'), 0, 200, 20),
    hideWake: pick('hideWake') === true,
    respectPause: pick('respectPause') === true,
    personaFile: String(pick('personaFile') ?? '').trim(),
    diaryFile: String(pick('diaryFile') ?? '').trim(),
    bodyType: String(pick('bodyType') ?? 'mc-companion:companion').trim() || 'mc-companion:companion',
    level: normalizeLevel(pick('level'), fallback.level ?? 'partner'),
    autoGoal: pick('autoGoal') === true,
    goalIntervalSeconds: clampInt(pick('goalIntervalSeconds'), 30, 3600, 180),
  }
}

/** 只保留认识的键，返回要写盘的对象。 */
export function toStored(settings) {
  const out = {}
  for (const key of SETTING_KEYS) out[key] = settings[key]
  return out
}

/** 一小时内的唤醒还剩几次。 */
export function budgetLeft(times, budget, now = Date.now()) {
  if (budget <= 0) return 0
  const recent = (times ?? []).filter((t) => now - t < 3600000)
  return Math.max(0, budget - recent.length)
}
