/**
 * 话量：她到底该多爱说话。
 *
 * 以前这件事藏在两处：提示词里一句"没事就什么都不做"，和写死的"一次不超过 20 字"。
 * 结果就是她话少，而且改配置也改不动——因为抑制写在提示词里，不在数字里。
 *
 * 现在把"说不说、说多长、什么时候说"做成三档，每档直接换成一段提示词。
 *
 * @module mc-companion/lib/talk
 */

export const TALK_LEVELS = ['quiet', 'normal', 'chatty']

export const TALK_INFO = {
  quiet: { title: '话少', detail: '能不说就不说，只在被问到、或事情做完时开口。' },
  normal: { title: '正常', detail: '被问到要回，事情做完说一句结果，平时不多嘴。' },
  chatty: { title: '话多', detail: '每件事都可以接一句，闲着也会说说自己在干什么。' },
}

/** 规整话量；不认识的回落到 normal。 */
export function normalizeTalkLevel(value, fallback = 'normal') {
  const text = String(value ?? '').trim()
  return TALK_LEVELS.includes(text) ? text : fallback
}

/**
 * 拼进提示词里的"怎么说话"。
 *
 * @param {string} level
 * @returns {string}
 */
export function talkRules(level) {
  const id = normalizeTalkLevel(level)
  if (id === 'quiet') {
    return [
      '**说话：能不说就不说。**',
      '被问到要回（一句带过），事情做完说一句结果；其它时候保持安静。',
      '一次不超过 12 字，不解释、不客套。',
    ].join('\n')
  }
  if (id === 'chatty') {
    return [
      '**说话：可以多说一点。**',
      '被问到一定要接话；做完一件事说一句结果和你的看法；闲着的时候可以说一句你在干什么。',
      '一次不超过 30 字，说人话，不用"收到/明白/好的"这种空话。',
      '别连着刷屏——同一件事只说一次。',
    ].join('\n')
  }
  return [
    '**说话：正常。**',
    '被问到要回；做完一件事说一句结果；其它时候不用刻意找话说。',
    '一次不超过 20 字，不用"收到/明白/好的"这种空话。',
  ].join('\n')
}
