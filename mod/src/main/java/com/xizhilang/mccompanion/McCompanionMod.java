package com.xizhilang.mccompanion;

import net.fabricmc.api.ModInitializer;

/**
 * 双端入口。
 *
 * 实体类型必须两边都注册：只在客户端注册的话，
 * 服务端不认这个类型——`/summon` 会失败，`@e[type=…]` 也选不中她，
 * 指令就没法指向她。
 *
 * 这里只做"注册"这种两边都要的事；渲染、按键、桥接留在客户端。
 */
public class McCompanionMod implements ModInitializer {
    @Override
    public void onInitialize() {
        ModEntities.init();
    }
}
