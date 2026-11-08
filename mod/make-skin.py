"""照 DSH 鲸鱼娘设定图重画皮肤（64x64，双层）。

第一版的问题：全是平涂色块，看着不像。这一版做三件事：
1. **两层都用上**：底层画身体，overlay 层画头发体积、荷叶边、裙摆褶皱、尾鳍。
   MC 的第二层可以伸出轮廓外，长头发/裙边就是靠它做出层次的。
2. **每个材质分 3 个色阶**（亮/中/暗），不再是一块死色。
3. 脸用 8x8 网格手绘（眼白/虹膜/瞳孔/高光/腮红/嘴）；身体正面 8x12 用来画围裙、
   荷叶边、金边、蝴蝶结——像素够了，只是第一版没画。

UV 布局（标准 64x64 经典模型）：
  头 底层 (0,0)   overlay (32,0)
  身 底层 (16,16) overlay (16,32)
  右臂 (40,16)    overlay (40,32)
  右腿 (0,16)     overlay (0,32)
  左臂 (32,48) / 左腿 (16,48) —— 直接复制右侧
"""
from PIL import Image, ImageDraw

OUT = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\src\main\resources\assets\mc-companion"
    r"\textures\entity\whale_girl.png"
)

img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# ── 三阶调色板
HAIR0 = (18, 30, 72, 255)      # 暗（发根）
HAIR1 = (34, 66, 140, 255)     # 中
HAIR2 = (64, 116, 200, 255)    # 亮
HAIR3 = (120, 176, 232, 255)   # 高光
SKIN0 = (232, 196, 178, 255)   # 皮肤暗部
SKIN1 = (252, 226, 210, 255)   # 皮肤
SKIN2 = (255, 240, 230, 255)   # 皮肤亮部
WHITE0 = (206, 214, 228, 255)  # 白布暗
WHITE1 = (240, 244, 250, 255)  # 白布
WHITE2 = (255, 255, 255, 255)  # 白布亮
NAVY0 = (16, 24, 52, 255)      # 裙子暗
NAVY1 = (28, 42, 84, 255)      # 裙子
NAVY2 = (44, 64, 118, 255)     # 裙子亮
GOLD = (222, 186, 96, 255)
BOW0 = (30, 78, 158, 255)
BOW1 = (58, 124, 208, 255)
EYE_W = (255, 255, 255, 255)
EYE_B = (46, 110, 200, 255)
EYE_D = (20, 44, 96, 255)
BLUSH = (246, 176, 184, 255)
MOUTH = (156, 56, 72, 255)
SHOE = (32, 32, 40, 255)
SHOE_H = (68, 68, 80, 255)


def px(x, y, c):
    d.point((x, y), fill=c)


def rect(x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)


def vgrad(x0, y0, x1, y1, top, bottom):
    h = max(1, y1 - y0)
    for i in range(h):
        t = i / max(1, h - 1) if h > 1 else 0
        c = tuple(int(top[k] + (bottom[k] - top[k]) * t) for k in range(3)) + (255,)
        rect(x0, y0 + i, x1, y0 + i + 1, c)


# ═══════════════════ 头（底层）
# 头顶：头发（前后左右都铺满，渐变从深到亮）
vgrad(8, 0, 16, 8, HAIR0, HAIR1)        # top
vgrad(16, 0, 24, 8, HAIR0, HAIR0)       # bottom（被遮住）
vgrad(0, 8, 8, 16, HAIR0, HAIR2)        # right
vgrad(24, 8, 32, 16, HAIR0, HAIR2)      # back
vgrad(16, 8, 24, 16, HAIR0, HAIR2)      # left
# 脸（正面 8x8 手绘）
FACE = [
    "HHHHHHHH",   # 刘海第 1 行
    "HHHSHSHH",   # 刘海第 2 行（中间一缕亮色分开）
    "HWWSSWWH",   # 眼白（上缘）
    "HBDSSDBH",   # 虹膜 + 瞳孔（一行里压出深浅）
    "RSSSSSSR",   # 脸颊
    "RSSMMSSR",   # 腮红 + 嘴
    "sSSSSSSs",   # 下巴
    "sSSSSSSs",   # 下巴阴影
]
COL = {
    "H": HAIR1, "h": HAIR2, "S": SKIN1, "s": SKIN0,
    "W": EYE_W, "B": EYE_B, "D": EYE_D, "R": BLUSH, "M": MOUTH,
}
for row, line in enumerate(FACE):
    for col, ch in enumerate(line):
        px(8 + col, 8 + row, COL[ch])
# 头发高光 + 鬓角
px(9, 8, HAIR3); px(13, 8, HAIR3); px(11, 8, HAIR2)
px(8, 11, HAIR3); px(15, 11, HAIR3)

# ═══════════════════ 头（overlay：发带 + 长头发丝）
# 发带正面：白色荷叶边（锯齿）
rect(40, 8, 48, 9, WHITE2)                       # 发带主体一行
for x in range(40, 48, 2):                       # 荷叶边（锯齿，只垂一格）
    px(x, 9, WHITE1)
    px(x + 1, 9, WHITE0)
rect(40, 9, 48, 10, (0, 0, 0, 0))
for x in range(40, 48, 2):
    px(x, 9, WHITE2)
# 头顶的小蓝鲸（发带上的挂饰）
rect(43, 5, 46, 8, BOW1)
rect(43, 7, 46, 8, WHITE2)
px(45, 6, BOW0)
# 侧面/后面：垂下来的长发（伸出轮廓外，才有体积感）
vgrad(32, 8, 40, 16, HAIR1, HAIR3)      # 右侧长发
vgrad(56, 8, 64, 16, HAIR1, HAIR3)      # 后面长发
for y in range(8, 16, 3):
    px(33, y, HAIR3)
    px(57, y, HAIR3)
# 长发垂到肩膀（用身体 overlay 的前面两侧）
n = rect

# ═══════════════════ 身体（底层）
rect(16, 16, 40, 32, NAVY1)
rect(16, 16, 20, 20, NAVY2)             # 肩
rect(28, 16, 32, 20, NAVY2)
# 正面：水手领 + 蝴蝶结 + 围裙 + 荷叶边 + 金边
rect(20, 20, 28, 21, WHITE2)            # 领口白线
rect(21, 21, 27, 22, WHITE1)
rect(22, 22, 26, 23, BOW1)              # 蝴蝶结
rect(23, 22, 25, 24, BOW0)
px(24, 23, BOW1)
rect(20, 24, 28, 30, WHITE1)            # 围裙
rect(21, 25, 27, 29, WHITE2)            # 围裙亮面
rect(20, 24, 21, 30, WHITE0)            # 左缘阴影
rect(27, 24, 28, 30, WHITE0)            # 右缘阴影
# 围裙上的小鲸鱼
rect(23, 26, 26, 28, BOW1)
rect(23, 27, 26, 28, WHITE2)
px(25, 26, BOW0)
# 荷叶边裙摆（锯齿）+ 金边
for x in range(20, 28):
    px(x, 30, WHITE2 if x % 2 == 0 else WHITE0)
for x in range(20, 28):
    px(x, 31, GOLD)
# 背面：长发 + 尾鳍
vgrad(32, 20, 40, 28, HAIR1, HAIR2)
rect(32, 28, 40, 32, NAVY1)
d.polygon([(32, 30), (36, 26), (40, 30), (36, 33)], fill=BOW1)   # 尾鳍
px(36, 27, HAIR3); px(35, 28, HAIR3); px(37, 28, HAIR3)
# 侧面
rect(16, 20, 20, 32, NAVY0)
rect(28, 20, 32, 32, NAVY0)

# ═══════════════════ 身体（overlay：垂到胸前的长发）
vgrad(20, 36, 21, 44, HAIR1, HAIR3)              # 左侧一缕（1px）
vgrad(27, 36, 28, 44, HAIR1, HAIR3)              # 右侧一缕
px(20, 36, HAIR0); px(27, 36, HAIR0)

# ═══════════════════ 手臂
# 底层：袖子 + 袖口 + 手
rect(44, 16, 48, 20, NAVY2)             # 肩头亮
rect(44, 20, 48, 27, NAVY1)             # 袖子
rect(44, 27, 48, 29, WHITE1)            # 袖口荷叶边
rect(44, 29, 48, 32, SKIN1)             # 手
px(45, 30, SKIN2)
rect(40, 20, 44, 32, NAVY0)             # 外侧
rect(48, 20, 52, 32, NAVY0)             # 内侧
rect(52, 20, 56, 32, NAVY0)             # 后面
rect(48, 16, 52, 20, NAVY1)
rect(52, 16, 56, 20, NAVY1)
rect(40, 16, 44, 20, NAVY1)
# overlay：泡泡袖（伸出轮廓，显得蓬松）
rect(40, 32, 56, 38, WHITE1)
for x in range(40, 56, 3):
    rect(x, 37, x + 1, 38, WHITE0)
rect(44, 32, 48, 38, WHITE2)

# ═══════════════════ 腿
rect(0, 16, 16, 20, NAVY0)              # 被裙摆盖住
rect(4, 20, 8, 28, WHITE1)              # 正面白袜
rect(4, 20, 8, 21, WHITE0)
rect(0, 20, 4, 32, WHITE0)              # 外侧
rect(8, 20, 12, 32, WHITE0)             # 内侧
rect(12, 20, 16, 32, WHITE0)            # 后面
rect(4, 28, 8, 32, SHOE)                # 正面鞋
rect(0, 28, 4, 32, SHOE)
rect(8, 28, 12, 32, SHOE)
rect(12, 28, 16, 32, SHOE)
px(5, 29, SHOE_H); px(2, 29, SHOE_H); px(10, 29, SHOE_H)
# overlay：裙摆荷叶边（腿的上部，伸出裙外）
rect(0, 32, 16, 34, WHITE1)
for x in range(0, 16, 2):
    px(x, 34, WHITE2)
    px(x + 1, 34, WHITE0)

# ═══════════════════ 左侧复制
img.paste(img.crop((40, 16, 56, 48)), (32, 48))   # 左臂（含 overlay）
img.paste(img.crop((0, 16, 16, 48)), (16, 48))    # 左腿（含 overlay）

img.save(OUT)
print("saved", OUT)
