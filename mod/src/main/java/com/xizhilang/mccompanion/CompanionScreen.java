package com.xizhilang.mccompanion;

import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

/**
 * 命令盘：按一个键，弹出几个按钮。
 *
 * 这些是「不需要她思考」的动作——过来、跟着、停下、待着。
 * 想让她说话或做别的事，走「说话」这个按钮，交回 DSH 那边决定。
 */
public class CompanionScreen extends Screen {
    public CompanionScreen() {
        super(Text.literal("大肥鱼"));
    }

    @Override
    protected void init() {
        int centerX = this.width / 2 - 100;
        int startY = this.height / 2 - 108;
        int step = 24;

        addButton(centerX, startY, "过来", () -> McCompanionClient.panelCome());
        addButton(centerX, startY + step, "跟着我", () -> McCompanionClient.panelFollow(true));
        addButton(centerX, startY + step * 2, "待着别动", () -> McCompanionClient.panelFollow(false));
        addButton(centerX, startY + step * 3, "停下", () -> McCompanionClient.panelHalt());
        addButton(centerX, startY + step * 4, "挖准星这格", () -> McCompanionClient.panelMineCrosshair());
        addButton(centerX, startY + step * 5, "捡东西", () -> McCompanionClient.panelCollect());
        addButton(centerX, startY + step * 6, "把东西给我", () -> McCompanionClient.panelDeliver());
        // 看她的包（只读）
        addDrawableChild(ButtonWidget.builder(Text.literal("看她的包"), b -> {
            if (this.client != null) this.client.setScreen(new BagScreen());
        }).dimensions(centerX, startY + step * 7, 200, 20).build());
        // 这一项不关闭本页，改成打开合成页
        addDrawableChild(ButtonWidget.builder(Text.literal("让她做个东西…"), b -> {
            if (this.client != null) this.client.setScreen(new CraftScreen());
        }).dimensions(centerX, startY + step * 8, 200, 20).build());
        addButton(centerX, startY + step * 9, "说句话", () -> McCompanionClient.panelSpeak());
        addButton(centerX, startY + step * 10, "收起身体", () -> McCompanionClient.panelDismiss());
    }

    private void addButton(int x, int y, String label, Runnable action) {
        this.addDrawableChild(ButtonWidget.builder(Text.literal(label), button -> {
            action.run();
            this.close();
        }).dimensions(x, y, 200, 20).build());
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
