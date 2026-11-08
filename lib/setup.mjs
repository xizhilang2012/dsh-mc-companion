/**
 * 给别人用的"安装引导"：让玩家手里的那个 AI 自己读、自己带人装。
 *
 * 为什么要有这个：装这个插件需要两半（DSH 插件 + Minecraft mod），
 * 而 mod 是个 jar，只能手动放进 mods 目录。玩家不会读文档，
 * 但会问「我怎么用」——那就让 AI 能把状态查清楚、一步步教。
 *
 * @module mc-companion/lib/setup
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * 检查安装状态，给出可以直接念给玩家听的步骤。
 *
 * @param {{
 *   root: string,              // 插件安装目录
 *   bridgeConnected: boolean,
 *   herAlive?: boolean,
 *   saveStateLoaded?: boolean,
 *   modReported?: boolean,     // 有没有收到过 mod 的任何事件
 * }} input
 */
export function buildSetup(input) {
  const root = input?.root ?? ''
  const jarDir = path.join(root, 'mod', 'build', 'libs')
  let jars = []
  try {
    jars = fs.readdirSync(jarDir).filter((f) => f.endsWith('.jar') && !f.includes('sources'))
  } catch {
    jars = []
  }
  const jarName = jars.find((f) => f.includes('mc-companion')) ?? ''
  const jarPath = jarName === '' ? '' : path.join(jarDir, jarName)

  const bridge = input?.bridgeConnected === true
  const modReported = input?.modReported === true
  const alive = input?.herAlive === true

  /** @type {string[]} */
  const problems = []
  if (jarName === '') problems.push('插件包里没找到 mod 的 jar（发布包应该有；如果你是源码运行，先构建一次）')
  if (!bridge) problems.push('mod 还没连上：游戏没开、没进存档，或者 jar 没放进 mods/')
  else if (!modReported) problems.push('连上了但没收到她的消息：可能还没进存档')
  else if (!alive) problems.push('她在存档里但没出现：检查设置里的「复活」开关')

  /** @type {{title: string, done: boolean, detail: string}[]} */
  const steps = [
    {
      title: '确认游戏是 1.20.1 + Fabric',
      done: bridge,
      detail: '需要 Fabric Loader ≥ 0.15 和 Fabric API（1.20.1 版）。版本不对装了也起不来。',
    },
    {
      title: '把 jar 放进游戏的 mods 文件夹',
      done: bridge,
      detail: jarPath === ''
        ? '在插件的安装目录里找 mod/build/libs/mc-companion-*.jar'
        : `这个文件：${jarPath}　复制到你的 Fabric 实例的 mods/ 目录（和 Fabric API 放一起）`,
    },
    {
      title: '插件装进 DSH 并重启',
      done: true,
      detail: 'dsh plugin --profile desktop add dsh-mc-companion，然后重启 DSH。',
    },
    {
      title: '进存档，看她有没有出现',
      done: modReported && alive,
      detail: '她会自己出现（不用召唤）。按 N 开她的面板；说话要 op 权限。',
    },
  ]

  return {
    version: readVersion(root),
    jarName,
    jarPath,
    jarExists: jarName !== '',
    bridgeConnected: bridge,
    herAlive: alive,
    problems,
    steps,
    // 给 AI 的说话方式建议：别一次倒完，先问一句
    howToExplain:
      '别一次把四步全倒出来。先说一句你们现在是连上/没连上，然后只讲下一步该做什么，'
      + '等他做完再问"弄好了吗"。他要是说搞不定，先问他用的哪个启动器（PCL2 / 官方启动器 / HMCL / Modrinth App）。',
  }
}

function readVersion(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    return String(pkg.version ?? '')
  } catch {
    return ''
  }
}
