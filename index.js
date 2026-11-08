/**
 * MC 陪伴插件 · Host 侧。
 *
 * 做三件事：
 *   1. 跟读服务器日志，解析成事件（谁死了、谁在说话、谁上线）
 *   2. 按「对话活跃度」判断该不该开口，攒成待办
 *   3. 把「发生了什么」交给 agent，并把 agent 想说的话通过 RCON say 发回游戏
 *
 * 它自己不生成任何一句话——说话的是会话里那个她。
 *
 * @module mc-companion
 */
import { readNewEvents } from './lib/log-tail.mjs'
import { rconCommand, probeRcon } from './lib/rcon.mjs'
import { shouldSpeak, markSpoke, cooldownFor } from './lib/chattiness.mjs'
import { createBridge } from './lib/bridge.mjs'
import { buildSetup } from './lib/setup.mjs'
import { moodFor } from './lib/mood.mjs'
import { pickLine } from './lib/lines.mjs'
import { phrase } from './lib/phrase.mjs'
import { loadIdentity, readDiary, appendNote } from './lib/identity.mjs'
import { normalizeSettings, toStored, budgetLeft } from './lib/settings.mjs'
import { resolveSource, personaCandidates, diaryCandidates } from './lib/source.mjs'
import { buildBundle, parseBundle, bundleToPersonaConfig, bundleToDiary } from './lib/memory.mjs'
import { isOrder } from './lib/order.mjs'
import { readSessionState, writeSessionState, newSessionId, bootstrapText } from './lib/session.mjs'
import { shouldPropose, goalPrompt } from './lib/goal.mjs'
import { preferencePrompt, normalizePreference } from './lib/preference.mjs'
import { progressPrompt } from './lib/progress.mjs'
import { autonomyRules } from './lib/autonomy.mjs'
import { flattenPlan, describePlan, suggestTarget } from './lib/plan.mjs'
import { runMake } from './lib/make.mjs'
import { parseNeeds, buildQuestion, needsSatisfied } from './lib/request.mjs'

// 跟随距离按性子给：建筑/采集要空间，黏人/守着要贴身，探险可以跑远点。
function followDistanceFor(preference) {
  switch (String(preference ?? '')) {
    case 'company': return 4
    case 'guard': return 4
    case 'build': return 16
    case 'gather': return 16
    case 'explore': return 24
    default: return 10
  }
}
import { talkRules } from './lib/talk.mjs'
import { personaPrompt } from './lib/identity.mjs'
import { homedir } from 'node:os'
import { readdir, stat } from 'node:fs/promises'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 面板保存的设置；面板写这里，插件启动时读它。 */
const SETTINGS_PATH = join(homedir(), '.dsh', 'mc-companion-settings.json')
const PANEL_PATH = fileURLToPath(new URL('./ui/panel.html', import.meta.url))

function loadSavedSettings() {
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))
    return raw !== null && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  try {
    mkdirSync(join(homedir(), '.dsh'), { recursive: true })
    writeFileSync(SETTINGS_PATH, JSON.stringify(toStored(settings), null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

/** 需要 tools 才能注册工具，需要 webServer 才能开状态路由。 */
export const inject = ['tools', 'webServer', 'sessionController']

const DEFAULTS = {
  host: '127.0.0.1',
  rconPort: 25575,
  rconPassword: '',
  logPath: '',
  bridgePort: 25566,
  chattiness: 55,
  identityPath: '',
  diaryPath: '',
  diaryWrite: false,
  respectPause: false,
  bodyType: 'mc-companion:companion',
  bodyOn: false,
  autoGoal: false,
  preference: 'company',
  sheInvulnerable: true,
  dropOnDeath: false,
  revive: true,
  // dedicated 需要新会话自带模型选择（provider/model），否则会落到要 API key 的路由
  sessionMode: 'dedicated',
  sessionWorkspace: '',
  goalIntervalSeconds: 180,
  wake: false,
  autoSay: false,
  displayName: '同伴',
  mode: 'speak',
  wakeBudgetPerHour: 20,
  hideWake: false,
  cooldownMs: 0,
  sessionId: '',
  maxPending: 20,
  autoSpeak: false,
}

export function apply(ctx, rawConfig) {
  const config = normalize(rawConfig)
  // 面板保存过的值盖在配置之上（只盖它存过的键）
  const saved = loadSavedSettings()
  if (Object.keys(saved).length > 0) {
    const normalized = normalizeSettings(saved, config)
    for (const key of Object.keys(saved)) {
      if (key in normalized) config[key] = normalized[key]
    }
  }
  const log = ctx.logger ?? console
  const state = { lastSpokeAt: undefined, spokeTimes: [], pending: [], offset: 0, wakeTimes: [] }
/** 插件自己的安装目录：找 mod 的 jar 用。 */
const pluginRoot = fileURLToPath(new URL('.', import.meta.url))

  // 人设与记忆：先看显式配置，再按通用候选找（不绑死某一家插件）。
  // 别人的机器上可能是别的陪伴插件，也可能只是一份自己写的人设。
  config.identityPath = resolveSource({
    explicit: config.personaFile || config.identityPath,
    candidates: personaCandidates(),
  })
  config.diaryPath = resolveSource({
    explicit: config.diaryFile || config.diaryPath,
    candidates: diaryCandidates(),
  })
  if (config.identityPath !== '') log.info(`mc-companion: 人设来自 ${config.identityPath}`)
  if (config.diaryPath !== '') log.info(`mc-companion: 日记来自 ${config.diaryPath}`)

  if (config.logPath === '') {
    log.info('mc-companion: 没有配置 logPath，只会提供工具，不跟日志')
  }

  /**
   * 她该开口了 —— 把这件事投给会话，让她自己说。
   * 拿不到会话就退化成一句模板，至少游戏里不会死寂。
   */
  const wake = async (event, verdict) => {
    const who = event.player ?? event.name ?? '老大'
    const line = event.kind === 'craft'
      ? `老大要我做「${event.label ?? event.item ?? '东西'}」（${event.item ?? ''}）`
      : event.kind === 'goal' ? '她想找点事做'
      : event.kind === 'arrived' ? '她走到了地方'
      : event.kind === 'stuck' ? '她走不过去，卡住了'
      : phrase(event)
    const mode = config.mode ?? (config.autoSay ? 'template' : config.wake ? 'speak' : 'quiet')

    if (mode === 'quiet') {
      log.info(`mc-companion: 该开口了（安静模式）—— ${line}`)
      return
    }

    // 念短句：不经过模型，不花钱
    if (mode === 'template') {
      if (bridge?.connected) {
        const mood = moodFor({ deathsInWindow: (state.deaths ?? []).length })
        bridge.say(pickLine({ kind: event.kind, tone: mood.tone, player: who }), config.displayName)
      }
      return
    }

    if (!ctx.sessionController) {
      log.info(`mc-companion: 该开口了（没有 sessionController）—— ${line}`)
      return
    }

    // 预算闸：每次唤醒都是一次完整的模型调用，超了就只记账
    state.wakeTimes = (state.wakeTimes ?? []).filter((t) => Date.now() - t < 3600000)
    if (budgetLeft(state.wakeTimes, config.wakeBudgetPerHour) <= 0) {
      log.info(`mc-companion: 本小时唤醒预算用尽（${config.wakeBudgetPerHour} 次）—— ${line}`)
      return
    }

    // 会话：默认给她单独开一条，只装"玩"需要的东西，不背整段调试历史
    let sessionId
    let prefix = ''
    if (config.sessionMode === 'dedicated') {
      const saved = readSessionState()
      if (saved) {
        sessionId = saved.id
        // 这条会话还没注入过人设（比如刚被改成指向已有会话）
        if (!saved.bootstrappedAt) {
          const who = await loadIdentity(config.identityPath)
          prefix = `${bootstrapText({ name: config.displayName, ownerTitle: who.ownerTitle })}\n\n`
          writeSessionState({ id: sessionId, bootstrappedAt: Date.now() })
        }
      } else {
        sessionId = newSessionId()
        try {
          // 不传 cwd：插件进程的 cwd 是 profile 目录，不是工作区。
          // 建在那种地方的会话起不来（只有一条会话头，没有任何消息）。
          const request = { sessionId }
          if (config.sessionWorkspace) request.cwd = config.sessionWorkspace
          await ctx.sessionController.create(request)
        } catch (error) {
          log.warn(`mc-companion: 建会话失败 ${error instanceof Error ? error.message : String(error)}`)
        }
        writeSessionState({ id: sessionId, bootstrappedAt: Date.now() })
        const who = await loadIdentity(config.identityPath)
        prefix = `${bootstrapText({ name: config.displayName, ownerTitle: who.ownerTitle })}\n\n`
        log.info(`mc-companion: 新建游戏会话 ${sessionId}`)
      }
    } else {
      sessionId = config.sessionId || state.sessionId || await newestSessionId()
    }
    if (sessionId === '') {
      log.info(`mc-companion: 该开口了，但没找到会话 —— ${line}`)
      return
    }
    state.wakeTimes.push(Date.now())
    // 写成"她看见的事"，不是游戏日志——不然读起来像旁白
    const snap = state.snapshot
    const where = snap
      ? `\n（你在 ${snap.x}, ${snap.y}, ${snap.z}；她 ${snap.herPresent ? `在 ${snap.herX}, ${snap.herY}, ${snap.herZ}，离你 ${snap.herDistance} 格` : '不在场'}）`
      : ''
    const craftItem = event.item ?? ''
    const prompt = event.kind === 'craft'
      ? `🐟 老大要你做「${event.label ?? craftItem}」。\n` +
        `（先 action=craft item=${craftItem} 直接试做，它会当场告诉你成了没有。` +
        `返回 result=craft-missing 时，detail 里就是缺什么、缺几个——**先自己解决**：` +
        `缺木头/原木就 action=gather（她自己找树、走过去砍、掉落自己捡）；` +
        `缺石头/圆石就 action=mine（没镐先做木镐并 equip 拿在手上，空手挖石头不掉东西）；` +
        `中间产物自己做（木板→木棍→工具）。凑齐了再 craft 一次，做好她会自己送过来。` +
        `真的搞不到才开口——用问句问，不要下命令。别拆玩家放的东西。）`
      : event.kind === 'goal'
      ? goalPrompt(state.snapshot)
        + '\n\n' + (() => {
          const target = suggestTarget({ herBag: state.herBag, playerInv: state.inventory })
          if (!target) return '工具都齐了：可以自由安排（跟着他 / 攒材料 / 搭东西 / 探路）。'
          // 按需提请：升级不是"必须现在做"，而是"想做的时候可以这样发起"。
          // 老大的原话：装备升级链在决策循环里按需提请，或者由他主动提出。
          return [
            `如果想升级装备（可选，不着急）：目标 ${target}`,
            `  → action=make item=${target}，她会自己采/烧/做，缺材料会开口问。`,
            '也可以先问他一句"要不要我把镐升级一下"，他说要再做。',
          ].join('\n')
        })()
        + '\n\n' + preferencePrompt(config.preference, config.preferenceCustom)
        + '\n\n' + progressPrompt({
          herBag: state.herBag,
          playerInv: state.inventory,
          held: state.snapshot?.herHeld,
        })
        + '\n\n' + autonomyRules()
      : event.kind === 'materials'
      ? `🐟 你要的 ${event.detail} 到了（${event.item} 现在能做了）。${where}\n` +
        `（继续：mc_companion action=make item=${event.item}——它会自己接着采集/加工/做成。` +
        `做完 say 一句结果给他，别只说"收到"。）`
      : event.kind === 'chat'
      ? `🐟 老大在跟你说话：「${event.text ?? event.detail}」${where}\n` +
        `（**先回一句**：用 mc_companion action=say，20 字内，接他的话，` +
        `别回"收到""明白"这种空话；他要你做什么，回一句之后就去动手，做完再 say 一句结果。` +
        `不想聊就一句带过，但不要不理他。）`
      : event.kind === 'arrived'
      ? `🐟 她走到了地方。${where}\n` +
        `（下一步做什么？派活用 mc_companion action=order kind=goto x= y= z=，` +
        `或 kind=follow / halt；想说一句就 action=say。）`
      : event.kind === 'stuck'
      ? `🐟 她走不过去，卡在半路了（就在那附近，不是没动）。${where}\n` +
        `（换个办法：换目标点、用 kind=follow 让她跟过来、或者就地对准星挖东西；` +
        `实在不行 say 一句告诉他绕不开。）`
      : `🐟 ${line}。${where}\n` +
        `（缺东西先自己弄，真要问玩家就用问句。` +
        `想说就用 mc_companion action=say。）`
      + '\n\n' + talkRules(config.talkLevel)
    try {
      const controller = new AbortController()
      // 人设每次都带上（不是只注入一次）：她那条会话很长，只在开场说一遍，
      // 聊到后面"她是谁"就被上下文冲淡了。
      const persona = personaPrompt(await loadIdentity(config.identityPath))
      const head = persona === '' ? '' : persona + '\n\n'
      const sent = await promptSession(ctx, sessionId, prefix + head + prompt, controller.signal, config.hideWake === true)
      if (!sent.ok) throw new Error(sent.error)
      state.lastWake = { ok: true, sessionId: sent.sessionId, at: new Date().toTimeString().slice(0, 8) }
      log.info(`mc-companion: 已唤醒会话 ${sent.sessionId} —— ${line}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state.lastWake = { ok: false, sessionId, error: message, at: new Date().toTimeString().slice(0, 8) }
      log.warn(`mc-companion: 投递失败 ${message}`)
    }
  }
  /** 统一入口：日志和 mod 管道来的事件都走这里，活跃度判定只有一份。 */
  // 日记里写着「暂停」时，她在游戏里也不主动开口——两边得是同一只。
  const pause = { paused: false, checkedAt: 0 }
  const refreshPause = async () => {
    if (Date.now() - pause.checkedAt < 60000) return pause.paused
    pause.checkedAt = Date.now()
    const diary = await readDiary(config.diaryPath)
    if (diary.paused !== pause.paused) log.info(`mc-companion: 日记暂停状态 -> ${diary.paused}`)
    pause.paused = diary.paused
    return pause.paused
  }

  const acceptEvent = (raw) => {
    if (!raw || typeof raw !== 'object') return
    // mod 发的是 {type, name, text}，日志解析出来的是 {kind, player, detail}
    // 统一成一种形状，不然闸门和措辞层都读不到字段
    const event = {
      kind: raw.kind ?? raw.type ?? 'chat',
      player: raw.player ?? raw.name ?? '',
      detail: raw.detail ?? raw.text ?? '',
      text: raw.text ?? '',
      at: raw.at,
    }
    if (event.kind === 'inventory') {
      state.inventory = { items: raw.items ?? [], chests: raw.chests ?? [], at: Date.now() }
      return
    }
    if (event.kind === 'herinventory') {
      state.herBag = { items: raw.items ?? [], at: Date.now() }
      return
    }
    if (event.kind === 'recipes') {
      state.recipes = { item: raw.item ?? '', recipes: raw.recipes ?? [], at: Date.now() }
      return
    }
    if (event.kind === 'diag') {
      state.sawMod = true
      state.herAlive = raw.herAlive === true
      state.saveState = String(raw.saveState ?? '')
      state.modVersion = String(raw.version ?? '')
      return
    }
    if (event.kind === 'snapshot') {
      state.sawMod = true
      state.herAlive = raw.herAlive !== false
      return
    }
    if (event.kind === 'ack') {
      // mod 的回执：命令走到哪一步了。
      // 除了"最新一条"，还要留一个带序号的队列——她的自主会话和工具调用
      // 会同时发命令，只看 lastAck 的话两条回执挤在 80ms 内就会漏掉一条
      //（实测 make 就卡在"gather 没回话"）。
      const one = { what: raw.what ?? '', detail: raw.detail ?? '', at: new Date().toTimeString().slice(0, 8) }
      state.ackSeq = (state.ackSeq ?? 0) + 1
      state.lastAck = one
      state.ackLog = [...(state.ackLog ?? []), { ...one, seq: state.ackSeq }].slice(-200)
      state.acks = [...(state.acks ?? []), one].slice(-10)
      return
    }
    if (event.kind === 'plan') {
      state.plan = { item: raw.item ?? '', tree: raw.tree ?? null, at: Date.now() }
      return
    }
    if (event.kind === 'snapshot') {
      // 世界快照不是事件，单独留一份最新状态
      state.snapshot = { ...raw, at: Date.now() }
      return
    }
    // 握手/心跳不是"发生了什么"，别让它占事件位
    if (event.kind === 'hello' || event.kind === 'health') return
    // 她自己说的话会作为聊天事件回来，别让它触发下一轮
    if (event.kind === 'chat' && String(event.text).startsWith('[')) return
    if (config.respectPause && pause.paused) {
      state.pending.push({ ...event, wanted: false, reason: 'paused', at: Date.now() })
      if (state.pending.length > config.maxPending) state.pending.shift()
      return
    }
    void refreshPause()
    if (event.kind === 'arrived' || event.kind === 'stuck') {
      // 任务做完 / 走不过去 = 该决定下一步了。这是决策循环的节拍，不走随机闸门。
      const reason = event.kind === 'stuck' ? 'stuck' : 'task-done'
      state.lastVerdict = { kind: event.kind, wanted: true, reason }
      state.pending.push({ ...event, wanted: true, reason, at: Date.now() })
      if (state.pending.length > config.maxPending) state.pending.shift()
      void wake(event, { reason })
      return
    }
    if (event.kind === 'craft') {
      // 玩家在合成页点了目标：这是元指令，必须叫醒我跑完整条链
      state.lastVerdict = { kind: 'craft', wanted: true, reason: 'craft-request' }
      state.pending.push({ ...event, wanted: true, reason: 'craft-request', at: Date.now() })
      if (state.pending.length > config.maxPending) state.pending.shift()
      void wake({ ...event, kind: 'craft' }, { reason: 'craft-request' })
      return
    }
    if (event.kind === 'panel') {
      // 命令盘的动作：记下来，只有「说句话」才叫醒
      state.lastPanel = { action: raw.action ?? '', at: new Date().toTimeString().slice(0, 8) }
      state.pending.push({ ...event, wanted: raw.action === 'speak', reason: `panel:${raw.action ?? '?'}`, at: Date.now() })
      if (state.pending.length > config.maxPending) state.pending.shift()
      if (raw.action !== 'speak') return
    }
    if (event.kind === 'panel' && raw.action === 'speak') {
      // 命令盘上的「说句话」：不用挑时机，直接叫醒
      state.lastVerdict = { kind: 'panel', wanted: true, reason: 'panel' }
      void wake({ kind: 'panel', player: state.snapshot?.name ?? '' }, { reason: 'panel' })
      return
    }    if (
      event.kind === 'chat'
      && isOrder({
        text: event.text,
        names: [config.displayName, '同伴'],
        // 单机：你自己打的字就是指令，不用喊她名字
        own: event.player !== '' && event.player === state.snapshot?.name,
        singleplayer: state.snapshot?.multiplayer === false,
      })
    ) {
      // 指令不走随机闸门：你喊了就得听见
      state.lastVerdict = { kind: 'chat', wanted: true, reason: 'order' }
      state.pending.push({ ...event, wanted: true, reason: 'order', at: Date.now() })
      if (state.pending.length > config.maxPending) state.pending.shift()
      void wake(event, { reason: 'order' })
      return
    }    if (event.kind === 'death') {
      state.deaths = [...(state.deaths ?? []), Date.now()].filter((t) => Date.now() - t < 300000)
    }
    const mood = moodFor({ deathsInWindow: (state.deaths ?? []).length })
    state.lastVerdict = { kind: event.kind, player: event.player }
    const verdict = shouldSpeak({
      event,
      chattiness: config.chattiness,
      cooldownFactor: mood.cooldownFactor,
      cooldownOverride: config.cooldownMs,
      state,
    })
    state.pending.push({ ...event, wanted: verdict.speak, reason: verdict.reason, at: Date.now() })
    if (state.pending.length > config.maxPending) state.pending.shift()
    state.lastVerdict = {
      kind: event.kind,
      player: event.player,
      wanted: verdict.speak,
      reason: verdict.reason,
    }
    if (verdict.speak) {
      state.lastSpokeAt = Date.now()
      state.spokeTimes = markSpoke(state).spokeTimes
      void wake(event, verdict)
    }
  }

  void refreshPause()

  // ── 她自己提目标的节拍器：闲下来了就问她想做什么
  const goalTimer = setInterval(() => {
    // 游戏没开就别提目标：管道断了，说明她不在场
    if (!bridge?.connected) return
    // 快照必须是新鲜的，旧快照说明游戏停了
    const snap = state.snapshot
    if (!snap || !Number.isFinite(snap.at) || Date.now() - snap.at > 30000) return
    // 安静档不谈目标
    if (config.mode === 'quiet') return
    const decision = shouldPropose({
      enabled: config.autoGoal,
      busy: state.snapshot?.herBusy === true,
      lastProposedAt: state.lastProposedAt ?? 0,
      intervalMs: Number(config.goalIntervalSeconds) * 1000,
      budgetLeft: budgetLeft(state.wakeTimes, config.wakeBudgetPerHour),
    })
    if (!decision.propose) return
    state.lastProposedAt = Date.now()
    void wake({ kind: 'goal', player: state.snapshot?.name ?? '' }, { reason: 'goal' })
  }, 30000)
  ctx.effect(() => () => clearInterval(goalTimer), 'mcCompanion.goal')
  // ── mod 管道：优先用它，因为它是双向的（日志只能看不能说）
  let bridge
  if (config.bridgePort > 0) {
    bridge = createBridge({
      port: config.bridgePort,
      onEvent: acceptEvent,
      onStatus: (s) => {
        log.info(`mc-companion: 游戏管道 ${s}`)
        // 连上就把名字同步给她：她可能是自己显形的，初识只叫"同伴"
        if (s === 'connected' && bridge) {
          bridge.send({ cmd: 'rename', name: config.displayName, type: config.bodyType })
          bridge.send({
            cmd: 'rules',
            invulnerable: config.sheInvulnerable,
            dropOnDeath: config.dropOnDeath,
            revive: config.revive,
          })
        }
      },
    })
    ctx.effect(() => () => bridge.stop(), 'mcCompanion.bridge')
  }
  // ── 日志跟读：事件进队列，按活跃度决定是否标记"值得开口"
  let timer
  const tick = async () => {
    if (config.logPath === '') return
    try {
      const result = await readNewEvents({ path: config.logPath, offset: state.offset })
      state.offset = result.offset
      for (const event of result.events) acceptEvent(event)
    } catch (error) {
      log.warn(`mc-companion: 读日志失败 ${describe(error)}`)
    }
  }

  timer = setInterval(() => { void tick() }, 1000)
  ctx.effect(() => () => clearInterval(timer), 'mcCompanion.tail')

  // ── 等她开口要的材料：给了就自动接着做
  // 以前她问完就结束了，玩家把铁锭放她箱子里/丢给她也没人接着做。
  // 这里每 6 秒看一眼玩家背包，凑齐了就唤醒一次，让她继续 make。
  const requestTimer = setInterval(async () => {
    const request = state.request
    if (!request) return
    if (Date.now() - request.askedAt > 600000) {      // 10 分钟还没给，忘掉
      state.request = null
      return
    }
    if (!bridge?.connected) return
    state.inventory = null
    if (!bridge.send({ cmd: 'inventory' })) return
    const started = Date.now()
    while (Date.now() - started < 1500 && !state.inventory) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const inventory = state.inventory
    if (!inventory) return
    if (!needsSatisfied(request.needs, inventory)) return
    state.request = null
    const label = request.needs.map((n) => `${n.id}×${n.count}`).join('、')
    log.info(`mc-companion: 材料到了（${label}），叫她继续做 ${request.item}`)
    void wake({ kind: 'materials', item: request.item, detail: label }, { reason: 'materials' })
  }, 6000)
  ctx.effect(() => () => clearInterval(requestTimer), 'mcCompanion.request')

  // ── 路由：状态自查 + 设置面板
  if (ctx.webServer) {
    const json = (res, status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    const readBody = async (req) => {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 64 * 1024) throw new Error('请求体太大')
        chunks.push(chunk)
      }
      return Buffer.concat(chunks).toString('utf8')
    }
    const settingsNow = () => normalizeSettings(config, config)
    const runtimeNow = () => ({
      bridgeConnected: bridge?.connected === true,
      wakeUsed: (state.wakeTimes ?? []).filter((t) => Date.now() - t < 3600000).length,
      budgetLeft: budgetLeft(state.wakeTimes, config.wakeBudgetPerHour),
    })

    ctx.effect(() => {
      const disposers = [
        ctx.webServer.register({
          kind: 'exact',
          path: '/dsh-mc-companion/status',
          handler: async (_req, res) => {
            json(res, 200, {
              ok: true,
              chattiness: config.chattiness,
              displayName: config.displayName,
        lastAck: JSON.stringify(state.lastAck ?? null),
        lastPanel: JSON.stringify(state.lastPanel ?? null),
              cooldownMs: cooldownFor(config.chattiness),
              pending: state.pending.length,
              logPath: config.logPath,
            })
          },
        }),
        ctx.webServer.register({
          kind: 'exact',
          path: '/dsh-mc-companion/settings',
          handler: async (req, res) => {
            if (req.method === 'GET') {
              json(res, 200, {
                ok: true,
                settings: settingsNow(),
                runtime: runtimeNow(),
                sources: { persona: config.identityPath, diary: config.diaryPath },
              })
              return
            }
            if (req.method !== 'POST') {
              json(res, 405, { ok: false, error: '只接受 GET / POST' })
              return
            }
            try {
              const body = JSON.parse(await readBody(req))
              const before = config.displayName
              const beforeType = config.bodyType
              const beforeSkin = config.skinPath
              const next = normalizeSettings(body, config)
              Object.assign(config, next)
              // 名字或类型改了：实体头顶的字、身体本身都要跟着换
              if ((config.displayName !== before || config.bodyType !== beforeType) && bridge?.connected) {
                bridge.send({ cmd: 'rename', name: config.displayName, type: config.bodyType })
              }
              if (config.skinPath !== beforeSkin && bridge?.connected) {
                bridge.send({ cmd: 'skin', path: config.skinPath ?? '' })
              }
              // 规则改了：立刻推给 mod
              if (bridge?.connected) {
                bridge.send({
                  cmd: 'rules',
                  invulnerable: config.sheInvulnerable,
                  dropOnDeath: config.dropOnDeath,
                  revive: config.revive,
                })
              }
              const persisted = saveSettings(next)
              json(res, 200, {
                ok: true,
                persisted,
                settings: settingsNow(),
                runtime: runtimeNow(),
              })
            } catch (error) {
              json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
            }
          },
        }),
        // 没有斜杠 / 带 index.html 的都重定向过去，免得手输漏了斜杠
        ...['/dsh-mc-companion', '/dsh-mc-companion/index.html'].map((path) =>
          ctx.webServer.register({
            kind: 'exact',
            path,
            handler: async (_req, res) => {
              res.writeHead(302, { location: '/dsh-mc-companion/' })
              res.end()
            },
          })),
        ctx.webServer.register({
          kind: 'exact',
          path: '/dsh-mc-companion/',
          handler: async (_req, res) => {
            try {
              const html = readFileSync(PANEL_PATH)
              res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
              res.end(html)
            } catch (error) {
              res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
              res.end(`面板读不到：${error instanceof Error ? error.message : String(error)}`)
            }
          },
        }),
      ]
      return () => { for (const dispose of disposers) dispose?.() }
    }, 'mcCompanion.routes')
  }

  // ── 给 agent 的工具
  const tool = {
    name: 'mc_companion',
    description:
      '看 Minecraft 里发生了什么，或者让角色在游戏里做事。action=pending 取走最近的待处理事件（带 wanted 标记：该不该开口）；action=say 用 text 发一条游戏内消息；action=gather 让她自己找周围的树并砍（缺木头就用这个，不用问玩家）；action=craft 试着做一个东西（缺什么会直接说出来）；action=state 看 TPS/在线玩家；action=status 看插件配置与 RCON 连通性。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['pending', 'say', 'state', 'status', 'identity', 'brief', 'remember', 'wake', 'export', 'import', 'world', 'body', 'order', 'mine', 'gather', 'equip', 'place', 'plan', 'make', 'setup', 'rescue', 'deliver', 'collect', 'attack', 'inventory', 'recipe', 'craft', 'herbag'] },
        text: { type: 'string', description: 'action=say 时要发到游戏里的文字' },
        limit: { type: 'number', description: 'action=pending 时最多取几条，默认 10' },
        note: { type: 'string', description: 'action=remember 时要写进日记的一句话（需开启 diaryWrite）' },
        path: { type: 'string', description: 'action=import 时要读的迁移文件路径，留空用默认位置' },
        rel: { type: 'string', description: 'action=mine 的相对目标：under（她脚下）/ underPlayer（你脚下）/ crosshair（准星）' },
        radius: { type: 'number', description: 'action=gather 时找的目标范围（格），默认 24' },
        what: { type: 'string', enum: ['log', 'stone'], description: 'action=gather 时找什么：log 砍树（默认）/ stone 挖石头' },
        on: { type: 'boolean', description: 'action=body 时：true 生成身体，false 收回' },
        kind: { type: 'string', description: 'action=order 时：goto / halt / follow' },
        all: { type: 'boolean', description: 'action=deliver 时：true 表示把包里所有东西都给你（默认），false 只交手上那件' },
        item: { type: 'string', description: 'action=recipe 时要查的物品 id，如 minecraft:stone_pickaxe' },
        x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
    },
    async execute(args, ext) {
      state.extKeys = Object.keys(ext ?? {}).join(',')
      if (typeof ext?.sessionId === 'string' && ext.sessionId !== '') state.sessionId = ext.sessionId
      const action = args?.action ?? 'status'

      if (action === 'pending') {
        const limit = Math.max(1, Math.min(50, Number(args?.limit) || 10))
        const taken = state.pending.splice(0, limit)
        return { ok: true, count: taken.length, events: taken }
      }

      if (action === 'say') {
        const text = String(args?.text ?? '').trim()
        if (text === '') return { ok: false, error: 'text 不能为空' }
        if (bridge?.connected) {
          const sent = bridge.say(text, config.displayName)
          if (sent) return { ok: true, said: text, via: 'bridge' }
        }
        try {
          await rconCommand({ ...rconOptions(config), command: `say ${text}` })
          return { ok: true, said: text, via: 'rcon' }
        } catch (error) {
          return { ok: false, error: describe(error) }
        }
      }

      if (action === 'state') {
        try {
          const list = await rconCommand({ ...rconOptions(config), command: 'list' })
          const tps = await rconCommand({ ...rconOptions(config), command: 'tps' }).catch(() => '')
          return { ok: true, players: list.trim(), tps: tps.trim() }
        } catch (error) {
          return { ok: false, error: describe(error) }
        }
      }

      if (action === 'wake') {
        // 自检：走真实唤醒路径（含专用会话解析），返回这次投递到哪
        await wake({ kind: 'panel', player: state.snapshot?.name ?? '' }, { reason: 'self-test' })
        return { ok: state.lastWake?.ok === true, session: state.lastWake?.sessionId ?? '', error: state.lastWake?.error ?? '', ack: state.lastWake ?? null }
      }
      if (action === 'gather') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const radius = Number(args?.radius ?? 24)
        // what: log（砍树，默认）/ stone（挖石头）
        const what = String(args?.what ?? 'log').trim() === 'stone' ? 'stone' : 'log'
        state.lastAck = null
        if (!bridge.send({ cmd: 'gather', radius, what })) return { ok: false, error: '发送失败' }
        const started = Date.now()
        let ack = null
        while (Date.now() - started < 2500) {
          const seen = state.lastAck
          if (seen && String(seen.what ?? '').startsWith('gather')) {
            ack = seen
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 80))
        }
        if (!ack) return { ok: false, result: 'no-reply', detail: '游戏没回话' }
        return {
          ok: ack.what === 'gather-found',
          result: String(ack.what ?? ''),
          detail: String(ack.detail ?? ''),
          radius,
          what,
          note: ack.what === 'gather-found'
            ? (what === 'stone' ? '找到了石头，她会走过去挖（手里得有镐，不然不掉东西）' : '找到了树，她会走过去砍；砍到的东西落进她的包')
            : '',
        }
      }
      if (action === 'make') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const item = String(args?.item ?? '').trim()
        if (item === '') return { ok: false, error: 'make 需要 item，例如 minecraft:stone_pickaxe' }
        const rounds = Math.max(1, Math.min(20, Number(args?.rounds ?? 12)))

        // 等某条 ack：从 from 之后**新进队列**的回执里找。
        // 用队列而不是 lastAck —— 她的自主会话可能同时发命令，会互相覆盖。
        const waitAck = async (match, ms, from = 0) => {
          const started = Date.now()
          while (Date.now() - started < ms) {
            const hit = (state.ackLog ?? []).find((a) => a.seq > from && match(String(a.what ?? '')))
            if (hit) return hit
            await new Promise((resolve) => setTimeout(resolve, 60))
          }
          return null
        }
        const planOnce = async () => {
          state.plan = null
          if (!bridge.send({ cmd: 'plan', item })) throw new Error('发送 plan 失败')
          const started = Date.now()
          while (Date.now() - started < 3000) {
            if (state.plan && state.plan.item === item) return flattenPlan(state.plan.tree)
            await new Promise((resolve) => setTimeout(resolve, 80))
          }
          throw new Error('plan 没回话')
        }
        // 一个步骤真的落到游戏里：发命令 → 等它自己的回执
        const execStep = async (step) => {
          if (step.action === 'gather') {
            const from = state.ackSeq ?? 0
            bridge.send({ cmd: 'gather', what: step.args.what, radius: step.args.radius ?? 32 })
            const found = await waitAck((w) => w.startsWith('gather'), 8000, from)
            if (!found) return { ok: false, detail: 'gather 没回话' }
            if (found.what !== 'gather-found') return { ok: false, detail: found.detail || found.what }
            // 走过去 + 挖，可能要几十秒
            const mined = await waitAck((w) => w === 'mined' || w === 'mine-failed' || w === 'mine-need-tool'
              || w === 'mine-unreachable' || w === 'stuck', 90000, from)
            if (!mined) return { ok: false, detail: '挖了 90 秒没结果' }
            return { ok: mined.what === 'mined', detail: mined.detail || '' }
          }
          if (step.action === 'craft') {
            const from = state.ackSeq ?? 0
            bridge.send({ cmd: 'craft', item: step.args.item })
            const ack = await waitAck((w) => w.startsWith('craft'), 15000, from)
            if (!ack) return { ok: false, detail: 'craft 没回话' }
            return { ok: ack.what === 'crafted', detail: ack.detail || '' }
          }
          if (step.action === 'smelt') {
            // 烧炼：要熔炉、要燃料、要时间。没熔炉就自己做一个放下再烧一次。
            const doSmelt = async () => {
              const from = state.ackSeq ?? 0
              bridge.send({ cmd: 'smelt', item: step.args.item, count: step.args.count ?? 1 })
              const ack = await waitAck((w) => w.startsWith('smelt'), 8000, from)
              return ack
            }
            let ack = await doSmelt()
            if (!ack) return { ok: false, detail: 'smelt 没回话' }
            if (ack.what === 'smelt-no-furnace') {
              // 自己做熔炉：8 圆石（3×3，会自己放工作台）
              const craftFrom = state.ackSeq ?? 0
              bridge.send({ cmd: 'craft', item: 'minecraft:furnace' })
              const crafted = await waitAck((w) => w.startsWith('craft'), 15000, craftFrom)
              if (!crafted || crafted.what !== 'crafted') {
                return { ok: false, detail: `熔炉也做不出来：${crafted?.detail ?? '没回话'}` }
              }
              const placeFrom = state.ackSeq ?? 0
              bridge.send({ cmd: 'place', item: 'minecraft:furnace' })
              const placed = await waitAck((w) => w.startsWith('place'), 5000, placeFrom)
              if (!placed || placed.what !== 'placed') {
                return { ok: false, detail: `熔炉放不下：${placed?.detail ?? '没回话'}` }
              }
              ack = await doSmelt()
              if (!ack) return { ok: false, detail: '放了熔炉，但再烧一次没回话' }
            }
            if (ack.what === 'smelting') {
              // 等它烧完（每件 10 秒，最多 60 秒 + 余量）
              const done = await waitAck((w) => w === 'smelted' || w.startsWith('smelt-'), 75000, state.ackSeq ?? 0)
              if (!done) return { ok: false, detail: '烧了 75 秒没出锭' }
              return { ok: done.what === 'smelted', detail: done.detail || '' }
            }
            return { ok: ack.what === 'smelted', detail: ack.detail || ack.what }
          }
          if (step.action === 'equip') {
            const from = state.ackSeq ?? 0
            bridge.send({ cmd: 'equip', item: step.args.item })
            const ack = await waitAck((w) => w.startsWith('equip'), 4000, from)
            if (!ack) return { ok: false, detail: 'equip 没回话' }
            return { ok: ack.what === 'equipped', detail: ack.detail || '' }
          }
          return { ok: false, detail: `不认识的步骤 ${step.action}` }
        }

        const result = await runMake({ plan: planOnce, exec: execStep, maxRounds: rounds })
        // 缺她搞不到的材料：开口问，并记下"在等什么"。
        // 以前这里是"停住把问题交回模型"，模型说完就结束了，材料到了也没人接着做。
        if (!result.done && (result.asks ?? []).length > 0) {
          const needs = parseNeeds(result.asks)
          if (needs.length > 0) {
            state.request = { item, needs, askedAt: Date.now(), did: result.did }
            if (bridge?.connected) bridge.say(buildQuestion(needs, item), config.displayName)
            return {
              ok: false,
              waiting: true,
              item,
              need: needs.map((n) => `${n.id}×${n.count}`),
              did: result.did,
              error: '',
              note: '已经在游戏里用问句问玩家了；他给了材料会自动接着做',
            }
          }
        }
        return {
          ok: result.done,
          item,
          done: result.done,
          rounds: result.rounds,
          did: result.did,
          asks: result.asks,
          error: result.done ? '' : result.lastError,
        }
      }
      if (action === 'setup') {
        // 让玩家的 AI 自己查状态、自己教人装
        const info = buildSetup({
          root: pluginRoot,
          bridgeConnected: bridge?.connected === true,
          herAlive: state.herAlive === true,
          modReported: state.sawMod === true,
          saveStateLoaded: state.saveState !== '',
        })
        return { ok: true, ...info }
      }
      if (action === 'plan') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const item = String(args?.item ?? '').trim()
        if (item === '') return { ok: false, error: 'plan 需要 item，例如 minecraft:stone_pickaxe' }
        state.plan = null
        if (!bridge.send({ cmd: 'plan', item })) return { ok: false, error: '发送失败' }
        const started = Date.now()
        let data = null
        while (Date.now() - started < 3000) {
          if (state.plan && state.plan.item === item) { data = state.plan; break }
          await new Promise((resolve) => setTimeout(resolve, 80))
        }
        if (!data) return { ok: false, item, error: '游戏没回话（mod 是旧版本？）' }
        const { steps, asks } = flattenPlan(data.tree)
        return {
          ok: true,
          item,
          steps: steps.map((step) => `${step.action} ${Object.entries(step.args).map(([k, v]) => `${k}=${v}`).join(' ')}`.trim()),
          asks,
          guide: describePlan(steps, asks),
        }
      }
      if (action === 'rescue') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        state.lastAck = null
        if (!bridge.send({ cmd: 'rescue' })) return { ok: false, error: '发送失败' }
        const started = Date.now()
        while (Date.now() - started < 2000) {
          const seen = state.lastAck
          if (seen && /^rescue/.test(String(seen.what ?? ''))) {
            return { ok: true, result: String(seen.what), detail: String(seen.detail ?? '') }
          }
          await new Promise((resolve) => setTimeout(resolve, 80))
        }
        return { ok: false, result: 'no-reply', detail: '游戏没回话' }
      }
      if (action === 'place') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const item = String(args?.item ?? '').trim()
        if (item === '') return { ok: false, error: 'place 需要 item（她包里的方块 id）' }
        state.lastAck = null
        if (!bridge.send({ cmd: 'place', item })) return { ok: false, error: '发送失败' }
        const started = Date.now()
        let ack = null
        while (Date.now() - started < 2500) {
          const seen = state.lastAck
          if (seen && /^(placed|place-)/.test(String(seen.what ?? ''))) {
            ack = seen
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 80))
        }
        if (!ack) return { ok: false, result: 'no-reply', detail: '游戏没回话' }
        return { ok: ack.what === 'placed', result: String(ack.what ?? ''), detail: String(ack.detail ?? '') }
      }
      if (action === 'equip') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const item = String(args?.item ?? '').trim()
        if (item === '') return { ok: false, error: 'equip 需要 item（包里的物品 id），卸下用 item=none' }
        state.lastAck = null
        if (!bridge.send({ cmd: 'equip', item })) return { ok: false, error: '发送失败' }
        const started = Date.now()
        let ack = null
        while (Date.now() - started < 2500) {
          const seen = state.lastAck
          if (seen && String(seen.what ?? '').startsWith('equip')) {
            ack = seen
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 80))
        }
        if (!ack) return { ok: false, result: 'no-reply', detail: '游戏没回话' }
        return { ok: ack.what === 'equipped', result: String(ack.what ?? ''), detail: String(ack.detail ?? '') }
      }
      if (action === 'deliver') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const all = args?.all !== false
        state.lastAck = null
        if (!bridge.send({ cmd: 'deliver', all })) return { ok: false, error: '发送失败' }
        // 要等她走过去，最多等 15 秒
        const started = Date.now()
        let ack = null
        while (Date.now() - started < 15000) {
          const seen = state.lastAck
          if (seen && /^deliver(ed|-stuck|-no-companion)?$/.test(String(seen.what ?? ''))) {
            ack = seen
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        if (!ack) return { ok: false, result: 'no-reply', detail: '15 秒内没送到（她可能路被挡了）' }
        return {
          ok: ack.what === 'delivered',
          result: String(ack.what ?? ''),
          detail: String(ack.detail ?? ''),
        }
      }
      if (action === 'craft') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const item = String(args?.item ?? '').trim()
        if (item === '') return { ok: false, error: 'craft 需要 item，例如 minecraft:stick' }
        // 等回执再返回：不然后面那个模型以为"发出去了=做好了"，
        // 玩家看到的就是"合成任务没被执行"
        state.lastAck = null
        if (!bridge.send({ cmd: 'craft', item })) return { ok: false, error: '发送失败' }
        const started = Date.now()
        let ack = null
        while (Date.now() - started < 2500) {
          const seen = state.lastAck
          if (seen && String(seen.what ?? '').startsWith('craft')) {
            ack = seen
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 80))
        }
        if (!ack) return { ok: false, item, result: 'no-reply', detail: '游戏没回话（mod 是不是旧版本？）' }
        return {
          ok: ack.what === 'crafted',
          item,
          result: String(ack.what ?? ''),
          detail: String(ack.detail ?? ''),
        }
      }

      if (action === 'inventory' || action === 'recipe') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const waitFor = async (read, ms = 1500) => {
          const started = Date.now()
          while (Date.now() - started < ms) {
            const value = read()
            if (value) return value
            await new Promise((resolve) => setTimeout(resolve, 80))
          }
          return null
        }
        if (action === 'inventory') {
          state.inventory = null
          if (!bridge.send({ cmd: 'inventory' })) return { ok: false, error: '发送失败' }
          const data = await waitFor(() => state.inventory)
          if (!data) return { ok: false, error: '游戏没回话（mod 是不是旧版本？）' }
          return { ok: true, items: data.items, chests: data.chests, chestCount: data.chests.length }
        }
        const item = String(args?.item ?? '').trim()
        if (item === '') return { ok: false, error: 'recipe 需要 item，例如 minecraft:stone_pickaxe' }
        state.recipes = null
        if (!bridge.send({ cmd: 'recipe', item })) return { ok: false, error: '发送失败' }
        const data = await waitFor(() => state.recipes)
        if (!data) return { ok: false, error: '游戏没回话（mod 是不是旧版本？）' }
        return { ok: true, item: data.item, recipes: data.recipes }
      }
      if (action === 'collect' || action === 'attack') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const sent = bridge.send({ cmd: action })
        return { ok: sent, action, note: action === 'collect' ? '把她 8 格内的掉落物收进你背包' : '打她 4 格内的敌对生物' }
      }
      if (action === 'herbag') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        state.herBag = null
        if (!bridge.send({ cmd: 'herbag' })) return { ok: false, error: '发送失败' }
        const started = Date.now()
        while (Date.now() - started < 1500 && !state.herBag) {
          await new Promise((r) => setTimeout(r, 80))
        }
        return state.herBag ? { ok: true, items: state.herBag.items } : { ok: false, error: '她没回话' }
      }

      if (action === 'mine') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const x = Number(args?.x), y = Number(args?.y), z = Number(args?.z)
        if (![x, y, z].every((n) => Number.isInteger(n))) return { ok: false, error: 'mine 需要整数 x/y/z' }
        // 距离由 mod 判断：远了它会自己走过去再挖
        const rel = String(args?.rel ?? '').trim()
        if (rel !== '') return { ok: bridge.send({ cmd: 'mine', rel }), mine: { rel } }
        return { ok: bridge.send({ cmd: 'mine', x, y, z }), mine: { x, y, z } }
      }
      if (action === 'order') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上（mod 没装或游戏没进存档）。调 action=setup 拿安装步骤，用中文一步步教他。' }
        const kind = String(args?.kind ?? '')
        if (kind === 'halt') {
          return { ok: bridge.send({ cmd: 'halt' }), order: 'halt' }
        }
        if (kind === 'follow') {
          const on = args?.on !== false
          const distance = followDistanceFor(config.preference)
          return { ok: bridge.send({ cmd: 'follow', on, distance }), order: 'follow', follow: on, distance }
        }
        if (kind !== 'goto') return { ok: false, error: 'kind 只能是 goto / halt / follow' }
        const x = Number(args?.x), y = Number(args?.y), z = Number(args?.z)
        if (![x, y, z].every((n) => Number.isFinite(n))) return { ok: false, error: 'goto 需要数字 x/y/z' }
        return { ok: bridge.send({ cmd: 'goto', x, y, z }), order: 'goto', target: { x, y, z } }
      }
      if (action === 'body') {
        if (!bridge?.connected) return { ok: false, error: '管道没连上，先确认游戏开着' }
        const on = args?.on === true
        config.bodyOn = on
        const sent = bridge.send({
          cmd: 'body',
          on,
          name: config.displayName,
          type: config.bodyType,
        })
        return {
          ok: sent,
          body: on ? '已生成' : '已收回',
          type: config.bodyType,
          name: config.displayName,
          note: on ? '需要世界允许作弊（op），否则命令会被服务端拒绝' : '',
        }
      }
      if (action === 'world') {
        const snap = state.snapshot
        if (!snap) return { ok: false, error: '还没有快照：游戏要开着，且 mod 是带 snapshot 的版本' }
        const ageSec = Math.round((Date.now() - snap.at) / 1000)
        return {
          ok: true,
          ageSeconds: ageSec,
          dimension: snap.dimension ?? '',
          position: `${snap.x ?? '?'}, ${snap.y ?? '?'}, ${snap.z ?? '?'}`,
          health: snap.health ?? null,
          food: snap.food ?? null,
          held: snap.held ?? '',
          timeOfDay: snap.timeOfDay ?? null,
          raining: snap.raining === true,
          onGround: snap.onGround === true,
          sprinting: snap.sprinting === true,
          sneaking: snap.sneaking === true,
          her: snap.herPresent
            ? {
                present: true,
                position: `${snap.herX ?? '?'}, ${snap.herY ?? '?'}, ${snap.herZ ?? '?'}`,
                busy: snap.herBusy === true,
                distance: snap.herDistance ?? null,
                ticks: snap.herTicks ?? null,
                speed: snap.herSpeed ?? null,
                idle: snap.herIdle === true,
              }
            : { present: false },
        }
      }
      if (action === 'export') {
        const identity = await loadIdentity(config.identityPath)
        const diary = await readDiary(config.diaryPath)
        const bundle = buildBundle({
          identity,
          wantToSay: diary.wantToSay,
          paused: diary.paused,
          settings: settingsNow(),
        })
        const target = join(homedir(), '.dsh', 'mc-companion-memory.json')
        try {
          mkdirSync(join(homedir(), '.dsh'), { recursive: true })
          writeFileSync(target, JSON.stringify(bundle, null, 2), 'utf8')
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
        return { ok: true, path: target, name: bundle.identity.name, thoughts: bundle.recentThoughts.length }
      }

      if (action === 'import') {
        const source = String(args?.path ?? '').trim() || join(homedir(), '.dsh', 'mc-companion-memory.json')
        let text
        try {
          text = readFileSync(source, 'utf8')
        } catch (error) {
          return { ok: false, error: `读不到 ${source}` }
        }
        const parsed = parseBundle(text)
        if (!parsed.ok) return { ok: false, error: parsed.error }
        const personaTarget = join(homedir(), '.dsh', 'companion.json')
        const diaryTarget = join(homedir(), '.dsh', 'companion-diary.md')
        const wrote = []
        if (existsSync(personaTarget) || existsSync(diaryTarget)) {
          return { ok: false, error: '已存在 companion.json 或 companion-diary.md，不覆盖', skipped: true }
        }
        writeFileSync(personaTarget, JSON.stringify(bundleToPersonaConfig(parsed.bundle), null, 2), 'utf8')
        writeFileSync(diaryTarget, bundleToDiary(parsed.bundle), 'utf8')
        wrote.push(personaTarget, diaryTarget)
        config.identityPath = personaTarget
        config.diaryPath = diaryTarget
        return { ok: true, name: parsed.bundle.identity.name, wrote }
      }
      if (action === 'identity') {
        const id = await loadIdentity(config.identityPath)
        const diary = await readDiary(config.diaryPath)
        return { ok: true, ...id, diaryPaused: diary.paused, recentSaid: diary.wantToSay.slice(-3) }
      }

      if (action === 'brief') {
        const id = await loadIdentity(config.identityPath)
        const diary = await readDiary(config.diaryPath)
        return {
          ok: true,
          identity: id,
          recentEvents: state.pending.slice(-5),
          diary: { paused: diary.paused, wantToSay: diary.wantToSay.slice(-3) },
          chattiness: config.chattiness,
        displayName: config.displayName,
        lastAck: JSON.stringify(state.lastAck ?? null),
        lastPanel: JSON.stringify(state.lastPanel ?? null),
        }
      }

      if (action === 'remember') {
        if (!config.diaryWrite) return { ok: false, error: 'diaryWrite 没开，不写日记（改配置里的 diaryWrite: true）' }
        const note = String(args?.note ?? '').trim()
        if (note === '') return { ok: false, error: 'note 不能为空' }
        const wrote = await appendNote(config.diaryPath, `${localDate()} ${note}`)
        return { ok: wrote, wrote: note, path: config.diaryPath }
      }

      const probe = await probeRcon(rconOptions(config))
      // 只回扁平的基本类型：嵌套对象/undefined 会被宿主判成「非无损 JSON」
      return {
        ok: true,
        chattiness: config.chattiness,
        displayName: config.displayName,
        lastAck: JSON.stringify(state.lastAck ?? null),
        lastPanel: JSON.stringify(state.lastPanel ?? null),
        cooldownMs: cooldownFor(config.chattiness),
        logPath: config.logPath,
        bridgePort: config.bridgePort,
        bridgeConnected: bridge?.connected === true,
        sessionId: state.sessionId ?? '',
        resolvedSession: await newestSessionId(),
        lastVerdict: JSON.stringify(state.lastVerdict ?? null),
        lastWake: JSON.stringify(state.lastWake ?? null),
        extKeys: state.extKeys ?? '',
        controllerKeys: Object.keys(ctx.sessionController ?? {}).join(','),
        stateKeys: Object.keys(ctx.sessionController?.stateController ?? {}).join(','),
        agentKeys: Object.keys(ctx.sessionController?.agents ?? {}).join(','),
        rconOk: probe.ok === true,
        rconError: typeof probe.error === 'string' ? probe.error : '',
      }
    },
  }

  return ctx.effect(() => ctx.tools.register(tool), 'mcCompanion.tool')
}


/**
 * 找到「最近在活动的会话」。
 *
 * DSH 没把当前会话 id 交给插件，所以直接看磁盘：
 * ~/.dsh/sessions/<group>/session-<uuid>/session.v4.jsonl.zstd 的最新修改时间。
 */
async function newestSessionId() {
  const root = join(homedir(), '.dsh', 'sessions')
  let best = null
  for (const group of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!group.isDirectory()) continue
    const groupPath = join(root, group.name)
    for (const session of await readdir(groupPath, { withFileTypes: true }).catch(() => [])) {
      if (!session.isDirectory() || !session.name.startsWith('session-')) continue
      const file = join(groupPath, session.name, 'session.v4.jsonl.zstd')
      try {
        const info = await stat(file)
        if (!best || info.mtimeMs > best.mtime) best = { mtime: info.mtimeMs, id: session.name.slice(8) }
      } catch { /* 跳过没有日志的会话 */ }
    }
  }
  return best?.id ?? ''
}

/** 会话 id 有两种写法（裸 uuid / session- 前缀），挨个试。 */
async function promptSession(ctx, id, text, signal, hidden = false) {
  const forms = [id, id.startsWith('session-') ? id : `session-${id}`]
  let lastError
  for (const form of forms) {
    try {
      const request = {
        sessionId: form,
        mode: 'queue',                       // 会话忙就排队，别直接拒
        requestId: `mc-companion-${Date.now()}`,
        content: [{ type: 'text', text }],
      }
      // 实验：控制器若不认这个字段会忽略，认了就不显示那条消息
      if (hidden) request.hidden = true
      await ctx.sessionController.prompt(request, signal)
      return { ok: true, sessionId: form }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return { ok: false, error: lastError }
}
function localDate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function rconOptions(config) {
  return { host: config.host, port: config.rconPort, password: config.rconPassword }
}

function normalize(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const out = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) {
    const value = input[key]
    if (typeof DEFAULTS[key] === 'number' && typeof value === 'number' && Number.isFinite(value)) out[key] = value
    if (typeof DEFAULTS[key] === 'string' && typeof value === 'string') out[key] = value
    if (typeof DEFAULTS[key] === 'boolean' && typeof value === 'boolean') out[key] = value
  }
  out.chattiness = Math.max(0, Math.min(100, out.chattiness))
  return out
}

function renderResult(value) {
  if (!value || typeof value !== 'object') return String(value)
  if (Array.isArray(value.events)) {
    if (value.events.length === 0) return '没有待处理事件。'
    return value.events
      .map((e) => `${e.time ?? ''} ${e.player ?? ''} ${e.kind}${e.detail ? ` · ${e.detail}` : ''}${e.text ? ` · ${e.text}` : ''}${e.wanted ? '  ← 该开口' : ''}`)
      .join('\n')
  }
  return Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n')
}

function describe(error) {
  return error instanceof Error ? error.message : String(error)
}
