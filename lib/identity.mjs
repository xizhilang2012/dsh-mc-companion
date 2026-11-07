/**
 * 身份接线：让 MC 里的她和 B 站里的她是同一只。
 *
 * 不新建人设——直接读 bili-whale 那份配置和那本日记。
 * 写日记是敏感操作，默认关闭，且永远只追加、不重写。
 *
 * @module mc-companion/lib/identity
 */
import { readFile, writeFile } from 'node:fs/promises'

/** 从 bili-whale 的配置对象里取出需要的那几个字段。 */
export function parseIdentity(raw) {
  const config = raw !== null && typeof raw === 'object' ? raw : {}
  const persona = config.persona ?? {}
  const owner = config.owner ?? {}
  return {
    name: String(persona.name ?? '大肥鱼'),
    selfClaim: String(persona.selfClaim ?? '我'),
    ownerTitle: String(persona.ownerTitle ?? '老大'),
    ownerName: String(owner.name ?? ''),
  }
}

/** 按 `## 标题` 切段，返回 { 标题: 正文 }。 */
export function splitSections(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const sections = {}
  let current = null
  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) {
      current = heading[1]
      sections[current] = []
      continue
    }
    if (current !== null) sections[current].push(line)
  }
  return sections
}

/** 从日记正文里取出「想说」和最近几条「看过」，以及是否处于暂停。 */
export function parseDiary(text) {
  const sections = splitSections(text)
  const wantToSay = (sections['想说'] ?? [])
    .map((line) => line.replace(/^\s*[-*]\s?/, '').trim())
    .filter((line) => line !== '' && !line.startsWith('（空）'))

  const seenRows = (sections['看过'] ?? [])
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !line.startsWith('| ---') && !line.startsWith('| 时间'))

  const paused = Object.keys(sections).some((title) => title.includes('暂停')) &&
    (sections['暂停记录'] ?? []).some((line) => line.includes('恢复时间'))

  return { wantToSay, seenRows, paused, sectionNames: Object.keys(sections) }
}

/**
 * 往「想说」小节末尾追加一行；小节不存在就在文末新建。
 * 只追加，绝不动已有内容。
 */
export function appendToWantToSay(text, line) {
  const source = String(text ?? '')
  const bullet = `- ${line}`
  const lines = source.split(/\r?\n/)

  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^##\s+想说\s*$/.test(lines[i])) { start = i; break }
  }
  if (start < 0) {
    return `${source.replace(/\s*$/, '')}\n\n## 想说\n\n${bullet}\n`
  }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) { end = i; break }
  }

  // 插到该小节最后一个非空行之后
  let insertAt = end
  while (insertAt - 1 > start && lines[insertAt - 1].trim() === '') insertAt -= 1
  lines.splice(insertAt, 0, bullet)
  return lines.join('\n')
}

export async function loadIdentity(path) {
  try {
    const text = await readFile(path, 'utf8')
    return { ...parseIdentity(JSON.parse(text)), source: path }
  } catch (error) {
    // 读不到就回默认值，但把原因带上——不然「她不知道自己叫什么」没法排查
    return { ...parseIdentity(undefined), source: path, readError: String(error?.message ?? error) }
  }
}

export async function readDiary(path) {
  try {
    return parseDiary(await readFile(path, 'utf8'))
  } catch {
    return { wantToSay: [], seenRows: [], paused: false, sectionNames: [] }
  }
}

/** 追加一条；返回是否成功。调用方负责判断是否允许写。 */
export async function appendNote(path, line) {
  try {
    const text = await readFile(path, 'utf8')
    await writeFile(path, appendToWantToSay(text, line), 'utf8')
    return true
  } catch {
    return false
  }
}
