package com.xizhilang.mccompanion;

import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

/**
 * 合成请求页：选一个想要的东西，剩下的交给她去查、去挖、去合成。
 *
 * 这里只放少数常用项——要什么都能做的话，得有个搜索框，
 * 那是下一步的事。先把"点一下，她自己跑完整条链"验证掉。
 */
public class CraftScreen extends Screen {
    /** 常用目标。id 用注册名，服务端查得到就做得了，包括 mod 加的。 */
    private static final String[][] PRESETS = {
            { "工作台", "minecraft:crafting_table" },
            { "木棍", "minecraft:stick" },
            { "石头", "minecraft:stone" },
            { "火把", "minecraft:torch" },
            { "石镐", "minecraft:stone_pickaxe" },
            { "铁镐", "minecraft:iron_pickaxe" },
            { "箱子", "minecraft:chest" },
            { "床", "minecraft:red_bed" },
    };

    public CraftScreen() {
        super(Text.literal("让她做什么"));
    }

    @Override
    protected void init() {
        int centerX = this.width / 2 - 100;
        int startY = this.height / 2 - 90;
        int step = 24;

        for (int i = 0; i < PRESETS.length; i++) {
            final String label = PRESETS[i][0];
            final String id = PRESETS[i][1];
            addDrawableChild(ButtonWidget.builder(Text.literal(label), b -> {
                McCompanionClient.requestCraft(id, label);
                this.close();
            }).dimensions(centerX, startY + step * i, 200, 20).build());
        }

        addDrawableChild(ButtonWidget.builder(Text.literal("返回"), b -> this.close())
                .dimensions(centerX, startY + step * PRESETS.length + 6, 200, 20).build());
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
