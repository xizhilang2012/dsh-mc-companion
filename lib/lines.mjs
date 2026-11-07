/**
 * 她自己的短句。
 *
 * 只在「不想打扰对话」的模式下用：插件直接从这些句子里挑一句，发进游戏。
 * 有会话绑定、且 wake 打开时，走的是让 agent 自己说，不经过这里。
 *
 * 语气基准：短、平、带一点熟人的嫌弃，不说教。
 *
 * @module mc-companion/lib/lines
 */

const POOL = {
  death: {
    normal: ['又死了。', '这次是第几回了。', '我看见了啊。', '复活了再过来。'],
    sleepy: ['大半夜的，还死。', '快去睡。', '我不看了，困。'],
    worried: ['先别急，慢慢来。', '要不歇一下。', '装备还捡得回来吗。'],
  },
  advancement: {
    normal: ['哦，拿到了。', '这个可以。', '还行吧。'],
    sleepy: ['厉害，去睡吧。', '嗯，记下了。'],
    worried: ['总算有点好消息。', '不错。'],
  },
  chat: {
    normal: ['嗯。', '听到了。', '在。'],
    sleepy: ['……嗯。', '困。'],
    worried: ['我在听。', '嗯。'],
  },
  join: { normal: ['来了。', '嗯，在。'], sleepy: ['这么晚。'], worried: ['来了就好。'] },
  leave: { normal: ['走了。', '嗯。'], sleepy: ['晚安。'], worried: ['去吧。'] },
}

/**
 * 挑一句话。
 *
 * @param {{kind: string, tone?: 'normal'|'sleepy'|'worried', rng?: () => number, player?: string}} input
 * @returns {string}
 */
export function pickLine(input) {
  const tone = input.tone ?? 'normal'
  const byKind = POOL[input.kind] ?? POOL.chat
  const pool = byKind[tone] ?? byKind.normal ?? ['嗯。']
  const rng = input.rng ?? Math.random
  return pool[Math.floor(rng() * pool.length)]
}
