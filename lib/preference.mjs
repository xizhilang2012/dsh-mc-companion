/**
 * 决策偏好：她闲下来时想干什么。
 *
 * 这不是给她加一个"性格标签"就完事——每种偏好都要落到**具体的下一步动作**上，
 * 否则模型拿到"她喜欢建筑"也只会说空话。
 *
 * @module mc-companion/lib/preference
 */

export const PREFERENCES = ['company', 'build', 'gather', 'explore', 'guard', 'custom']

export const PREFERENCE_INFO = {
  company: {
    title: '黏人',
    detail: '喜欢待在你附近，看你做事，偶尔说一句。',
    likes: ['跟在你后面', '看你挖矿', '在你停下时靠近'],
    sample: '保持 3–5 格距离跟着他，他挖矿时站在旁边看',
  },
  build: {
    title: '喜欢建筑',
    detail: '会主动攒材料，想找地方搭点东西。',
    likes: ['收集木头和石头', '找平地', '搭小结构'],
    sample: '先看他附近有没有平坦的地方，再决定要不要去攒木头和石头',
  },
  gather: {
    title: '喜欢采集',
    detail: '爱捡东西、爱挖矿，看到材料就想收。',
    likes: ['挖矿石', '捡掉落物', '清理方块'],
    sample: '看看附近有没有裸露的石头或矿脉，先挖一组再回去',
  },
  explore: {
    title: '爱探险',
    detail: '喜欢往没去过的地方走，看到新东西会兴奋。',
    likes: ['朝一个方向走远', '走高处看地形', '靠近洞穴口'],
    sample: '挑一个没走过的方向走出去 30–50 格，看看那边有什么',
  },
  guard: {
    title: '守着',
    detail: '待在你附近，把靠过来的敌人打掉。',
    likes: ['站在你前方', '打怪', '警戒'],
    sample: '站在他和大概会来敌人的方向之间，附近有怪就打',
  },
  custom: {
    title: '自定义',
    detail: '用玩家自己写的那句话决定她想做什么。',
    likes: [],
    sample: '',
  },
}

/** 规整偏好名，不认识的回落到"黏人"。 */
export function normalizePreference(value, fallback = 'company') {
  const text = String(value ?? '').trim()
  return PREFERENCES.includes(text) ? text : fallback
}

/**
 * 拼进"让她自己提目标"提示语里的那一段。
 *
 * @param {string} preference
 * @param {string} [customText] preference 为 custom 时，玩家自己写的那句话
 * @returns {string} 没有偏好时返回空串
 */
export function preferencePrompt(preference, customText = '') {
  const id = normalizePreference(preference)
  if (id === 'custom') {
    const text = String(customText ?? '').trim()
    if (text === '') return '你的性子：自定义（面板里还没填内容，就按你自己的判断来）。'
    return [`你的性子（你自己写的）：${text}`, '照这个决定你想做什么。'].join('\n')
  }
  const info = PREFERENCE_INFO[id]
  if (!info) return ''
  return [
    `你的性子：${info.title}——${info.detail}`,
    `你平时喜欢：${info.likes.join('、')}。`,
    `这次可以照这个来：${info.sample}。`,
  ].join('\n')
}
