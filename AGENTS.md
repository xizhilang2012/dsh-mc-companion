# AGENTS.md · 给 AI 读的安装说明

> 这个文件是写给你的（在 DSH 里跑的那个 AI），不是写给玩家的。
> 玩家装了 `dsh-mc-companion` 之后第一句话往往是「这怎么用」——按下面的流程带他装。

## 一句话说清这个插件是什么

它给**你**一个 Minecraft 里的身体：一个能自己走路、自己挖矿、自己攒材料做工具、
有自己的背包、《每档只出现一只、死了能复活》的女性角色。**她的判断来自你**——
你说话、你决定，她照做。她不是 mod 里写死的 NPC。

## 关键事实：这是两半，缺一半没用

| | 插件（你所在这边） | mod（游戏那边） |
|---|---|---|
| 是什么 | npm 包，跑在 DSH 里 | Java jar，跑在 Minecraft 里 |
| 装在哪 | `dsh plugin add` | 游戏实例的 `mods/` 文件夹 |
| 缺了会怎样 | 场上有个空壳，不会思考 | 你看不见游戏里的一切 |

**jar 已经打包在插件里**，玩家不用另外下载：

```
<插件安装目录>/mod/build/libs/mc-companion-*.jar
```

## 玩家问「怎么用」时，你的流程

1. **先查状态**：调 `mc_companion action=setup`。
   它返回 `bridgeConnected` / `jarPath` / `steps` / `problems`。

2. **按状态说一句，不要倒文档**：
   - `bridgeConnected: true` 且 `herAlive: true` → 她已经在场上了，直接教他按 `N` 开面板。
   - `bridgeConnected: false` → 先确认他装没装 mod，把 `jarPath` 原样告诉他，
     让他复制到 `mods/`（和 Fabric API 一起）。

3. **问清环境再讲细节**：用的哪个启动器（PCL2 / HMCL / 官方 / Modrinth App）？
   Minecraft 是 1.20.1 吗？Fabric API 装了吗？——**一次只问一个**。

4. **他做完一步就再查一次** `action=setup`，确认 `bridgeConnected` 变了再讲下一步。

## 绝对不要做的事

- ❌ 一次把四步全贴出来
- ❌ 说「请阅读 INSTALL.md」（他不会去读）
- ❌ 说「重新安装一遍」（先查状态，别猜）
- ❌ 承诺 1.21 能用（目前只有 1.20.1）

## 版本与限制（说话时别越界）

- 当前版本：`0.1.1-beta.1`，**测试版**，只支持 **Minecraft 1.20.1 + Fabric**
- 她的能力到「木头 → 石头」这一档是通的；**铁**那一档（挖矿→造熔炉→烧→铁镐）
  代码齐了但还没在真机跑通，别承诺
- 她说话需要 **op 权限**（`/op 玩家名`）
- 端口 `127.0.0.1:25566` **只开在本机**，不对外；多人服务器她跑不动（需要服务端也装）

## 排错顺序（按这个查，别乱试）

```
1. action=setup 看 bridgeConnected
2. false → 问：游戏开着吗？进存档了吗？mods/ 里有 jar 吗？Fabric API 装了吗？
3. true 但 herAlive=false → 问：设置里「复活」开着吗？她是不是刚死？
4. 她在但不动 → action=state 看 busy / 她是不是卡住了 → action=rescue
5. 她说话你看不见 → 问：你是 op 吗？
```
