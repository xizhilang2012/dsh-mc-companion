/**
 * 记忆迁移：把这台机器上的人设和日记摘要打成一个文件，换机器时带走。
 *
 * 导出的东西必须是可以公开看的——它是你要上传到网上的一部分。
 * 所以只带"她是谁"和"最近想过什么"，不带凭据、不带会话原文。
 *
 * @module mc-companion/lib/memory
 */

const FORMAT = 'mc-companion-memory@1'

/**
 * @param {{identity?: object, wantToSay?: string[], paused?: boolean, settings?: object, now?: number}} input
 */
export function buildBundle(input = {}) {
  const identity = input.identity ?? {}
  return {
    format: FORMAT,
    exportedAt: new Date(input.now ?? Date.now()).toISOString(),
    identity: {
      name: String(identity.name ?? ''),
      ownerTitle: String(identity.ownerTitle ?? ''),
      ownerName: String(identity.ownerName ?? ''),
      selfClaim: String(identity.selfClaim ?? ''),
    },
    // 只留最近几句"想说"，够延续语气，又不至于把整本日记搬走
    recentThoughts: (input.wantToSay ?? []).slice(-5).map((s) => String(s)),
    paused: input.paused === true,
    settings: input.settings ?? {},
  }
}

/**
 * 校验一个导入包。宁可拒绝，也不要写进去半个坏文件。
 *
 * @param {unknown} raw
 * @returns {{ok: true, bundle: object} | {ok: false, error: string}}
 */
export function parseBundle(raw) {
  const data = typeof raw === 'string' ? safeJson(raw) : raw
  if (data === null || typeof data !== 'object') return { ok: false, error: '不是一个对象' }
  if (data.format !== FORMAT) return { ok: false, error: `格式不对：需要 ${FORMAT}` }

  const identity = typeof data.identity === 'object' && data.identity !== null ? data.identity : {}
  const name = String(identity.name ?? '').trim()
  if (name === '') return { ok: false, error: '包里没有名字' }

  return {
    ok: true,
    bundle: {
      format: FORMAT,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      identity: {
        name,
        ownerTitle: String(identity.ownerTitle ?? '').trim(),
        ownerName: String(identity.ownerName ?? '').trim(),
        selfClaim: String(identity.selfClaim ?? '').trim(),
      },
      recentThoughts: Array.isArray(data.recentThoughts) ? data.recentThoughts.slice(-5).map(String) : [],
      paused: data.paused === true,
      settings: typeof data.settings === 'object' && data.settings !== null ? data.settings : {},
    },
  }
}

/** 把导入包写成一份能被 persona 解析的配置。 */
export function bundleToPersonaConfig(bundle) {
  return {
    persona: {
      name: bundle.identity.name,
      ownerTitle: bundle.identity.ownerTitle || '老大',
      selfClaim: bundle.identity.selfClaim || '我',
    },
    owner: { name: bundle.identity.ownerName },
    importedAt: bundle.exportedAt,
  }
}

/** 把导入包写成一本最小的日记（只含"想说"几条）。 */
export function bundleToDiary(bundle) {
  const lines = ['# 带来的日记', '', `> 从 ${bundle.exportedAt || '另一个地方'} 导入。`, '', '## 想说', '']
  if (bundle.recentThoughts.length === 0) lines.push('- （空）')
  else for (const thought of bundle.recentThoughts) lines.push(`- ${thought}`)
  lines.push('')
  return lines.join('\n')
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
