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
 * @param {{text?: string, names?: string[], own?: boolean, singleplayer?: boolean}} input
 *   own         这条聊天是不是你自己打的字（而不是别人/系统）
 *   singleplayer 现在是不是单机——单机时没有人可以对话，你自己打的字就是在叫她
 * @returns {boolean}
 */
export function isOrder(input) {
  const text = stripPrefix(input?.text)
  if (text === '') return false
  // 单机里你自己发的每一句话都是对她说的：不用喊名字也算指令
  if (input?.own === true && input?.singleplayer === true) return true
  const names = (input?.names ?? [])
    .map((n) => String(n ?? '').trim())
    .filter((n) => n !== '')
  if (names.length === 0) return false
  return new RegExp(names.map(escape).join('|')).test(text)
}
