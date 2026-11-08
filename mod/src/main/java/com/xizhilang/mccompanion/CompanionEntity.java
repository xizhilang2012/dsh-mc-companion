package com.xizhilang.mccompanion;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.passive.WolfEntity;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * 她的身体。
 *
 * 继承狼不是为了"当宠物"——是为了白拿一套已经调好的寻路和模型：
 * Navigation、MobEntityModel、WolfEntityRenderer 全都不用重写。
 *
 * 区别在于：
 *   1. 它不会因为没主人而乱跑（永远认第一个靠近的玩家为主）
 *   2. 外部可以给它一个目标点，它会自己走过去（不是被传送）
 *   3. 它不叫、不掉血、不消失
 *
 * 真正的"决策"在 DSH 那边，这里只负责执行"走到哪"。
 */
public class CompanionEntity extends WolfEntity {
    /** 重力加速度：和玩家同一套数值（0.08 格/tick²）。 */
    private static final double GRAVITY = 0.08;
    /** 走路速度：0.2 格/tick ≈ 4 格/秒，和玩家走路差不多，跟得上。 */
    private static final double WALK_SPEED = 0.2;
    /** 起跳速度：原版生物就是这个数，正好上一格。 */
    private static final double JUMP_SPEED = 0.42;

    /** 她自己的背包：采集来的东西先放这里。 */
    private final net.minecraft.inventory.SimpleInventory bag = new net.minecraft.inventory.SimpleInventory(27);

    public net.minecraft.inventory.SimpleInventory getBag() {
        return this.bag;
    }

    /** 目标点；null 表示没有任务。 */
    private Vec3d target = null;
    /** 到达目标时置位，由外部取走。 */
    private boolean arrived = false;
    /** 走不过去时置位，由外部取走——不能一直"忙"着装没事。 */
    private boolean stuck = false;
    /** 诊断：她自己 tick 了多少次。不涨就说明没在跑。 */
    private int ticks = 0;
    /** 上一次的位置，用来判断"卡住了没"。 */
    private Vec3d lastPos = Vec3d.ZERO;
    private int stalledTicks = 0;
    /** 上一次离目标多远：没变近就算没进展。 */
    private double lastDistance = Double.MAX_VALUE;
    /** 自己的垂直速度：NoAI 的实体原版不给算重力，只能自己攒。 */
    private double vy = 0;
    /** 寻路算出来的路径；null 表示"还没算"或"算不出来"。 */
    private net.minecraft.entity.ai.pathing.Path path = null;
    private int nodeIndex = 0;
    private int repathTicks = 0;
    /** 连续算不出路的 tick 数：给宽限，别一失败就吃掉用户的目标。 */
    private int noPathTicks = 0;

    public CompanionEntity(EntityType<? extends WolfEntity> type, World world) {
        super(type, world);
        this.setTamed(true);
        this.setInvulnerable(true);
        this.setSilent(true);
        this.setPersistent();
        this.setCustomNameVisible(true);
        // 关掉狼自己的 AI：不然它的 WanderAroundGoal 会不停重置我们设的路径和速度
        this.setAiDisabled(true);
    }

    /** 让它走到某个坐标。 */
    public void walkTo(double x, double y, double z) {
        this.target = new Vec3d(x, y, z);
        this.path = null;             // 新目标：路要重算
        this.nodeIndex = 0;
        this.repathTicks = 0;
        this.noPathTicks = 0;
        this.stalledTicks = 0;
        this.lastDistance = Double.MAX_VALUE;
        this.stuck = false;
    }

    /** 停下。 */
    public void halt() {
        this.target = null;
        this.getNavigation().stop();
    }

    public boolean hasTarget() {
        return this.target != null;
    }

    public int getTicks() {
        return this.ticks;
    }

    public double getVelocityXZ() {
        return Math.sqrt(this.getVelocity().x * this.getVelocity().x + this.getVelocity().z * this.getVelocity().z);
    }

    /** 取走「刚到」这个信号，只报一次。 */
    public boolean consumeArrived() {
        boolean was = this.arrived;
        this.arrived = false;
        return was;
    }

    /** 取走「走不过去」这个信号，只报一次。 */
    public boolean consumeStuck() {
        boolean was = this.stuck;
        this.stuck = false;
        return was;
    }

    @Override
    public void tick() {
        super.tick();
        this.ticks++;
        // 位置只由服务端算：客户端有服务端同步，自己再 move 一次就会抖
        if (this.getWorld().isClient) return;

        Vec3d horizontal = Vec3d.ZERO;
        if (this.target != null) {
            double dx = this.getX() - this.target.x;
            double dz = this.getZ() - this.target.z;
            // 到点判定要带上高度：只判水平的话，她会站在崖顶"到达"脚下 6 格外的铁矿，
            // 然后 mine-unreachable（实测：铁矿石差 7 格、石头差 6 格，反复重试）。
            boolean closeEnough = dx * dx + dz * dz < 2.25
                    && Math.abs(this.getY() - this.target.y) <= 3.0;
            if (closeEnough) {          // 到点了
                this.target = null;
                this.path = null;
                this.nodeIndex = 0;
                this.arrived = true;
                this.stalledTicks = 0;
                this.lastDistance = Double.MAX_VALUE;
            } else {
                // 卡住了要认：以前这里没有超时，走不过去就一直"忙"着，
                // 外面以为她在干活，决策循环再也不派新活。
                double distance = Math.sqrt(dx * dx + dz * dz);
                if (distance < this.lastDistance - 0.05) {
                    this.lastDistance = distance;
                    this.stalledTicks = 0;
                } else {
                    this.stalledTicks++;
                }
                if (this.stalledTicks > 60) {
                    // 3 秒没进展：先怀疑路不对（撞墙/地形变了），重算一次
                    this.path = null;
                    this.repathTicks = 0;
                }
                if (this.stalledTicks > 260) {       // 13 秒：认输，告诉外面
                    this.target = null;
                    this.path = null;
                    this.nodeIndex = 0;
                    this.stuck = true;
                    this.stalledTicks = 0;
                    this.lastDistance = Double.MAX_VALUE;
                } else {
                    horizontal = this.steer();
                }
            }
        }

        // ── 为什么不用 forwardSpeed + travel() ──
        // 实测：只设 forwardSpeed/yaw、把移动交给原版，她一步都不动（位置完全不变）。
        // 查过字节码：`LivingEntity.isImmobile()` 只返回 `isDead()`，
        // 所以不是"NoAI 让她 immobile"这种简单原因——真正的闸在哪还没查清。
        // 但自己调 move() 这条路上一次是能走的（5 秒 34 格），所以用这条：
        // 碰撞、上台阶、落地仍由引擎算，只是速度由我们喂。
        //
        // 垂直：自己积分，重力用玩家的 0.08，只减一次。
        // （以前 -0.08 是叠在 travel 已经减过的那次上，她掉得比玩家快一倍；
        //   再加一个每 tick 的"贴地"，一跳就被拽回去，所以永远跳不起来。）
        if (this.isOnGround() && this.vy < 0) this.vy = 0;
        this.vy -= GRAVITY;
        if (this.vy < -0.9) this.vy = -0.9;             // 终端速度，别一落千丈
        // 撞墙还站着：跳。0.42 是原版生物的起跳速度，正好上一格。
        if (this.horizontalCollision && this.isOnGround() && horizontal.lengthSquared() > 0) {
            this.vy = JUMP_SPEED;
        }
        this.move(net.minecraft.entity.MovementType.SELF, new Vec3d(horizontal.x, this.vy, horizontal.z));
        // 速度只是给客户端做插值，位置由 move() 负责
        this.setVelocity(horizontal.x, this.isOnGround() ? 0 : this.vy, horizontal.z);
        if (this.isOnGround() && this.vy < 0) this.vy = 0;
        this.lastPos = this.getPos();
    }

    /**
     * 这一 tick 往哪走。
     *
     * 以前是"朝目标画直线"——撞墙就跳，跳不上去就一直磨到超时。
     * 现在先让原版导航算一条路，然后沿着**路径节点**走：
     * 绕墙、上楼梯、绕水池都是寻路负责，我们只管一个节点一个节点地喂 move()。
     *
     * 算不出路（目标悬空/被围死）时退回直线，交给超时报 stuck。
     */
    private Vec3d steer() {
        if (this.target == null) return Vec3d.ZERO;
        if (this.path == null || this.repathTicks-- <= 0) {
            this.path = this.getNavigation().findPathTo(this.target.x, this.target.y, this.target.z, 32);
            if (this.path == null) {
                // 算不出路时**不要直线硬走**：她就是这么走进深坑的
                // （目标在你头顶 80 格，直线"能走"，走两步就掉下去了）。
                // 退一步：朝目标方向找个 8 格内的落脚点，能到就挪一段，再重算。
                this.path = pathToward();
                if (this.path == null) {
                    // 但绝不能一算不出来就取消目标：那样一条走路指令会被一次瞬间的
                    // 算路失败直接吃掉（实测：她站在崖边时 goto 一律无效，
                    // 外面看到的是"她卡死、下命令不动"）。
                    // 给 2 秒宽限：先不动，连续 40 tick 都算不出路才认输。
                    if (++this.noPathTicks > 40) {
                        this.noPathTicks = 0;
                        this.target = null;
                        this.stuck = true;
                    }
                    return Vec3d.ZERO;
                }
            }
            this.noPathTicks = 0;
            this.nodeIndex = 0;
            this.repathTicks = 40;      // 2 秒后允许重算（世界变了/被挡住）
        }
        Vec3d aim = this.target;
        if (this.path != null && this.path.getLength() > 0) {
            // 跳过已经站上去的节点
            while (this.nodeIndex < this.path.getLength()) {
                var node = this.path.getNode(this.nodeIndex).getBlockPos();
                double hx = node.getX() + 0.5 - this.getX();
                double hz = node.getZ() + 0.5 - this.getZ();
                if (hx * hx + hz * hz < 0.8) {
                    this.nodeIndex++;
                    continue;
                }
                aim = new Vec3d(node.getX() + 0.5, this.getY(), node.getZ() + 0.5);
                break;
            }
        }
        Vec3d flat = new Vec3d(aim.x - this.getX(), 0, aim.z - this.getZ());
        if (flat.lengthSquared() < 1.0E-4) return Vec3d.ZERO;
        float yaw = (float) (Math.toDegrees(Math.atan2(flat.z, flat.x)) - 90);
        this.setYaw(yaw);
        this.bodyYaw = yaw;
        this.headYaw = yaw;
        return flat.normalize().multiply(WALK_SPEED);
    }

    /** 朝最终目标方向找一个 8 格内、但同一高度的落脚点（不跨高度就不会掉坑）。 */
    private net.minecraft.entity.ai.pathing.Path pathToward() {
        if (this.target == null) return null;
        double dx = this.target.x - this.getX();
        double dz = this.target.z - this.getZ();
        double len = Math.sqrt(dx * dx + dz * dz);
        if (len < 1.0) return null;
        for (double step = 8.0; step >= 2.0; step -= 2.0) {
            double x = this.getX() + dx / len * step;
            double z = this.getZ() + dz / len * step;
            var path = this.getNavigation().findPathTo(x, this.getY(), z, 12);
            if (path != null) return path;
        }
        return null;
    }


    @Override
    public void writeCustomDataToNbt(net.minecraft.nbt.NbtCompound nbt) {
        super.writeCustomDataToNbt(nbt);
        // 手写槽位格式：比 Inventories 的签名稳，跨小版本也不容易崩
        net.minecraft.nbt.NbtList list = new net.minecraft.nbt.NbtList();
        for (int i = 0; i < this.bag.size(); i++) {
            var stack = this.bag.getStack(i);
            if (stack.isEmpty()) continue;
            net.minecraft.nbt.NbtCompound one = new net.minecraft.nbt.NbtCompound();
            one.putByte("Slot", (byte) i);
            stack.writeNbt(one);
            list.add(one);
        }
        nbt.put("Bag", list);
    }

    @Override
    public void readCustomDataFromNbt(net.minecraft.nbt.NbtCompound nbt) {
        super.readCustomDataFromNbt(nbt);
        net.minecraft.nbt.NbtList list = nbt.getList("Bag", 10);
        for (int k = 0; k < list.size(); k++) {
            net.minecraft.nbt.NbtCompound one = list.getCompound(k);
            int slot = one.getByte("Slot") & 255;
            if (slot < this.bag.size()) {
                this.bag.setStack(slot, net.minecraft.item.ItemStack.fromNbt(one));
            }
        }
    }

    @Override
    public void onDeath(net.minecraft.entity.damage.DamageSource source) {
        super.onDeath(source);
        // 记账：她死了。复活的判断只看这一笔，不看"能不能看见她"——
        // 看不见也可能是走远了，把那种情况当成死就是把她反复杀掉。
        McCompanionClient.noteHerDeath();
        // 背包里的东西：按设置决定掉落还是留着（留着=复活后还在）
        if (McCompanionClient.dropOnDeath) {
            for (int i = 0; i < this.bag.size(); i++) {
                var stack = this.bag.getStack(i);
                if (!stack.isEmpty()) {
                    this.dropStack(stack);
                    this.bag.setStack(i, net.minecraft.item.ItemStack.EMPTY);
                }
            }
        } else {
            // 设置成"不掉落"就该是"留着"，而不是凭空消失：
            // 实体死了包也跟着没，等于她一路攒的东西被系统吞了。
            McCompanionClient.keepBagOnDeath(this.bag);
        }
    }

    @Override
    public boolean canBeLeashedBy(net.minecraft.entity.player.PlayerEntity player) {
        return false;
    }
}
