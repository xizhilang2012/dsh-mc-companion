package com.xizhilang.mccompanion;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.entity.WolfEntityRenderer;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.Set;

/**
 * 一根管子。
 *
 * 这个 mod 不含任何 AI，也不知道"她"是谁：只在本地开一个端口，
 * 把游戏里发生的事写出去，把外面想说的话塞进聊天框。
 *
 * 协议：127.0.0.1:25566，一行一个 JSON。
 *   收： {"cmd":"say","text":"..."}
 *   发： {"type":"chat","name":"Steve","text":"..."}
 *        {"type":"death","name":"Steve"}
 *        {"type":"health","value":12.5}
 *        {"type":"hello","version":"1.20.1"}
 */
public class McCompanionClient implements ClientModInitializer {
    private static final int PORT = 25566;

    private static final ConcurrentLinkedQueue<String> OUTGOING = new ConcurrentLinkedQueue<>();
    /** 所有连上来的对端（通常是插件那一条，但重载时可能短暂有两条）。 */
    private static final java.util.Set<Writer> PEERS = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private static final Gson GSON = new Gson();
    private static float lastHealth = -1f;
    private static int tickCounter = 0;

    /** 她的身体：一个带名字、跟着你走的实体。 */
    private static volatile boolean bodyOn = false;
    private static volatile boolean bodyDirty = false;
    private static volatile String bodyName = "";
    private static volatile String bodyType = "mc-companion:companion";
    /** 类型变了：把场上那只换掉，而不是留着一只 allay 冒充她。 */
    private static volatile boolean respawnDirty = false;

    /** 待执行的走位指令（在客户端线程里转成服务端的寻路）。 */
    private static volatile boolean gotoDirty = false;
    private static volatile double gotoX, gotoY, gotoZ;
    private static volatile boolean haltDirty = false;
    private static volatile boolean followOn = false;
    /** 跟随时保持多远：由性子决定（建筑/采集要空间，黏人要贴身）。 */
    private static volatile double followDistance = 8.0;
    private static volatile boolean comeDirty = false;
    private static volatile boolean renameDirty = false;
    private static volatile boolean mineDirty = false;
    private static volatile int mineX, mineY, mineZ;
    private static volatile boolean mineForce = false;
    /** 远距离派活时先走过去，到了再挖。 */
    private static volatile boolean scanDirty = false;
    private static volatile boolean recipeDirty = false;
    private static volatile String recipeItem = "";
    private static volatile boolean craftDirty = false;
    private static volatile boolean herBagDirty = false;
    /** 自动拾取：她身边 4 格内的掉落物自己收。 */
    private static volatile boolean autoPickupOn = true;
    private static volatile boolean purgeDirty = false;
    private static volatile boolean diagDirty = false;
    /** 进世界自己显形（不靠外部命令）。 */
    private static volatile boolean autoBodyOn = true;
    /** 规则：死了要不要掉背包。 */
    static volatile boolean dropOnDeath = false;
    /** 规则：她能不能被伤害。 */
    private static volatile boolean sheInvulnerable = true;
    /** 规则：死了要不要复活。 */
    private static volatile boolean revive = true;
    /** 召唤限流：上一次召唤的时刻 + 本分钟次数。 */
    private static long lastSummonAt = 0;
    private static int summonCount = 0;
    private static long summonWindowStart = 0;
    private static volatile String craftItem = "";
    /** mine 的相对目标：under（她脚下）/ underPlayer（你脚下）/ crosshair（准星） */
    private static volatile String mineRel = "";
    /** 自己找树：要扫多大一圈 */
    private static volatile boolean gatherDirty = false;
    private static volatile int gatherRadius = 24;
    /** 找什么：log（木头）/ stone（石头） */
    private static volatile String gatherWhat = "log";
    /** 要交给玩家的东西：合成完自动送过去；也可以手动让她"把东西给我"。 */
    private static net.minecraft.item.ItemStack deliverStack = net.minecraft.item.ItemStack.EMPTY;
    private static volatile boolean deliverDirty = false;
    private static volatile boolean deliverAll = false;
    private static int deliverTicks = 0;
    private static boolean deliverAnnounced = false;
    /** 为了做 3×3 而自己放合成台的次数（防止无限放）。 */
    private static int tablePlaceAttempts = 0;
    /**
     * 玩家亲手放下的方块位置。
     *
     * 她采木头时按 `minecraft:logs` 标签认，分不出"野生的树"和"你垒的木屋"——
     * 所以这里记一份账：右键放下方块时把坐标记下来，`gather` 跳过这些位置。
     * 存在每个存档的状态文件里，跟她的身份放在一起。
     */
    private static final java.util.Set<String> placedByPlayer = new java.util.LinkedHashSet<>();
    private static String pendingPlaceKey = null;
    private static int pendingPlaceTicks = 0;
    private static volatile boolean pendingMine = false;
    /** 排队挖矿等了多久：够不着要认输，不能永远挂着。 */
    private static int pendingMineTicks = 0;
    /** 刚挖掉的那格：她得走过去把掉落物捡起来（自动拾取只有 4 格，砍的地方常常刚好在 4 格外）。 */
    private static volatile boolean pickupDirty = false;
    private static int pickupX, pickupY, pickupZ;
    private static int pickupTicks = 0;
    /** 装备：让她像玩家一样手上拿工具。 */
    private static volatile boolean equipDirty = false;
    private static volatile String equipItem = "";
    /** 放方块：从她包里拿一件放到旁边（会挖不会放，就谈不上自己搭东西）。 */
    private static volatile boolean placeDirty = false;
    private static volatile String placeItem = "";
    /** 逃生口：她被坑里/墙里困住时，明确把她拉到玩家身边。 */
    private static volatile boolean rescueDirty = false;
    /** 烧炼：她要自己把矿烧成锭（熔炉 + 燃料 + 输入，等真实时间）。 */
    private static volatile boolean smeltDirty = false;
    private static volatile String smeltItem = "";
    private static volatile int smeltCount = 1;
    private static int smeltPending = 0;
    private static long smeltDoneAt = 0;
    /** 通用求解：想做 X 还缺什么（递归查配方）。 */
    private static volatile boolean planDirty = false;
    private static volatile String planItem = "";
    private static volatile int pendingMineX, pendingMineY, pendingMineZ;
    private static volatile boolean collectDirty = false;
    private static volatile boolean attackDirty = false;
    /** 上次快照时她的位置，用来算真实速度。 */
    private static double lastHerX = 0, lastHerZ = 0;
    private static long lastHerSampleAt = 0;
    /** 上次报 arrived 的位置和时间：同一个地方 15 秒内不重复报。 */
    private static double lastArrivedX = Double.NaN, lastArrivedZ = 0;
    private static long lastArrivedAt = 0;

    /**
     * 这个档里她是谁 —— 唯一权威。
     *
     * 以前是"客户端实体列表里看不见她就召唤"，可是看不见有两种情况：
     * 她死了，或者她只是走远了、区块没加载。两种情况分不清，就会把活着的那只
     * kill 掉再召唤一只新的——玩家看到的就是"她反复被杀"。
     *
     * 现在只信两件事：她的 UUID（存在档里），和 onDeath 记下的那一笔。
     */
    private static volatile String herUuid = null;
    private static volatile boolean herAlive = false;
    private static long herDiedAt = 0;
    /** 当前档的标识；换档要重新读状态文件。 */
    private static String bodyStateKey = null;
    /** 上次 tick 里抛异常的时刻，用来给报错限流。 */
    private static long lastTickErrorAt = 0;
    private static KeyBinding panelKey;

    @Override
    public void onInitializeClient() {
        // 实体类型由 main 入口注册（双端都要），这里只管渲染
        panelKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.mc-companion.panel", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_N, "category.mc-companion"));
        // 复用狼的渲染器：她的身体就是一只狼，但由我们指挥
        EntityRendererRegistry.register(ModEntities.COMPANION, CompanionRenderer::new);

        Thread bridge = new Thread(McCompanionClient::serve, "mc-companion-bridge");
        bridge.setDaemon(true);
        bridge.start();

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            // 一个插件 bug 不该把玩家的游戏打崩。
            // 之前 applyCraft 里的一个 NPE 直接把客户端关掉了——玩家看到的是
            // "合成没执行"，其实是游戏崩了。现在出错只记账，下一 tick 照常跑。
            try {
                tickOnce(client);
            } catch (Throwable error) {
                long now = System.currentTimeMillis();
                if (now - lastTickErrorAt > 10000) {      // 别每 tick 刷一次
                    lastTickErrorAt = now;
                    System.err.println("[mc-companion] tick 出错：" + error);
                    error.printStackTrace();
                    String where = error.getStackTrace().length > 0
                            ? error.getStackTrace()[0].toString() : "?";
                    ack("error", error.getClass().getSimpleName() + ": " + error.getMessage() + " @ " + where);
                }
            }
        });

        // 状态栏：屏幕左上角常驻显示她在干什么。
        // 之前只有 N 面板和"她的包"，你不按 N 就不知道她活着没、手上有什么。
        net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback.EVENT.register((context, tickDelta) -> {
            try {
                drawHud(context);
            } catch (Throwable ignored) {
                // 状态栏画不出来也不能影响游戏
            }
        });

        ClientReceiveMessageEvents.CHAT.register((message, signed, sender, params, time) -> {
            JsonObject event = new JsonObject();
            event.addProperty("type", "chat");
            event.addProperty("name", sender == null ? "" : sender.getName());
            event.addProperty("text", message.getString());
            emit(event);
        });

        // 记账：玩家亲手放下的方块，她采木头时不碰。
        // 右键瞬间只是"可能放下"（也可能是在开箱子、用床），所以先记下候选位置，
        // 下一个 tick 再看那个位置是不是真的有方块了。
        net.fabricmc.fabric.api.event.player.UseBlockCallback.EVENT.register((player, world, hand, hit) -> {
            var instance = MinecraftClient.getInstance();
            if (instance != null && instance.world == world && player == instance.player) {
                var stack = player.getStackInHand(hand);
                if (stack.getItem() instanceof net.minecraft.item.BlockItem) {
                    pendingPlaceKey = blockKey(hit.getBlockPos().offset(hit.getSide()));
                    pendingPlaceTicks = 0;
                }
            }
            return net.minecraft.util.ActionResult.PASS;
        });
    }

    private static String blockKey(net.minecraft.util.math.BlockPos pos) {
        return pos.getX() + "," + pos.getY() + "," + pos.getZ();
    }

    /** 右键之后隔一 tick 确认方块真的放下来了，才记账。 */
    private static void resolvePendingPlace(MinecraftClient client) {
        if (pendingPlaceKey == null) return;
        if (++pendingPlaceTicks < 2) return;                  // 等一 tick
        String key = pendingPlaceKey;
        pendingPlaceKey = null;
        pendingPlaceTicks = 0;
        if (client.world == null) return;
        String[] parts = key.split(",");
        if (parts.length != 3) return;
        try {
            var pos = new net.minecraft.util.math.BlockPos(
                    Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), Integer.parseInt(parts[2]));
            if (client.world.getBlockState(pos).isAir()) return;   // 没放成：那一下不是放置
            if (placedByPlayer.add(key)) {
                saveBodyState();
                ack("noted-placed", "记下你放的方块 " + key + "（她采集时会绕开）");
            }
        } catch (NumberFormatException ignored) {
            // 坏键直接丢
        }
    }

    /**
     * 在游戏里维持她的身体。
     *
     * 用命令做（summon / tp / data merge），所以需要世界允许作弊。
     * 没有 op 权限时什么也不做，不刷屏。
     */
    /**
     * 自己显形：进世界后如果发现"她"不在，就自己生成一个。
     *
     * 不靠外面下命令——她该自己出现。名字先用默认值，
     * 插件连上之后会用 rename 改成设置里的名字。
     */
    private static void selfSummon(MinecraftClient client) {
        if (!autoBodyOn) return;
        if (client.player == null || client.world == null || client.player.networkHandler == null) return;
        if (tickCounter % 40 != 0) return;                 // 每两秒看一次
        if (!client.player.hasPermissionLevel(2)) return;   // 没 op 就安静等
        ensureBodyState(client);

        if (respawnDirty) {                                 // 类型变了：换掉场上那只
            respawnDirty = false;
            purgeCompanions(client);
            client.player.networkHandler.sendCommand("kill @e[tag=mc_companion]");
            forgetHer();
            return;
        }

        // 1. 在场：认下她。老档第一次跑新版本时，就靠这一步接上
        //    （不挂 ENTITY_LOAD 事件：fabric-api 0.92.2 里没有 ServerEntityEvents；
        //      findCompanion 读的就是服务端世界，每 2 秒问一次效果一样）
        CompanionEntity here = findCompanion(client);
        if (here != null) {
            String id = here.getUuidAsString();
            if (!id.equals(herUuid) || !herAlive) {
                herUuid = id;
                herAlive = true;
                herDiedAt = 0;
                saveBodyState();
                ack("her-adopted", id);
            }
            // 她死前"留着"的那包东西，现在还给她（设置里不掉落时）
            if (!keptBag.isEmpty()) {
                int restored = 0;
                for (var stack : keptBag) {
                    if (!stack.isEmpty()) {
                        here.getBag().addStack(stack);
                        restored++;
                    }
                }
                keptBag.clear();
                // 还完必须立刻清盘：不然状态文件里那包东西还在，
                // 下次进游戏会再"还"一次——等于凭空复制一包工具。
                saveBodyState();
                if (restored > 0) ack("bag-restored", restored + " 摞东西还给她了");
            }
            return;
        }

        // 2. 她没死：只是这块区块没加载（走远了、在别的维度）。
        //    这里绝对不能召唤第二只——"每个档只生成一个"就是这一行。
        if (herUuid != null && herAlive) return;

        // 3. 她死了，或者这个档还从来没有过她
        if (!revive) return;
        long now = System.currentTimeMillis();
        if (herDiedAt > 0 && now - herDiedAt < 3000) return;   // 死了先躺三秒再回来
        // 限流：10 秒内最多一次，每分钟最多 5 次——宁可她不出现，也不能刷屏
        if (now - lastSummonAt < 10000) return;
        if (now - summonWindowStart > 60000) { summonWindowStart = now; summonCount = 0; }
        if (summonCount >= 5) {
            ack("summon-giveup", "一分钟内试了 5 次都没看到她（类型 " + bodyType + "），先停下");
            return;
        }
        lastSummonAt = now;
        summonCount++;
        summonBody(client);
    }

    /** 她死了：记账。复活只看这个标记，不再靠"看不见"。 */
    static void noteHerDeath() {
        herAlive = false;
        herDiedAt = System.currentTimeMillis();
        saveBodyState();
        ack("her-died", herUuid == null ? "还没记下她是谁" : herUuid);
    }

    /** 设置里"不掉落"时，把她的包先收起来，复活后还给她。 */
    private static final java.util.List<net.minecraft.item.ItemStack> keptBag = new java.util.ArrayList<>();

    static void keepBagOnDeath(net.minecraft.inventory.Inventory bag) {
        keptBag.clear();
        for (int i = 0; i < bag.size(); i++) {
            var stack = bag.getStack(i);
            if (!stack.isEmpty()) keptBag.add(stack.copy());
        }
        if (!keptBag.isEmpty()) {
            saveBodyState();          // 立刻写盘：她可能死在你关游戏之前
            ack("bag-kept", keptBag.size() + " 摞东西留着，等她回来");
        }
    }

    /** 忘掉这个档里的她：下一个 tick 会重新召唤一只。 */
    private static void forgetHer() {
        herUuid = null;
        herAlive = false;
        herDiedAt = 0;
        saveBodyState();
    }

    /** 生成她——这里是唯一一处拼 summon 命令的地方。 */
    private static void summonBody(MinecraftClient client) {
        // 只挡"活着的她"：留着 tag 的残骸不该阻止召唤，否则永远出不来
        if (findCompanion(client) != null) return;
        String display = bodyName.isEmpty() ? "同伴" : bodyName;
        StringBuilder nbt = new StringBuilder("{Tags:[\"mc_companion\"],NoAI:1b,Silent:1b,");
        if (sheInvulnerable) nbt.append("Invulnerable:1b,");
        nbt.append(ownerNbt(client));
        nbt.append("CustomName:'[{\"text\":\"").append(escapeJson(display)).append("\"}]'}");
        // 先按 tag 清一遍，靠命令而不是服务端对象——服务器上也有效
        client.player.networkHandler.sendCommand("kill @e[tag=mc_companion]");
        client.player.networkHandler.sendCommand(
                "summon " + bodyType + " "
                        + String.format("%.2f %.2f %.2f", client.player.getX() + 1.2,
                                client.player.getY(), client.player.getZ() - 1.2)
                        + " " + nbt);
        ack("self-summoned", display);
    }

    // ── 每个档一份状态：她是谁、还活着没 ─────────────────────────────
    // 存在 .minecraft/config/dsh-mc-companion/<档名>.json。
    // 为什么不写进存档：写 NBT 要走命令、要读命令回执，还得解析文本；
    // 而单机存档就在本机，一个 json 更好调试，删掉就等于"当这个档没有过她"。

    /**
     * 档的标识：单机用存档文件夹名，多人用服务器地址。
     *
     * 不要用 `WorldSavePath.ROOT`：它解析出来是 "."，档名会变成 `sp-.`，
     * 于是两个不同的存档共用一个状态文件——那就等于"每个档只生成一个"是假的。
     * 用 level.dat 的父目录，那个才是真正的文件夹名。
     */
    private static String saveKey(MinecraftClient client) {
        var server = client.getServer();
        if (server == null) {
            var entry = client.getCurrentServerEntry();
            return entry == null ? null : "mp-" + entry.address;
        }
        try {
            var levelDat = server.getSavePath(net.minecraft.util.WorldSavePath.LEVEL_DAT);
            var folder = levelDat == null ? null : levelDat.getParent();
            var name = folder == null ? null : folder.getFileName();
            if (name != null && !name.toString().isEmpty() && !".".equals(name.toString())) {
                return "sp-" + name;
            }
            // 兜底：folder 拿不到时用存档名，至少不同名字不会撞
            return "sp-" + server.getSaveProperties().getLevelName();
        } catch (Exception error) {
            return "sp-unknown";
        }
    }

    private static java.nio.file.Path bodyStateFile(String key) {
        String safe = key.replaceAll("[\\\\/:*?\"<>|]", "_");
        return net.fabricmc.loader.api.FabricLoader.getInstance().getConfigDir()
                .resolve("dsh-mc-companion").resolve(safe + ".json");
    }

    /** 换档了就把状态换过来；同一个档只读一次。 */
    private static void ensureBodyState(MinecraftClient client) {
        String key = saveKey(client);
        if (key == null || key.equals(bodyStateKey)) return;
        bodyStateKey = key;
        herUuid = null;
        herAlive = false;
        herDiedAt = 0;
        placedByPlayer.clear();
        try {
            var file = bodyStateFile(key);
            if (java.nio.file.Files.exists(file)) {
                var obj = JsonParser.parseString(
                        java.nio.file.Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
                if (obj.has("uuid") && !obj.get("uuid").isJsonNull()) herUuid = obj.get("uuid").getAsString();
                herAlive = obj.has("alive") && obj.get("alive").getAsBoolean();
                keptBag.clear();
                if (obj.has("bag") && obj.get("bag").isJsonArray()) {
                    for (var one : obj.getAsJsonArray("bag")) {
                        if (one == null || one.isJsonNull()) continue;
                        var entry = one.getAsJsonObject();
                        var itemId = net.minecraft.util.Identifier.tryParse(entry.get("id").getAsString());
                        if (itemId == null) continue;
                        int count = entry.has("count") ? entry.get("count").getAsInt() : 1;
                        keptBag.add(new net.minecraft.item.ItemStack(
                                net.minecraft.registry.Registries.ITEM.get(itemId), Math.max(1, count)));
                    }
                }
                if (obj.has("placed") && obj.get("placed").isJsonArray()) {
                    for (var one : obj.getAsJsonArray("placed")) {
                        if (one != null && !one.isJsonNull()) placedByPlayer.add(one.getAsString());
                    }
                }
                ack("her-state", "档 " + key + " 里她 " + (herUuid == null ? "没有记录" : herUuid)
                        + (herAlive ? "，活着" : "，不在世")
                        + "；记着玩家放过的 " + placedByPlayer.size() + " 个方块");
            } else {
                ack("her-state", "档 " + key + " 还没有状态文件");
            }
        } catch (Exception error) {
            ack("her-state", "读状态失败：" + error.getClass().getSimpleName());
        }
    }

    private static void saveBodyState() {
        if (bodyStateKey == null) return;
        try {
            var file = bodyStateFile(bodyStateKey);
            java.nio.file.Files.createDirectories(file.getParent());
            JsonObject obj = new JsonObject();
            if (herUuid == null) obj.add("uuid", com.google.gson.JsonNull.INSTANCE);
            else obj.addProperty("uuid", herUuid);
            obj.addProperty("alive", herAlive);
            // 玩家放过的方块：只留最近 20000 个，别让文件无限长
            var placed = new com.google.gson.JsonArray();
            int skip = Math.max(0, placedByPlayer.size() - 20000);
            int index = 0;
            for (String key : placedByPlayer) {
                if (index++ < skip) continue;
                placed.add(key);
            }
            obj.add("placed", placed);
            // 她的包也写盘：她死的时候如果游戏正好关了，内存里那份就没了
            //（实测丢过一整包工具：石镐/石斧/木镐全空）
            var bagJson = new com.google.gson.JsonArray();
            for (var stack : keptBag) {
                if (stack.isEmpty()) continue;
                var one = new JsonObject();
                one.addProperty("id", net.minecraft.registry.Registries.ITEM.getId(stack.getItem()).toString());
                one.addProperty("count", stack.getCount());
                bagJson.add(one);
            }
            obj.add("bag", bagJson);
            obj.addProperty("savedAt", System.currentTimeMillis());
            java.nio.file.Files.writeString(file, GSON.toJson(obj), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            // 写不进去也不影响这一局：内存里还记着
        }
    }

    private static void maintainBody(MinecraftClient client) {
        if (client.player == null || client.player.networkHandler == null) return;
        if (bodyDirty) {
            bodyDirty = false;
            if (!client.player.hasPermissionLevel(2)) {
                System.err.println("[mc-companion] 没有 op 权限，起不了身体（世界要允许作弊）");
                bodyOn = false;
                return;
            }
            // 先清干净：早期生成的实体可能没有 tag，命令杀不掉
            int purged = purgeCompanions(client);
            if (purged > 0) ack("purged", purged + " 个旧的");
            forgetHer();                       // 清场就是重新来过：下次召唤是新的 uuid
            if (bodyOn) {
                summonBody(client);
            } else {
                client.player.networkHandler.sendCommand("kill @e[tag=mc_companion]");
            }
            return;
        }
        if (!bodyOn) return;
        if (!client.player.hasPermissionLevel(2)) return;
        // 自定义实体和原版狼/猫都用寻路跟着走，不传送
        if (isPathfindingType()) return;
        if (tickCounter % 20 != 0) return;
        client.player.networkHandler.sendCommand(
                "tp @e[tag=mc_companion,limit=1] "
                        + String.format("%.2f %.2f %.2f", client.player.getX() + 1.2,
                                client.player.getY(), client.player.getZ() - 1.2));
    }

    /**
     * 把"走到某处"的指令交给服务端的那个实体。
     *
     * 客户端改不动实体，单机时客户端和服务端在同一个进程里，
     * 所以这里通过 client.getServer() 拿到整合服务端再操作。
     */

    /** 跟着你走——用寻路，不是传送。距离够近就不动。 */
    private static void follow(MinecraftClient client) {
        // 只要开了跟随就走，不再要求 bodyOn：
        // bodyOn 只有走"body 命令"才为真，自己显形的那只永远是 false →
        // 她从不主动跟着你（实测站在 8.8 格外一动不动，外面看起来像"卡死"）。
        if (!followOn) return;
        if (client.player == null) return;
        if (tickCounter % 40 != 0) return;
        CompanionEntity companion = findCompanion(client);
        if (companion == null) return;
        double dx = companion.getX() - client.player.getX();
        double dz = companion.getZ() - client.player.getZ();
        // 阈值由外面按性子给：黏人 4 格、建筑/采集 16 格、探险 24 格。
        // 一刀切 4 格的话，"喜欢建筑"的她会被一直拽着跟在你屁股后面，搭不成东西。
        if (dx * dx + dz * dz < followDistance * followDistance) return;
        companion.walkTo(client.player.getX(), client.player.getY(), client.player.getZ());
    }
    private static void applyOrders(MinecraftClient client) {
        if (!gotoDirty && !haltDirty && !comeDirty) return;
        ack("order-applied", "goto=" + gotoDirty + " halt=" + haltDirty);
        CompanionEntity companion = findCompanion(client);
        if (companion == null) {
            ack("order-no-companion", "");
            gotoDirty = false;
            haltDirty = false;
            return;
        }
        if (comeDirty) {
            companion.walkTo(client.player.getX(), client.player.getY(), client.player.getZ());
            comeDirty = false;
        }
        if (haltDirty) {
            companion.halt();
            haltDirty = false;
        }
        if (gotoDirty) {
            companion.walkTo(gotoX, gotoY, gotoZ);
            gotoDirty = false;
        }
    }


    /** 这些类型有自己的寻路，靠 tp 会打架。 */
    private static boolean isPathfindingType() {
        return bodyType.contains("mc-companion")
                || bodyType.contains("wolf")
                || bodyType.contains("cat")
                || bodyType.contains("fox");
    }
    /**
     * 让她挖掉一个方块。
     *
     * 走服务端的世界对象（单机时在同一个进程里），所以会正常掉落物品。
     * 距离太远就不挖——不然等于远程拆家。
     */
    private static void applyMine(MinecraftClient client) {
        if (!mineDirty) return;
        mineDirty = false;
        CompanionEntity her = findCompanion(client);
        if (her == null) {
            ack("mine-no-companion", "");
            return;
        }
        var server = client.getServer();
        if (server == null || client.world == null) {
            ack("mine-no-server", "只能在单机/整合服务端用");
            return;
        }
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return;
        resolveRelativeTarget(client, her);
        var pos = new net.minecraft.util.math.BlockPos(mineX, mineY, mineZ);
        var state = world.getBlockState(pos);
        if (state.isAir()) {
            ack("mine-air", "");
            return;
        }
        double distance = Math.sqrt(her.squaredDistanceTo(mineX + 0.5, mineY + 0.5, mineZ + 0.5));
        if (distance > 4.5) {
            // 不管谁下的命令，都先走过去——她不是远程工具
            her.walkTo(mineX + 0.5, mineY, mineZ + 0.5);
            pendingMineX = mineX;
            pendingMineY = mineY;
            pendingMineZ = mineZ;
            pendingMine = true;
            pendingMineTicks = 0;          // 新目标：超时重新算
            ack("mine-heading", String.format("%.1f 格外，走过去再挖", distance));
            return;
        }
        String blockName = state.getBlock().getName().getString();
        ensureToolFor(her, state);                       // 先换合适的工具
        // 生存逻辑：要工具的方块，手上没有合适的就不许挖。
        // world.breakBlock() 本身不看工具——空手也能敲下圆石，那是给玩家挖矿的规则，
        // 我们不能拿它当后门，不然"先做木镐"整条链就没有意义。
        if (!canMine(her, state)) {
            ack("mine-need-tool", blockName + " 要工具才挖得动，她手上没有合适的");
            return;
        }
        boolean broke = world.breakBlock(pos, true, her);
        if (broke) notePickup(mineX, mineY, mineZ);   // 掉落物在 4 格开外，得走过去捡
        ack(broke ? "mined" : "mine-failed", blockName);
    }

    /**
     * 捡东西：把她附近的掉落物收进玩家背包。
     *
     * 她不能像玩家那样捡，所以这里直接把物品塞给你——当个帮手。
     */
    private static void applyCollect(MinecraftClient client) {
        if (!collectDirty) return;
        collectDirty = false;
        CompanionEntity her = findCompanion(client);
        if (her == null || client.player == null) {
            ack("collect-no-companion", "");
            return;
        }
        int taken = collectNear(client, her, 8.0);
        ack("collected", taken + " 件");
    }

    /**
     * 自动拾取：她身边 4 格内的掉落物自己收进包里。
     *
     * 不等口令——伙伴看到东西会捡。范围小是故意的：
     * 你正想捡的那块她不会抢，只有落在她脚边的才会进她的包。
     */
    private static void autoCollect(MinecraftClient client) {
        if (!autoPickupOn) return;
        if (tickCounter % 20 != 0) return;
        CompanionEntity her = findCompanion(client);
        if (her == null || client.player == null) return;
        int taken = collectNear(client, her, 4.0);
        if (taken > 0) ack("auto-collected", taken + " 件");
    }

    /** 收掉落物到她包里（满了才给你），返回件数。 */
    private static int collectNear(MinecraftClient client, CompanionEntity her, double radius) {
        var server = client.getServer();
        if (server == null || client.world == null) return 0;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return 0;
        double limit = radius * radius;
        int taken = 0;
        for (var entity : world.iterateEntities()) {
            if (!(entity instanceof net.minecraft.entity.ItemEntity item)) continue;
            if (item.isRemoved() || item.getStack().isEmpty()) continue;
            if (item.squaredDistanceTo(her) > limit) continue;
            var stack = item.getStack().copy();
            // 先放她自己的包；她的包满了才塞给你（addStack 返回没装下的那部分）
            var rest = her.getBag().addStack(stack);
            if (rest.isEmpty()) {
                item.discard();
                taken++;
            } else if (client.player.getInventory().insertStack(rest)) {
                item.discard();
                taken++;
            }
        }
        return taken;
    }

    /**
     * 打一下最近的敌对生物。
     *
     * 只打"活的、不是玩家的、在她 4 格内"的东西，避免误伤你和动物。
     */
    private static void applyAttack(MinecraftClient client) {
        if (!attackDirty) return;
        attackDirty = false;
        CompanionEntity her = findCompanion(client);
        if (her == null) {
            ack("attack-no-companion", "");
            return;
        }
        var server = client.getServer();
        if (server == null || client.world == null) return;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return;
        net.minecraft.entity.LivingEntity target = null;
        double best = 16.0;   // 4 格
        for (var entity : world.iterateEntities()) {
            if (!(entity instanceof net.minecraft.entity.mob.HostileEntity mob)) continue;
            if (!mob.isAlive() || mob.isRemoved()) continue;
            double d = mob.squaredDistanceTo(her);
            if (d < best) {
                best = d;
                target = mob;
            }
        }
        if (target == null) {
            ack("attack-none", "附近没有敌人");
            return;
        }
        String name = target.getName().getString();
        target.damage(world.getDamageSources().mobAttack(her), 4.0f);
        ack("attacked", name);
    }


    /** 超过这个距离就提醒一次。 */
    private static final double FAR_REPORT_DISTANCE = 150.0;
    /** 回到这个距离内就算"回来了"，下次再远重新提醒。 */
    private static final double FAR_RESET_DISTANCE = 100.0;
    /** 往回走多久还回不来就直接传送。 */
    private static final long FAR_RETURN_TIMEOUT_MS = 20000L;

    private static boolean farReported = false;
    private static long farStartedAt = 0;

    /**
     * 离得太远：报一次，然后往回走；回不来就传送。
     *
     * 她去哪儿都行（不受范围限制），但不能真走丢：
     * 150 格报一次，给 20 秒走回来，还回不来就直接 tp 过来。
     */
    private static void farWatch(MinecraftClient client) {
        if (client.player == null) return;
        var her = findCompanion(client);
        if (her == null) return;
        double distance = her.distanceTo(client.player);
        if (distance < FAR_RESET_DISTANCE) {
            farReported = false;
            farStartedAt = 0;
            return;
        }
        if (distance < FAR_REPORT_DISTANCE) return;
        long now = System.currentTimeMillis();
        if (!farReported) {
            farReported = true;
            farStartedAt = now;
            her.walkTo(client.player.getX(), client.player.getY(), client.player.getZ());
            ack("far-report", "我离你 " + Math.round(distance) + " 格了，往回走");
            return;
        }
        if (!her.hasTarget() && now - farStartedAt < FAR_RETURN_TIMEOUT_MS) {
            her.walkTo(client.player.getX(), client.player.getY(), client.player.getZ());
        }
        if (now - farStartedAt >= FAR_RETURN_TIMEOUT_MS) {
            her.requestTeleport(client.player.getX() + 1.0, client.player.getY(), client.player.getZ() - 1.0);
            her.halt();
            farReported = false;
            farStartedAt = 0;
            ack("far-teleport", "走不回来（差 " + Math.round(distance) + " 格），我直接过来了");
        }
    }

    /**
     * 自己找树：在周围找最近的一个原木，然后走过去砍掉。
     *
     * "周围有什么"这件事不该由外面告诉她——她站在那儿，看得见。
     * 用原版标签 `minecraft:logs` 认，所以任何 mod 的木头也算
     * （不写死橡木/白桦这些 id，换整合包也不用改代码）。
     *
     * 找到之后直接接上挖矿那条路：远就自己走过去（先到再动手），
     * 到了再砍，砍下来的东西她 4 格内自动捡进包。
     */
    private static void applyGather(MinecraftClient client) {
        if (!gatherDirty) return;
        gatherDirty = false;
        CompanionEntity her = findCompanion(client);
        if (her == null) {
            ack("gather-no-companion", "");
            return;
        }
        var server = client.getServer();
        if (server == null || client.world == null) {
            ack("gather-no-server", "只能在单机/整合服务端用");
            return;
        }
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return;

        // 目标要"挖出来正好是我们要的东西"：要圆石就只认 stone / cobblestone。
        // 安山岩、花岗岩、深板岩挖出来是它们自己，拿了也做不了石镐
        //（实测踩过：她挖了一堆安山岩，plan 还是说缺圆石）。
        boolean wantStone = "stone".equals(gatherWhat);
        boolean wantIron = "iron".equals(gatherWhat);
        java.util.function.Predicate<net.minecraft.block.BlockState> match = wantIron
                ? state -> state.isOf(net.minecraft.block.Blocks.IRON_ORE)
                    || state.isOf(net.minecraft.block.Blocks.DEEPSLATE_IRON_ORE)
                : wantStone
                ? state -> state.isOf(net.minecraft.block.Blocks.STONE)
                    || state.isOf(net.minecraft.block.Blocks.COBBLESTONE)
                : state -> state.isIn(net.minecraft.registry.tag.BlockTags.LOGS);
        var found = findNearestMarked(world, her.getBlockPos(), gatherRadius, match);
        int usedRadius = gatherRadius;
        if (found == null && gatherRadius < 64) {
            // 近处没有就往外再看一圈（最多 64 格），别第一圈没有就放弃
            usedRadius = Math.min(gatherRadius * 2, 64);
            found = findNearestMarked(world, her.getBlockPos(), usedRadius, match);
        }
        if (found == null) {
            ack("gather-none", "周围 " + usedRadius + " 格里没有"
                    + (wantIron ? "铁矿" : wantStone ? "石头" : "树"));
            return;
        }
        String name = world.getBlockState(found).getBlock().getName().getString();
        ack("gather-found", name + " @ " + found.getX() + "," + found.getY() + "," + found.getZ()
                + "（" + Math.round(Math.sqrt(her.getBlockPos().getSquaredDistance(found))) + " 格外）");
        mineX = found.getX();
        mineY = found.getY();
        mineZ = found.getZ();
        mineForce = false;
        mineDirty = true;          // 交给挖矿那条路：先走过去，到了再砍
    }

    /** 以 center 为中心找最近的一个带指定标签的方块（原木/石头）；找不到返回 null。 */
    private static net.minecraft.util.math.BlockPos findNearestMarked(
            net.minecraft.server.world.ServerWorld world,
            net.minecraft.util.math.BlockPos center,
            int radius,
            java.util.function.Predicate<net.minecraft.block.BlockState> match) {
        net.minecraft.util.math.BlockPos best = null;
        double bestDistance = Double.MAX_VALUE;
        // 树在竖直方向不会离她太远，把 y 夹住：省掉大量空扫
        int minY = Math.max(world.getBottomY() + 1, center.getY() - 24);
        int maxY = Math.min(world.getTopY() - 1, center.getY() + 24);
        int cx0 = (center.getX() - radius) >> 4;
        int cx1 = (center.getX() + radius) >> 4;
        int cz0 = (center.getZ() - radius) >> 4;
        int cz1 = (center.getZ() + radius) >> 4;
        for (int cx = cx0; cx <= cx1; cx++) {
            for (int cz = cz0; cz <= cz1; cz++) {
                // 关键：先问"加载了吗"。
                // 直接 world.getBlockState() 对未加载区块会去 getChunk(..., true)——
                // 那是"生成并加载地形"，扫一圈等于把周围所有区块全生成一遍
                // （实测 24 格要 16 秒，48 格一分钟都回不来）。
                if (!world.isChunkLoaded(cx, cz)) continue;
                var chunk = world.getChunk(cx, cz);
                int baseX = cx << 4;
                int baseZ = cz << 4;
                for (int y = minY; y <= maxY; y++) {
                    var section = chunk.getSection(chunk.getSectionIndex(y));
                    if (section.isEmpty()) continue;        // 整段是空气，跳过
                    for (int lx = 0; lx < 16; lx++) {
                        int x = baseX + lx;
                        if (Math.abs(x - center.getX()) > radius) continue;
                        for (int lz = 0; lz < 16; lz++) {
                            int z = baseZ + lz;
                            if (Math.abs(z - center.getZ()) > radius) continue;
                            var pos = new net.minecraft.util.math.BlockPos(x, y, z);
                            if (placedByPlayer.contains(blockKey(pos))) continue;   // 你放的，不砍
                            if (!match.test(chunk.getBlockState(pos))) continue;
                            // 打分：水平距离 + 4×高度差。
                            // 树顶那几格水平上很近、但她走不过去（够不着），
                            // 不加高度惩罚就会一直挑树顶，然后卡在那儿挖不到。
                            double hx = pos.getX() + 0.5 - center.getX();
                            double hz = pos.getZ() + 0.5 - center.getZ();
                            double hy = pos.getY() - center.getY();
                            double distance = hx * hx + hz * hz + 4.0 * hy * hy;
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                best = pos;
                            }
                        }
                    }
                }
            }
        }
        return best;
    }

    /**
     * 把东西交给玩家。
     *
     * 她的包是她自己的：采来的木头先归她。但"给你做的东西"要送到你手上——
     * 所以她得自己走过来（不是隔空塞进你背包），到了再交。
     * 走不过去就明说，东西留在她包里（`herbag` 看得见），不假装给了。
     */
    private static void applyDeliver(MinecraftClient client) {
        if (!deliverDirty) return;
        if (client.player == null) return;
        CompanionEntity her = findCompanion(client);
        if (her == null) {
            deliverDirty = false;
            ack("deliver-no-companion", "她不在场，东西送不了");
            return;
        }
        double distance = her.distanceTo(client.player);
        if (distance > 3.0) {
            if (!her.hasTarget()) {
                her.walkTo(client.player.getX(), client.player.getY(), client.player.getZ());
            }
            if (!deliverAnnounced) {
                deliverAnnounced = true;
                ack("deliver-heading", String.format("%.1f 格外，走过去给你", distance));
            }
            if (++deliverTicks > 240) {          // 12 秒还到不了就认
                deliverDirty = false;
                deliverTicks = 0;
                deliverAnnounced = false;
                ack("deliver-stuck", "过不去，东西还在她包里（herbag 能看）");
            }
            return;
        }
        int given = 0;
        String what = "";
        if (!deliverStack.isEmpty()) {
            what = deliverStack.getName().getString();
            given += handOver(client, deliverStack);
            deliverStack = net.minecraft.item.ItemStack.EMPTY;
        }
        if (deliverAll) {
            for (int i = 0; i < her.getBag().size(); i++) {
                var stack = her.getBag().getStack(i);
                if (stack.isEmpty()) continue;
                given += handOver(client, stack.copy());
                her.getBag().setStack(i, net.minecraft.item.ItemStack.EMPTY);
            }
            deliverAll = false;
        }
        deliverDirty = false;
        deliverTicks = 0;
        deliverAnnounced = false;
        ack("delivered", what.isEmpty() ? given + " 件" : what + "，" + given + " 件");
    }

    /** 塞进玩家背包；装不下就丢在他脚边，别默默消失。返回件数。 */
    private static int handOver(MinecraftClient client, net.minecraft.item.ItemStack stack) {
        int count = stack.getCount();
        client.player.getInventory().insertStack(stack);
        if (!stack.isEmpty()) client.player.dropItem(stack, false);
        return count;
    }

    /**
     * 砍完/挖完之后，走过去把掉落物捡进包。
     *
     * 自动拾取只有 4 格，而她常常是站在 4 格开外把方块挖掉的——
     * 掉落物就留在原地了，看起来像"砍了但没拿到"。
     * 这里让她走到那格附近再收（不是隔空收，仍然守"先到再动手"）。
     */
    private static void applyPickup(MinecraftClient client) {
        if (!pickupDirty) return;
        if (deliverDirty) return;                 // 交付优先，别抢她的目标
        CompanionEntity her = findCompanion(client);
        if (her == null) {
            pickupDirty = false;
            return;
        }
        if (!dropNear(client, pickupX, pickupY, pickupZ, 3.5)) {
            pickupDirty = false;                  // 没了：被玩家捡了，或她自己已经收到
            return;
        }
        double distance = Math.sqrt(her.squaredDistanceTo(pickupX + 0.5, pickupY + 0.5, pickupZ + 0.5));
        if (distance > 3.0) {
            if (!her.hasTarget()) her.walkTo(pickupX + 0.5, pickupY, pickupZ + 0.5);
            if (++pickupTicks > 200) {            // 10 秒走不过去就认
                pickupDirty = false;
                pickupTicks = 0;
                ack("pickup-gaveup", "掉落物在 " + Math.round(distance) + " 格外，过不去");
            }
            return;
        }
        int taken = collectNear(client, her, 6.0);
        pickupDirty = false;
        pickupTicks = 0;
        if (taken > 0) ack("picked-up", taken + " 件");
    }

    /** 记下"这格挖掉了，等会儿去捡"。 */
    private static void notePickup(int x, int y, int z) {
        pickupX = x;
        pickupY = y;
        pickupZ = z;
        pickupTicks = 0;
        pickupDirty = true;
    }

    /**
     * 装备：把她包里的东西拿到手上（或卸下）。
     *
     * 这不是装饰——原版的掉落表要看手上的工具：空手挖石头什么都不掉，
     * 拿着木镐才掉圆石。所以"能不能发展"取决于她会不会用工具。
     */
    private static void applyEquip(MinecraftClient client) {
        if (!equipDirty) return;
        equipDirty = false;
        CompanionEntity her = findCompanion(client);
        if (her == null) {
            ack("equip-no-companion", "");
            return;
        }
        var slot = net.minecraft.entity.EquipmentSlot.MAINHAND;
        var old = her.getEquippedStack(slot);
        if (equipItem.isEmpty() || "none".equals(equipItem)) {
            if (!old.isEmpty()) {
                her.getBag().addStack(old);
                her.equipStack(slot, net.minecraft.item.ItemStack.EMPTY);
            }
            ack("equipped", "空手");
            return;
        }
        var id = net.minecraft.util.Identifier.tryParse(equipItem);
        if (id == null) {
            ack("equip-bad-id", equipItem);
            return;
        }
        var item = net.minecraft.registry.Registries.ITEM.get(id);
        // 已经拿在手上就别再报"包里没有"（她做好工具是直接拿到手上的，不在包里）
        if (!old.isEmpty() && old.isOf(item)) {
            ack("equipped", old.getName().getString() + " 已经拿在手上了");
            return;
        }
        int index = -1;
        for (int i = 0; i < her.getBag().size(); i++) {
            var stack = her.getBag().getStack(i);
            if (!stack.isEmpty() && stack.isOf(item)) { index = i; break; }
        }
        if (index < 0) {
            ack("equip-missing", "她包里没有 " + equipItem);
            return;
        }
        var taken = her.getBag().getStack(index).copy();
        her.getBag().setStack(index, net.minecraft.item.ItemStack.EMPTY);
        her.equipStack(slot, taken);
        if (!old.isEmpty()) her.getBag().addStack(old);
        ack("equipped", taken.getName().getString() + " ×" + taken.getCount());
    }

    /**
     * 挖之前先换合适的工具。
     *
     * 只在"手里的不合适"时才动：从包里找挖这块最快的那件，和她手里的换。
     * 换不到就不换——空手也能挖的方块照挖，只是可能不掉东西，那时她会拿到空手的结果。
     */
    private static void ensureToolFor(CompanionEntity her, net.minecraft.block.BlockState state) {
        var slot = net.minecraft.entity.EquipmentSlot.MAINHAND;
        var held = her.getEquippedStack(slot);
        if (!held.isEmpty() && held.isSuitableFor(state)) return;
        int bestIndex = -1;
        float bestSpeed = -1;
        for (int i = 0; i < her.getBag().size(); i++) {
            var stack = her.getBag().getStack(i);
            if (stack.isEmpty() || !stack.isSuitableFor(state)) continue;
            float speed = stack.getMiningSpeedMultiplier(state);
            if (speed > bestSpeed) {
                bestSpeed = speed;
                bestIndex = i;
            }
        }
        if (bestIndex < 0) return;                       // 包里没有合适的工具
        var better = her.getBag().getStack(bestIndex).copy();
        her.getBag().setStack(bestIndex, held.isEmpty() ? net.minecraft.item.ItemStack.EMPTY : held);
        her.equipStack(slot, better);
        ack("tool-swap", "换成 " + better.getName().getString());
    }

    /** 她自己干活要用的方块：做出来得留在她身上，不然用不了。 */
    private static boolean isStationBlock(net.minecraft.item.Item item) {
        return item == net.minecraft.item.Items.CRAFTING_TABLE
                || item == net.minecraft.item.Items.FURNACE
                || item == net.minecraft.item.Items.BLAST_FURNACE;
    }

    /** 这块能不能挖：要工具的方块，手上必须有一件合适的。 */
    private static boolean canMine(CompanionEntity her, net.minecraft.block.BlockState state) {
        if (!state.isToolRequired()) return true;
        var held = her.getEquippedStack(net.minecraft.entity.EquipmentSlot.MAINHAND);
        return !held.isEmpty() && held.isSuitableFor(state);
    }

    /**
     * 够不着就垫方块（搭脚架）。
     *
     * 她挖的矿常常在头顶两三格：跳又跳不上去，绕又绕不过去，以前只能报 stuck。
     * 现在按玩家的老办法办——把手里能放的方块垫在脚下，站上去，一格一格够。
     * 真扣材料（她包里优先，其次玩家的），最多垫 4 格，防止一路搭到天上。
     *
     * @return 垫上去之后离目标更近了吗
     */
    private static boolean tryScaffold(MinecraftClient client, CompanionEntity her,
                                       double targetX, double targetY, double targetZ) {
        if (client.world == null || client.player == null) return false;
        if (targetY - her.getY() < 1.5) return false;          // 不是"太高"，是别的方向够不着
        var server = client.getServer();
        if (server == null) return false;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return false;

        // 找一件能放的方块：她包里优先，其次玩家背包
        net.minecraft.block.Block block = null;
        boolean fromHer = false;
        for (int i = 0; i < her.getBag().size(); i++) {
            var stack = her.getBag().getStack(i);
            if (stack.isEmpty()) continue;
            if (stack.getItem() instanceof net.minecraft.item.BlockItem blockItem) {
                block = blockItem.getBlock();
                fromHer = true;
                break;
            }
        }
        if (block == null) {
            for (int i = 0; i < client.player.getInventory().size(); i++) {
                var stack = client.player.getInventory().getStack(i);
                if (stack.isEmpty()) continue;
                if (stack.getItem() instanceof net.minecraft.item.BlockItem blockItem) {
                    block = blockItem.getBlock();
                    break;
                }
            }
        }
        if (block == null) return false;                        // 一块方块都没有

        var feet = her.getBlockPos();
        if (!world.getBlockState(feet).isAir()) return false;   // 脚下这格不是空的，没地方垫
        if (!world.setBlockState(feet, block.getDefaultState(), net.minecraft.block.Block.NOTIFY_ALL)) {
            return false;
        }
        // 扣材料（用哪个包放的从哪个包扣）
        if (fromHer) takeAnyBlock(her.getBag());
        else takeAnyBlock(client.player.getInventory());
        // 站上去
        her.requestTeleport(her.getX(), feet.getY() + 1.0, her.getZ());
        ack("scaffold", "垫了一层 " + block.getName().getString() + "（要到 y=" + Math.round(targetY) + "）");
        return true;
    }

    /** 从背包里拿走任意一块方块（用来扣垫脚的料）。 */
    private static boolean takeAnyBlock(net.minecraft.inventory.Inventory inv) {
        for (int i = 0; i < inv.size(); i++) {
            var stack = inv.getStack(i);
            if (stack.isEmpty()) continue;
            if (!(stack.getItem() instanceof net.minecraft.item.BlockItem)) continue;
            stack.decrement(1);
            if (stack.isEmpty()) inv.setStack(i, net.minecraft.item.ItemStack.EMPTY);
            return true;
        }
        return false;
    }

    /**
     * 通用求解：想做 X，还缺什么。
     *
     * 不再按"木→石→铁"写死阶梯——那只是结果，不是逻辑。
     * 真正的逻辑只有一条：想要某个东西 → 递归查配方 → 有现成的就跳过 →
     * 缺的如果是能采的（木头/石头）就去采，能做的就做，做不了的（要烧/要下矿）才问人。
     *
     * 返回一棵树，外面的插件把它拍平成"一步一步做什么"。
     */
    private static void applyPlan(MinecraftClient client) {
        if (!planDirty) return;
        planDirty = false;
        if (client.player == null) return;
        var server = client.getServer();
        if (server == null || client.world == null) {
            ack("plan-no-server", "只能在单机用");
            return;
        }
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return;
        var id = net.minecraft.util.Identifier.tryParse(planItem);
        if (id == null) {
            ack("plan-bad-id", planItem);
            return;
        }
        var target = net.minecraft.registry.Registries.ITEM.get(id);
        var event = new JsonObject();
        event.addProperty("type", "plan");
        event.addProperty("item", planItem);
        event.add("tree", planNode(client, world, target, 1, 0));
        emit(event);
    }

    /** 递归展开一层材料。depth 限制防止循环（木板↔木头这类配方）。 */
    private static JsonObject planNode(
            MinecraftClient client,
            net.minecraft.server.world.ServerWorld world,
            net.minecraft.item.Item item,
            int need,
            int depth) {
        var node = new JsonObject();
        node.addProperty("id", net.minecraft.registry.Registries.ITEM.getId(item).toString());
        node.addProperty("need", need);
        int have = stockOf(client, item);
        node.addProperty("have", have);
        int missing = Math.max(0, need - have);
        if (missing == 0) {
            node.addProperty("kind", "have");
            return node;
        }
        node.addProperty("missing", missing);

        // 只能烧出来的东西（锭、玻璃、砖…）直接判"问人"，不许走合成。
        // 不拦住会绕出死循环：铁镐要 3 铁锭 → 铁锭有"1 铁块=9 铁锭"的配方 →
        // 递归算成 3 锭 → 0.33 铁块 → 9 锭（实测就是报 need 铁锭 ×9）。
        // 能烧的锭：她自己能烧（矿自己挖、燃料是木头/煤），别判成"问人"。
        var oreIds = oreIdsFor(net.minecraft.registry.Registries.ITEM.getId(item).toString());
        if (oreIds.length > 0) {
            node.addProperty("kind", "smelt");
            node.addProperty("ore", oreIds[0]);
            node.addProperty("fuel", "minecraft:coal");
            node.addProperty("count", missing);
            return node;
        }
        if (isSmeltOnly(item)) {
            node.addProperty("kind", "ask");
            return node;
        }
        var recipe = findCraftingRecipeFor(world, item);
        if (recipe == null || depth >= 3) {
            node.addProperty("kind", kindOf(item));
            return node;
        }
        // 一次合成能做几个：探针摆一遍网格问配方（getOutput 在 1.20.1 常常是空的）
        int perCraft = Math.max(1, probeCraftCount(recipe, world));
        int crafts = (missing + perCraft - 1) / perCraft;

        node.addProperty("kind", "craft");
        node.addProperty("recipe", recipe.getId().toString());
        node.addProperty("perCraft", perCraft);
        node.addProperty("crafts", crafts);

        // 配方里每种材料出现几次（三个木板就是 3 份）
        var counts = new java.util.LinkedHashMap<net.minecraft.item.Item, Integer>();
        for (var ingredient : recipe.getIngredients()) {
            if (ingredient.isEmpty()) continue;
            var options = ingredient.getMatchingStacks();
            if (options.length == 0) continue;
            counts.merge(options[0].getItem(), 1, Integer::sum);
        }
        var children = new com.google.gson.JsonArray();
        for (var entry : counts.entrySet()) {
            children.add(planNode(client, world, entry.getKey(), entry.getValue() * crafts, depth + 1));
        }
        node.add("needs", children);
        return node;
    }

    /** 她包里 + 她手上 + 你背包里一共有几个。 */
    private static int stockOf(MinecraftClient client, net.minecraft.item.Item item) {
        int total = 0;
        var her = findCompanion(client);
        if (her != null) {
            total += countItemOf(her.getBag(), item);
            // 手上那件也要算：她做好工具是直接拿到手上的，
            // 不数手上的话 plan 会以为"还没有"，然后一直重复做同一把（实测踩过）。
            var hand = her.getEquippedStack(net.minecraft.entity.EquipmentSlot.MAINHAND);
            if (!hand.isEmpty() && hand.isOf(item)) total += hand.getCount();
            var off = her.getEquippedStack(net.minecraft.entity.EquipmentSlot.OFFHAND);
            if (!off.isEmpty() && off.isOf(item)) total += off.getCount();
        }
        if (client.player != null) total += countItemOf(client.player.getInventory(), item);
        return total;
    }

    private static int countItemOf(net.minecraft.inventory.Inventory inv, net.minecraft.item.Item item) {
        int total = 0;
        for (int i = 0; i < inv.size(); i++) {
            var stack = inv.getStack(i);
            if (!stack.isEmpty() && stack.isOf(item)) total += stack.getCount();
        }
        return total;
    }

    /** 这些只能烧出来/只能挖出来，她做不了：直接问玩家。 */
    private static boolean isSmeltOnly(net.minecraft.item.Item item) {
        var id = net.minecraft.registry.Registries.ITEM.getId(item).getPath();
        return id.endsWith("_ingot") || id.endsWith("_nugget") || id.equals("glass")
                || id.equals("brick") || id.equals("charcoal") || id.equals("stone")
                || id.equals("smooth_stone") || id.equals("netherite_scrap")
                || id.equals("diamond") || id.equals("redstone") || id.equals("lapis_lazuli")
                || id.equals("emerald") || id.equals("quartz") || id.equals("amethyst_shard")
                || id.equals("coal");
    }

    /** 这个物品靠什么搞到：采 / 她做不了要问人。 */
    private static String kindOf(net.minecraft.item.Item item) {
        var id = net.minecraft.registry.Registries.ITEM.getId(item).getPath();
        if (id.endsWith("_log") || id.endsWith("_wood") || id.endsWith("_planks")
                || id.equals("stick") || id.equals("crafting_table") || id.startsWith("wooden_")) {
            return "gather";                       // 木头这一条链，砍树就有
        }
        if (id.contains("cobblestone") || id.equals("stone") || id.equals("deepslate")
                || id.contains("andesite") || id.contains("diorite") || id.contains("granite")) {
            return "gather";                       // 石头，拿镐挖
        }
        return "ask";                              // 铁/钻石/玻璃/要烧的：她做不到，问人
    }

    /** 找一个能做出这个物品的合成配方。 */
    private static net.minecraft.recipe.CraftingRecipe findCraftingRecipeFor(
            net.minecraft.server.world.ServerWorld world,
            net.minecraft.item.Item item) {
        for (var recipe : world.getRecipeManager().listAllOfType(net.minecraft.recipe.RecipeType.CRAFTING)) {
            if (craftsTarget(recipe, item, world)) return recipe;
        }
        return null;
    }

    /** 这份配方一次能做几个。 */
    private static int probeCraftCount(
            net.minecraft.recipe.CraftingRecipe recipe,
            net.minecraft.server.world.ServerWorld world) {
        var probe = new VirtualGrid();
        int width = shapedWidth(recipe);
        var ingredients = recipe.getIngredients();
        for (int index = 0; index < ingredients.size(); index++) {
            var ingredient = ingredients.get(index);
            if (ingredient.isEmpty()) continue;
            int slot = width > 0 ? (index / width) * 3 + (index % width) : index;
            if (slot < 0 || slot >= 9) continue;
            var options = ingredient.getMatchingStacks();
            if (options.length == 0) return 1;
            probe.setStack(slot, options[0].copyWithCount(1));
        }
        var out = recipe.craft(probe, world.getRegistryManager());
        return out.isEmpty() ? 1 : out.getCount();
    }

    /** 某个位置附近有没有掉落物（服务端世界）。 */
    private static boolean dropNear(MinecraftClient client, double x, double y, double z, double radius) {
        var server = client.getServer();
        if (server == null || client.world == null) return false;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return false;
        double limit = radius * radius;
        for (var entity : world.iterateEntities()) {
            if (!(entity instanceof net.minecraft.entity.ItemEntity item)) continue;
            if (item.isRemoved() || item.getStack().isEmpty()) continue;
            if (item.squaredDistanceTo(x, y, z) <= limit) return true;
        }
        return false;
    }

    /** 她走到位了就把之前排队的那格挖掉。 */
    private static void finishPendingMine(MinecraftClient client) {
        if (!pendingMine) return;
        CompanionEntity her = findCompanion(client);
        if (her == null) {
            pendingMine = false;
            return;
        }
        double distance = Math.sqrt(her.squaredDistanceTo(pendingMineX + 0.5, pendingMineY + 0.5, pendingMineZ + 0.5));
        if (distance > 4.5) {
            // 先试着自己垫方块上去（玩家的老办法）：够不着多半是那格在头顶两三格。
            // 垫得上去就继续，垫不上去再走超时认输。
            if (pendingMineTicks % 20 == 0
                    && tryScaffold(client, her, pendingMineX + 0.5, pendingMineY, pendingMineZ + 0.5)) {
                pendingMineTicks += 20;              // 垫一次就多给点时间
                return;
            }
            // 够不着就得认输：树顶那格可能水平到了、竖直差 7 格。
            // 没有这个超时就会永远挂着一个 pending，外面以为她在干活。
            if (++pendingMineTicks > 300) {          // 15 秒
                pendingMine = false;
                pendingMineTicks = 0;
                ack("mine-unreachable", "那一格够不着（差 " + Math.round(distance) + " 格），换个目标");
            }
            return;   // 没到就继续走
        }
        pendingMine = false;
        pendingMineTicks = 0;
        var server = client.getServer();
        if (server == null || client.world == null) return;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return;
        var pos = new net.minecraft.util.math.BlockPos(pendingMineX, pendingMineY, pendingMineZ);
        if (world.getBlockState(pos).isAir()) {
            ack("mine-air", "到的时候已经没了");
            return;
        }
        String name = world.getBlockState(pos).getBlock().getName().getString();
        ensureToolFor(her, world.getBlockState(pos));     // 到了再换工具，才开始砍
        if (!canMine(her, world.getBlockState(pos))) {
            ack("mine-need-tool", name + " 要工具才挖得动，她手上没有合适的");
            return;
        }
        boolean broke = world.breakBlock(pos, true, her);
        if (broke) notePickup(pendingMineX, pendingMineY, pendingMineZ);   // 砍完去捡
        ack(broke ? "mined" : "mine-failed", name);
    }
    /**
     * 查库存：玩家背包 + 附近箱子的内容。
     *
     * 只读，不改世界。让她先"看见有什么"，才谈得上决定做什么。
     */
    private static void applyScan(MinecraftClient client) {
        if (!scanDirty) return;
        scanDirty = false;
        if (client.player == null) return;
        JsonObject event = new JsonObject();
        event.addProperty("type", "inventory");
        com.google.gson.JsonArray bag = new com.google.gson.JsonArray();
        var inv = client.player.getInventory();
        for (int i = 0; i < inv.size(); i++) {
            var stack = inv.getStack(i);
            if (stack.isEmpty()) continue;
            JsonObject one = new JsonObject();
            one.addProperty("id", net.minecraft.registry.Registries.ITEM.getId(stack.getItem()).toString());
            one.addProperty("count", stack.getCount());
            bag.add(one);
        }
        event.add("items", bag);

        com.google.gson.JsonArray chests = new com.google.gson.JsonArray();
        var server = client.getServer();
        if (server != null && client.world != null) {
            var world = server.getWorld(client.world.getRegistryKey());
            if (world != null) {
                var origin = client.player.getBlockPos();
                int r = 16;
                for (var pos : net.minecraft.util.math.BlockPos.iterate(origin.add(-r, -4, -r), origin.add(r, 4, r))) {
                    var be = world.getBlockEntity(pos);
                    if (!(be instanceof net.minecraft.block.entity.LootableContainerBlockEntity || be instanceof net.minecraft.block.entity.BarrelBlockEntity)) continue;
                    if (!(be instanceof net.minecraft.inventory.Inventory inventory)) continue;
                    JsonObject chest = new JsonObject();
                    chest.addProperty("x", pos.getX());
                    chest.addProperty("y", pos.getY());
                    chest.addProperty("z", pos.getZ());
                    com.google.gson.JsonArray inside = new com.google.gson.JsonArray();
                    for (int i = 0; i < inventory.size(); i++) {
                        var stack = inventory.getStack(i);
                        if (stack.isEmpty()) continue;
                        JsonObject one = new JsonObject();
                        one.addProperty("id", net.minecraft.registry.Registries.ITEM.getId(stack.getItem()).toString());
                        one.addProperty("count", stack.getCount());
                        inside.add(one);
                    }
                    if (inside.size() == 0) continue;
                    chest.add("items", inside);
                    chests.add(chest);
                    if (chests.size() >= 16) break;
                }
            }
        }
        event.add("chests", chests);
        emit(event);
    }

    /**
     * 查配方：这个物品怎么做。
     *
     * 从服务端的配方表里查，所以 mod 加进来的配方也能看到——
     * 不需要预先认识哪些 mod，也就顺带解决了"跨版本/跨 mod"的问题。
     */
    private static void applyRecipe(MinecraftClient client) {
        if (!recipeDirty) return;
        recipeDirty = false;
        JsonObject event = new JsonObject();
        event.addProperty("type", "recipes");
        event.addProperty("item", recipeItem);
        com.google.gson.JsonArray list = new com.google.gson.JsonArray();
        var server = client.getServer();
        if (server != null && client.world != null) {
            var world = server.getWorld(client.world.getRegistryKey());
            if (world != null) {
                var id = net.minecraft.util.Identifier.tryParse(recipeItem);
                if (id != null) {
                    var item = net.minecraft.registry.Registries.ITEM.get(id);
                    for (var recipe : world.getRecipeManager().listAllOfType(net.minecraft.recipe.RecipeType.CRAFTING)) {
                        if (!recipe.getOutput(world.getRegistryManager()).isOf(item)) continue;
                        JsonObject one = new JsonObject();
                        one.addProperty("id", recipe.getId().toString());
                        // 形状：有形状的报"几×几"，无形状的报"几样材料"——
                        // 3×3 的配方要合成台，这一点得让外面看得见
                        int[] shape = recipeShape(recipe);
                        one.addProperty("w", shape[0]);
                        one.addProperty("h", shape[1]);
                        one.addProperty("needsTable", needsTable(recipe));
                        com.google.gson.JsonArray need = new com.google.gson.JsonArray();
                        for (var ingredient : recipe.getIngredients()) {
                            var options = ingredient.getMatchingStacks();
                            if (options.length == 0) continue;
                            JsonObject entry = new JsonObject();
                            entry.addProperty("id", net.minecraft.registry.Registries.ITEM.getId(options[0].getItem()).toString());
                            entry.addProperty("count", 1);
                            if (options.length > 1) entry.addProperty("anyOf", options.length + " 种");
                            need.add(entry);
                        }
                        one.add("needs", need);
                        list.add(one);
                        if (list.size() >= 8) break;
                    }
                }
            }
        }
        event.add("recipes", list);
        emit(event);
    }

    /**
     * 合成：按服务端的配方表，从她自己的包（不够再用你的）扣材料，把成品交回去。
     *
     * 生存逻辑——材料必须是真有的，不凭空生成。
     *
     * 之前的毛病有两个，都在这一个方法里：
     *   1. `fitsAll()` 只检查"有没有这个材料"，不检查**数量**。
     *      合成台要 4 块木板，包里有 1 块也算"够"，于是成品出来了、只扣了 1 块。
     *      既凭空变出材料，也让"没材料"和"有材料"混在一起，报错永远是那一句。
     *   2. 失败只有一句 `craft-no-recipe`（"没有可用配方"），可是绝大多数时候
     *      配方是有的，只是材料不够。玩家看到的就是"合成任务没被执行"。
     */
    /** 把她的包和玩家背包拼成一个临时库存（副本）：材料"够不够"按两边合计算。 */
    private static net.minecraft.inventory.Inventory mergeStock(
            net.minecraft.inventory.Inventory herBag,
            net.minecraft.entity.player.PlayerInventory playerInv) {
        int herSize = herBag == null ? 0 : herBag.size();
        var union = new net.minecraft.inventory.SimpleInventory(herSize + playerInv.size());
        for (int i = 0; i < herSize; i++) {
            union.setStack(i, herBag.getStack(i).copy());
        }
        for (int i = 0; i < playerInv.size(); i++) {
            union.setStack(herSize + i, playerInv.getStack(i).copy());
        }
        return union;
    }

    /** 从某个来源的第 index 格扣掉 count 个（不够就把这格清空）。 */
    private static void consumeAt(net.minecraft.inventory.Inventory inv, int index, int count) {
        if (inv == null || index < 0 || index >= inv.size()) return;
        var stack = inv.getStack(index);
        if (stack.isEmpty()) return;
        stack.decrement(Math.min(count, stack.getCount()));
        if (stack.isEmpty()) inv.setStack(index, net.minecraft.item.ItemStack.EMPTY);
    }

    private static void applyCraft(MinecraftClient client) {
        if (!craftDirty) return;
        craftDirty = false;
        // 注意：这里不清零 tablePlaceAttempts。清零点在"收到新的 craft 命令"那里，
        // 否则"放好台子 → 重试合成"会把计数重置，万一放的位置判不出来就会无限放。
        if (client.player == null) return;
        var server = client.getServer();
        if (server == null || client.world == null) {
            ack("craft-no-server", "只能在单机用");
            return;
        }
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return;
        var id = net.minecraft.util.Identifier.tryParse(craftItem);
        if (id == null) {
            ack("craft-bad-id", craftItem);
            return;
        }
        var target = net.minecraft.registry.Registries.ITEM.get(id);
        var playerInv = client.player.getInventory();
        var her = findCompanion(client);
        var herBag = her != null ? her.getBag() : null;

        int matched = 0;
        boolean tableNeeded = false;
        boolean shapeBlocked = false;
        boolean hasTable = tableNearby(client);
        net.minecraft.recipe.CraftingRecipe blockedBy = null;   // 配方对了但材料不够的，留一份好报原因
        net.minecraft.recipe.CraftingRecipe tableRecipe = null; // 要合成台的那份，报"几×几"用
        int blockedScore = Integer.MAX_VALUE;
        for (var recipe : world.getRecipeManager().listAllOfType(net.minecraft.recipe.RecipeType.CRAFTING)) {
            if (!craftsTarget(recipe, target, world)) continue;
            matched++;
            // 3×3 的配方在原版必须站在合成台旁边。
            // 不检查的话就是"凭空在手上做出工作台类的东西"，跟生存模式对不上。
            if (needsTable(recipe)) {
                tableNeeded = true;
                if (!hasTable) {
                    if (tableRecipe == null) tableRecipe = recipe;
                    continue;
                }
            }
            // 材料可以两边凑：她的包 + 你的背包合成一个"临时库存"。
            // 以前一次只能用**一个**来源，结果她包里 1 个圆石、你包里 2 根木棍时，
            // 两边都不够 3 圆石+2 木棍 → 永远做不出来（实测卡在这一步）。
            var union = mergeStock(herBag, playerInv);
            int[] used = reserve(union, recipe);
            if (used != null) {
                var grid = buildGrid(union, recipe, used);
                // 摆完之后让配方自己确认一遍：这不是可选项。
                // 有形状的配方对摆放位置敏感，错一格也算不出东西——
                // 而我们手里这份网格是自己摆的，凭什么相信它对？问配方。
                if (recipe.matches(grid, world)) {
                    var result = recipe.craft(grid, world.getRegistryManager());
                    if (!result.isEmpty() && result.isOf(target)) {
                        // 真扣材料：按 union 的槽位映射回两个来源（她包在前）
                        int spentHers = 0;
                        int spentYours = 0;
                        int herSize = herBag == null ? 0 : herBag.size();
                        for (int i = 0; i < used.length; i++) {
                            if (used[i] == 0) continue;
                            if (i < herSize) {
                                consumeAt(herBag, i, used[i]);
                                spentHers += used[i];
                            } else {
                                consumeAt(playerInv, i - herSize, used[i]);
                                spentYours += used[i];
                            }
                        }
                        var made = result.copy();
                        boolean hers = spentYours == 0;      // 一点都没用你的材料，才算她的
                        // 工具一律归她：她要用它去挖、去发展。
                        // 之前是"用了你的材料 → 成品给你"，结果她永远没镐可用，
                        // 整条链卡死在 "crafted 木镐（用你的材料）→ equip-missing"。
                        // 工具和"她干活要用的方块"（工作台/熔炉）都归她：
                        // 归玩家的话她既拿不了也放不下，整条链就断了。
                        boolean keepTool = her != null
                                && (made.getItem() instanceof net.minecraft.item.ToolItem
                                    || isStationBlock(made.getItem()));
                        if (keepTool) {
                            her.getBag().addStack(made);
                            equipItem = net.minecraft.registry.Registries.ITEM.getId(made.getItem()).toString();
                            equipDirty = true;
                        } else if (hers) {
                            deliverStack = made.copy();
                            deliverDirty = true;
                            deliverAll = false;
                            deliverAnnounced = false;
                            deliverTicks = 0;
                        } else {
                            playerInv.insertStack(made);
                            if (!made.isEmpty()) client.player.dropItem(made, false);
                        }
                        client.player.currentScreenHandler.sendContentUpdates();
                        ack("crafted", result.getCount() + " 个 " + result.getName().getString()
                                + (keepTool ? "（工具归她，已拿到手上）"
                                    : hers ? "（用她自己的材料，做好了过来给你）"
                                    : "（她" + spentHers + " 份 + 你" + spentYours + " 份材料）"));
                        return;
                    }
                } else {
                    shapeBlocked = true;
                }
            }
            // 材料不够：记下"最接近能做"的那份，报给玩家时更可行动
            int score = shortfallScore(herBag, playerInv, recipe);
            if (blockedBy == null || score < blockedScore) {
                blockedBy = recipe;
                blockedScore = score;
            }
        }

        if (matched == 0) {
            ack("craft-no-recipe", "合成表里没有能做出 " + craftItem + " 的配方");
            return;
        }
        String shortfall = blockedBy == null ? "" : describeShortfall(herBag, playerInv, blockedBy);
        if (tableNeeded && !hasTable) {
            // 缺台子：她自己从包里掏一个放下，然后接着做
            if (tablePlaceAttempts < 2 && placeCraftingTable(client, herBag, playerInv)) {
                tablePlaceAttempts++;
                craftDirty = true;
                ack("craft-placed-table", "附近没台子，我从" +
                        (herBag != null && countItem(herBag, "minecraft:crafting_table") > 0 ? "她包里" : "你包里") +
                        "拿了一个放下，接着做");
                return;
            }
            ack("craft-need-table", "这个要合成台（" + shapeText(tableRecipe) + "），附近 4 格内没有，"
                    + "包里也没有工作台可放。"
                    + (shortfall.isEmpty() ? "" : "另外材料也不够——" + shortfall));
            return;
        }
        if (blockedBy == null) {
            ack("craft-missing", "材料看着够，但摆不出这份配方" + (shapeBlocked ? "（形状限制）" : ""));
            return;
        }
        ack("craft-missing", "配方有，材料不够——" + shortfall
                + (shapeBlocked ? "（材料够的那次摆不出这个形状）" : ""));
    }

    private static String shapeText(net.minecraft.recipe.CraftingRecipe recipe) {
        if (recipe == null) return "有形状";
        int[] shape = recipeShape(recipe);
        if (shape[1] <= 1 && shapedWidth(recipe) == 0) return shape[0] + " 样材料";
        return shape[0] + "×" + shape[1];
    }

    /**
     * 这份配方还差几个材料（她和你合起来算）。
     *
     * 用来在多个配方里挑"最接近能做"的那个报给玩家：
     * 木棍既能用竹子也能用木板，缺 1 块木板比缺 2 根竹子有用。
     */
    private static int shortfallScore(
            net.minecraft.inventory.Inventory herBag,
            net.minecraft.entity.player.PlayerInventory playerInv,
            net.minecraft.recipe.CraftingRecipe recipe) {
        var need = new java.util.LinkedHashMap<net.minecraft.recipe.Ingredient, Integer>();
        for (var ingredient : recipe.getIngredients()) {
            if (ingredient.isEmpty()) continue;
            need.merge(ingredient, 1, Integer::sum);
        }
        int score = 0;
        for (var entry : need.entrySet()) {
            int have = countMatching(herBag, entry.getKey()) + countMatching(playerInv, entry.getKey());
            score += Math.max(0, entry.getValue() - have);
        }
        return score;
    }

    /** "缺什么、缺几个"——把她和你的东西合起来算一次。 */
    private static String describeShortfall(
            net.minecraft.inventory.Inventory herBag,
            net.minecraft.entity.player.PlayerInventory playerInv,
            net.minecraft.recipe.CraftingRecipe recipe) {
        var need = new java.util.LinkedHashMap<net.minecraft.recipe.Ingredient, Integer>();
        for (var ingredient : recipe.getIngredients()) {
            if (ingredient.isEmpty()) continue;
            need.merge(ingredient, 1, Integer::sum);
        }
        var sb = new StringBuilder();
        for (var entry : need.entrySet()) {
            var ingredient = entry.getKey();
            int wanted = entry.getValue();
            int have = countMatching(herBag, ingredient) + countMatching(playerInv, ingredient);
            if (have >= wanted) continue;
            if (sb.length() > 0) sb.append("、");
            sb.append(describeMissing(ingredient)).append(" ×").append(wanted)
                    .append("（现在有 ").append(have).append("）");
        }
        if (sb.length() == 0) sb.append("材料看着够，但摆不出这份配方（可能是形状限制）");
        return sb.toString();
    }

    /**
     * 一块只在内存里的 3×3 合成网格。
     *
     * 不能用 `new CraftingInventory(null, 3, 3)`：它的 `setStack()` 里会去调
     * `handler.onContentChanged(...)`，而 handler 是 null——**第一次 setStack 就 NPE，
     * 整个客户端崩掉**。"合成任务不被执行"的真正原因就是这个：不是没做，是把游戏打崩了。
     *
     * 传一个真的 ScreenHandler 也不行（PlayerScreenHandler 重写了 onContentChanged，
     * 会去动玩家的界面）。所以这里不继承，直接实现 RecipeInputInventory：
     * 配方只读 getWidth/getHeight/getStack，够用。
     */
    private static final class VirtualGrid implements net.minecraft.inventory.RecipeInputInventory {
        private final net.minecraft.util.collection.DefaultedList<net.minecraft.item.ItemStack> stacks =
                net.minecraft.util.collection.DefaultedList.ofSize(9, net.minecraft.item.ItemStack.EMPTY);

        @Override
        public int size() {
            return 9;
        }

        @Override
        public boolean isEmpty() {
            for (var stack : this.stacks) {
                if (!stack.isEmpty()) return false;
            }
            return true;
        }

        @Override
        public net.minecraft.item.ItemStack getStack(int slot) {
            return this.stacks.get(slot);
        }

        @Override
        public net.minecraft.item.ItemStack removeStack(int slot) {
            var stack = this.stacks.get(slot);
            this.stacks.set(slot, net.minecraft.item.ItemStack.EMPTY);
            return stack;
        }

        @Override
        public net.minecraft.item.ItemStack removeStack(int slot, int amount) {
            var stack = this.stacks.get(slot);
            if (stack.isEmpty()) return net.minecraft.item.ItemStack.EMPTY;
            if (stack.getCount() <= amount) {
                this.stacks.set(slot, net.minecraft.item.ItemStack.EMPTY);
                return stack;
            }
            return stack.split(amount);
        }

        @Override
        public void setStack(int slot, net.minecraft.item.ItemStack stack) {
            this.stacks.set(slot, stack);
        }

        @Override
        public void markDirty() {
            // 内存里的网格，没有"脏了"这回事
        }

        @Override
        public boolean canPlayerUse(net.minecraft.entity.player.PlayerEntity player) {
            return true;
        }

        @Override
        public void clear() {
            this.stacks.clear();
        }

        @Override
        public int getHeight() {
            return 3;
        }

        @Override
        public int getWidth() {
            return 3;
        }

        @Override
        public java.util.List<net.minecraft.item.ItemStack> getInputStacks() {
            return this.stacks;
        }

        @Override
        public void provideRecipeInputs(net.minecraft.recipe.RecipeMatcher finder) {
            for (var stack : this.stacks) {
                finder.addInput(stack);
            }
        }
    }

    /** 这份配方做出来的是不是它（拿占位材料摆一遍网格算，不看材料够不够）。 */
    private static boolean craftsTarget(
            net.minecraft.recipe.CraftingRecipe recipe,
            net.minecraft.item.Item target,
            net.minecraft.server.world.ServerWorld world) {
        var probe = new VirtualGrid();
        int width = shapedWidth(recipe);
        var ingredients = recipe.getIngredients();
        for (int index = 0; index < ingredients.size(); index++) {
            var ingredient = ingredients.get(index);
            if (ingredient.isEmpty()) continue;
            int slot = width > 0 ? (index / width) * 3 + (index % width) : index;
            if (slot < 0 || slot >= 9) continue;
            var options = ingredient.getMatchingStacks();
            if (options.length == 0) return false;
            probe.setStack(slot, options[0].copyWithCount(1));
        }
        var out = recipe.craft(probe, world.getRegistryManager());
        return !out.isEmpty() && out.isOf(target);
    }

    /**
     * 按配方在背包里预留材料，返回"每个槽位用几个"。
     *
     * 这里必须按数量算：同一格只有 1 块木板，却要 4 块，就得判成不够，
     * 而不是"看见有木板就行"。
     */
    private static int[] reserve(net.minecraft.inventory.Inventory inv, net.minecraft.recipe.CraftingRecipe recipe) {
        int[] used = new int[inv.size()];
        for (var ingredient : recipe.getIngredients()) {
            if (ingredient.isEmpty()) continue;
            boolean ok = false;
            for (int i = 0; i < inv.size(); i++) {
                var stack = inv.getStack(i);
                if (stack.isEmpty() || !ingredient.test(stack)) continue;
                if (stack.getCount() <= used[i]) continue;     // 这一格已经被前面的材料预定完了
                used[i]++;
                ok = true;
                break;
            }
            if (!ok) return null;
        }
        return used;
    }

    /**
     * 把材料摆进 3×3 网格，每个槽位放 1 个（不是把整摞塞进去）。
     *
     * 有形状的配方必须按它自己的宽度换算槽位：`getIngredients()` 的长度是
     * width×height，不是 9。2×2 的配方如果按顺序摆到 0/1/2/3，摆出来是一个
     * 错位的形状（应该是 0/1 和 3/4），跟配方对不上。
     */
    private static net.minecraft.inventory.RecipeInputInventory buildGrid(
            net.minecraft.inventory.Inventory inv,
            net.minecraft.recipe.CraftingRecipe recipe,
            int[] used) {
        var grid = new VirtualGrid();
        int[] taken = new int[inv.size()];
        int width = shapedWidth(recipe);
        var ingredients = recipe.getIngredients();
        for (int index = 0; index < ingredients.size(); index++) {
            var ingredient = ingredients.get(index);
            int slot = width > 0 ? (index / width) * 3 + (index % width) : index;
            if (slot < 0 || slot >= 9) continue;
            if (ingredient.isEmpty()) continue;      // 空格本来就不摆
            for (int i = 0; i < inv.size(); i++) {
                var stack = inv.getStack(i);
                if (stack.isEmpty() || !ingredient.test(stack)) continue;
                if (taken[i] >= used[i]) continue;
                taken[i]++;
                grid.setStack(slot, stack.copyWithCount(1));
                break;
            }
        }
        return grid;
    }

    /** 有形状配方的宽度；无形状的返回 0（按顺序摆就行）。 */
    private static int shapedWidth(net.minecraft.recipe.CraftingRecipe recipe) {
        if (recipe instanceof net.minecraft.recipe.ShapedRecipe shaped) return shaped.getWidth();
        return 0;
    }

    /** 这份配方要几行几列。 */
    private static int[] recipeShape(net.minecraft.recipe.CraftingRecipe recipe) {
        if (recipe instanceof net.minecraft.recipe.ShapedRecipe shaped) {
            return new int[]{shaped.getWidth(), shaped.getHeight()};
        }
        int count = 0;
        for (var ingredient : recipe.getIngredients()) {
            if (!ingredient.isEmpty()) count++;
        }
        return new int[]{count, 1};     // 无形状：按"几个材料"说，别假装有形状
    }

    /** 这份配方是不是得站在合成台旁边（超过 2×2 就得）。 */
    private static boolean needsTable(net.minecraft.recipe.CraftingRecipe recipe) {
        int[] shape = recipeShape(recipe);
        return shape[0] > 2 || shape[1] > 2;
    }

    /**
     * 从她（或你）包里掏一个工作台，放在玩家旁边。
     *
     * 放了才调用者知道"下一步附近就有台子了"。放不下（没物品 / 没地方）返回 false。
     */
    private static boolean placeCraftingTable(
            MinecraftClient client,
            net.minecraft.inventory.Inventory herBag,
            net.minecraft.entity.player.PlayerInventory playerInv) {
        if (client.world == null || client.player == null) return false;
        var source = countItem(herBag, "minecraft:crafting_table") > 0 ? herBag
                : countItem(playerInv, "minecraft:crafting_table") > 0 ? playerInv : null;
        if (source == null) return false;
        var pos = findPlaceSpot(client);
        if (pos == null) return false;
        var server = client.getServer();
        if (server == null) return false;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return false;
        if (!world.setBlockState(pos, net.minecraft.block.Blocks.CRAFTING_TABLE.getDefaultState(),
                net.minecraft.block.Block.NOTIFY_ALL)) {
            return false;
        }
        takeOne(source, "minecraft:crafting_table");
        ack("placed", "工作台 @ " + pos.getX() + "," + pos.getY() + "," + pos.getZ());
        return true;
    }
    /** 找一块能放方块的地方：脚下实心、本身空气、不压在人身上。 */
    private static void applyPlace(MinecraftClient client) {
        if (!placeDirty) return;
        placeDirty = false;
        CompanionEntity her = findCompanion(client);
        if (her == null) {
            ack("place-no-companion", "");
            return;
        }
        var id = net.minecraft.util.Identifier.tryParse(placeItem);
        if (id == null) {
            ack("place-bad-id", placeItem);
            return;
        }
        var item = net.minecraft.registry.Registries.ITEM.get(id);
        if (!(item instanceof net.minecraft.item.BlockItem blockItem)) {
            ack("place-not-block", placeItem + " 不是方块");
            return;
        }
        // 方块可以两边凑：她包里没有就用你背包里的（跟合成时"材料合并"一个道理）。
        // 实测踩过：她在洞里、木板全在玩家身上，于是每次 place 都报"她包里没有"。
        boolean fromHer = countItem(her.getBag(), placeItem) > 0;
        boolean fromYou = !fromHer && client.player != null
                && countItem(client.player.getInventory(), placeItem) > 0;
        if (!fromHer && !fromYou) {
            ack("place-missing", "她和你包里都没有 " + placeItem);
            return;
        }
        var pos = findPlaceSpot(client);
        if (pos == null) {
            ack("place-no-spot", "旁边没有能放的位置");
            return;
        }
        var server = client.getServer();
        if (server == null) return;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return;
        if (!world.setBlockState(pos, blockItem.getBlock().getDefaultState(),
                net.minecraft.block.Block.NOTIFY_ALL)) {
            ack("place-failed", "放不上去");
            return;
        }
        if (fromHer) takeOne(her.getBag(), placeItem);
        else takeFrom(client.player.getInventory(), placeItem, 1);
        ack("placed", item.getName().getString() + " @ "
                + pos.getX() + "," + pos.getY() + "," + pos.getZ()
                + (fromHer ? "" : "（用你背包里的）"));
    }

    /** 牵引绳的连续失败次数 + 上次报告时间。 */

    /**
     * 烧炼：把她的矿烧成锭。
     *
     * 原版规则：要熔炉、要燃料、要时间（每件 10 秒）。这里不模拟熔炉方块状态，
     * 但三样都得真扣：附近 4 格内要有熔炉，燃料按"1 煤 = 1 件、2 木板 = 1 件"扣，
     * 矿按件数扣；扣完要等够时间才出锭（不是瞬间变出来）。
     */
    private static void applySmelt(MinecraftClient client) {
        if (!smeltDirty) return;
        smeltDirty = false;
        if (client.player == null) return;
        var her = findCompanion(client);
        if (her == null) {
            ack("smelt-no-companion", "");
            return;
        }
        if (smeltPending > 0) {
            ack("smelt-busy", "上一炉还在烧（" + smeltPending + " 件）");
            return;
        }
        if (!furnaceNearby(client)) {
            ack("smelt-no-furnace", "附近没有熔炉（8 个圆石在工作台做一个，放她旁边）");
            return;
        }
        String ingot = smeltItem.isEmpty() ? "minecraft:iron_ingot" : smeltItem;
        String[] inputs = oreIdsFor(ingot);
        if (inputs.length == 0) {
            ack("smelt-unsupported", ingot + " 不知道用什么烧");
            return;
        }

        int have = 0;
        for (String id : inputs) {
            have += countItem(her.getBag(), id) + countItem(client.player.getInventory(), id);
        }
        if (have <= 0) {
            ack("smelt-missing", "没有可烧的矿（要 " + String.join(" / ", inputs) + "）");
            return;
        }
        int count = Math.min(smeltCount, have);

        int coal = countItem(her.getBag(), "minecraft:coal") + countItem(her.getBag(), "minecraft:charcoal")
                + countItem(client.player.getInventory(), "minecraft:coal")
                + countItem(client.player.getInventory(), "minecraft:charcoal");
        int planks = planksStock(client, her);
        int useCoal = Math.min(coal, count);
        int rest = count - useCoal;
        int usePlanks = rest <= 0 ? 0 : (rest + 1) / 2;
        if (useCoal + usePlanks * 2 < count) {
            ack("smelt-no-fuel", "燃料不够：要 " + count + " 个煤（或 2 倍木板），现在煤 " + coal + "、木板 " + planks);
            return;
        }

        for (String id : inputs) {
            int need = count;
            need -= takeFrom(her.getBag(), id, need);
            if (need > 0) takeFrom(client.player.getInventory(), id, need);
        }
        if (useCoal > 0) {
            int left = useCoal;
            left -= takeFrom(her.getBag(), "minecraft:coal", left);
            if (left > 0) left -= takeFrom(her.getBag(), "minecraft:charcoal", left);
            if (left > 0) left -= takeFrom(client.player.getInventory(), "minecraft:coal", left);
            if (left > 0) takeFrom(client.player.getInventory(), "minecraft:charcoal", left);
        }
        if (usePlanks > 0) {
            int left = usePlanks;
            left -= takePlanks(her, left);
            if (left > 0) takePlayerPlanks(client, left);
        }

        smeltPending = count;
        smeltItem = ingot;
        smeltDoneAt = System.currentTimeMillis() + Math.min(60000L, count * 10000L);
        ack("smelting", count + " 件 → " + itemLabel(ingot) + "，"
                + Math.round((smeltDoneAt - System.currentTimeMillis()) / 1000.0) + " 秒后好");
    }

    /** 时间到了就出锭（进她的包；包满进你的，最后丢脚边）。 */
    private static void finishSmelt(MinecraftClient client) {
        if (smeltPending <= 0) return;
        if (System.currentTimeMillis() < smeltDoneAt) return;
        var id = net.minecraft.util.Identifier.tryParse(smeltItem);
        int count = smeltPending;
        smeltPending = 0;
        if (id == null) return;
        var item = net.minecraft.registry.Registries.ITEM.get(id);
        var stack = new net.minecraft.item.ItemStack(item, count);
        var her = findCompanion(client);
        if (her != null) her.getBag().addStack(stack);
        if (!stack.isEmpty() && client.player != null) client.player.getInventory().insertStack(stack);
        if (!stack.isEmpty() && client.player != null) client.player.dropItem(stack, false);
        ack("smelted", count + " 个 " + itemLabel(smeltItem));
    }

    private static String itemLabel(String itemId) {
        var id = net.minecraft.util.Identifier.tryParse(itemId);
        if (id == null) return itemId;
        return net.minecraft.registry.Registries.ITEM.get(id).getName().getString();
    }

    /** 这种锭要烧什么矿。 */
    private static String[] oreIdsFor(String ingot) {
        switch (ingot) {
            case "minecraft:iron_ingot":
                return new String[]{"minecraft:raw_iron", "minecraft:iron_ore", "minecraft:deepslate_iron_ore"};
            case "minecraft:gold_ingot":
                return new String[]{"minecraft:raw_gold", "minecraft:gold_ore", "minecraft:deepslate_gold_ore"};
            case "minecraft:copper_ingot":
                return new String[]{"minecraft:raw_copper", "minecraft:copper_ore", "minecraft:deepslate_copper_ore"};
            default:
                return new String[0];
        }
    }

    /** 附近 4 格内有没有熔炉（她和你都算）。 */
    private static boolean furnaceNearby(MinecraftClient client) {
        if (client.world == null) return false;
        var bases = new java.util.ArrayList<net.minecraft.util.math.BlockPos>();
        if (client.player != null) bases.add(client.player.getBlockPos());
        var her = findCompanion(client);
        if (her != null) bases.add(her.getBlockPos());
        for (var base : bases) {
            for (int dx = -4; dx <= 4; dx++) {
                for (int dy = -2; dy <= 2; dy++) {
                    for (int dz = -4; dz <= 4; dz++) {
                        var state = client.world.getBlockState(base.add(dx, dy, dz));
                        if (state.isOf(net.minecraft.block.Blocks.FURNACE)
                                || state.isOf(net.minecraft.block.Blocks.BLAST_FURNACE)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    /** 木板总量（任何种类，她包里 + 你包里）。 */
    private static int planksStock(MinecraftClient client, CompanionEntity her) {
        int total = 0;
        for (int i = 0; i < her.getBag().size(); i++) {
            var stack = her.getBag().getStack(i);
            if (!stack.isEmpty() && net.minecraft.registry.Registries.ITEM
                    .getId(stack.getItem()).getPath().endsWith("_planks")) total += stack.getCount();
        }
        if (client.player != null) {
            var inv = client.player.getInventory();
            for (int i = 0; i < inv.size(); i++) {
                var stack = inv.getStack(i);
                if (!stack.isEmpty() && net.minecraft.registry.Registries.ITEM
                        .getId(stack.getItem()).getPath().endsWith("_planks")) total += stack.getCount();
            }
        }
        return total;
    }

    /** 从背包里拿走 n 个指定物品，返回实际拿走的数量。 */
    private static int takeFrom(net.minecraft.inventory.Inventory inv, String itemId, int n) {
        if (inv == null || n <= 0) return 0;
        var id = net.minecraft.util.Identifier.tryParse(itemId);
        if (id == null) return 0;
        var item = net.minecraft.registry.Registries.ITEM.get(id);
        int taken = 0;
        for (int i = 0; i < inv.size() && taken < n; i++) {
            var stack = inv.getStack(i);
            if (stack.isEmpty() || !stack.isOf(item)) continue;
            int take = Math.min(n - taken, stack.getCount());
            stack.decrement(take);
            taken += take;
            if (stack.isEmpty()) inv.setStack(i, net.minecraft.item.ItemStack.EMPTY);
        }
        return taken;
    }

    /** 从她包里拿走 n 块木板（任何种类）。 */
    private static int takePlanks(CompanionEntity her, int n) {
        int taken = 0;
        for (int i = 0; i < her.getBag().size() && taken < n; i++) {
            var stack = her.getBag().getStack(i);
            if (stack.isEmpty()) continue;
            if (!net.minecraft.registry.Registries.ITEM.getId(stack.getItem()).getPath().endsWith("_planks")) continue;
            int take = Math.min(n - taken, stack.getCount());
            stack.decrement(take);
            taken += take;
            if (stack.isEmpty()) her.getBag().setStack(i, net.minecraft.item.ItemStack.EMPTY);
        }
        return taken;
    }

    /** 从玩家背包拿走 n 块木板。 */
    private static int takePlayerPlanks(MinecraftClient client, int n) {
        if (client.player == null) return 0;
        int taken = 0;
        var inv = client.player.getInventory();
        for (int i = 0; i < inv.size() && taken < n; i++) {
            var stack = inv.getStack(i);
            if (stack.isEmpty()) continue;
            if (!net.minecraft.registry.Registries.ITEM.getId(stack.getItem()).getPath().endsWith("_planks")) continue;
            int take = Math.min(n - taken, stack.getCount());
            stack.decrement(take);
            taken += take;
            if (stack.isEmpty()) inv.setStack(i, net.minecraft.item.ItemStack.EMPTY);
        }
        return taken;
    }
    /**
     * 把她拉到玩家身边。
     *
     * 这是逃生口，不是日常移动：她掉进坑里、被墙夹住、寻路算不出来时，
     * 只能靠这个把她弄回来（日常走路一律自己走，不许 tp）。
     */
    private static void applyRescue(MinecraftClient client) {
        if (!rescueDirty) return;
        rescueDirty = false;
        CompanionEntity her = findCompanion(client);
        if (her == null || client.player == null) {
            ack("rescue-no-companion", "她不在场，拉不过来");
            return;
        }
        her.requestTeleport(client.player.getX() + 1.0, client.player.getY(), client.player.getZ() - 1.0);
        her.halt();
        ack("rescued", "拉到你身边了");
    }

    /** 玩家旁边找一个能放方块的位置（脚下实心、本身是空气、不压在人或她身上）。 */
    private static net.minecraft.util.math.BlockPos findPlaceSpot(MinecraftClient client) {
        var world = client.world;
        var player = client.player;
        if (world == null || player == null) return null;
        var base = player.getBlockPos();
        var her = findCompanion(client);
        var herPos = her == null ? null : her.getBlockPos();
        for (int r = 1; r <= 3; r++) {
            for (int dx = -r; dx <= r; dx++) {
                for (int dz = -r; dz <= r; dz++) {
                    for (int dy = 0; dy <= 1; dy++) {
                        var pos = base.add(dx, dy, dz);
                        if (!world.getBlockState(pos).isAir()) continue;
                        if (world.getBlockState(pos.down()).isAir()) continue;   // 悬空不放
                        if (pos.equals(base) || pos.equals(base.up())) continue; // 别塞进玩家
                        if (herPos != null && (pos.equals(herPos) || pos.equals(herPos.up()))) continue;
                        return pos;
                    }
                }
            }
        }
        return null;
    }

    /** 某个物品在背包里有多少个。 */
    private static int countItem(net.minecraft.inventory.Inventory inv, String itemId) {
        if (inv == null) return 0;
        var id = net.minecraft.util.Identifier.tryParse(itemId);
        if (id == null) return 0;
        var item = net.minecraft.registry.Registries.ITEM.get(id);
        int total = 0;
        for (int i = 0; i < inv.size(); i++) {
            var stack = inv.getStack(i);
            if (!stack.isEmpty() && stack.isOf(item)) total += stack.getCount();
        }
        return total;
    }

    /** 从背包里拿掉一个指定物品。 */
    private static boolean takeOne(net.minecraft.inventory.Inventory inv, String itemId) {
        if (inv == null) return false;
        var id = net.minecraft.util.Identifier.tryParse(itemId);
        if (id == null) return false;
        var item = net.minecraft.registry.Registries.ITEM.get(id);
        for (int i = 0; i < inv.size(); i++) {
            var stack = inv.getStack(i);
            if (stack.isEmpty() || !stack.isOf(item)) continue;
            stack.decrement(1);
            if (stack.isEmpty()) inv.setStack(i, net.minecraft.item.ItemStack.EMPTY);
            return true;
        }
        return false;
    }

    /** 附近 4 格内有没有合成台（她和你都算）。 */
    private static boolean tableNearby(MinecraftClient client) {
        if (client.world == null || client.player == null) return false;
        var base = client.player.getBlockPos();
        for (int dx = -4; dx <= 4; dx++) {
            for (int dy = -2; dy <= 2; dy++) {
                for (int dz = -4; dz <= 4; dz++) {
                    if (client.world.getBlockState(base.add(dx, dy, dz))
                            .isOf(net.minecraft.block.Blocks.CRAFTING_TABLE)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /** 按预留表真扣材料。 */
    private static void consumeReserved(net.minecraft.inventory.Inventory inv, int[] used) {
        for (int i = 0; i < inv.size(); i++) {
            if (used[i] == 0) continue;
            var stack = inv.getStack(i);
            stack.decrement(used[i]);
            if (stack.isEmpty()) inv.setStack(i, net.minecraft.item.ItemStack.EMPTY);
        }
    }


    /** 背包里有多少个能顶这个材料的物品（按数量，不是按种类）。 */
    private static int countMatching(net.minecraft.inventory.Inventory inv, net.minecraft.recipe.Ingredient ingredient) {
        if (inv == null) return 0;
        int total = 0;
        for (int i = 0; i < inv.size(); i++) {
            var stack = inv.getStack(i);
            if (!stack.isEmpty() && ingredient.test(stack)) total += stack.getCount();
        }
        return total;
    }

    private static String describeMissing(net.minecraft.recipe.Ingredient ingredient) {
        var options = ingredient.getMatchingStacks();
        if (options.length == 0) return "某种材料";
        return options[0].getName().getString();
    }

    /** 看她自己包里有什么。 */
    private static void applyHerBag(MinecraftClient client) {
        if (!herBagDirty) return;
        herBagDirty = false;
        CompanionEntity her = findCompanion(client);
        JsonObject event = new JsonObject();
        event.addProperty("type", "herinventory");
        com.google.gson.JsonArray items = new com.google.gson.JsonArray();
        if (her != null) {
            for (int i = 0; i < her.getBag().size(); i++) {
                var stack = her.getBag().getStack(i);
                if (stack.isEmpty()) continue;
                JsonObject one = new JsonObject();
                one.addProperty("id", net.minecraft.registry.Registries.ITEM.getId(stack.getItem()).toString());
                one.addProperty("count", stack.getCount());
                items.add(one);
            }
        }
        event.add("items", items);
        emit(event);
    }

    /**
     * 清掉世界里所有"她"。
     *
     * 命令 `kill @e[tag=…]` 只对带 tag 的生效，早期版本的实体没有 tag，
     * 会一直留在存档里——所以这里直接按类型清，一个不留。
     */
    private static int purgeCompanions(MinecraftClient client) {
        var server = client.getServer();
        if (server == null || client.world == null) return 0;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return 0;
        int count = 0;
        for (var entity : world.iterateEntities()) {
            if (entity instanceof CompanionEntity companion) {
                companion.discard();
                count++;
            }
        }
        return count;
    }

    /**
     * 把"相对目标"换算成绝对坐标。
     *
     * 这样就不需要外面去猜她的 y 坐标：
     *   under        她脚下那块
     *   underPlayer  你脚下那块
     *   crosshair    你准星对着的那块
     */
    private static void resolveRelativeTarget(MinecraftClient client, CompanionEntity her) {
        if (mineRel == null || mineRel.isEmpty()) return;
        net.minecraft.util.math.BlockPos pos = null;
        if (mineRel.equals("under") && her != null) {
            pos = her.getBlockPos().down();
            // 她脚下可能是空气（悬在洞口）：往下找几格，找第一块实心的
            if (client.world != null) {
                for (int dy = 0; dy >= -6; dy--) {
                    var probe = pos.add(0, dy, 0);
                    if (!client.world.getBlockState(probe).isAir()) { pos = probe; break; }
                }
            }
        } else if (mineRel.equals("underPlayer") && client.player != null) {
            pos = client.player.getBlockPos().down();
        } else if (mineRel.equals("crosshair") && client.crosshairTarget instanceof net.minecraft.util.hit.BlockHitResult hit) {
            pos = hit.getBlockPos();
        }
        if (pos != null) {
            mineX = pos.getX();
            mineY = pos.getY();
            mineZ = pos.getZ();
        }
        mineRel = "";
    }


    /** 诊断：把"我们能看到什么"打出来——查不到实体时第一件事就是看这个。 */
    private static void emitDiag(MinecraftClient client) {
        boolean hasServer = client.getServer() != null;
        int seen = 0;
        if (hasServer && client.world != null) {
            var w = client.getServer().getWorld(client.world.getRegistryKey());
            if (w != null) {
                for (var e : w.iterateEntities()) {
                    if (e instanceof CompanionEntity) seen++;
                }
            }
        }
        JsonObject d = new JsonObject();
        d.addProperty("type", "diag");
        d.addProperty("hasServer", hasServer);
        d.addProperty("dimension", client.world == null ? "?" : client.world.getRegistryKey().getValue().toString());
        d.addProperty("companionsSeen", seen);
        d.addProperty("op", client.player != null && client.player.hasPermissionLevel(2));
        d.addProperty("multiplayer", client.getCurrentServerEntry() != null);
        // "每个档只生成一个"靠的就是这三行
        d.addProperty("bodyType", bodyType);
        d.addProperty("herUuid", herUuid == null ? "" : herUuid);
        d.addProperty("herAlive", herAlive);
        d.addProperty("saveState", bodyStateKey == null ? "" : bodyStateKey);
        emit(d);
    }

    private static CompanionEntity findCompanion(MinecraftClient client) {
        var server = client.getServer();
        if (server == null || client.world == null) return null;
        var world = server.getWorld(client.world.getRegistryKey());
        if (world == null) return null;
        // 可能有好几个（旧存档里残留的、未加载区块里冻住的）。
        // 取离玩家最近的那个才算"当前在场的她"。
        CompanionEntity best = null;
        double bestDistance = Double.MAX_VALUE;
        for (var entity : world.iterateEntities()) {
            if (!(entity instanceof CompanionEntity c) || !c.isAlive() || c.isRemoved()) continue;
            double d = c.squaredDistanceTo(client.player);
            if (d < bestDistance) {
                bestDistance = d;
                best = c;
            }
        }
        return best;
    }


    /** 面板改了名字：把实体头顶的字也换掉，别让它和设置对不上。 */
    /** 每个客户端 tick 做一遍的事（内容从事件注册里搬出来，好统一兜异常）。 */
    private static void tickOnce(MinecraftClient client) {
        // 把排队的发言送进聊天框必须在主线程
        String line;
        while ((line = OUTGOING.poll()) != null) {
            if (client.player != null && client.getNetworkHandler() != null && client.player.networkHandler != null) {
                // 以 "/" 开头的是命令（tellraw 用），否则当普通聊天
                if (line.startsWith("/")) {
                    client.player.networkHandler.sendCommand(line.substring(1));
                } else {
                    client.getNetworkHandler().sendChatMessage(line);
                }
            }
        }
        detectDeath(client);
        resolvePendingPlace(client);
        snapshot(client);
        maintainBody(client);
        selfSummon(client);
        maintainName(client);
        while (panelKey != null && panelKey.wasPressed()) {
            client.setScreen(new CompanionScreen());
        }
        applyOrders(client);
        applyScan(client);
        applyRecipe(client);
        applyCraft(client);
        applyHerBag(client);
        autoCollect(client);
        if (diagDirty) {
            diagDirty = false;
            emitDiag(client);
        }
        if (purgeDirty) {
            purgeDirty = false;
            int n = purgeCompanions(client);
            forgetHer();            // 清掉之后，下一次会重新召唤一只
            ack("purged", n + " 个");
        }
        farWatch(client);
        applyGather(client);
        applySmelt(client);
        finishSmelt(client);
        applyPlan(client);
        applyRescue(client);
        applyEquip(client);
        applyPlace(client);
        applyDeliver(client);
        applyMine(client);
        finishPendingMine(client);
        applyPickup(client);
        applyCollect(client);
        applyAttack(client);
        follow(client);
    }

    /** 状态栏那几行：名字、手上、包、她正在干什么。 */
    private static void drawHud(net.minecraft.client.gui.DrawContext context) {
        var client = MinecraftClient.getInstance();
        if (client == null || client.player == null || client.world == null) return;
        if (client.options.hudHidden) return;
        String name = bodyName.isEmpty() ? "同伴" : bodyName;
        var her = findCompanion(client);
        int y = 6;
        int color = 0xFFFFFF;
        if (her == null) {
            context.drawTextWithShadow(client.textRenderer, net.minecraft.text.Text.literal(name + " · 不在场"), 6, y, 0xFF8888);
            return;
        }
        var held = her.getEquippedStack(net.minecraft.entity.EquipmentSlot.MAINHAND);
        String heldText = held.isEmpty() ? "空手" : held.getName().getString();
        int used = 0;
        for (int i = 0; i < her.getBag().size(); i++) {
            if (!her.getBag().getStack(i).isEmpty()) used++;
        }
        String doing = her.hasTarget() ? "在走动" : (deliverDirty ? "要给你东西" : "闲着");
        String line = String.format("%s · %s · 包 %d/27 · %s · %.1f 格",
                name, heldText, used, doing, her.distanceTo(client.player));
        context.drawTextWithShadow(client.textRenderer, net.minecraft.text.Text.literal(line), 6, y, color);
    }

    private static void maintainName(MinecraftClient client) {
        if (!renameDirty) return;
        renameDirty = false;
        if (!bodyOn || client.player == null || client.player.networkHandler == null) return;
        if (!client.player.hasPermissionLevel(2)) return;
        String display = bodyName.isEmpty() ? "同伴" : bodyName;
        client.player.networkHandler.sendCommand(
                "data merge entity @e[tag=mc_companion,limit=1] {CustomName:'[{\"text\":\""
                        + escapeJson(display) + "\"}]'}");
    }
    /** 命令盘按钮：过来。 */
    public static void panelCome() {
        panelEvent("come");
        if (!bodyReady()) {
            sayLine("我还没到场呢。");
            return;
        }
        comeDirty = true;
        sayLine("来了。");
    }

    /** 命令盘按钮：跟着 / 待着。 */
    public static void panelFollow(boolean on) {
        panelEvent(on ? "follow" : "stay");
        followOn = on;
        sayLine(on ? "跟着。" : "那我待着。");
    }

    /** 命令盘按钮：停下。 */
    public static void panelHalt() {
        panelEvent("halt");
        haltDirty = true;
        sayLine("停了。");
    }

    /** 命令盘按钮：收起身体。 */
    public static void panelDismiss() {
        panelEvent("dismiss");
        bodyOn = false;
        bodyDirty = true;
        sayLine("先回去一下。");
    }


    /** 命令盘按了哪个键，告诉插件一声（不带 speak 的会唤醒，其余只记录）。 */
    private static void panelEvent(String action) {
        JsonObject event = new JsonObject();
        event.addProperty("type", "panel");
        event.addProperty("action", action);
        emit(event);
    }
    /** 命令盘按钮：挖掉准星对着的那格。玩家亲手点的，不受 6 格限制。 */
    public static void panelMineCrosshair() {
        panelEvent("mine");
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || !(client.crosshairTarget instanceof net.minecraft.util.hit.BlockHitResult hit)) {
            sayLine("没瞄着方块。");
            return;
        }
        var pos = hit.getBlockPos();
        mineX = pos.getX();
        mineY = pos.getY();
        mineZ = pos.getZ();
        mineForce = true;
        mineDirty = true;
    }

    /** 玩家在合成页选了一个目标：交给 DSH 去跑完整条链。 */
    public static void requestCraft(String item, String label) {
        JsonObject event = new JsonObject();
        event.addProperty("type", "craft");
        event.addProperty("item", item);
        event.addProperty("label", label);
        emit(event);
        sayLine("我去看看" + label + "要什么。");
    }

    /** 命令盘按钮：把附近掉落物收起来。 */
    public static void panelCollect() {
        panelEvent("collect");
        collectDirty = true;
        sayLine("我去捡。");
    }

    /** 命令盘按钮：把包里的东西都交给你。 */
    public static void panelDeliver() {
        panelEvent("deliver");
        deliverAll = true;
        deliverAnnounced = false;
        deliverTicks = 0;
        deliverDirty = true;
        sayLine("这就拿给你。");
    }

    /** 打开"她的包"界面用：她的 27 格（不在场返回 null）。 */
    public static net.minecraft.inventory.Inventory herBag() {
        var client = MinecraftClient.getInstance();
        if (client == null) return null;
        var her = findCompanion(client);
        return her == null ? null : her.getBag();
    }

    /** 她手上拿着什么（不在场返回 null）。 */
    public static net.minecraft.item.ItemStack herHeldStack() {
        var client = MinecraftClient.getInstance();
        if (client == null) return null;
        var her = findCompanion(client);
        return her == null ? null : her.getEquippedStack(net.minecraft.entity.EquipmentSlot.MAINHAND);
    }

    /** 用她的名义说一句（命令盘的反馈，不需要经过 DSH）。 */
    private static void sayLine(String text) {
        String name = bodyName.isEmpty() ? "同伴" : bodyName;
        OUTGOING.add("/tellraw @a " + tellraw(name, text));
    }

    /** 她到场了吗？没到场时按钮点了也没用，得先说清楚。 */
    private static boolean bodyReady() {
        MinecraftClient client = MinecraftClient.getInstance();
        return client != null && findCompanion(client) != null;
    }

    /** 命令盘按钮：让她说句话——这个要交给 DSH 那边决定。 */
    public static void panelSpeak() {
        JsonObject event = new JsonObject();
        event.addProperty("type", "panel");
        event.addProperty("action", "speak");
        emit(event);
    }

    /**
     * 公共 NBT 前缀。狼/猫这类要认主，否则不会跟着你走。
     */
    private static String ownerNbt(MinecraftClient client) {
        StringBuilder sb = new StringBuilder("PersistenceRequired:1b,CustomNameVisible:1b,");
        if (bodyType.contains("wolf") || bodyType.contains("cat")) {
            java.util.UUID id = client.player.getUuid();
            sb.append("Owner:[I;")
                    .append((int) (id.getMostSignificantBits() >> 32)).append(',')
                    .append((int) id.getMostSignificantBits()).append(',')
                    .append((int) (id.getLeastSignificantBits() >> 32)).append(',')
                    .append((int) id.getLeastSignificantBits())
                    .append("],Tame:1b,Sitting:0b,");
        }
        return sb.toString();
    }

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static void detectDeath(MinecraftClient client) {
        if (client.player == null) { lastHealth = -1f; return; }
        float health = client.player.getHealth();
        if (lastHealth > 0f && health <= 0f) {
            JsonObject event = new JsonObject();
            event.addProperty("type", "death");
            event.addProperty("name", client.player.getGameProfile().getName());
            // 死因：客户端已经算好的那句话（"被僵尸打死了" 之类）
            try {
                String cause = client.player.getDamageTracker().getDeathMessage().getString();
                if (cause != null) event.addProperty("detail", cause);
            } catch (Exception ignored) {
                // 拿不到就算了，至少还有"死了"
            }
            emit(event);
        }
        lastHealth = health;
    }


    /** 每 100 tick（约 5 秒）发一次"她现在能看见什么"。 */
    private static void snapshot(MinecraftClient client) {
        tickCounter++;
        // 她到了目的地就单独报一次，让外面知道该派下一件事了
        if (tickCounter % 10 == 0) {
            CompanionEntity her = findCompanion(client);
            // arrived 别刷屏：她在一个点附近反复"到达"时（模型重试同一个够不着的目标），
            // 每 10 tick 报一次会把日志和模型上下文都灌满（实测刷了十几条一样的坐标）。
            if (her != null && her.consumeArrived()) {
                long now = System.currentTimeMillis();
                boolean sameSpot = Math.abs(her.getX() - lastArrivedX) < 2
                        && Math.abs(her.getZ() - lastArrivedZ) < 2;
                if (sameSpot && now - lastArrivedAt < 15000) {
                    // 同一个地方、15 秒内报过了，就不再报
                } else {
                    lastArrivedAt = now;
                    lastArrivedX = her.getX();
                    lastArrivedZ = her.getZ();
                    JsonObject arrived = new JsonObject();
                    arrived.addProperty("type", "arrived");
                    arrived.addProperty("x", Math.round(her.getX() * 10) / 10.0);
                    arrived.addProperty("y", Math.round(her.getY() * 10) / 10.0);
                    arrived.addProperty("z", Math.round(her.getZ() * 10) / 10.0);
                    emit(arrived);
                }
            }
            if (her != null && her.consumeStuck()) {
                // 走不过去也得说一声，别让她一直"忙"着装没事
                JsonObject stuck = new JsonObject();
                stuck.addProperty("type", "stuck");
                stuck.addProperty("x", Math.round(her.getX() * 10) / 10.0);
                stuck.addProperty("y", Math.round(her.getY() * 10) / 10.0);
                stuck.addProperty("z", Math.round(her.getZ() * 10) / 10.0);
                emit(stuck);
            }
        }
        if (tickCounter % 100 != 0) return;
        if (client.player == null || client.world == null) return;
        if (PEERS.isEmpty()) return;
        JsonObject event = new JsonObject();
        event.addProperty("type", "snapshot");
        event.addProperty("name", client.player.getGameProfile().getName());
        event.addProperty("dimension", client.world.getRegistryKey().getValue().toString());
        event.addProperty("x", Math.round(client.player.getX() * 10) / 10.0);
        event.addProperty("y", Math.round(client.player.getY() * 10) / 10.0);
        event.addProperty("z", Math.round(client.player.getZ() * 10) / 10.0);
        event.addProperty("health", client.player.getHealth());
        event.addProperty("food", client.player.getHungerManager().getFoodLevel());
        event.addProperty("air", client.player.getAir());
        event.addProperty("held", client.player.getMainHandStack().getName().getString());
        event.addProperty("timeOfDay", client.world.getTimeOfDay() % 24000L);
        event.addProperty("raining", client.world.isRaining());
        event.addProperty("sprinting", client.player.isSprinting());
        event.addProperty("sneaking", client.player.isSneaking());
        event.addProperty("onGround", client.player.isOnGround());
        // 单机还是多人：插件靠这个决定"你自己打的字"算不算在叫她
        event.addProperty("multiplayer", client.getCurrentServerEntry() != null);
        event.addProperty("bodyType", bodyType);
        // 她自己的状态：在不在、在哪、还有没有任务
        CompanionEntity her = findCompanion(client);
        event.addProperty("herPresent", her != null);
        if (her != null) {
            event.addProperty("herX", Math.round(her.getX() * 10) / 10.0);
            event.addProperty("herY", Math.round(her.getY() * 10) / 10.0);
            event.addProperty("herZ", Math.round(her.getZ() * 10) / 10.0);
            event.addProperty("herBusy", her.hasTarget());
            event.addProperty("herIdle", her.getNavigation().isIdle());
            event.addProperty("herTicks", her.getTicks());
            // 她手上拿的是什么：外面靠这个判断"能不能挖得动石头"
            var hand = her.getEquippedStack(net.minecraft.entity.EquipmentSlot.MAINHAND);
            event.addProperty("herHeld", hand.isEmpty()
                    ? ""
                    : net.minecraft.registry.Registries.ITEM.getId(hand.getItem()).toString());
            event.addProperty("herSpeed", Math.round(herSpeed(client, her) * 100) / 100.0);
            event.addProperty("herDistance", Math.round(her.distanceTo(client.player) * 10) / 10.0);
        }
        emit(event);
    }

    /**
     * 她的实际速度（格/秒）。
     *
     * 不用 getVelocity()：NoAI 的实体由我们自己 move() 驱动，原版 travel() 每 tick
     * 又把 velocity 衰减回 0，读出来永远是 0.0——一个一直在骗人的诊断字段。
     * 改成拿两次快照之间的位移算，慢就是慢，快就是快。
     */
    private static double herSpeed(MinecraftClient client, CompanionEntity her) {
        long now = System.currentTimeMillis();
        double speed = 0;
        if (lastHerSampleAt > 0 && now > lastHerSampleAt) {
            double dt = (now - lastHerSampleAt) / 1000.0;
            double dx = her.getX() - lastHerX;
            double dz = her.getZ() - lastHerZ;
            speed = Math.sqrt(dx * dx + dz * dz) / dt;
        }
        lastHerX = her.getX();
        lastHerZ = her.getZ();
        lastHerSampleAt = now;
        return speed;
    }

    /** 回执：让外面知道命令到底走到哪一步了。 */
    private static void ack(String what, String detail) {
        JsonObject event = new JsonObject();
        event.addProperty("type", "ack");
        event.addProperty("what", what);
        event.addProperty("detail", detail);
        emit(event);
    }
    private static void emit(JsonObject event) {
        if (PEERS.isEmpty()) return;
        String line = GSON.toJson(event);
        for (Writer out : PEERS) {
            try {
                out.write(line);
                out.write("\n");
                out.flush();
            } catch (Exception ignored) {
                // 对端断了：丢掉这条连接，别的照常
                PEERS.remove(out);
            }
        }
    }

    private static void serve() {
        // 端口被上一个游戏实例占着是常事：失败就等一会儿再试，不能一次失败就整局没有管道
        while (true) {
            try {
                listen();
            } catch (Exception error) {
                System.err.println("[mc-companion] 端口 " + PORT + " 起不来，3 秒后重试：" + error.getMessage());
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ignored) {
                    return;
                }
            }
        }
    }

    private static void listen() throws Exception {
        try (ServerSocket socket = new ServerSocket(PORT, 8, InetAddress.getByName("127.0.0.1"))) {
            while (true) {
                Socket client = socket.accept();
                // 一条连接一个线程：插件重载时旧连接还挂着，新连接也能立刻被服务
                Thread peer = new Thread(() -> handleClient(client), "mc-companion-peer");
                peer.setDaemon(true);
                peer.start();
            }
        }
    }


    /** 拼一段 tellraw JSON：`[大肥鱼] 内容`，青色，和玩家发言区分开。 */
    private static String tellraw(String name, String text) {
        String body = "[" + name + "] " + text;
        StringBuilder sb = new StringBuilder("{\"text\":\"");
        for (char c : body.toCharArray()) {
            if (c == '"' || c == '\\') {
                sb.append('\\').append(c);
            } else if (c == '\n') {
                sb.append("\\n");
            } else if (c == ' ' || c > 127) {
                // 指令按空格切参数：空格和中文都必须转义，否则 tellraw 当场被截断
                sb.append('\\').append('u').append(String.format("%04x", (int) c));
            } else {
                sb.append(c);
            }
        }
        sb.append("\",\"color\":\"aqua\"}");
        return sb.toString();
    }


    /** 一条连接的生命周期：注册 writer、发 hello、读命令，断开时摘掉。 */
    private static void handleClient(Socket client) {
        Writer out = null;
        try {
            out = new OutputStreamWriter(client.getOutputStream(), StandardCharsets.UTF_8);
            PEERS.add(out);
            JsonObject hello = new JsonObject();
            hello.addProperty("type", "hello");
            hello.addProperty("version", "1.20.1");
            emit(hello);

            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) {
                handle(line);
            }
        } catch (Exception ignored) {
            // 单条连接出错不影响监听
        } finally {
            if (out != null) PEERS.remove(out);
            try { client.close(); } catch (Exception ignored) { }
        }
    }
    private static void handle(String line) {
        try {
            JsonObject message = JsonParser.parseString(line).getAsJsonObject();
            String cmd = message.has("cmd") ? message.get("cmd").getAsString() : "";
            if ("goto".equals(cmd)) {
                gotoX = message.get("x").getAsDouble();
                gotoY = message.get("y").getAsDouble();
                gotoZ = message.get("z").getAsDouble();
                gotoDirty = true;
                ack("goto-received", "x=" + gotoX + " z=" + gotoZ);
            }
            if ("follow".equals(cmd)) {
                followOn = message.has("on") && message.get("on").getAsBoolean();
                if (message.has("distance")) {
                    followDistance = Math.max(2.0, Math.min(48.0, message.get("distance").getAsDouble()));
                }
            }
            if ("halt".equals(cmd)) {
                haltDirty = true;
            }
            if ("mine".equals(cmd)) {
                // 坐标是可选的：用 rel（under / underPlayer / crosshair）时不用给
                if (message.has("x")) mineX = message.get("x").getAsInt();
                if (message.has("y")) mineY = message.get("y").getAsInt();
                if (message.has("z")) mineZ = message.get("z").getAsInt();
                // 玩家亲手点的（还是从面板来的）不受 6 格限制
                mineForce = message.has("force") && message.get("force").getAsBoolean();
                mineRel = message.has("rel") ? message.get("rel").getAsString() : "";
                mineDirty = true;
            }
            if ("inventory".equals(cmd)) {
                scanDirty = true;
            }
            if ("place".equals(cmd)) {
                placeItem = message.has("item") ? message.get("item").getAsString() : "";
                placeDirty = true;
            }
            if ("plan".equals(cmd)) {
                planItem = message.has("item") ? message.get("item").getAsString() : "";
                planDirty = true;
            }
            if ("skin".equals(cmd)) {
                String path = message.has("path") ? message.get("path").getAsString() : "";
                String problem = CompanionRenderer.useSkinFile(path);
                if (problem == null) {
                    ack("skin-set", path.isBlank() ? "换回自带皮肤" : "换上你指定的皮肤");
                } else {
                    ack("skin-bad", problem);
                }
            }
            if ("smelt".equals(cmd)) {
                smeltItem = message.has("item") ? message.get("item").getAsString() : "";
                smeltCount = message.has("count") ? Math.max(1, message.get("count").getAsInt()) : 1;
                smeltDirty = true;
            }
            if ("rescue".equals(cmd)) {
                rescueDirty = true;     // 实体操作必须在主线程
            }
            if ("equip".equals(cmd)) {
                // 把包里的东西拿到手上（item="none" 卸下）
                equipItem = message.has("item") ? message.get("item").getAsString() : "";
                equipDirty = true;
            }
            if ("gather".equals(cmd)) {
                // 她自己找东西：what=log（砍树，默认）/ stone（挖石头），半径可调
                gatherWhat = message.has("what") ? message.get("what").getAsString() : "log";
                gatherRadius = message.has("radius")
                        ? Math.max(4, Math.min(64, message.get("radius").getAsInt()))
                        : 24;
                gatherDirty = true;
            }
            if ("deliver".equals(cmd)) {
                // 把东西给她拿到你手上；all=true 表示"包里所有东西都给我"
                deliverAll = !message.has("all") || message.get("all").getAsBoolean();
                deliverAnnounced = false;
                deliverTicks = 0;
                deliverDirty = true;
            }
            if ("recipe".equals(cmd)) {
                recipeItem = message.has("item") ? message.get("item").getAsString() : "";
                recipeDirty = true;
            }
            if ("diag".equals(cmd)) {
                diagDirty = true;   // 世界对象只能在主线程读
            }
            if ("rules".equals(cmd)) {
                if (message.has("dropOnDeath")) dropOnDeath = message.get("dropOnDeath").getAsBoolean();
                if (message.has("invulnerable")) sheInvulnerable = message.get("invulnerable").getAsBoolean();
                if (message.has("revive")) revive = message.get("revive").getAsBoolean();
                ack("rules", "drop=" + dropOnDeath + " invul=" + sheInvulnerable + " revive=" + revive);
            }
            if ("purge".equals(cmd)) {
                purgeDirty = true;   // 实体操作必须在主线程
            }
            if ("autopickup".equals(cmd)) {
                autoPickupOn = message.has("on") && message.get("on").getAsBoolean();
            }
            if ("herbag".equals(cmd)) {
                herBagDirty = true;
            }
            if ("craft".equals(cmd)) {
                craftItem = message.has("item") ? message.get("item").getAsString() : "";
                tablePlaceAttempts = 0;          // 新的一次请求：允许她再放台子
                craftDirty = true;
            }
            if ("collect".equals(cmd)) {
                collectDirty = true;
            }
            if ("attack".equals(cmd)) {
                attackDirty = true;
            }            if ("rename".equals(cmd)) {
                if (message.has("name")) bodyName = message.get("name").getAsString();
                // 类型也一起同步：插件那边才是"她该长什么样"的唯一来源
                if (message.has("type")) {
                    String type = message.get("type").getAsString();
                    if (!type.isEmpty() && !type.equals(bodyType)) {
                        bodyType = type;
                        respawnDirty = true;   // 换类型 = 重新生成，不留在场的旧身体
                    }
                }
                renameDirty = true;
            }
            if ("body".equals(cmd)) {
                // 身体：生成/收回/改名。真正的命令在主线程的 maintainBody 里发。
                boolean on = message.has("on") && message.get("on").getAsBoolean();
                if (message.has("name")) bodyName = message.get("name").getAsString();
                if (message.has("type")) bodyType = message.get("type").getAsString();
                bodyOn = on;
                bodyDirty = true;
            }
            if ("say".equals(cmd) && message.has("text")) {
                String text = message.get("text").getAsString();
                String name = message.has("name") ? message.get("name").getAsString() : "";
                if (name.isEmpty()) {
                    OUTGOING.add(text);
                } else {
                    // 用 tellraw 以"她"的名义说话，不占用玩家的发言
                    OUTGOING.add("/tellraw @a " + tellraw(name, text));
                }
            }
        } catch (Exception ignored) {
            // 坏行直接丢
        }
    }
}
