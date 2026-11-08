/**
 * 自给自足：缺东西时她自己怎么办。
 *
 * 之前的问题是她太依赖玩家——缺材料就开口要，玩家不在就卡住。
 * 这里把"哪些东西她自己能搞到、哪些搞不到"写死成规则，塞进提示词，
 * 让她先动手，最后才问；而且问要用问句，不是下命令。
 *
 * @module mc-companion/lib/autonomy
 */

/** 木头这一整条链：她自己 gather 就能解决。 */
const WOOD = /(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped)?_?(log|wood|planks|sapling|stick|crafting_table)$/
/** 石头/土/沙这类：挖就有。 */
const GROUND = /(cobblestone|stone|deepslate|andesite|diorite|granite|tuff|gravel|sand|sandstone|dirt|grass_block|clay|flint|coal|charcoal)$/
/** 木头工具：材料自己都有。 */
const WOOD_TOOL = /^wooden_/
/** 石头工具：木头档之后的下一个目标。 */
const STONE_TOOL = /^stone_/
/** 这些要工具、要下矿、要烧，代价明显更高。 */
const COSTLY = /(iron|gold|diamond|emerald|netherite|ancient_debris|redstone|lapis|quartz|amethyst|copper)/
/** 烧炼相关：她没有熔炉/烧炼能力。 */
const SMELTING = /(furnace|smoker|blast_furnace|torch|glass|brick|charcoal)$/

/**
 * 这个缺的东西，她自己能不能弄到。
 *
 * @param {string} itemId 例如 minecraft:oak_planks
 * @returns {{kind: 'self'|'costly'|'unknown', how: string}}
 */
export function classifyNeed(itemId) {
  const id = String(itemId ?? '').trim()
  if (id === '') return { kind: 'unknown', how: '' }
  const short = id.includes(':') ? id.split(':').pop() : id
  if (WOOD.test(short)) {
    return { kind: 'self', how: '自己去 gather 砍树，再 craft 成木板/木棍/工作台' }
  }
  if (WOOD_TOOL.test(short)) {
    return { kind: 'self', how: '自己砍树 → 木板 → 木棍 → craft 出来，做好记得 equip 拿在手上' }
  }
  if (GROUND.test(short)) {
    return { kind: 'self', how: '自己去 mine（没镐先做木镐——空手挖石头什么都不掉）' }
  }
  if (STONE_TOOL.test(short)) {
    return { kind: 'self', how: '先做木镐 → 拿在手上 mine 石头拿圆石 → craft 石工具' }
  }
  if (SMELTING.test(short)) {
    return { kind: 'costly', how: '要熔炉烧，她做不到——开口问玩家（用问句）' }
  }
  if (COSTLY.test(short)) {
    return { kind: 'costly', how: '要下矿/要更好的镐，代价大——先问玩家有没有多余的（用问句）' }
  }
  return { kind: 'unknown', how: '不确定能不能自己弄到——先看看周围，实在没有就问玩家（用问句）' }
}

/**
 * 塞进提示词的"自给自足"规则。
 *
 * @returns {string}
 */
export function autonomyRules() {
  return [
    '**缺东西时按这个顺序，别一上来就找玩家要：**',
    '1. 自己能弄到的，自己弄：木头 → `gather`；石头/土/沙 → `mine`（没镐先做木镐，空手挖石头不掉东西）；',
    '   中间产物 → `craft`（木板、木棍、工作台、木工具）。',
    '2. 做出来就 `equip` 拿在手上——工具在包里等于没有。',
    '3. 真的搞不到（铁、钻石、要熔炉烧的东西、别人的东西），才开口问。',
    '**开口的规矩：用问句，不用命令。** 例如「你有多余的铁锭吗？我拿木头跟你换」；',
    '不要说「给我铁锭」「去挖点煤」。一次只问一件事；被拒绝或没人回答，就自己换个目标继续做，',
    '不要反复要同一件东西。',
  ].join('\n')
}

/**
 * 她的请求是不是问句（用来提醒模型改口吻，也用来测）。
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isQuestion(text) {
  const t = String(text ?? '').trim()
  if (t === '') return false
  return /[?？]\s*$/.test(t) || /(吗|么|好不好|行不行|可以吗|有没有|能不能)/.test(t)
}
