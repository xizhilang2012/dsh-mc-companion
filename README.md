# mc-companion · 让 DSH 里的 AI 有个身体，陪你玩 Minecraft

> **0.1.1-beta.1** · 测试版 · 只支持 **Minecraft 1.20.1 + Fabric**
>
> 装之前先读 [INSTALL.md](INSTALL.md)。**这是两半：DSH 插件 + Minecraft mod，只装一半不能用。**
> 两个都给你准备好了——jar 就在插件的 Release / 安装包里，不用另外找。

她不是 mod 里写死的 NPC。**思考在 DSH 的会话里，身体在游戏里。**

```
┌─────────────────────┐   TCP 25566   ┌──────────────────────┐
│ DSH（会思考的那半）   │◀────────────▶│ Minecraft（会动的那半） │
│ 它平时跟你聊天的那个   │   只连本机    │ 一个能走、能挖、有背包的人 │
└─────────────────────┘               └──────────────────────┘
```

## 她是什么样的

不是宠物，是**伙伴**：

| | |
|---|---|
| 自己出现 | 单机进存档自动出现，不用召唤；每档只一只 |
| 自己的背包 | 27 格 + 自己的合成栏，按 `N` 能翻 |
| 自己干活 | 缺材料自己去砍树/挖石头，缺工作台自己从包里掏一个放下 |
| 从零发展 | 木头 → 石头 这一档已经通了：砍树 → 木板 → 木棍 → 木镐 → 拿手上 → 挖石头 → 石镐 |
| 不出卖你 | 只动她自己放过的方块，不碰你的建筑 |
| 死得起 | 死了能复活；背包掉不掉由你设置（默认不掉） |
| 会说话 | 以她自己的名字说话，不占用你的 ID；话多话少能在面板里调 |
| 有脾气 | 性子（黏人/建筑/采集/探险/守着/自定义）+ 人设文件 + 日记 |
| 有脸 | 自带鲸鱼娘皮肤，也能在设置页填一张 64×64 的 png 立刻换装 |

## 装（三分钟）

1. 游戏侧：Fabric Loader ≥ 0.15（1.20.1）+ **Fabric API** + 把 `mc-companion-*.jar` 丢进 `mods/`
2. DSH 侧：`dsh plugin --profile desktop add dsh-mc-companion`
3. 进存档 → 她会出现在你旁边 → 左侧设置里多出「大肥鱼」一页

详细步骤、卡住了怎么查 → [INSTALL.md](INSTALL.md)

## 你（那个 AI）会用到的东西

插件给会话注册了一个工具 `mc_companion`，主要动作：

```
action=state / herbag / inventory    看她的位置、她的包、你的包
action=order kind=goto|follow|halt   让她走 / 跟着 / 停
action=gather what=log|stone|iron    去砍树 / 挖石头 / 找铁矿
action=craft item=...                让她做东西（会自己放工作台）
action=plan item=...                 查做这个东西还缺什么（递归展开配方）
action=make item=...                 一次调用跑完 采集→加工→做成
action=setup                         查安装状态，用来引导玩家装
```

`make` 是闭环：她缺什么自己去弄，搞不到的会**用问句问玩家**，玩家给了会接着做。

## 花销（重要）

每一次「她开口说话」= 一次完整的模型调用（上下文 + 生成）。

- 面板里有**每小时最多叫醒几次**的闸，默认 20 次
- 想省：把预算调到 5，或者把档位切到「安静」
- 预算用尽时她只记账不开口，**不会偷偷花钱**

## 不做什么

- 不改你的存档数据、不替你操作
- 不联网（除了你正在用的那个会话模型）
- 多人服务器需要**服务端也装**这个 mod，否则她不存在
- 只支持 1.20.1；1.21 的移植还没做

## 自己改

只有三样东西：

```
index.js + lib/     插件本体（纯 ESM，Node 20+）
client/client.js    设置页（浏览器里跑的那半）
mod/                Fabric mod（Java 17）
```

协议是一行一个 JSON：

```jsonc
// 插件 → 游戏
{"cmd":"say","text":"又死了。","name":"鲸喜"}
{"cmd":"order","kind":"goto","x":120,"y":64,"z":-30}

// 游戏 → 插件
{"type":"hello","version":"1.20.1"}
{"type":"snapshot","herX":120.5,"herY":64.0,"herZ":-30.2,"herHeld":"minecraft:stone_pickaxe"}
{"type":"ack","what":"mined","detail":"圆石"}
```

测试：

```powershell
node --test tests/*.test.mjs     # 115 条
```

mod 编译需要 JDK 17：

```powershell
cd mod
.\gradle-8.7\bin\gradle.bat build
```

## 已知限制（测试版，别期待完美）

- **铁那一档还没跑通**：挖铁矿 → 造熔炉 → 烧 → 铁镐，代码齐了但没在真机验完
- 她走路是最简版寻路，遇到复杂地形会卡住并报 `stuck`（不会装死）
- 皮肤的脸只有 8×8，别期待跟插画一样
- 多人服务器、1.21、服务端模式都还没做

## 许可

MIT。她的皮肤是本项目自绘。

Minecraft 是 Mojang Studios 的商标，本项目与 Mojang 无关。
