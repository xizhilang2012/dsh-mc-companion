"""鲸鱼娘皮肤 v3：照网上那张皮肤的技法重画。

技法（从 cache/skin-blue-whale.png 量出来的）：
- 全皮肤共享一个"描边/深阴影色"（近黑 #0B1A26），所有交界都压一条 → 有"画过"的感觉
- 主色每种 1 个基色 + 8 档明暗（渐变），整张有 60+ 个颜色
- 只用**帽子层**做体积（头发），外套/袖子/裤腿层基本留空
- 不填满整张图（约 47%），留白处透明

这张全部自己画，版权无争议。
"""
from PIL import Image, ImageDraw

OUT = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\src\main\resources\assets\mc-companion"
    r"\textures\entity\whale_girl.png"
)

img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(img)


def mix(a, b, t):
    return tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3)) + (255,)


def shade(c, k):
    """k<1 变暗，k>1 变亮。"""
    if k >= 1:
        return mix(c[:3], (255, 255, 255), min(1.0, k - 1))
    return mix(c[:3], (0, 0, 0), 1 - k)


OUTLINE = (11, 26, 38, 255)
INK = (16, 34, 52, 255)

# 基色
HAIR_D = (9, 18, 44)
HAIR_B = (24, 52, 118)
HAIR_L = (64, 124, 206)
HAIR_H = (120, 180, 252)
SKIN_D = (206, 158, 138)
SKIN_B = (255, 214, 190)
SKIN_L = (255, 236, 224)
WHITE_D = (188, 198, 214)
WHITE_B = (240, 244, 252)
WHITE_L = (255, 255, 255)
NAVY_D = (12, 20, 44)
NAVY_B = (26, 40, 84)
NAVY_L = (44, 64, 120)
GOLD_D = (150, 116, 44)
GOLD_B = (222, 186, 96)
GOLD_L = (250, 226, 150)
BOW_D = (18, 52, 118)
BOW_B = (44, 104, 190)
BOW_L = (96, 160, 236)
EYE_W = (255, 255, 255)
EYE_L = (128, 196, 255)
EYE_B = (48, 116, 206)
EYE_D = (14, 40, 92)
BLUSH = (250, 170, 178)
MOUTH_D = (120, 40, 56)
MOUTH_B = (170, 66, 84)
SHOE_D = (22, 22, 30)
SHOE_B = (44, 44, 56)


def px(x, y, c):
    d.point((x, y), fill=c)


def rect(x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)


def grad_v(x0, y0, x1, y1, top, bottom, outline_edges=False):
    h = max(1, y1 - y0)
    for i in range(h):
        t = i / max(1, h - 1) if h > 1 else 0.0
        c = mix(top, bottom, t)
        rect(x0, y0 + i, x1, y0 + i + 1, c)
    if outline_edges and y1 - y0 > 1:
        rect(x0, y0, x1, y0 + 1, mix(top, OUTLINE, 0.55))
        rect(x0, y1 - 1, x1, y1, mix(bottom, OUTLINE, 0.55))


# ══════════════ 头：底层
# 头顶（被帽子层盖住一半，但仍然要有头发颜色）
grad_v(8, 0, 16, 8, HAIR_L, HAIR_B)
grad_v(16, 0, 24, 8, HAIR_D, HAIR_D)
grad_v(0, 8, 8, 16, HAIR_B, HAIR_L)
grad_v(24, 8, 32, 16, HAIR_B, HAIR_H)
grad_v(16, 8, 24, 16, HAIR_B, HAIR_H)

# 脸：8x8 手绘
FACE = [
    "HHHHHHHH",   # 刘海
    "HHhSSHhH",   # 刘海分开（露额头）
    "HWWSSWWH",   # 眼白
    "HLBSSBLH",   # 虹膜上缘（亮蓝高光）
    "HBDSSDBH",   # 虹膜下缘 + 瞳孔
    "RSSSSSSR",   # 脸颊
    "RSSMMSSR",   # 腮红 + 嘴
    "IISSSSII",   # 下巴阴影 + 脖子
]
COL = {
    "H": mix(HAIR_B, OUTLINE, 0.25),
    "h": HAIR_H,
    "S": SKIN_B, "s": SKIN_D, "I": mix(SKIN_D, OUTLINE, 0.45),
    "W": EYE_W, "L": EYE_L, "B": EYE_B, "D": EYE_D,
    "R": BLUSH, "M": MOUTH_B,
}
for row, line in enumerate(FACE):
    for col, ch in enumerate(line):
        px(8 + col, 8 + row, COL[ch])
px(11, 13, MOUTH_D); px(12, 13, MOUTH_D)     # 嘴的深色下唇
px(10, 14, mix(SKIN_B, SKIN_L, 0.7))         # 鼻子高光
px(8, 15, mix(SKIN_D, OUTLINE, 0.2))         # 下巴描边
px(15, 15, mix(SKIN_D, OUTLINE, 0.2))

# ══════════════ 头：帽子层（头发体积 + 发带）
# 顶部：蓬起的头发（比底层高一层）
grad_v(40, 0, 48, 8, HAIR_L, HAIR_B)
rect(40, 0, 48, 1, mix(HAIR_H, OUTLINE, 0.3))
# 正面：白荷叶边发带 + 两侧垂发
rect(40, 8, 48, 9, WHITE_L)
for x in range(40, 48, 2):                   # 荷叶边锯齿轮廓
    px(x, 9, WHITE_B)
    px(x + 1, 9, mix(WHITE_D, OUTLINE, 0.35))
rect(41, 9, 42, 16, mix(HAIR_B, OUTLINE, 0.3))   # 右垂发
rect(46, 9, 47, 16, mix(HAIR_B, OUTLINE, 0.3))
px(41, 12, HAIR_H); px(46, 12, HAIR_L)
# 头顶小蓝鲸挂饰（发带上）
rect(43, 5, 46, 8, BOW_B)
rect(43, 7, 46, 8, WHITE_L)
px(45, 6, BOW_D)
# 两侧 + 后面：整片长发（这是体积的来源）
grad_v(32, 8, 40, 16, HAIR_B, HAIR_H)
grad_v(56, 8, 64, 16, HAIR_B, HAIR_H)
grad_v(48, 8, 56, 16, mix(HAIR_B, OUTLINE, 0.2), HAIR_L)
for y in (9, 12, 15):                        # 发丝（每三行一条亮线）
    px(33, y, HAIR_H); px(35, y, HAIR_L)
    px(57, y, HAIR_H); px(59, y, HAIR_L)

# ══════════════ 身体：底层
rect(16, 16, 40, 32, NAVY_B)
grad_v(16, 16, 20, 32, NAVY_L, NAVY_D)       # 右侧面
grad_v(28, 16, 32, 32, NAVY_D, NAVY_L)       # 左侧面
# 正面
rect(20, 20, 28, 21, mix(WHITE_B, OUTLINE, 0.5))    # 领口阴影
rect(21, 21, 27, 22, WHITE_B)                        # 水手领
rect(22, 22, 26, 23, BOW_B)                          # 蝴蝶结
rect(23, 22, 25, 25, BOW_D)                          # 结心
px(24, 22, BOW_L)
rect(22, 23, 26, 24, mix(BOW_B, OUTLINE, 0.3))       # 结的下缘
# 围裙（竖向渐变 + 两侧阴影 + 中缝）
grad_v(20, 24, 28, 30, WHITE_L, WHITE_D)
rect(20, 24, 21, 30, WHITE_D)
rect(27, 24, 28, 30, WHITE_D)
px(24, 25, WHITE_D); px(24, 27, WHITE_D); px(24, 29, WHITE_D)   # 折痕
# 围裙上的小鲸鱼（浅蓝 + 白肚 + 描边）
rect(22, 26, 26, 28, EYE_L)
rect(22, 27, 26, 29, WHITE_L)
px(25, 26, BOW_D); px(22, 26, mix(EYE_L, OUTLINE, 0.4))
# 荷叶边 + 金边
for x in range(20, 28):
    px(x, 30, WHITE_L if x % 2 == 0 else mix(WHITE_D, OUTLINE, 0.35))
for x in range(20, 28):
    px(x, 31, GOLD_B if x % 2 == 0 else GOLD_D)
# 背面：长发 + 尾鳍
grad_v(32, 20, 40, 27, HAIR_B, HAIR_H)
rect(32, 27, 40, 32, NAVY_B)
d.polygon([(32, 30), (35, 26), (40, 29), (36, 33)], fill=BOW_B)
d.polygon([(33, 30), (35, 27), (38, 29), (36, 32)], fill=EYE_L)
px(36, 26, HAIR_H)

# ══════════════ 手臂（右）
rect(44, 16, 48, 20, NAVY_L)                 # 肩
grad_v(44, 20, 48, 27, NAVY_B, NAVY_D, True)  # 袖子
rect(44, 27, 48, 29, WHITE_B)                # 袖口荷叶边
px(44, 28, mix(WHITE_D, OUTLINE, 0.35)); px(46, 28, mix(WHITE_D, OUTLINE, 0.35))
grad_v(44, 29, 48, 32, SKIN_B, SKIN_D)       # 手
px(45, 29, SKIN_L)
grad_v(40, 20, 44, 32, NAVY_D, mix(NAVY_D, OUTLINE, 0.5))
grad_v(48, 20, 52, 32, NAVY_D, mix(NAVY_D, OUTLINE, 0.5))
grad_v(52, 20, 56, 32, NAVY_D, mix(NAVY_D, OUTLINE, 0.5))
rect(48, 16, 52, 20, NAVY_B)
rect(52, 16, 56, 20, NAVY_B)
rect(40, 16, 44, 20, NAVY_B)
# 袖子层：泡泡袖
grad_v(40, 32, 56, 36, WHITE_L, WHITE_D)
for x in range(40, 56, 3):
    px(x, 35, mix(WHITE_D, OUTLINE, 0.3))
px(44, 32, WHITE_L); px(45, 32, WHITE_L)

# ══════════════ 腿（右）
rect(0, 16, 16, 20, NAVY_D)                  # 裙下摆盖住
grad_v(4, 20, 8, 28, WHITE_L, WHITE_D)       # 白袜
px(4, 20, mix(WHITE_D, OUTLINE, 0.3)); px(7, 20, mix(WHITE_D, OUTLINE, 0.3))
rect(0, 20, 4, 28, WHITE_D)
rect(8, 20, 12, 28, WHITE_D)
rect(12, 20, 16, 28, WHITE_D)
grad_v(4, 28, 8, 32, SHOE_B, SHOE_D)         # 鞋
px(5, 28, SHOE_D); px(6, 28, SHOE_D)
px(2, 28, SHOE_D); px(10, 28, SHOE_D); px(14, 28, SHOE_D)
rect(0, 28, 4, 32, SHOE_D)
rect(8, 28, 12, 32, SHOE_D)
rect(12, 28, 16, 32, SHOE_D)
# 裙摆荷叶边（腿层）
rect(0, 32, 16, 34, WHITE_L)
for x in range(0, 16, 2):
    px(x, 34, WHITE_L)
    px(x + 1, 34, mix(WHITE_D, OUTLINE, 0.35))

# ══════════════ 左侧复制（含各自 overlay）
img.paste(img.crop((40, 16, 56, 48)), (32, 48))   # 左臂 + 袖子层
img.paste(img.crop((0, 16, 16, 48)), (16, 48))    # 左腿 + 裤腿层

img.save(OUT)
colors = len({c for c in img.getdata() if c[3] > 0})
print("saved, colors =", colors)
