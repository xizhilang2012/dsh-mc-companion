package com.xizhilang.mccompanion;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.item.ItemStack;
import net.minecraft.text.Text;

/**
 * 她自己的包：27 格，看得见每一件东西。
 *
 * 只读——东西是她的，要拿就让她走过来给你（deliver）。
 * 这和玩家的物品栏是两回事：她采的木头先进这里，用自己材料做成的东西也从这里出。
 */
public class BagScreen extends Screen {
    private static final int COLS = 9;
    private static final int ROWS = 3;
    private static final int CELL = 20;

    public BagScreen() {
        super(Text.literal("她的包"));
    }

    @Override
    protected void init() {
        this.addDrawableChild(ButtonWidget.builder(Text.literal("关上"), button -> this.close())
                .dimensions(this.width / 2 - 40, this.height / 2 + 92, 80, 20)
                .build());
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        this.renderBackground(context);
        var bag = McCompanionClient.herBag();
        int gridW = COLS * CELL;
        int gridH = ROWS * CELL;
        int left = (this.width - gridW) / 2;
        int top = this.height / 2 - 60;

        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("她的包"), this.width / 2, top - 24, 0xFFFFFF);

        // 底格
        for (int row = 0; row < ROWS; row++) {
            for (int col = 0; col < COLS; col++) {
                int x = left + col * CELL;
                int y = top + row * CELL;
                context.fill(x, y, x + 18, y + 18, 0x40FFFFFF);
                context.fill(x, y, x + 18, y + 1, 0x30FFFFFF);
            }
        }

        int hovered = -1;
        if (bag != null) {
            int slots = Math.min(bag.size(), COLS * ROWS);
            for (int i = 0; i < slots; i++) {
                ItemStack stack = bag.getStack(i);
                if (stack.isEmpty()) continue;
                int x = left + (i % COLS) * CELL;
                int y = top + (i / COLS) * CELL;
                context.drawItemInSlot(this.textRenderer, stack, x, y);
                if (mouseX >= x && mouseX < x + 18 && mouseY >= y && mouseY < y + 18) hovered = i;
            }
            if (hovered >= 0) {
                context.drawItemTooltip(this.textRenderer, bag.getStack(hovered), mouseX, mouseY);
            }
        }
        if (bag == null) {
            context.drawCenteredTextWithShadow(this.textRenderer,
                    Text.literal("她不在场（或者这个版本拿不到服务端世界）"), this.width / 2, top + gridH / 2, 0xFF6666);
        }

        // 手上那件 + 用了几格
        var hand = McCompanionClient.herHeldStack();
        String held = hand == null || hand.isEmpty() ? "手上：空手" : "手上：" + hand.getName().getString();
        context.drawTextWithShadow(this.textRenderer, Text.literal(held), left, top + gridH + 8, 0xCCCCCC);
        int used = 0;
        if (bag != null) {
            for (int i = 0; i < bag.size(); i++) {
                if (!bag.getStack(i).isEmpty()) used++;
            }
        }
        context.drawTextWithShadow(this.textRenderer,
                Text.literal("用了 " + used + " / 27 格 · 想要东西就喊她拿给你"), left, top + gridH + 22, 0x999999);

        super.render(context, mouseX, mouseY, delta);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
