/**
 * 她从低到高该往哪走。
 *
 * 这不是自动执行——执行还是靠她和 mod 的工具。这里只负责一件事：
 * 把"你现在在第几档、下一步该做什么、卡在哪"算清楚，塞进提示词。
 * 不写清楚的话，模型每次醒来都会从"先砍棵树"重新开始。
 *
 * 顺序按原版：木 → 石 → 铁 → 钻石 → 下界合金。
 *
 * @module mc-companion/lib/progress
 */

/** 档次顺序，从低到高。 */
export const TIERS = [
  { id: 'wood', title: '木', prefix: 'wooden_', material: '木头' },
  { id: 'stone', title: '石', prefix: 'stone_', material: '圆石' },
  { id: 'iron', title: '铁', prefix: 'iron_', material: '铁锭' },
  { id: 'diamond', title: '钻石', prefix: 'diamond_', material: '钻石' },
  { id: 'netherite', title: '下界合金', prefix: 'netherite_', material: '下界合金锭' },
]

/** 每一档的工具：原版 id（不带命名空间）。 */
const TOOL_KINDS = ['pickaxe', 'axe', 'shovel', 'sword']

/** 这一档的"入门工具"是镐——有镐才算进了这一档。 */
export function tierToolId(tierId) {
  const tier = TIERS.find((t) => t.id === tierId)
  return tier ? `minecraft:${tier.prefix}pickaxe` : ''
}

/** 从物品 id 列表里看出最高到了哪一档；一件都没有返回 null。 */
export function highestTier(itemIds) {
  const ids = (itemIds ?? []).map((id) => String(id ?? ''))
  let best = null
  for (const tier of TIERS) {
    const hit = ids.some((id) => {
      const short = id.includes(':') ? id.split(':').pop() : id
      return TOOL_KINDS.some((kind) => short === `${tier.prefix}${kind}`)
    })
    if (hit) best = tier
  }
  return best
}

/** 下一档；已经最高了返回 null。 */
export function nextTier(tierId) {
  if (!tierId) return TIERS[0]
  const index = TIERS.findIndex((t) => t.id === tierId)
  if (index < 0) return TIERS[0]
  return TIERS[index + 1] ?? null
}

/**
 * 拼一段"发展顺序"提示。
 *
 * @param {{herBag?: {items?: {id: string, count: number}[]}, playerInv?: {items?: {id: string, count: number}[]}, held?: string}} input
 * @returns {string}
 */
export function progressPrompt(input = {}) {
  const herIds = (input.herBag?.items ?? []).map((it) => it.id)
  const playerIds = (input.playerInv?.items ?? []).map((it) => it.id)
  const held = String(input.held ?? '')
  const mine = highestTier(herIds)
  const ours = highestTier([...herIds, ...playerIds])
  const next = nextTier(ours?.id ?? null)

  const lines = [`发展顺序（从低到高）：${TIERS.map((t) => t.title).join(' → ')}。`]
  if (held) lines.push(`你手上现在是 ${held}。`)
  if (!ours) lines.push('你们现在连木镐都还没有：先 gather 砍木头，再 craft 木镐（3 木板 + 2 木棍）。')
  else lines.push(`你们目前最高是「${ours.title}」档。`)
  if (next) {
    lines.push(
      `下一步：${next.title}制工具。${next.id === 'stone'
        ? '要圆石——先拿着木镐去挖石头（空手挖石头什么都不掉），3 圆石 + 2 木棍做石镐。'
        : next.id === 'iron'
          ? '要铁锭——挖铁矿再烧：需要熔炉和燃料（木头/煤），这一步比前面麻烦，先攒够再动。'
          : `要${next.material}。`}`,
    )
  } else {
    lines.push('已经是最高档了，接下来可以往建筑/探索走。')
  }
  lines.push('别跳档：没木镐就别想着石镐；做出来了就 equip 拿在手上，不然挖石头不掉东西。')
  return lines.join('\n')
}
