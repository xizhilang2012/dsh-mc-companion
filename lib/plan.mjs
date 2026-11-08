/**
 * 材料求解：把"想做 X"变成"一步一步做什么"。
 *
 * 这里**不再写死"木→石→铁"的顺序**。那只是结果，不是逻辑。
 * 逻辑只有一条：想要某个东西 → 看还缺几个 → 缺的是能采的就采、能做的就做、
 * 做不了的（要烧/要挖矿深处）才问人。木头到石头、石头到铁都是这条链自己走出来的。
 *
 * mod 那边负责递归展开配方（它才拿得到服务端配方表），这里负责把树拍平成步骤。
 *
 * @module mc-companion/lib/plan
 */

/** 哪些东西她自己去采就有。 */
const GATHER_STONE = /(cobblestone|^stone$|deepslate|andesite|diorite|granite|tuff)/
/** 铁矿：要下矿挖，挖到的是生铁/铁矿。 */
const GATHER_IRON = /(raw_iron|iron_ore)/

/**
 * 把 mod 给的配方树拍平成有序步骤（后序：先把材料弄到手，再做这一层）。
 *
 * @param {object|null} tree mod 的 planNode 结果
 * @returns {{steps: {action: string, args: object}[], asks: string[]}}
 */
export function flattenPlan(tree) {
  const steps = []
  const asks = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    const kind = String(node.kind ?? '')
    if (kind === 'have') return                       // 已有，跳过
    if (kind === 'craft') {
      for (const child of node.needs ?? []) walk(child)
      steps.push({ action: 'craft', args: { item: node.id } })
      return
    }
    if (kind === 'gather') {
      const path = String(node.id ?? '')
      const what = GATHER_IRON.test(path) ? 'iron' : GATHER_STONE.test(path) ? 'stone' : 'log'
      steps.push({ action: 'gather', args: { what, radius: 32 } })
      return
    }
    if (kind === 'smelt') {
      // 要先有矿：先把矿（和燃料）弄到手，再烧
      steps.push({
        action: 'smelt',
        args: { item: node.id, count: Number(node.count ?? node.missing ?? 1) },
      })
      return
    }
    // ask：她做不到的（铁/钻石/要烧的东西）
    const label = `${node.id} ×${node.missing ?? 1}`
    if (!asks.includes(label)) asks.push(label)
  }
  walk(tree)
  return { steps: collapse(steps), asks }
}

/** 连续的同一个采集动作合成一条（砍 3 次树不用写 3 遍）。 */
function collapse(steps) {
  const out = []
  for (const step of steps) {
    const last = out[out.length - 1]
    if (last && last.action === step.action &&
        last.action === 'gather' && last.args.what === step.args.what) {
      last.args.times = (last.args.times ?? 1) + 1
      continue
    }
    out.push({ action: step.action, args: { ...step.args } })
  }
  return out
}

/** 把步骤写成提示词里的几行，外面直接抄。 */
export function describePlan(steps, asks = []) {
  if (!steps || steps.length === 0) {
    return asks.length === 0
      ? '材料都够了，直接 craft 那个目标就行。'
      : `她做不了这些：${asks.join('、')}——用问句问玩家有没有多余的。`
  }
  const lines = ['按这个顺序做（每步做完看回执，失败先说原因别跳步）：']
  steps.forEach((step, index) => {
    const args = Object.entries(step.args ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
    lines.push(`  ${index + 1}. mc_companion action=${step.action} ${args}`.trim())
  })
  if (asks.length > 0) {
    lines.push(`做不了的：${asks.join('、')}——这些用问句问玩家有没有多余的。`)
  }
  lines.push('做完这一轮再 plan 一次，看还缺什么。')
  return lines.join('\n')
}

/**
 * 建议一个目标（只是建议，不是固定阶梯）。
 *
 * 手上没有任何镐就先做木镐；有木镐没石镐就做石镐；再往上要铁（她做不了，得问人）。
 *
 * @param {{herBag?: {items?: {id: string, count: number}[]}, playerInv?: {items?: {id: string, count: number}[]}}} input
 * @returns {string|null} 目标物品 id
 */
export function suggestTarget(input = {}) {
  const ids = [
    ...(input.herBag?.items ?? []).map((it) => String(it?.id ?? '')),
    ...(input.playerInv?.items ?? []).map((it) => String(it?.id ?? '')),
  ]
  const has = (id) => ids.includes(id)
  if (!has('minecraft:wooden_pickaxe') && !has('minecraft:stone_pickaxe') &&
      !has('minecraft:iron_pickaxe') && !has('minecraft:diamond_pickaxe')) {
    return 'minecraft:wooden_pickaxe'
  }
  if (!has('minecraft:stone_pickaxe') && !has('minecraft:iron_pickaxe') &&
      !has('minecraft:diamond_pickaxe')) {
    return 'minecraft:stone_pickaxe'
  }
  if (!has('minecraft:iron_pickaxe') && !has('minecraft:diamond_pickaxe')) {
    return 'minecraft:iron_pickaxe'
  }
  return null
}
