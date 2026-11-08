package com.xizhilang.mccompanion;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.LivingEntityRenderer;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 她的渲染器：人形模型 + 鲸鱼娘皮肤。
 *
 * 原来是 WolfEntityRenderer（狼的形状）。要换皮肤就得换模型：
 * 皮肤是给"玩家布局"画的（64×64，头/身/手/腿六面），狼的 UV 是另一套，
 * 直接把皮肤贴到狼身上只会得到一团错位的色块。
 *
 * 皮肤可以是自带的，也可以是玩家自己指定的一张 png（设置页里填路径）：
 * 那就从磁盘读进来注册成动态贴图——不用重启游戏，换一张立刻生效。
 */
public class CompanionRenderer extends LivingEntityRenderer<CompanionEntity, PlayerEntityModel<CompanionEntity>> {
    /** 自带的那张。 */
    private static final Identifier DEFAULT_TEXTURE =
            new Identifier("mc-companion", "textures/entity/whale_girl.png");
    /** 当前生效的贴图（自带或自定义）。 */
    private static volatile Identifier currentTexture = DEFAULT_TEXTURE;
    private static int customSeq = 0;

    public CompanionRenderer(EntityRendererFactory.Context ctx) {
        super(ctx, new PlayerEntityModel<>(ctx.getPart(EntityModelLayers.PLAYER), false), 0.5f);
    }

    @Override
    public Identifier getTexture(CompanionEntity entity) {
        return currentTexture;
    }

    /** 换回自带皮肤。 */
    static void resetSkin() {
        currentTexture = DEFAULT_TEXTURE;
    }

    /**
     * 用磁盘上的一张 png 当皮肤。
     *
     * @return 成功返回 null，失败返回原因（交给外面 ack，别静默）
     */
    static String useSkinFile(String path) {
        if (path == null || path.isBlank()) {
            resetSkin();
            return null;
        }
        Path file = Path.of(path);
        if (!Files.isRegularFile(file)) {
            return "找不到文件：" + path;
        }
        try (InputStream in = Files.newInputStream(file)) {
            NativeImage image = NativeImage.read(in);
            if (image.getWidth() != 64 || image.getHeight() != 64) {
                image.close();
                return "皮肤必须是 64×64 的 png，这张是 " + image.getWidth() + "×" + image.getHeight();
            }
            var tex = new NativeImageBackedTexture(image);
            var id = new Identifier("mc-companion", "dynamic/skin_" + (++customSeq));
            MinecraftClient.getInstance().getTextureManager().registerTexture(id, tex);
            currentTexture = id;
            return null;
        } catch (Exception e) {
            return "读了打不开：" + e.getMessage();
        }
    }

    static boolean isCustom() {
        return currentTexture != DEFAULT_TEXTURE;
    }
}
