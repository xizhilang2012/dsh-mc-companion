# 交接文档

写于 2026-11-07 深夜。给"下次接着做"用——里面没有推测，只有已经验证过的事和还没验证的事。

## 一、这是什么

让 DSH 会话里的 AI 陪玩 Minecraft：

```
游戏世界 ──mod──▶ 本地端口 25566 ──插件──▶ 会话
     ▲                                      │
     └──────── tellraw / 指令 ◀──────────────┘
```

- **mod**（`mod/`）：一块 Fabric 1.20.1 客户端 mod，注册一个实体当她的身体，把事件和世界状态送出去，接收指令。
- **插件**（本项目根目录）：DSH 插件，判断该不该开口、派活、查配方库存、合成。

## 二、已经验证过的（真机）

| 能力 | 怎么验的 | 结果 |
|---|---|---|
| 走路 | `goto` 后看坐标变化 | 34 格 / 5 秒真实位移 |
| 重力/落地 | 比对玩家与她 y | 同高 70.0，不再悬空 |
| 挖方块 | `{"cmd":"mine","rel":"under"}` | `ack: mined 草方块` |
| 她的背包 | `{"cmd":"herbag"}` | 返回 JSON，NBT 持久化 |
| 专用会话 | 调 `action=wake` | 会话 `9376d79f` 自己回了一句 |
| 唤醒链路 | 死亡/面板触发 | 游戏里出现 `[大肥鱼] …` |
| 查库存 | `action=inventory` | 读到背包 5 项 |

## 三、还没验证的（下次从这里开始）

1. **捡取**：`{"cmd":"collect"}` 逻辑完整（掉落物 → 她的包），但每次测都有玩家在旁边先捡走。验证方法：玩家按 `Q` 丢一个物品，再调 collect。
2. **合成**：`recipe.craft()` 已经修好（原来 `getOutput()` 返回空），但**一次都没成功合成过**。下次直接 `{"cmd":"craft","item":"minecraft:oak_planks"}` 试。
3. **工作台配方**（3×3）：未实现，需要"站在工作台旁"的判定。
4. **采集避开玩家建筑**：未实现。
5. **自主决策**：节拍器 + 性子代码就绪，`autoGoal` 默认关着，没真跑过。

## 四、调试方法（重要）

**别靠重启游戏验证 mod**。mod 支持多连接，直接用 TCP 说话：

```powershell
$c = New-Object System.Net.Sockets.TcpClient
$c.Connect('127.0.0.1', 25566)
$s = $c.GetStream()
$r = New-Object System.IO.StreamReader($s, [Text.Encoding]::UTF8)
$w = New-Object System.IO.StreamWriter($s, (New-Object Text.UTF8Encoding($false)))
$w.AutoFlush = $true
$w.WriteLine('{"cmd":"herbag"}')
# 读几行看回执
```

连接后 mod 会先发 `{"type":"hello"}`，之后每 5 秒一条 `snapshot`。

常用命令：

```jsonc
{"cmd":"purge"}                                        // 清掉所有"她"（换版本/重复召唤后用）
{"cmd":"body","on":true,"name":"大肥鱼","type":"mc-companion:companion"}
{"cmd":"herbag"}                                       // 她包里有什么
{"cmd":"mine","rel":"under"}                           // 挖她脚下
{"cmd":"collect"}                                      // 手动捡（8 格）
{"cmd":"autopickup","on":false}                        // 关掉自动拾取（默认开，4 格）
{"cmd":"craft","item":"minecraft:oak_planks"}          // 合成
{"cmd":"recipe","item":"minecraft:stone_pickaxe"}      // 查配方
{"cmd":"inventory"}                                    // 背包 + 附近箱子
```

**重复的"她"**：老版本实体没有 tag，`kill @e[tag=…]` 清不掉。用 `purge` 按类型清，
再 `body on` 重新生成一只。

## 五、踩过的坑（按代价排序）

1. **`replace` 没匹配上却以为改好了**——`bridge.mjs` 的 `name` 参数、`Config` 引用都栽在这。改完必须 `Select-String` 确认。
2. **只注册客户端入口**——`fabric.mod.json` 只有 `"client"`，服务端不认实体类型，`@e[type=…]` 选不中。加了 `"main"` 才对。
3. **手写物理**——`requestTeleport` 推进位置，导致悬空、贴地、台阶各要一个补丁。换 `Entity.move()` 后全部消失。
4. **`setVelocity` 对生物无效**——`travel()` 每 tick 用 `forwardSpeed` 重算，赋值那一刻能读到，下一 tick 就被覆盖。症状是"速度有值但不动"。
5. **`getOutput()` 返回空**——1.20.1 合成配方要用 `recipe.craft(网格, registryManager)`。
6. **命令解析抛异常被 catch 吞掉**——`message.get("x").getAsInt()` 在只传 `rel` 时 NPE，整条命令静默消失。
7. **专用会话没有模型选择**——新会话落到 `deepseek-official`（无 key）。模型选择按会话存在 `session_projcache`，需要在界面里给它设一次。
8. **会话日志是多个 zstd 帧**——只解压第一帧会以为"只有会话头"。

## 六、构建与部署

```powershell
# mod
cd mod
$env:JAVA_HOME = "$env:APPDATA\.minecraft\runtime\java-runtime-gamma-snapshot"   # PCL 自带的 JDK 17
.\gradle-8.7\bin\gradle.bat build --no-daemon
# 产物: build/libs/mc-companion-0.1.0.jar → 复制到 mods/

# 插件（link 安装，改完同步到 profile）
dsh plugin --profile desktop add "link:<本目录>"
node --test tests/*.test.mjs      # 65 个测试
```

**源码里有中文注释，必须关掉 sources jar**（`withSourcesJar()` 会让 remapSourcesJar 挂在非 ASCII 上）。

## 七、设计原则（不改）

1. **先到再动手**：任何改变世界的动作都要先走到位。
2. **按生存模式设计**：资源要采、路要走、不能飞，不凭空给材料。
3. **不碰玩家的东西**：玩家放的方块、箱子里的物品，除非明确要求。
4. **失败要说出来**：每一步都有 ack，不许静默失败。

## 八、文件地图

```
index.js              插件入口：工具、路由、唤醒、节拍器
lib/
  bridge.mjs          TCP 客户端（多连接、重连）
  chattiness.mjs      活跃度 → 冷却与命中率
  order.mjs           喊名字即指令
  goal.mjs            该不该让她自己提目标
  preference.mjs      五种性子及其实施建议
  level.mjs           四个成本档位
  settings.mjs        设置规整与持久化
  session.mjs         专用会话的创建与开场白
  mood.mjs            深夜/连死时的语气
  phrase.mjs          事件 → 中文一句话
  lines.mjs           内置短句（免费模式）
  identity.mjs        读人设与日记
  source.mjs          人设/日记的查找规则
  memory.mjs          导出入包
  rcon.mjs log-tail.mjs   服务器模式（未启用）
client/client.js      设置页（settings.section）
ui/panel.html         备用网页版面板（路由 /dsh-mc-companion/）
mod/                  Fabric mod 源码
  McCompanionClient   桥、快照、指令、面板
  CompanionEntity     她的身体（继承狼，自带寻路与模型）
  ModEntities         类型注册 + 默认属性
  CompanionScreen     命令盘（N 键）
  CraftScreen         合成目标选择
```

## 十、明天从这里继续（2026-11-07 收工）

### 卡在哪

`selfSummon`（进世界自己显形）用了**服务端世界**判断"她在不在"。
如果 `client.getServer()` 拿不到，判断永远返回"不在"→ 每两秒召唤一次 → 存档里堆出几十只。

表现：启动变慢、游戏里一堆她、`purge` 却回 `0 个`。

### 已经写好的修法（未编译！）

`findCompanion` 旁边新增了 `companionExists()`——**用客户端世界**判断存在性：

```java
for (var entity : client.world.getEntities())
    if (entity instanceof CompanionEntity c && c.isAlive()) return true;
```

`selfSummon` 已改为调用它。**但这版还没 build**（编译被中断）。

### 明天第一件事

```powershell
cd mod
$env:JAVA_HOME = "$env:APPDATA\.minecraft\runtime\java-runtime-gamma-snapshot"
.\gradle-8.7\bin\gradle.bat build --no-daemon
```

编译后装进 `mods/`、重启游戏，然后：

1. 游戏里先 `/kill @e[type=mc-companion:companion]` 清场
2. 直连发 `{"cmd":"diag"}`，看 `hasServer` / `companionsSeen`
3. 确认只会有**一只**，且她死了 3 秒后回来仍然只有一只

### 还有一个待修的

`purge` / 挖矿 / 合成 / 捡取都依赖 `client.getServer()`。
如果 `diag` 显示 `hasServer: false`，这些功能在多人服上全部失效——
需要改成纯命令实现（`/execute`、`/data`）或做服务端版。

### 今天验证通过的（别忘了）

新档里跑通过一次完整链路：

```
summon → mine-heading（走过去）→ mined 草方块 → auto-collected 1 件 → herbag 有 dirt×1
```

## 九、发布状态

- 仓库 `xizhilang2012/dsh-mc-companion` 已建，**私有**，36 个文件已推。
- release 未建、插件市场未提。
- 等"捡取/合成"验证通过再公开。

## 十一、2026-11-08 修的三件事（都出在"字段没同步"上）

### 1. 她反复被杀、每秒被 tp —— 身体类型没同步

日志里她是 `class_7298`（原版生物），不是 `CompanionEntity`：

```
Named entity class_7298['同伴'/1904, ...] died: 同伴被杀死      ← 每 10 秒一次 /kill
[wangzhixi: 已将她传送到53.90, 65.00, 1.10]                   ← 每秒一次 /tp
{"type":"diag","companionsSeen":0,"op":true}                  ← 一个自定义实体都没有
```

原因：`bodyType` 默认 `minecraft:allay`，而插件只在 tool 动作 `body` 时才发 `type`，
进游戏时从不发。一个字段错，四个症状同时出现：

| 症状 | 代码 | 结果 |
|---|---|---|
| 反复被杀 | `companionExists()` 只认 `CompanionEntity` | 判成"不在场" → 每 10 秒 kill + summon |
| 不停 tp | `isPathfindingType()` 认不出 allay | 每秒把玩家身边那个坐标 tp 一次 |
| `herPresent:false` | `findCompanion()` 找不到 | 跟随、挖矿、背包全失效 |
| 没有背包 | 不是 `CompanionEntity` | `herbag` 永远 `[]` |

修法（不是打补丁，是把源头收成一个）：
- 默认值改成 `mc-companion:companion`
- `rename` 命令也带 `type`，插件连上就同步；类型变了 → `respawnDirty` 换掉旧身体
- `companionExists` → `bodyExists`：**按 `mc_companion` 标签认，不再看类**，换任何类型都不会误判
- summon 命令收成 `summonBody()` 一处（之前两份拼法不同，一份带 `Invulnerable` 一份带 `Tame`）

### 2. 游戏里发的指令没进会话 —— 插件被禁用了

`dsh.profile.bundles` 里没有 `dsh-mc-companion`，`enabled: false`：
插件根本没跑，管道没接上，也没有 `/dsh-mc-companion/status` 路由（404）。

用 plugin_manager 的 `set_bundle` 重新启用即可（live profile 立即生效）。
验证：`action=wake` 返回 `ok:true`，会话 `9376d79f` 出现第 12/14 轮，她回「在。」

顺带发现：`isOrder` 只认名字，单机里打「过来」不算指令。
现在单机（`snapshot.multiplayer === false`）里**你自己打的字就算指令**，多人仍要求喊名字。

### 3. 她会卡死还一直"忙" —— 没有失败态

`herBusy:true` / `herIdle:false` / 位置 15 秒不变 → 决策循环以为她在干活，再也不派活。

`CompanionEntity.tick()` 现在：
- 去掉 `getNavigation().startMovingTo`（和手动驱动抢路径，导致原地不动）
- 5 秒没进展 → 跳一下（台阶/半砖）
- 10 秒还不行 → 丢掉目标，置 `stuck`，发 `{"type":"stuck"}` 事件
- 插件把 `stuck` 和 `arrived` 一样当成"该重新决策了"的节拍（reason=`stuck`）

### 还没做

- **每个档只生成一只**（固定 UUID + 死亡标记）：现在仍是"客户端实体列表里没有就召唤"，
  她走远、区块卸载时会误判。要做到"死了才复活、活着就不重召唤"，得在 `onDeath` 记账，
  用持久化状态存她的 UUID。
- 合成链路（`craft`）一次都没成功过。
- 3×3 工作台配方；不拆玩家放置物；1.21.x 多版本。

## 十二、移动这件事，最后验到的数字（2026-11-08）

她跳不起来 / 掉得比玩家快，原因是两个补丁叠在一起：

1. `snapToGround()` 每 tick 把 y 拽回地面 → 一跳起来就被按回去
2. 自己又减了一次 `-0.08` 重力 → 原版 `travel()` 已经减过一次，等于双倍重力

而且发现一条容易走错的路：**只设 `forwardSpeed` + `yaw`、把移动交给原版，她一步都不动**
（实测位置完全不变）。查过字节码，`LivingEntity.isImmobile()` 只返回 `isDead()`，
所以不是"NoAI 让她 immobile"这么简单——真正的闸还没查清。别在这条路上猜，
`move()` 驱动是验证过能走的。

现在的实现与实测：

| 项 | 值 | 怎么验的 |
|---|---|---|
| 走路速度 | 0.2 格/tick ≈ 4.0 格/秒 | 直连发 goto 12 格，3.03 秒到（3.96 格/秒） |
| 重力 | 0.08（玩家同值，只减一次） | 走下一格高地，y 70 → 69 |
| 跳跃 | 撞墙时 `vy = 0.42` | 从 y=69 走回 y=70 的高地，`arrived` 在 (90.1, 70.0) |
| tick | 20.1 / 秒 | 300 tick / 14.9 秒 |
| 被杀 / 被 tp | 0 次 | 重启后日志里 `died:` `传送到` 都是 0 |
| 实体数 | 1 | `{"cmd":"diag"}` → `companionsSeen: 1`，`bodyType: mc-companion:companion` |

顺带修的诊断字段：`herSpeed` 以前读 `getVelocity()`，而 NoAI 实体的 velocity 每 tick
被原版衰减回 0，所以永远显示 `0.0`。改成用两次快照的位移算。

## 十三、合成：真正的死因 + 两条新规矩（2026-11-08）

### 合成从来不是"不执行"，是把游戏打崩了

```
NullPointerException: Cannot invoke "ScreenHandler.onContentChanged(CraftingInventory)"
because "this.field_7802" is null
    at CraftingInventory.setStack
    at McCompanionClient.applyCraft
```

`new CraftingInventory(null, 3, 3)` 的 handler 是 null，而 `setStack()` 里会调
`handler.onContentChanged(...)`。第一次 `setStack` 就 NPE，客户端直接关掉。
所以"合成没反应"= 游戏崩了。修法是 `VirtualGrid`：不继承，直接实现
`RecipeInputInventory`（传真的 ScreenHandler 也不行，`PlayerScreenHandler`
重写了 `onContentChanged`，会去动玩家界面）。

### 顺带修掉的四个坑

1. **材料按数量算**：以前 `fitsAll()` 只看"有没有"，1 块木板也满足 4 块木板的配方，
   成品照做、只扣 1 块——凭空变材料。现在 `reserve()` 逐槽位计数并预留。
2. **网格形状**：`ShapedRecipe.getIngredients()` 的长度是 `width×height`，不是 9。
   2×2 的配方按顺序摆到 0/1/2/3 是错位的（应为 0/1 与 3/4）。现在用
   `slot = (i / width) * 3 + (i % width)`。
3. **让配方自己验一遍**：摆完调用 `recipe.matches(grid, world)`，不匹配就不做。
   以前是"摆了就算"，凭什么相信摆对了？
4. **3×3 要合成台**：`needsTable()` 检查 `width>2 || height>2`，附近 4 格内没有
   `CRAFTING_TABLE` 就 ack `craft-need-table`。否则等于在手上做工作台，跟生存模式对不上。

### 规矩一：换 jar 必须游戏关着

Fabric 的 classloader 是**懒加载**的：jar 在游戏跑着的时候被覆盖，之后第一次用到的类
（这里是 `McCompanionClient$VirtualGrid`）会加载失败：

```
RuntimeException: Failed to load class file for '...VirtualGrid'!
    at KnotClassDelegate.getPreMixinClassByteArray
```

2026-11-08 08:32 我犯过这个错（游戏 08:25 开着，我 08:32 覆盖了 jar）。
症状会伪装成"代码有 bug"。**先关游戏，再拷 jar。**

### 规矩二：一个 bug 不能杀掉玩家的游戏

`ClientTickEvents` 的回调现在整体包在 `tickOnce()` + try/catch 里：出错只
`ack("error", 类名 + 消息 + 第一行栈)`，最多 10 秒报一次，游戏继续跑。
上面那个类加载失败就是被它兜住的——游戏没崩，外面看得见错误。

## 十四、采集 → 合成 → 交付：真机闭环（2026-11-08 09:1x）

### 真机验证过的完整链路

```
她的包：oak_log ×2
{"cmd":"gather"}   → gather-found 橡木原木 @ -39,66,6（6 格外）     ← 1 秒内
                   → mine-heading 6.2 格外，走过去再挖
                   → mined 橡木原木 → auto-collected 1 件
{"cmd":"craft","item":"minecraft:oak_planks"}
                   → crafted 4 个 橡木木板（用她自己的材料，做好了过来给你）
                   → deliver-heading 5.8 格外，走过去给你
                   → delivered 橡木木板，4 件
玩家背包           → minecraft:oak_planks ×4
她的包             → oak_log 2 → 1（正好扣 1 个原木）
```

用玩家材料时不触发交付：`craft stick → crafted 4 个 木棍（用你的材料）`，直接进玩家背包。

### gather 的 16 秒卡顿是怎么来的

```java
// 错：ServerWorld.getBlockState() 对未加载区块会 getChunk(x, z, true) → 生成并加载地形
world.getBlockState(pos)
// 对：先问加载了没，只碰已加载区块；再跳过空区段；y 夹在 她 ±8/+24
if (!world.isChunkLoaded(cx, cz)) continue;
var chunk = world.getChunk(cx, cz);
if (chunk.getSection(chunk.getSectionIndex(y)).isEmpty()) continue;
```

24 格扫描从 **16.4 秒** 降到 1 秒内；48 格从"一分钟不回来"降到秒级。

### 合成：又两个坑

1. **`blockedBy` 可能是 null**：3×3 配方在"没合成台"时被 `continue` 掉，
   报错却拿 `blockedBy`（null）去问形状 → `NullPointerException: recipeShape(recipe)`。
   现在单独留一份 `tableRecipe`，`shapeText(null)` 也有兜底。
2. **配方要挑"最接近能做"的**：木棍有竹子版和木板版，之前随机报一个。
   现在用 `shortfallScore()` 算缺口，报差得最少的那个。

### 交付的设计选择（别改回去）

- 用**她自己的**材料做出来的东西 → 标记 `deliverStack`，她自己走到你 3 格内才交。
  不是隔空塞进背包——"过来给我"是行为，不是函数调用。
- 用**你的**材料做的 → 直接进你背包，不触发交付（不然她拿你的材料做完再走一圈给你，纯浪费）。
- 走不过去 → `deliver-stuck`，东西留在她包里（`herbag` 看得见），不假装给了。
- 面板 N 键新增「把东西给我」→ 包里全部交给你。

## 十五、3×3 与"自己放台子"（2026-11-08 09:4x，真机）

之前 3×3 只能报错——因为原版必须站在合成台旁边。现在她自己会放：

```
craft stick            → crafted 4 个 木棍（用你的材料）
craft wooden_pickaxe   → placed 工作台 @ -30,64,9
                       → craft-placed-table「附近没台子，我从你包里拿了一个放下，接着做」
                       → crafted 1 个 木镐（用你的材料）
背包                   → 木板 128 → 123（做木棍 2 + 镐 3）、木棍 2、木镐 1、工作台物品少了 1
```

实现要点：

- `placeCraftingTable()`：先看她包里、再看你包里有没有 `crafting_table`；
  `findPlaceSpot()` 在玩家 3 格内找"脚下实心 + 本身空气 + 不压在人身上"的位置，
  `setBlockState(..., NOTIFY_ALL)`，然后从来源背包扣掉一个。
- 放完把 `craftDirty` 再置 true，**下一 tick 重试同一次合成**（这时 tableNearby 已经是 true）。
- `tablePlaceAttempts` 在 `applyCraft` 里**不清零**，只在收到新的 `craft` 命令时清零——
  否则"放好→重试"会把计数重置，万一位置判不出来就会无限放台子。

注意：她能放台子这件事依赖"包里真有工作台"。没有就诚实报
`craft-need-table`（附近没有、包里也没有）。

## 十六、她的包 / 装备 / 自主决策 / 多版本（2026-11-08 晚）

### 她自己的包与合成栏

- 面板（N 键）新增「看她的包」→ `BagScreen`：27 格网格，物品图标 + 数量（`DrawContext.drawItemInSlot`），
  悬停看 tooltip，底下显示「手上：X」和「用了 n / 27 格」。
- 只读：东西是她的，要拿就喊她走过来给你（`deliver`）。不改玩家背包，也不允许隔着屏幕把东西塞进她包里。

### 装备（这是能不能发展的关键）

- `equip` 动作：把包里的东西拿到主手（`LivingEntity.equipStack`，注意不是 `setEquippedStack`——
  Yarn 1.20.1 里叫 `equipStack`，写错了是"找不到符号"）。
- 挖之前自动换工具：`ensureToolFor()` 从包里挑挖这块最快的（`isSuitableFor` + `getMiningSpeedMultiplier`），
  和手里的对调。原因很硬：**原版掉落表看手上工具**，空手挖石头什么都不掉。
- 快照新增 `herHeld`。

### 自主决策

- 提示词现在多两段：`preferencePrompt(偏好, preferenceCustom)` 和 `progressPrompt(...)`（木→石→铁→钻石→下界合金）。
- 面板新增「自定义性子」：选 custom 出现输入框，原话直接进提示词，限 300 字。
- `autoGoal` 已在设置里打开（120 秒间隔），预算仍受 `wakeBudgetPerHour` 限制。

### 多版本：先把"跟版本绑死的那段"隔离

`mod-1.21/` 工程复用 `mod/src/main/java` 同一份源码（`srcDirs` 指过去），
只在 exclusions 里挖掉版本相关的文件：

```gradle
exclude 'com/xizhilang/mccompanion/CraftImpl.java'
exclude 'com/xizhilang/mccompanion/VirtualGrid.java'
```

也就是说：**合成那一段必须各版本各写一份**（1.21 里 `CraftingInventory` 换成 `CraftingRecipeInput`、
`craft()` 签名变了、配方输出改成组件）。其余部分（桥、漫游、移动、采集、装备、交付）理论上共用。

## 十七、走路改成"先寻路再走"（2026-11-08 17:1x）

### 问题

她以前是**朝目标画直线**：撞墙就跳，跳不上去就一直磨，直到 10 秒超时判 stuck。
玩家看到的就是"一直撞墙"。

### 做法

不换成原版 `travel()`（那条路已验证走不动），而是：

```java
// 让原版导航算路（它会考虑墙、台阶、水池），我们只按节点喂 move()
this.path = this.getNavigation().findPathTo(target.x, target.y, target.z, 32);
// 沿 path.getNode(i).getBlockPos() 一个节点一个节点走，到 0.9 格内换下一个节点
```

- 算不出路（目标悬空/被围死）→ 退回直线走，交给超时 `stuck`
- 3 秒没进展 → 强制重算路（地形变了、门关了）
- 13 秒还没到 → 放弃并 `stuck`（原来 10 秒，寻路后允许更久）
- **客户端不再自己 `move()`**：位置由服务端算，客户端只拿同步结果（以前两边都在动，会抖）

### 还没验

真机没验过"绕过一堵墙"：需要进游戏发 goto 让她走一段有障碍的路，
看她是绕过去还是又撞上。验的时候看 `herX/herZ` 的轨迹 + `stuck` 有没有提前触发。

## 十八、工具链真机验证 + 三个被证伪的地方（2026-11-08 17:3x）

### 已验通过

```
gather what=stone → gather-found 石头 @ -101,25,48（1 格外）→ mined → picked-up 1 件
她的包 → minecraft:cobblestone ×1
goto 16 格 → 4.8 秒 arrived（洞穴里从 y=38 下到 y=25，没撞墙）
```

走路改成"先 `findPathTo` 算路，再沿路径节点自己 `move()`"之后确实不再撞墙。

### 被证伪的三条（都是我此前写的，不是猜错就是没验）

1. **"空手挖石头不掉东西"是假的。**
   `world.breakBlock(pos, true, entity)` 不走玩家的工具判定，掉落表里石头默认掉圆石。
   现在加了硬门槛：`state.isToolRequired() && !held.isSuitableFor(state)` → `mine-need-tool`，
   不然"先做木镐"整条链没有意义。
2. **"掉得比玩家快一倍"** —— 早期是双倍重力（travel 一次 + 自己 -0.08），已修，现在单一 0.08。
3. **`gather` 的 `what` 只写进了字段和用法，没在命令处理里读** ——
   结果 `gather what=stone` 一直当砍树，报"周围 48 格里没有树"。修好后立刻找到石头。

### 死锁（已修）

她做好工具（用自己的材料）会走"交付"→ 走过来给玩家 → 自己空手 → 永远挖不出圆石。
现在工具类（`ToolItem`）**留给她自己并立刻 equip**，非工具（木板/木棍/工作台）才交付。

### 已知未处理

- **她会自己走进深坑**：实测从 y=25 掉到 y=0，`stuck` 报对了但没救回来。
  下一步：走路时检查前方落差 >3 格就不走，或者掉下去后自己爬回来。
- 她死了且玩家直接退游戏时，`keptBag`（内存里）会丢；要写进状态文件才彻底。

## 十九、通用求解器 + 材料合并 + 说话与人格（2026-11-08 18:0x）

### 把"木→石→铁"的硬阶梯删了

玩家的原话：「木头到石头，石头到铁是同一个逻辑，只要有主动收集材料的意识」——对。
硬阶梯只是结果，不是逻辑，而且每加一个目标就要重写一套规则。

现在只有一条链：

```
想要 X → mod 递归查配方（深 3 层，防 木板↔木头 这类环）
       → 每片叶子分类：have（已有，跳过）/ craft（先备料再做）/ gather（砍树或挖石）/ ask（要烧、要下矿深处 → 问人）
       → 插件把树拍平成有序步骤 + 提示词
```

真机验证（`{"cmd":"plan","item":"minecraft:stone_pickaxe"}`）：

```json
{"id":"minecraft:stone_pickaxe","kind":"craft","perCraft":1,"crafts":1,
 "needs":[{"id":"minecraft:cobblestone","need":3,"have":1,"missing":2,"kind":"gather"},
          {"id":"minecraft:stick","need":2,"have":2,"kind":"have"}]}
```

`perCraft` 用探针摆网格问配方（1.20.1 的 `getOutput()` 常常是空的，不能直接读）。

### 材料分在两个包里 → 必须合并

真机上卡住的一条：她包里 1 圆石、玩家包里 2 木棍，配方要 3 圆石 + 2 木棍，
而 `applyCraft` 一次只从一个来源取料 → 永远 `craft-missing`。

现在：`mergeStock()` 把两边拼成临时库存做"够不够"判断，扣料时按
**她优先、玩家补差**，回执写清谁出了多少；归属规则：
一点都没用玩家的材料 → 算她的（工具自己留着并 equip），用了玩家的 → 成品给玩家。

### 说话与人格

- `lib/talk.mjs` 三档话量（话少/正常/话多），改的是提示词里"说不说、说多长"，
  并把原来写死的「一次不超过 20 字」「不想说就别动」删了。
- 人设支持**自由文本**：`personaFile` 指向 `.json` 时读 `persona.personality`，
  指向 `.md/.txt` 时整份当文本（截断 1200 字）。
- 人设**每次唤醒都拼进提示词**（不是只注入一次）——她那条会话已经 86 轮，
  开场那句"她是谁"早被冲淡了。真机第 86 轮的 prompt 开头已经是「你是鲸喜，老大的伙伴」。
- 玩家说话时明确要求"先回一句"，不许不理人。

### 本轮改动的风险点（要盯着）

`applyCraft` 这次删死代码时手滑删多了，把方法尾部（无配方/缺台子/缺材料三种回执）
连带删掉，已恢复；这块**没有单元测试**，只靠真机回执。
下次动它之前先补测试，或者至少先跑一遍三种失败路径。

## 二十、木→石全程闭环（2026-11-08 18:1x，真机）

这是"从零开始自己发展"第一次完整跑通，全部是同一条通用逻辑走出来的：

```
她的包：空
craft wooden_pickaxe  → crafted 1 个 木镐（工具归她，已拿到手上）+ equipped
                        你的木板 57→54、木棍 6→4（材料照扣，成品归她）
gather what=stone ×2  → gather-found 石头 @ -102,10,10 → mined → picked-up
                        （只认真石头：安山岩挖出来是安山岩自己，做不了石镐）
她的包：cobblestone 1 → 5
craft stone_pickaxe   → crafted 1 个 石镐（工具归她，已拿到手上）+ equipped
她的包：cobblestone 5→2（正好 -3），旧木镐回到包里
快照：herHeld = minecraft:stone_pickaxe
```

### 这一路修掉的四个真问题（都是真机才暴露的）

1. **材料分在两个包里** → `mergeStock()` 合并判断，扣料"她优先你补差"。
2. **工具归玩家导致她永远空手** → 工具一律归她并立刻 equip（非工具才按材料归属）。
3. **`gather what=stone` 认的是 `base_stone_overworld`** → 挖到安山岩/花岗岩，
   做不了石镐；现在只认 `stone` / `cobblestone`。
4. **已经拿在手上时 `equip` 报"包里没有"** → 现在回「已经拿在手上了」。

### 下一步该做的

- 铁：`plan iron_pickaxe` 会算出 iron_ingot 是 `ask`（要烧），但目前"问玩家"只是提示词里的一句，
  没有真正的"请求-等待-接收"机制。
- 自主决策完整跑一轮：需要她在没有玩家指令的情况下自己 plan → gather → craft。

## 二十一、闭环执行器 make（2026-11-08 18:1x）

目标：**一次调用，她自己走完 采集 → 加工 → 做成**，中间不花模型调用。

```
action=make item=minecraft:stone_axe rounds=8
→ done: true, rounds: 3
   did: ["做 stone_axe", "去采石头"]
   asks: []
```

实现分两层：

- `lib/make.mjs`（纯逻辑、可测）：`plan()` 拿步骤 → 执行第一步 → 再 plan → 直到没步骤；
  执行失败立刻停并带原因；遇到 `ask` 停住把问题交回模型；轮数上限防死循环。
- `index.js` 的 `action=make`：把 `plan` 接 mod 的配方树，把 `exec` 接
  `gather / craft / equip` 三个真实命令 + 等回执。

### 两个真机才暴露的坑

1. **ack 竞态**：插件原来只存"最新一条 ack"，而她的自主会话与工具调用会同时发命令，
   两条回执挤在 80ms 内就漏 → 报"gather 没回话"。
   现在有 `state.ackSeq` + `state.ackLog`（带序号、留 200 条），`waitAck(match, ms, from)` 从
   发命令前的位置往后找。
2. **`stockOf()` 不数手上的东西**：工具做好是直接拿到手上的（不在背包），
   于是 plan 认为"还没有这把斧子"，会一直重复做 → 现在背包 + 主手 + 副手 + 玩家背包都算。

### 下一步

`ask` 现在只是"停下来把问题交回模型"，还没有真正的"请求 → 等玩家给 → 继续"机制。
要把铁档打通，需要给 mod 加一个"等待玩家交东西"的状态（或者由插件轮询
`inventory`，看到材料到了就继续执行 `make`）。

## 二十二、"卡死"其实是四条代码在互相抵消（2026-11-08 18:5x–19:1x）

另一个会话里她的原话：「卡死在 -188.4, 118, -43.9，重新收回、生成后也没变化，
走路指令一律没有效果。我这边就不再发指令了，等环境恢复。」
实测她 tick 正常（20/s）、活着、离玩家 17 格不动 —— 不是卡死，是代码把指令吃掉了。

### 四条原因（按发现顺序）

1. **一次算路失败就取消目标**：为防"直线走进深坑"加的兜底，`pathToward()` 返回 null 时
   直接 `target = null; stuck = true` → 外面下的 goto 被一个瞬间的算路失败整个吃掉。
   改成给 2 秒宽限（连续 40 tick 算不出才认输）。
2. **`follow` 从来没生效**：`if (!followOn || !bodyOn) return;`，而 `bodyOn` 只有走
   `body` 命令才为真，自己显形的那只永远是 false → 她从不跟人。
3. **插件从没发过 `follow` 指令**：`followOn` 写在档位里，但没有任何地方推给 mod。
   连上时发一次。
4. **跟随距离一刀切 4 格**：修好 2、3 之后，"喜欢建筑"的她离玩家 4 格就被拽回来，
   永远搭不成东西。改成按性子给：黏人 4 / 守 4 / 建筑 16 / 采集 16 / 探险 24。

### 玩家最后的决定：不要范围限制

「不要范围限制」——所以：
- 牵引绳 `leash()` 整个删掉（方法、字段、tick 调用）
- 连接时不再自动开跟随；跟随只在他明确说"跟着我"时生效（并带上按性子的距离）
- 换成**一条极简规则** `farWatch()`：
  ```
  > 150 格 → ack far-report「我离你 N 格了，往回走」+ 朝玩家走（只报一次）
  20 秒还回不来 → ack far-teleport「走不回来（差 N 格），我直接过来了」+ requestTeleport
  < 100 格 → 重置，下次再远重新报
  ```

### 同一时段的其他修复

- **背包持久化**：死亡时的 `keptBag` 以前只在内存，关游戏就丢（实测丢过一整包工具）。
  现在死亡即写盘、读档读回、换身体（respawnDirty）前先收包。
- **到达判定带高度**：只判水平会让她站在崖顶"到达"脚下 6 格的矿 → `mine-unreachable`。
  现在要求水平 1.5 格内 **且** 高度差 ≤3。
- **`arrived` 去重**：同一个地方 15 秒只报一次（模型重试同一目标会刷十几条）。
- **`place` 用玩家背包兜底**：她包里没方块时用玩家的，回执标「用你背包里的」。

### 四次同一个坑（必须记住）

用 `String.Replace` 改文件、锚点不匹配 → **静默什么都没改**，编译照样过：

| 没改到 | 症状 |
|---|---|
| `gather` 的 `what` | 挖石头/铁矿一律当砍树 |
| `applyCraft` 尾部三种失败回执 | 报错时崩在半路 |
| `plan` 里的 `kind=smelt` | 铁锭仍是"问人" |
| `follow` 的 `!bodyOn` | 她从不跟人（"卡死"） |

**规矩**：这类改动一律用 `edit` 工具，改完立刻 `Select-String` 确认，再编译；最好再靠真机回执兜一层。

## 二十三、她的皮肤（2026-11-08 19:2x–20:1x）

### 换模型，不是换贴图

原来是 `WolfEntityRenderer`（狼的形状）。皮肤是给玩家布局画的（64×64 六面），
狼的 UV 是另一套，直接贴上去只会是一团错位色块。所以：

- 新增 `CompanionRenderer extends LivingEntityRenderer<CompanionEntity, PlayerEntityModel<CompanionEntity>>`
- 实体尺寸从 `0.6×0.85` 改成 `0.6×1.8`（人形模型按玩家身高算）
- 贴图 `assets/mc-companion/textures/entity/whale_girl.png`

### 脸的画法：结构比"精细"重要

自己在 8×8 里排元素，做了四版都不像。最后是**把参照皮肤逐像素量出来**才明白：

```
y8-y11  4 行头发（压到眉骨，额头一点不露）
y12     黑睫毛一行（每边 2px 黑）
y13-14  眼睛只有 2 行：外框黑 | 外侧白 | 内侧深蓝
y15     腮红 + 两侧青色发梢
```

我之前的错：把眼睛做成 3-4 行高、塞满整张脸 → 像面罩。**眼睛越小、头发越多，越像娘化角色**。

### 长发靠两层叠

- 帽子层：顶部蓬发 + 两侧/后面长发 + 尾鳍发饰 + 白荷叶发带
- 外套层（overlay）：两缕垂到胸前的长发 + 背后一大片长发

皮肤里"长发"不是画出来的，是**伸出轮廓外**的 overlay 堆出来的。

### 自定义皮肤窗口

设置页新增「她的皮肤」：填一张 64×64 png 的路径 → `{"cmd":"skin","path":...}` →
mod 用 `NativeImage` + `NativeImageBackedTexture` 注册动态贴图 → **立刻换、不重启**。
失败会 ack：`skin-bad: 找不到文件 / 必须是 64×64 的 png（这张是 128×128）`。

### 版权

- 自带那张是**自己画的**（结构参照 The Skindex 上的一张社区皮肤，但那只是"结构"，
  像素、配色、细节都是自己的），可以随 mod 分发。
- `cache/skin-blue-whale.png`（Skindex 原图）只在本机验证用，**不要打包发布**。
- 另一个参照 `dsh-skin-center`（仓库 MIT）里的 `deepseek-nv-q-bg.webp` 是鲸鱼娘插画，
  特征更清楚（头两侧尾鳍发饰、白荷叶发带 + 蓝结），已存 `cache/skinsrc/`。
