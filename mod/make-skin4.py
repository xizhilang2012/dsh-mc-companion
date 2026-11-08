"""鲸鱼娘皮肤 v5：照 dsh-skin-center 那张插画（MIT）重画。

从插画里补上的两个关键特征（前面几版都漏了）：
1. 头两侧的**鲸鱼尾鳍发饰**（深蓝三角鳍，插画里最显眼的识别点）
2. 白色荷叶边发带 + 侧边蓝色蝴蝶结
另外：发色是"深蓝发根 → 青蓝发梢"的渐变，眼睛很大（占两行），
裙是深蓝配白色荷叶领 + 白围裙 + 白袖口，白袜黑鞋。
"""
from PIL import Image, ImageDraw

OUT = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\src\main\resources\assets\mc-companion"
    r"\textures\entity\whale_girl.png"
)

img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

INK = (13, 24, 46, 255)        # 发根（近黑蓝）
HAIR = (28, 54, 118, 255)      # 中段蓝
HAIR_L = (58, 108, 190, 255)   # 亮蓝
HAIR_T = (110, 176, 236, 255)  # 发梢青
FIN = (26, 44, 96, 255)        # 尾鳍（比头发再深一点）
SKIN = (255, 222, 196, 255)
SKIN_D = (226, 172, 148, 255)
WHITE = (255, 255, 255, 255)
WHITE_D = (212, 220, 236, 255)
NAVY = (22, 34, 66, 255)
NAVY_L = (38, 56, 98, 255)
BOW = (48, 108, 200, 255)
BOW_L = (110, 168, 240, 255)
EYE_B = (44, 116, 208, 255)
EYE_D = (14, 40, 96, 255)
BLUSH = (250, 170, 178, 255)
MOUTH = (168, 62, 80, 255)
SHOE = (34, 34, 42, 255)


def px(x, y, c):
    d.point((x, y), fill=c)


def rect(x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)


def vgrad(x0, y0, x1, y1, top, bottom):
    h = max(1, y1 - y0)
    for i in range(h):
        t = i / max(1, h - 1) if h > 1 else 0.0
        c = tuple(int(top[k] + (bottom[k] - top[k]) * t) for k in range(3)) + (255,)
        rect(x0, y0 + i, x1, y0 + i + 1, c)


# ══════════ 头（底层）
vgrad(8, 0, 16, 8, INK, HAIR)          # 头顶
vgrad(16, 0, 24, 8, INK, INK)          # 头底
vgrad(0, 8, 8, 16, HAIR, HAIR_T)       # 右侧（发梢青）
vgrad(24, 8, 32, 16, HAIR, HAIR_T)     # 后面
vgrad(16, 8, 24, 16, HAIR, HAIR_T)     # 左侧

FACE = [
    "HHHHHHHH",   # 刘海
    "HHSSSSHH",   # 额头
    "SWWSSWWS",   # 眼白（各 2px，中间 2px 鼻梁）
    "SBBSSBBS",   # 虹膜（蓝）
    "SDDSSDDS",   # 瞳孔（深）
    "SSSSSSSS",   # 脸颊
    "RSMMSSSR",   # 腮红 + 张嘴
    "SSSSSSSS",   # 下巴
]
COL = {
    "H": INK, "S": SKIN, "W": WHITE, "B": EYE_B, "D": EYE_D,
    "R": BLUSH, "M": MOUTH,
}
for row, line in enumerate(FACE):
    for col, ch in enumerate(line):
        px(8 + col, 8 + row, COL[ch])
px(9, 12, HAIR_L); px(10, 12, HAIR_L)      # 眼里的青高光
px(13, 12, HAIR_L); px(14, 12, HAIR_L)
px(8, 14, SKIN_D); px(15, 14, SKIN_D)

# ══════════ 头（帽子层：长发 + 尾鳍发饰 + 发带）
# 两侧长发（垂下，把脸框住）
vgrad(32, 8, 40, 16, HAIR, HAIR_T)
vgrad(48, 8, 56, 16, HAIR, HAIR_T)
vgrad(56, 8, 64, 16, HAIR, HAIR_T)
px(33, 11, HAIR_L); px(35, 14, HAIR_L)
px(49, 11, HAIR_L); px(51, 14, HAIR_L)
px(57, 11, HAIR_L); px(59, 14, HAIR_L)
# 尾鳍发饰：两侧各一个三角鳍（插画最显眼的特征）
d.polygon([(32, 8), (37, 10), (32, 14)], fill=FIN)
d.polygon([(63, 8), (58, 10), (63, 14)], fill=FIN)
px(33, 10, HAIR_L); px(62, 10, HAIR_L)
# 正面：白荷叶边发带 + 蓝蝴蝶结
rect(40, 8, 48, 9, WHITE)
for x in range(40, 48, 2):
    px(x, 9, WHITE)
    px(x + 1, 9, WHITE_D)
rect(45, 8, 47, 10, BOW)
px(46, 8, BOW_L)
# 正面两侧的发绺（框脸）
rect(40, 9, 41, 16, HAIR)
rect(47, 9, 48, 16, HAIR)
px(40, 12, HAIR_T); px(47, 12, HAIR_T)

# ══════════ 身体
rect(16, 16, 40, 32, NAVY)
vgrad(16, 20, 20, 32, NAVY_L, NAVY)
vgrad(28, 20, 32, 32, NAVY, NAVY_L)
rect(16, 16, 20, 20, NAVY_L)
rect(28, 16, 32, 20, NAVY_L)
# 白色荷叶领
rect(20, 20, 28, 21, WHITE)
for x in range(20, 28, 2):
    px(x, 21, WHITE)
    px(x + 1, 21, WHITE_D)
# 领口的蓝蝴蝶结
rect(23, 21, 25, 23, BOW)
px(24, 21, BOW_L)
px(22, 22, BOW); px(26, 22, BOW)
# 白围裙（带荷叶下摆）
vgrad(20, 24, 28, 30, WHITE, WHITE_D)
rect(20, 24, 21, 30, WHITE_D)
rect(27, 24, 28, 30, WHITE_D)
for x in range(20, 28, 2):
    px(x, 30, WHITE)
    px(x + 1, 30, WHITE_D)
# 围裙上的小鲸鱼
rect(22, 26, 26, 28, HAIR_L)
rect(22, 27, 26, 29, WHITE)
px(25, 26, INK)
# 背面：长发 + 尾鳍
vgrad(32, 20, 40, 28, HAIR, HAIR_T)
rect(32, 28, 40, 32, NAVY)
d.polygon([(32, 31), (36, 27), (40, 31), (36, 34)], fill=FIN)
px(36, 28, HAIR_L)

# ══════════ 手臂：深蓝袖 + 白荷叶袖口 + 手
rect(44, 16, 48, 20, NAVY_L)
vgrad(44, 20, 48, 27, NAVY, NAVY_L)
rect(44, 27, 48, 29, WHITE)
for x in range(44, 48, 2):
    px(x, 29, WHITE_D)
rect(44, 29, 48, 32, SKIN)
px(45, 30, (255, 240, 220, 255))
for box in ((40, 20, 44, 32), (48, 20, 52, 32), (52, 20, 56, 32)):
    vgrad(box[0], box[1], box[2], box[3], NAVY, INK)
rect(40, 16, 44, 20, NAVY_L)
rect(48, 16, 52, 20, NAVY)
rect(52, 16, 56, 20, NAVY)
# 袖子层：白荷叶肩（插画里的蓬袖）
rect(40, 32, 56, 35, WHITE)
for x in range(40, 56, 3):
    px(x, 35, WHITE_D)
px(44, 32, WHITE)

# ══════════ 腿：白袜 + 黑鞋
rect(0, 16, 16, 20, NAVY)
vgrad(4, 20, 8, 28, WHITE, WHITE_D)
rect(0, 20, 4, 28, WHITE_D)
rect(8, 20, 12, 28, WHITE_D)
rect(12, 20, 16, 28, WHITE_D)
rect(4, 28, 8, 32, SHOE)
rect(0, 28, 4, 32, SHOE)
rect(8, 28, 12, 32, SHOE)
rect(12, 28, 16, 32, SHOE)
px(5, 29, (70, 70, 84, 255)); px(2, 29, (70, 70, 84, 255))
# 裙摆荷叶边（腿层）
rect(0, 32, 16, 34, WHITE)
for x in range(0, 16, 2):
    px(x, 34, WHITE)
    px(x + 1, 34, WHITE_D)

# 左侧复制
img.paste(img.crop((40, 16, 56, 48)), (32, 48))
img.paste(img.crop((0, 16, 16, 48)), (16, 48))

img.save(OUT)
data = list(img.convert("RGBA").getdata())
print("saved v5, colors =", len({c for c in data if c[3] > 0}))
