# mc-companion · 让你养的 AI 陪你玩 Minecraft

会话里那个 AI 能看见你在游戏里干了什么，并在合适的时候说一句。

不是 mod 内置的 NPC——**AI 在 DSH 里，mod 只是一根管子**。所以陪你玩的是你平时聊天的那一个，不是另一个。

```
游戏事件 ──mod──▶ 本地端口 ──插件──▶ 活跃度判定 ──▶ 唤醒会话
                                                    │
游戏聊天框 ◀──mod── 本地端口 ◀──插件── say ◀────────┘
```

## 需要什么

| 东西 | 说明 |
|---|---|
| DSH | 插件跑在 DeepSeek Harness 里 |
| Minecraft 1.20.1 + Fabric | 客户端需要 Fabric Loader ≥ 0.15 |
| Fabric API | 装了就能用，不需要额外配置 |
| 世界允许作弊 | 她说话走 `/tellraw`，要 op 权限 |
| 一个能跑的会话模型 | **每次唤醒都是一次完整的模型调用**，见下面的花销 |

## 安装

### 1. mod 放进游戏

把 `mc-companion-0.1.0.jar` 放进 Fabric 1.20.1 实例的 `mods/` 目录，重启游戏。

装好之后它会监听 `127.0.0.1:25566`。**端口只开在本机，不对外。**

### 2. 插件装进 DSH

```powershell
dsh plugin --profile desktop add "link:<这个目录的绝对路径>"
```

重启 DSH。左侧「设置」里会多出一项「**同伴**」，滑杆都在那。

### 3. 确认连上了

在会话里让 AI 调一次：

```
mc_companion action=status
```

看到 `bridgeConnected: true` 就通了。

## 配置

设置页里能调的都即时生效，存在 `~/.dsh/mc-companion-settings.json`。

`cordis.patch.yml` 里的选项（手改优先）：

| 键 | 默认 | 作用 |
|---|---|---|
| `chattiness` | 55 | 对话活跃度 0–100，冷却由它推算 |
| `cooldownMs` | 0 | 冷却覆盖，0 = 自动 |
| `wakeBudgetPerHour` | 20 | **每小时最多唤醒几次**（花销闸） |
| `displayName` | 同伴 | 游戏里显示的名字 |
| `mode` | speak | `speak` 让她现编 / `template` 念短句 / `quiet` 只记账 |
| `hideWake` | false | 实验性：试着隐藏唤醒消息 |
| `bridgePort` | 25566 | mod 的端口 |
| `rconPort` / `rconPassword` | — | 可选：连专用服务器的 RCON，走服务端模式 |
| `logPath` | '' | 可选：跟读服务器日志（只读，不能说） |

## 花销

`mode: speak` 下，每次唤醒等于一次完整对话调用：上下文 + 生成。

默认参数（活跃度 55、预算 20/小时）是**保守**的——认真玩两小时大概会叫醒它十几次。想更省：

- 把「每小时最多叫醒几次」调到 5
- 或者切到 `template`：从内置短句里挑一句，**完全不调用模型**，免费

预算用尽时她只记账不开口，不会偷偷花钱。

## 它不做什么

- 不改游戏、不加实体、不替你操作
- 不在游戏里生成任何文字（除了那一行 `/tellraw`）
- 不联网（除了你自己配的会话模型）
- 不读你的存档

## 自己改

协议很简单，一行一个 JSON：

```jsonc
// 进游戏（插件 → mod）
{"cmd":"say","text":"又死了。","name":"同伴"}

// 出游戏（mod → 插件）
{"type":"chat","name":"Steve","text":"<Steve> 有人吗"}
{"type":"death","name":"Steve","detail":"被僵尸打死了"}
{"type":"advancement","name":"Steve","detail":"石器时代"}
{"type":"hello","version":"1.20.1"}
```

mod 源码在 `mod/`，`mod/build-mod.ps1` 一条命令编译（需要 JDK 17，会自动找 PCL 带的那个）。

插件本体是纯 ESM：`index.js` + `lib/`，30 个测试：

```powershell
node --test tests/*.test.mjs
```

## 故障排查

| 症状 | 先看 |
|---|---|
| 她说话显示成 `<你的ID>` | `/tellraw` 被拒——世界没开作弊 |
| `bridgeConnected: false` | mod 没装好，或游戏没启动；`netstat -ano \| findstr 25566` |
| 唤醒了但没反应 | `mc_companion action=status` 看 `lastVerdict` / `lastWake` |
| 太吵 / 太安静 | 活跃度滑杆；或看 `pending` 里 `reason` 字段 |
| 她说的和游戏对不上 | 检查 `displayName` 和会话是否绑对了 |

日志在游戏目录 `logs/latest.log`，插件日志在 DSH 控制台。

## 许可

MIT
