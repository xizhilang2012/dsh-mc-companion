/**
 * 闭环执行：给一个目标，她自己跑完 采集 → 加工 → 做成。
 *
 * 为什么要有这一层：以前每一步都要模型决定一次（plan → gather → craft → equip），
 * 一轮下来就是四五次模型调用，又慢又贵。而这条链的判断其实是确定的
 * （还缺什么、缺的能不能采、能不能做），所以让代码自己跑；
 * 只有卡住、或者需要开口问人的时候，才交回给模型。
 *
 * 这里不碰网络和游戏：plan/exec 都是外面注入的，好测。
 *
 * @module mc-companion/lib/make
 */

/**
 * @param {{
 *   plan: () => Promise<{steps: {action: string, args: object}[], asks?: string[]}>,
 *   exec: (step: {action: string, args: object}) => Promise<{ok: boolean, what?: string, detail?: string}>,
 *   maxRounds?: number,
 * }} input
 * @returns {Promise<{done: boolean, rounds: number, did: string[], asks: string[], lastError: string}>}
 */
export async function runMake(input) {
  const maxRounds = Math.max(1, Number(input.maxRounds ?? 12))
  const did = []
  const asks = new Set()
  let lastError = ''
  let rounds = 0

  while (rounds < maxRounds) {
    rounds += 1
    const plan = await input.plan()
    const steps = plan?.steps ?? []
    for (const ask of plan?.asks ?? []) asks.add(ask)

    if (steps.length === 0) {
      return { done: true, rounds, did, asks: [...asks], lastError }
    }

    const step = steps[0]
    if (step.action === 'ask') {
      // 她做不了：停在这里，交给模型用问句问玩家
      asks.add(describeStep(step))
      return { done: false, rounds, did, asks: [...asks], lastError: '需要玩家提供材料' }
    }

    const result = await input.exec(step)
    if (!result?.ok) {
      lastError = String(result?.detail ?? '执行失败')
      return { done: false, rounds, did, asks: [...asks], lastError }
    }
    did.push(describeStep(step))
  }

  return { done: false, rounds, did, asks: [...asks], lastError: '轮数用完了还没做完' }
}

/** 一步写成一句人话，用来回报"她做了什么"。 */
export function describeStep(step) {
  const args = Object.entries(step?.args ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  const base = `action=${step?.action ?? '?'} ${args}`.trim()
  if (step?.action === 'gather') {
    return `去采${step.args?.what === 'stone' ? '石头' : '木头'}（${base}）`
  }
  if (step?.action === 'craft') return `做 ${step.args?.item ?? '东西'}（${base}）`
  if (step?.action === 'equip') return `把 ${step.args?.item ?? '工具'} 拿到手上（${base}）`
  return base
}
