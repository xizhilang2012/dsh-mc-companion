/**
 * 请求机制：她缺的东西自己搞不到时，怎么跟玩家要。
 *
 * 以前 `ask` 只是"停下来把问题交回模型"——模型说了句话就结束了，
 * 材料到了也没人接着做。这里补齐三段：
 *   1. 从 plan 的 asks 里解析出"要什么、要几个"
 *   2. 生成一句问句（不是命令）
 *   3. 判断玩家给了没有（看他背包里的数量）
 *
 * @module mc-companion/lib/request
 */

/** "minecraft:iron_ingot ×3" → { id, count } */
export function parseNeed(line) {
  const text = String(line ?? '').trim()
  if (text === '') return null
  const match = /^(.+?)\s*[×x*]\s*(\d+)$/.exec(text)
  if (!match) return { id: text, count: 1 }
  return { id: match[1].trim(), count: Math.max(1, Number(match[2])) }
}

/** 一批 asks → 去重后的 need 列表。 */
export function parseNeeds(asks) {
  const out = []
  for (const line of asks ?? []) {
    const need = parseNeed(line)
    if (!need) continue
    const existing = out.find((n) => n.id === need.id)
    if (existing) existing.count += need.count
    else out.push(need)
  }
  return out
}

/** 物品 id 的中文名（只覆盖常见的；不认识的就说 id）。 */
const NAMES = {
  'minecraft:iron_ingot': '铁锭',
  'minecraft:gold_ingot': '金锭',
  'minecraft:copper_ingot': '铜锭',
  'minecraft:coal': '煤',
  'minecraft:charcoal': '木炭',
  'minecraft:diamond': '钻石',
  'minecraft:redstone': '红石',
  'minecraft:lapis_lazuli': '青金石',
  'minecraft:glass': '玻璃',
  'minecraft:brick': '砖',
  'minecraft:torch': '火把',
  'minecraft:iron_pickaxe': '铁镐',
}

export function itemName(id) {
  return NAMES[String(id ?? '')] ?? String(id ?? '')
}

/**
 * 生成问句。用问句、给出用途和数量、允许拒绝——不用命令。
 *
 * @param {{id: string, count: number}[]} needs
 * @param {string} [target] 她做这个是为了什么
 */
export function buildQuestion(needs, target = '') {
  if (!Array.isArray(needs) || needs.length === 0) return ''
  const parts = needs.map((n) => `${itemName(n.id)}×${n.count}`)
  const why = target === '' ? '' : `（做${itemName(target)}用）`
  return `你有多余的${parts.join('、')}吗${why}？没有的话我就去做别的。`
}

/**
 * 玩家给了没有：把他的背包数量按 need 比对。
 *
 * @param {{id: string, count: number}[]} needs
 * @param {{items?: {id: string, count: number}[]}} inventory
 */
export function needsSatisfied(needs, inventory) {
  if (!Array.isArray(needs) || needs.length === 0) return true
  const have = new Map()
  for (const it of inventory?.items ?? []) {
    const id = String(it?.id ?? '')
    have.set(id, (have.get(id) ?? 0) + Number(it?.count ?? 0))
  }
  return needs.every((n) => (have.get(n.id) ?? 0) >= n.count)
}
