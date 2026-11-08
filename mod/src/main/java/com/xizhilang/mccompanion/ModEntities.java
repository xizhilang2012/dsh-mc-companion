package com.xizhilang.mccompanion;

import net.fabricmc.fabric.api.object.builder.v1.entity.FabricEntityTypeBuilder;
import net.minecraft.entity.EntityDimensions;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.entity.passive.WolfEntity;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.util.Identifier;

/** 注册她这个实体类型，好让 /summon mc-companion:companion 认得。 */
public final class ModEntities {
    public static final EntityType<CompanionEntity> COMPANION = Registry.register(
            Registries.ENTITY_TYPE,
            new Identifier("mc-companion", "companion"),
            FabricEntityTypeBuilder.create(SpawnGroup.CREATURE, CompanionEntity::new)
                    .dimensions(EntityDimensions.fixed(0.6f, 1.8f))   // 人形模型：身高要按玩家算，不然会穿地
                    .trackRangeBlocks(64)
                    .build());

    private ModEntities() {
    }

    public static void init() {
        // 没有默认属性的话，实体一生成就会 NPE
        net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry.register(
                COMPANION, WolfEntity.createWolfAttributes());
    }
}
