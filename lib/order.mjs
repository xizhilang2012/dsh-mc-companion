/**
 * 只认一种指令：**喊她的名字**。
 *
 * 之前是猜动词（"移动"/"过来"…），结果把"我要移动到那边"这种话也当成命令。
 * 现在规矩很简单——句子里有她的名字，就是在叫她；没有就是闲聊。
 *
 * @module mc-companion/lib/order
 */

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 去掉游戏自带的 `<玩家名>` 前缀。 */
export function stripPrefix(text) {
  return String(text ?? '').replace(/^<[^>]+>\s*/, '').trim()
}

/**
 * @param {{text?: string, names?: string[]}} input
 * @returns {boolean}
 */
export function isOrder(input) {
  const text = stripPrefix(input?.text)
  if (text === '') return false
  const names = (input?.names ?? [])
    .map((n) => String(n ?? '').trim())
    .filter((n) => n !== '')
  if (names.length === 0) return false
  return new RegExp(names.map(escape).join('|')).test(text)
}
