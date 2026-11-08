/**
 * 大肥鱼 · 设置在 harness 里的一整页。
 *
 * 形状照 bili-whale（「设置 → 养鱼」那一页）：
 *   注册 settings.section 槽，左侧导航就多一项。
 *
 * 数据走宿主接口：GET/POST /dsh-mc-companion/settings
 * 任何一步失败都只让这一页显示错误，不拖宿主。
 */
window.__mcCompanionLoaded = false
window.__mcCompanionError = ''

window.__ModuleLoader__.load({
  id: 'dsh-mc-companion',
  factory: (require) => {
    const module = { exports: {} }
    window.__mcCompanionLoaded = true

    const NS = 'mc-companion'
    const ENDPOINT = '/dsh-mc-companion/settings'

    const S = {
      page: { display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 620, padding: '4px 0 40px' },
      head: { display: 'flex', flexDirection: 'column', gap: 4 },
      title: { fontSize: 16, fontWeight: 650 },
      sub: { fontSize: 12, opacity: 0.6, lineHeight: 1.6 },
      row: { display: 'flex', flexDirection: 'column', gap: 7 },
      label: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
      name: { fontSize: 13, fontWeight: 600 },
      val: { fontSize: 12, fontVariantNumeric: 'tabular-nums', opacity: 0.7 },
      hint: { fontSize: 11.5, opacity: 0.55, lineHeight: 1.55 },
      input: {
        width: '100%',
        padding: '7px 10px',
        fontSize: 13,
        borderRadius: 7,
        border: '1px solid rgba(127,127,127,.35)',
        background: 'transparent',
        color: 'inherit',
        fontFamily: 'inherit',
      },
      modes: { display: 'flex', flexDirection: 'column', gap: 6 },
      mode: {
        display: 'flex',
        gap: 9,
        alignItems: 'flex-start',
        padding: '9px 11px',
        borderRadius: 8,
        border: '1px solid rgba(127,127,127,.25)',
        cursor: 'pointer',
      },
      modeOn: { borderColor: 'var(--dsh-accent, #4d6bfe)' },
      modeT: { fontSize: 12.5, fontWeight: 600 },
      modeD: { fontSize: 11.5, opacity: 0.6, lineHeight: 1.45 },
      foot: { display: 'flex', alignItems: 'center', gap: 12 },
      btn: {
        padding: '7px 18px',
        fontSize: 12.5,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: 7,
        border: 0,
        cursor: 'pointer',
        color: '#fff',
        background: 'var(--dsh-accent, #4d6bfe)',
      },
      muted: { fontSize: 11.5, opacity: 0.55 },
      bad: { fontSize: 11.5, color: '#c2410c' },
    }

    const MODES = [
      ['speak', '让她自己说', '唤醒会话，由模型现编一句。会多一条对话消息，也最花钱。'],
      ['template', '念短句', '从内置短句里挑一句发进游戏。免费、即时，但不是在思考。'],
      ['quiet', '安静', '只记录事件，不说话。'],
    ]

    // 四个档位：点一下就把下面这些参数一起改掉，之后还能单独微调。
    // （客户端 bundle 不能 import 本地模块，所以这份表和 lib/level.mjs 保持一致）
    const LEVELS = [
      {
        id: 'quiet',
        title: '安静',
        detail: '只记录，不说话也不行动。',
        cost: '不花钱',
        set: { mode: 'quiet', autoGoal: false, goalIntervalSeconds: 600, chattiness: 30, wakeBudgetPerHour: 0 },
      },
      {
        id: 'companion',
        title: '陪伴',
        detail: '在游戏里念短句、跟着你走。不调用模型。',
        cost: '免费',
        set: { mode: 'template', autoGoal: false, goalIntervalSeconds: 600, chattiness: 55, wakeBudgetPerHour: 0 },
      },
      {
        id: 'partner',
        title: '伙伴',
        detail: '你死了、喊她名字、她到了地方，才叫醒模型。',
        cost: '低',
        set: { mode: 'speak', autoGoal: false, goalIntervalSeconds: 300, chattiness: 45, wakeBudgetPerHour: 8 },
      },
      {
        id: 'autonomous',
        title: '自主',
        detail: '闲下来会自己提目标、自己走过去。',
        cost: '高',
        set: { mode: 'speak', autoGoal: true, goalIntervalSeconds: 120, chattiness: 60, wakeBudgetPerHour: 20 },
      },
    ]

    function Row(props) {
      return null
    }

    function buildPanel(React) {
      const h = React.createElement
      const { useState, useEffect, useCallback } = React

      function Slider(props) {
        return h(
          'div',
          { style: S.row },
          h(
            'div',
            { style: S.label },
            h('span', { style: S.name }, props.title),
            h('span', { style: S.val }, props.value),
          ),
          h('input', {
            type: 'range',
            min: props.min,
            max: props.max,
            step: props.step,
            value: props.value2,
            style: { width: '100%' },
            onChange: (e) => props.onChange(Number(e.target.value)),
          }),
          props.hint ? h('div', { style: S.hint }, props.hint) : null,
        )
      }

      return function Panel() {
        const [state, setState] = useState(null)
        const [note, setNote] = useState('')
        const [failed, setFailed] = useState(false)
        const [saving, setSaving] = useState(false)

        const load = useCallback(async () => {
          try {
            const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
            const data = await res.json()
            if (data && data.ok) setState({ ...data.settings, runtime: data.runtime || {}, sources: data.sources || {} })
            else setNote('接口没有返回设置')
          } catch (error) {
            setFailed(true)
            setNote(`读不到设置：${(error && error.message) || '未知错误'}`)
          }
        }, [])

        useEffect(() => {
          void load()
        }, [load])

        if (!state) {
          return h('div', { style: failed ? S.bad : S.muted }, note || '读取中…')
        }

        const patch = (key, value) => setState((prev) => ({ ...prev, [key]: value }))
        const rt = state.runtime || {}
        const cooldownSec = Math.round((state.cooldownMs || 0) / 1000)

        const save = async () => {
          setSaving(true)
          setFailed(false)
          setNote('')
          try {
            const res = await fetch(ENDPOINT, {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({
                chattiness: state.chattiness,
                cooldownMs: state.cooldownMs,
                wakeBudgetPerHour: state.wakeBudgetPerHour,
                displayName: state.displayName,
                mode: state.mode,
                hideWake: state.hideWake,
                respectPause: state.respectPause,
                personaFile: state.personaFile || '',
                diaryFile: state.diaryFile || '',
                level: state.level,
                preference: state.preference,
                preferenceCustom: state.preferenceCustom || '',
                talkLevel: state.talkLevel || 'normal',
                revive: state.revive === true,
                sheInvulnerable: state.sheInvulnerable !== false,
                dropOnDeath: state.dropOnDeath === true,
                autoGoal: state.autoGoal === true,
                goalIntervalSeconds: state.goalIntervalSeconds,
              }),
            })
            const data = await res.json()
            if (!data || !data.ok) throw new Error((data && data.error) || '保存失败')
            setState({ ...data.settings, runtime: data.runtime || {} })
            setNote(data.persisted ? '已保存' : '已生效，但写盘失败')
          } catch (error) {
            setFailed(true)
            setNote((error && error.message) || '保存失败')
          } finally {
            setSaving(false)
          }
        }

        return h(
          'div',
          { style: S.page },
          h(
            'div',
            { style: S.head },
            h('div', { style: S.title }, '大肥鱼'),
            h(
              'div',
              { style: S.sub },
              '她在游戏里说什么、多久说一次、叫自己什么。改完点保存，立刻生效。',
            ),
          ),
          h(
            'div',
            { style: S.row },
            h('div', { style: S.label }, h('span', { style: S.name }, '档位')),
            h(
              'div',
              { style: S.modes },
              LEVELS.map((lv) =>
                h(
                  'label',
                  {
                    key: lv.id,
                    style: state.level === lv.id ? { ...S.mode, ...S.modeOn } : S.mode,
                    onClick: () => setState((prev) => ({ ...prev, ...lv.set, level: lv.id })),
                  },
                  h('input', {
                    type: 'radio',
                    name: 'mc-companion-level',
                    checked: state.level === lv.id,
                    onChange: () => setState((prev) => ({ ...prev, ...lv.set, level: lv.id })),
                  }),
                  h(
                    'span',
                    null,
                    h('div', { style: S.modeT }, `${lv.title} · ${lv.cost}`),
                    h('div', { style: S.modeD }, lv.detail),
                  ),
                ),
              ),
            ),
            h('div', { style: S.hint }, '选一档会把下面的参数一起改掉，之后还能单独微调。'),
          ),
          h(
            'div',
            { style: S.row },
            h('div', { style: S.label }, h('span', { style: S.name }, '她的性子')),
            h(
              'div',
              { style: S.modes },
              [
                ['company', '黏人', '喜欢待在你附近，看你做事，偶尔说一句。'],
                ['build', '喜欢建筑', '会主动攒材料，想找地方搭点东西。'],
                ['gather', '喜欢采集', '爱挖矿、爱捡东西，看到材料就想收。'],
                ['explore', '爱探险', '喜欢往没去过的地方走。'],
                ['guard', '守着', '待在你附近，把靠过来的敌人打掉。'],
                ['custom', '自定义', '你自己写一句话决定她想干什么。'],
              ].map(([id, title, detail]) =>
                h(
                  'label',
                  {
                    key: id,
                    style: state.preference === id ? { ...S.mode, ...S.modeOn } : S.mode,
                    onClick: () => patch('preference', id),
                  },
                  h('input', {
                    type: 'radio',
                    name: 'mc-companion-pref',
                    checked: state.preference === id,
                    onChange: () => patch('preference', id),
                  }),
                  h(
                    'span',
                    null,
                    h('div', { style: S.modeT }, title),
                    h('div', { style: S.modeD }, detail),
                  ),
                ),
              ),
            ),
            h('div', { style: S.hint }, '她闲下来自己找事做时，会照这个性子来。'),
            // 选了「自定义」才出现的一句话：直接进提示词
            state.preference === 'custom'
              ? h(
                'div',
                { style: { marginTop: 8 } },
                h('input', {
                  type: 'text',
                  value: state.preferenceCustom ?? '',
                  placeholder: '比如：喜欢在夜里钓鱼，白天修路，不爱下矿',
                  maxLength: 300,
                  style: { width: '100%', padding: '6px 8px', boxSizing: 'border-box' },
                  onInput: (event) => setState((prev) => ({ ...prev, preferenceCustom: event.target.value })),
                  onChange: (event) => patch('preferenceCustom', event.target.value),
                }),
                h('div', { style: S.hint }, '这句话会原样进她的提示词；留空就是"按自己的判断来"。'),
              )
              : null,
          ),
          // ── 话量：控制"她多爱说话"（改提示词，不是改数字）
          h(
            'div',
            { style: S.row },
            h('div', { style: S.label }, h('span', { style: S.name }, '话量')),
            h(
              'div',
              { style: S.modes },
              [
                ['quiet', '话少', '能不说就不说，只在被问到或做完事时开口'],
                ['normal', '正常', '被问到要回，做完说一句结果'],
                ['chatty', '话多', '每件事都能接一句，闲着也说说自己在干什么'],
              ].map(([id, title, detail]) =>
                h(
                  'label',
                  {
                    key: id,
                    style: state.talkLevel === id ? { ...S.mode, ...S.modeOn } : S.mode,
                    onClick: () => patch('talkLevel', id),
                  },
                  h('input', {
                    type: 'radio',
                    name: 'mc-companion-talk',
                    checked: (state.talkLevel || 'normal') === id,
                    onChange: () => patch('talkLevel', id),
                  }),
                  h(
                    'span',
                    null,
                    h('div', { style: S.modeT }, title),
                    h('div', { style: S.modeD }, detail),
                  ),
                ),
              ),
            ),
            h('div', { style: S.hint }, '这一项改的是提示词里"说不说、说多长"，比调预算更直接。'),
          ),
          // ── 游戏内的规则（折叠）
          h(
            'div',
            { style: { ...S.row, borderTop: '1px solid rgba(127,127,127,.2)', paddingTop: 14 } },
            h(
              'div',
              {
                style: { ...S.label, cursor: 'pointer' },
                onClick: () => setState((prev) => ({ ...prev, showRules: !prev.showRules })),
              },
              h('span', { style: S.name }, `${state.showRules ? '▾' : '▸'} 游戏内的规则`),
              h('span', { style: S.muted }, '每个存档只生成一个她'),
            ),
            state.showRules
              ? h(
                  'div',
                  { style: { ...S.modes, marginTop: 8 } },
                  [
                    ['revive', '死了会复活', '她倒下 3 秒后自己回来；关掉就再也不出现。'],
                    ['sheInvulnerable', '不会被打死', '关掉之后她会受伤、会死——配合"复活"用。'],
                    ['dropOnDeath', '死亡时掉落背包', '关掉的话她的东西留在包里，复活后还在。'],
                  ].map(([key, title, detail]) =>
                    h(
                      'label',
                      {
                        key,
                        style: state[key] ? { ...S.mode, ...S.modeOn } : S.mode,
                        onClick: () => patch(key, !state[key]),
                      },
                      h('input', { type: 'checkbox', checked: state[key] === true, onChange: () => patch(key, !state[key]) }),
                      h('span', null, h('div', { style: S.modeT }, title), h('div', { style: S.modeD }, detail)),
                    ),
                  ),
                )
              : null,
          ),
          h(Slider, {
            title: '对话活跃度',
            value: String(state.chattiness),
            value2: state.chattiness,
            min: 0,
            max: 100,
            step: 1,
            onChange: (v) => patch('chattiness', v),
            hint: '0 完全不说话，100 大概每 8 秒就肯开口。冷却时间由它推算。',
          }),
          h(Slider, {
            title: '冷却覆盖',
            value: cooldownSec ? `${cooldownSec} 秒` : '自动',
            value2: Math.min(300, cooldownSec),
            min: 0,
            max: 300,
            step: 5,
            onChange: (v) => patch('cooldownMs', v * 1000),
            hint: '0 = 由活跃度决定；设成具体秒数就强制用它。',
          }),
          h(Slider, {
            title: '每小时最多叫醒几次',
            value: state.wakeBudgetPerHour === 0 ? '不叫醒' : `${state.wakeBudgetPerHour} 次`,
            value2: state.wakeBudgetPerHour,
            min: 0,
            max: 100,
            step: 1,
            onChange: (v) => patch('wakeBudgetPerHour', v),
            hint: '花销上限：超了只记账不开口。每次唤醒都是一次完整的模型调用。',
          }),
          h(
            'div',
            { style: S.row },
            h('div', { style: S.label }, h('span', { style: S.name }, '显示名称')),
            h('input', {
              type: 'text',
              maxLength: 24,
              value: state.displayName,
              style: S.input,
              onChange: (e) => patch('displayName', e.target.value),
            }),
            h('div', { style: S.hint }, '游戏里显示成 [这个名字] 内容，不会占用你的 ID。'),
          ),
          h(
            'div',
            { style: S.row },
            h('div', { style: S.label }, h('span', { style: S.name }, '人设文件')),
            h('input', {
              type: 'text',
              value: state.personaFile || '',
              placeholder: '留空 = 自动在本机找',
              style: S.input,
              onChange: (e) => patch('personaFile', e.target.value),
            }),
            h(
              'div',
              { style: S.hint },
              `当前读取：${(state.sources && state.sources.persona) || '未找到，用中性默认'}`,
            ),
          ),
          h(
            'div',
            { style: S.row },
            h('div', { style: S.label }, h('span', { style: S.name }, '日记文件')),
            h('input', {
              type: 'text',
              value: state.diaryFile || '',
              placeholder: '留空 = 自动在本机找',
              style: S.input,
              onChange: (e) => patch('diaryFile', e.target.value),
            }),
            h(
              'div',
              { style: S.hint },
              `当前读取：${(state.sources && state.sources.diary) || '未找到日记'}`,
            ),
          ),
          // ── 自定义皮肤：一张 64×64 的 png，填路径立刻换（不用重启游戏）
          h(
            'div',
            { style: S.row },
            h('div', { style: S.label }, h('span', { style: S.name }, '她的皮肤')),
            h('input', {
              type: 'text',
              value: state.skinPath || '',
              placeholder: '留空 = 自带鲸鱼娘；或填一张 64×64 png 的完整路径',
              style: S.input,
              onChange: (e) => patch('skinPath', e.target.value),
            }),
            h(
              'div',
              { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 } },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => patch('skinPath', ''),
                  style: { padding: '4px 10px', cursor: 'pointer' },
                },
                '用自带的',
              ),
              h(
                'span',
                { style: S.hint },
                '必须是 64×64 的 png；改完她立刻换装，不用重启游戏。',
              ),
            ),
          ),
          h(
            'div',
            { style: S.row },
            h('div', { style: S.label }, h('span', { style: S.name }, '说话方式')),
            h(
              'div',
              { style: S.modes },
              MODES.map(([mode, title, desc]) =>
                h(
                  'label',
                  {
                    key: mode,
                    style: state.mode === mode ? { ...S.mode, ...S.modeOn } : S.mode,
                    onClick: () => patch('mode', mode),
                  },
                  h('input', {
                    type: 'radio',
                    name: 'mc-companion-mode',
                    checked: state.mode === mode,
                    onChange: () => patch('mode', mode),
                  }),
                  h(
                    'span',
                    null,
                    h('div', { style: S.modeT }, title),
                    h('div', { style: S.modeD }, desc),
                  ),
                ),
              ),
            ),
          ),
          h(Slider, {
            title: '跟随日记的暂停状态',
            value: state.respectPause ? '开' : '关',
            value2: state.respectPause ? 1 : 0,
            min: 0,
            max: 1,
            step: 1,
            onChange: (v) => patch('respectPause', v === 1),
            hint: '开了之后，如果你那本日记里写着「暂停」，她在游戏里也不说话。',
          }),
          h(Slider, {
            title: '隐藏唤醒消息',
            value: state.hideWake ? '开' : '关',
            value2: state.hideWake ? 1 : 0,
            min: 0,
            max: 1,
            step: 1,
            onChange: (v) => patch('hideWake', v === 1),
            hint: '实验性：试着让 DSH 不显示那条 🐟 消息。控制器不一定支持。',
          }),
          h(
            'div',
            { style: S.foot },
            h(
              'button',
              { style: S.btn, disabled: saving, onClick: () => void save() },
              saving ? '保存中…' : '保存',
            ),
            note ? h('span', { style: failed ? S.bad : S.muted }, note) : null,
          ),
          h(
            'div',
            { style: S.muted },
            `管道${rt.bridgeConnected ? '已连接' : '未连接'} · 本小时已叫醒 ${rt.wakeUsed ?? 0} 次 · 剩余额度 ${rt.budgetLeft ?? '—'}`,
          ),
        )
      }
    }

    try {
      const React = require('react')
      const Panel = buildPanel(React)

      module.exports.name = NS
      module.exports.inject = ['slots']
      module.exports.apply = (ctx) => {
        try {
          if (!ctx || !ctx.slots) {
            window.__mcCompanionError = 'ctx.slots 不存在'
            return
          }
          ctx.effect &&
            ctx.effect(
              () =>
                ctx.slots.inject(
                  'settings.section',
                  () =>
                    ctx.slots.register(
                      { name: 'settings.section', id: NS, order: 7, label: () => '大肥鱼' },
                      Panel,
                    ),
                  'mc-companion: settings section',
                ),
              'mc-companion: settings section',
            )
        } catch (error) {
          window.__mcCompanionError = String((error && error.message) || error)
        }
      }
    } catch (error) {
      window.__mcCompanionError = String((error && error.message) || error)
      module.exports.name = NS
      module.exports.inject = ['slots']
      module.exports.apply = () => {}
    }

    return module.exports
  },
})
