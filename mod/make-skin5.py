"""鲸鱼娘皮肤 v6：头部细化 + 长发娘化。

这一版专门解决"头不像娘化角色"：
1. **脸 8×8 重画**：眉毛、带黑边的眼睛（白/青虹膜/深瞳三行）、2px 小嘴、腮红
2. **长发**：帽子层做顶部蓬发 + 两侧垂发；再用外套层（overlay）把头发
   一直垂到胸前和后背 —— 皮肤里"长发"就是靠这两层叠出来的
3. 发饰品：两侧尾鳍 + 白荷叶发带 + 蓝蝴蝶结
"""
from PIL import Image, ImageDraw

OUT = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\src\main\resources\assets\mc-companion"
    r"\textures\entity\whale_girl.png"
)

img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

INK = (10, 20, 40, 255)        # 描边 / 发根
HAIR0 = (20, 42, 96, 255)
HAIR1 = (38, 78, 152, 255)
HAIR2 = (66, 122, 200, 255)
HAIR3 = (120, 184, 244, 255)   # 发梢最亮
FIN = (22, 38, 84, 255)
SKIN = (255, 226, 202, 255)
SKIN_D = (228, 178, 152, 255)
WHITE = (255, 255, 255, 255)
WHITE_D = (210, 220, 238, 255)
NAVY = (20, 32, 62, 255)
NAVY_L = (36, 54, 96, 255)
BOW = (46, 106, 198, 255)
BOW_L = (112, 170, 244, 255)
EYE_W = (246, 250, 255, 255)
EYE_C = (128, 206, 255, 255)   # 眼里那点青
EYE_B = (40, 112, 206, 255)
EYE_D = (34, 70, 132, 255)
BLUSH = (252, 172, 180, 255)
MOUTH = (176, 64, 84, 255)
MOUTH_D = (128, 36, 54, 255)
SHOE = (30, 30, 38, 255)


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


# ═══════════ 头：底
vgrad(8, 0, 16, 8, HAIR1, HAIR0)         # 头顶
vgrad(16, 0, 24, 8, INK, INK)            # 头底
vgrad(0, 8, 8, 16, HAIR0, HAIR3)         # 右
vgrad(24, 8, 32, 16, HAIR0, HAIR3)       # 后
vgrad(16, 8, 24, 16, HAIR0, HAIR3)       # 左

# 脸：照网络版的结构（量出来的）
#   4 行头发（刘海压到眉骨） → 1 行黑睫毛 → 2 行眼睛（外侧白、内侧深蓝）→ 腮红
FACE = [
    "HHHHHHHH",   # 0 头发
    "HHHHHHHH",   # 1 头发
    "HHHHHHHH",   # 2 头发
    "HHHHHHHH",   # 3 头发（刘海压到眉骨，额头一点不露）
    "HKKSSKKH",   # 4 黑睫毛
    "KWDSSDWK",   # 5 眼睛：外框 | 白 | 深蓝 | 皮肤 | 皮肤 | 深蓝 | 白 | 外框
    "KWDSSDWK",   # 6
    "CRSSSSRC",   # 7 腮红 + 两侧青色发梢
]
COL = {
    "H": HAIR0, "S": SKIN, "W": EYE_W, "D": EYE_D,
    "K": (12, 16, 28, 255), "R": BLUSH, "C": HAIR2,
}
for row, line in enumerate(FACE):
    for col, ch in enumerate(line):
        px(8 + col, 8 + row, COL[ch])
# ═══════════ 头：帽子层（蓬发 + 长发 + 尾鳍 + 发带）
vgrad(40, 0, 48, 8, HAIR2, HAIR1)                 # 头顶蓬起
px(42, 1, HAIR3); px(45, 1, HAIR3); px(43, 4, HAIR3)
vgrad(32, 8, 40, 16, HAIR1, HAIR3)                # 右长
vgrad(48, 8, 56, 16, HAIR1, HAIR3)                # 左长
vgrad(56, 8, 64, 16, HAIR1, HAIR3)                # 后长
# 尾鳍发饰（两侧，插画里最显眼）
d.polygon([(31, 9), (37, 11), (31, 15)], fill=FIN)
d.polygon([(64, 9), (58, 11), (64, 15)], fill=FIN)
px(33, 11, HAIR2); px(62, 11, HAIR2)
# 白荷叶发带 + 蓝蝴蝶结
rect(40, 8, 48, 9, WHITE)
for x in range(40, 48, 2):
    px(x, 9, WHITE)
    px(x + 1, 9, WHITE_D)
rect(45, 8, 47, 10, BOW)
px(46, 8, BOW_L)
# 正面两侧的发绺（把脸框住）
rect(40, 9, 41, 11, HAIR0)
rect(47, 9, 48, 11, HAIR0)

# ═══════════ 身体
rect(16, 16, 40, 32, NAVY)
vgrad(16, 20, 20, 32, NAVY_L, NAVY)
vgrad(28, 20, 32, 32, NAVY, NAVY_L)
rect(16, 16, 20, 20, NAVY_L)
rect(28, 16, 32, 20, NAVY_L)
# 白荷叶领 + 蓝结
rect(20, 20, 28, 21, WHITE)
for x in range(20, 28, 2):
    px(x, 21, WHITE)
    px(x + 1, 21, WHITE_D)
rect(23, 21, 25, 23, BOW)
px(24, 21, BOW_L)
px(22, 22, BOW); px(26, 22, BOW)
# 白围裙 + 荷叶下摆
vgrad(20, 24, 28, 30, WHITE, WHITE_D)
rect(20, 24, 21, 30, WHITE_D)
rect(27, 24, 28, 30, WHITE_D)
for x in range(20, 28, 2):
    px(x, 30, WHITE)
    px(x + 1, 30, WHITE_D)
rect(22, 26, 26, 28, HAIR2)      # 围裙上的小鲸鱼
rect(22, 27, 26, 29, WHITE)
px(25, 26, INK)
# 背面：长发 + 尾鳍
vgrad(32, 20, 40, 28, HAIR1, HAIR3)
rect(32, 28, 40, 32, NAVY)
d.polygon([(32, 31), (36, 27), (40, 31), (36, 34)], fill=FIN)
px(36, 28, HAIR2)

# ═══════════ 外套层：长发垂到胸前 / 背后（娘化的关键）
# 正面两缕（在围裙两侧垂下）
vgrad(20, 36, 22, 47, HAIR1, HAIR3)
vgrad(26, 36, 28, 47, HAIR1, HAIR3)
px(20, 36, INK); px(27, 36, INK)
px(21, 40, HAIR2); px(26, 40, HAIR2)
px(20, 45, HAIR3); px(27, 45, HAIR3)
# 背面一大片长发
vgrad(32, 36, 40, 46, HAIR1, HAIR3)
for x in range(32, 40, 3):
    px(x, 41, HAIR2)
px(35, 45, HAIR3); px(37, 44, HAIR3)

# ═══════════ 手臂
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
# 袖子层：白荷叶肩
rect(40, 32, 56, 35, WHITE)
for x in range(40, 56, 3):
    px(x, 35, WHITE_D)

# ═══════════ 腿
rect(0, 16, 16, 20, NAVY)
vgrad(4, 20, 8, 28, WHITE, WHITE_D)
rect(0, 20, 4, 28, WHITE_D)
rect(8, 20, 12, 28, WHITE_D)
rect(12, 20, 16, 28, WHITE_D)
rect(4, 28, 8, 32, SHOE)
rect(0, 28, 4, 32, SHOE)
rect(8, 28, 12, 32, SHOE)
rect(12, 28, 16, 32, SHOE)
px(5, 29, (72, 72, 86, 255)); px(2, 29, (72, 72, 86, 255))
rect(0, 32, 16, 34, WHITE)
for x in range(0, 16, 2):
    px(x, 34, WHITE)
    px(x + 1, 34, WHITE_D)

# 左侧复制
img.paste(img.crop((40, 16, 56, 48)), (32, 48))
img.paste(img.crop((0, 16, 16, 48)), (16, 48))

img.save(OUT)
data = list(img.convert("RGBA").getdata())
print("saved v6, colors =", len({c for c in data if c[3] > 0}))
