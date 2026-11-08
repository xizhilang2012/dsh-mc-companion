"""鲸鱼娘皮肤 v4：按对比得出的四条教训重画。

对比图（skin-compare.png）看出来的差距：
1. **对比度**：那张用近黑 #0B1A26 + 亮青 #64B1FB + 纯白，三档拉得很开；
   我的 v3 全是中蓝，糊成一片。
2. **脸要"被头发框住"**：那张的头发占了大半张脸，眼睛只有 2px；
   我的 v3 塞了腮红+嘴+鼻子，反而脏。
3. **身上只要一个视觉焦点**：那张是"深色衣服 + 胸口一只亮蓝鲸鱼"；
   我的 v3 是围裙+荷叶边+金边+蝴蝶结全堆在一起 → 视觉噪音。
4. **下装要有图案**：那张是花纹裤子；我的是白袜黑鞋，空。

v4 就照这四条来：高对比、脸简化、胸口一只鲸鱼、裤腿加青色纹样。
"""
from PIL import Image, ImageDraw

OUT = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\src\main\resources\assets\mc-companion"
    r"\textures\entity\whale_girl.png"
)

img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

INK = (11, 26, 38, 255)          # 近黑：头发底 + 描边（这是"画感"的来源）
INK2 = (19, 40, 60, 255)
CY0 = (13, 123, 174, 255)        # 青（暗）
CY1 = (100, 177, 251, 255)       # 青（亮）
CY2 = (176, 222, 255, 255)       # 青（最亮/高光）
SKIN = (255, 214, 176, 255)
SKIN_D = (226, 172, 140, 255)
WHITE = (255, 255, 255, 255)
WHITE_D = (206, 214, 228, 255)
NAVY = (16, 28, 48, 255)
NAVY_L = (30, 50, 82, 255)
BLUSH = (250, 168, 176, 255)
MOUTH = (150, 52, 68, 255)


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


# ══════════ 头：底色全用近黑（对比度靠它）
rect(0, 0, 32, 16, INK)
vgrad(8, 0, 16, 8, INK2, INK)            # 头顶微微发亮
vgrad(0, 8, 8, 16, INK, INK2)            # 右侧
vgrad(24, 8, 32, 16, INK, INK2)          # 后面
vgrad(16, 8, 24, 16, INK, INK2)          # 左侧

# 脸：8x8 网格（简化！只有眼睛、腮红、小嘴）
FACE = [
    "HHHHHHHH",   # 刘海
    "HHSSSSHH",   # 露额头
    "HWWSSWWH",   # 眼白（各 2px，中间露皮肤）
    "HBBSSBBH",   # 虹膜（青）
    "HDDSSDDH",   # 瞳孔（深）
    "SSSSSSSS",   # 脸颊
    "RSMMSSSR",   # 腮红 + 小嘴
    "IISSSSII",   # 下巴 + 脖子阴影
]
COL = {
    "H": INK, "S": SKIN, "W": WHITE, "C": CY2, "B": CY0, "D": (20, 60, 110, 255),
    "R": BLUSH, "M": MOUTH, "I": SKIN_D,
}
for row, line in enumerate(FACE):
    for col, ch in enumerate(line):
        px(8 + col, 8 + row, COL[ch])
# 刘海发丝：两条亮青（对比度靠这两条）
px(9, 8, CY1); px(10, 8, CY1)
px(13, 8, CY1); px(14, 8, CY1)
px(8, 12, INK); px(15, 12, INK)

# ══════════ 头：帽子层（长发体积）
# 两侧垂下的长发（一整片，把脸框住）
vgrad(32, 8, 40, 16, INK, INK2)
vgrad(48, 8, 56, 16, INK, INK2)
vgrad(56, 8, 64, 16, INK, CY0)
# 正面两侧发绺（框脸）
rect(40, 8, 41, 16, INK)
rect(47, 8, 48, 16, INK)
px(40, 10, CY1); px(40, 13, CY1); px(47, 10, CY1); px(47, 13, CY1); px(34, 12, CY1); px(36, 14, CY0); px(58, 12, CY1)
# 头顶：发带（白色一条 + 青结）
rect(41, 8, 47, 9, WHITE)
px(44, 8, CY1)
rect(44, 6, 46, 8, CY0)
px(45, 6, CY1)

# ══════════ 身体：深色衣服 + 胸口一只鲸鱼（唯一焦点）
rect(16, 16, 40, 32, NAVY)
vgrad(16, 20, 20, 32, NAVY_L, NAVY)      # 右侧
vgrad(28, 20, 32, 32, NAVY, NAVY_L)      # 左侧
rect(16, 16, 20, 20, NAVY_L)
rect(28, 16, 32, 20, NAVY_L)
# 领口
rect(21, 20, 27, 21, WHITE_D)
rect(22, 21, 26, 22, CY0)
# 鲸鱼（胸口）：青色身体 + 白肚 + 深色描边
rect(21, 24, 27, 29, CY0)                # 身体
rect(21, 26, 27, 29, WHITE)              # 白肚
rect(21, 24, 27, 26, CY1)                # 背
px(22, 25, CY2); px(23, 25, CY2)
d.polygon([(26, 24), (28, 22), (28, 26)], fill=CY1)   # 尾鳍
px(28, 22, CY2)
px(21, 27, INK); px(26, 27, INK)         # 眼睛（两点）
# 背面：长发 + 尾鳍
vgrad(32, 20, 40, 28, INK, CY0)
rect(32, 28, 40, 32, NAVY)
d.polygon([(32, 31), (36, 27), (40, 31), (36, 34)], fill=CY1)
px(36, 28, CY2)

# ══════════ 手臂：深色 + 青色袖口
rect(44, 16, 48, 20, NAVY_L)
vgrad(44, 20, 48, 28, NAVY, NAVY_L)
rect(44, 28, 48, 30, CY0)
px(44, 29, CY2); px(46, 29, CY2)
rect(44, 30, 48, 32, SKIN)
px(45, 30, (255, 236, 214, 255))
for box in ((40, 20, 44, 32), (48, 20, 52, 32), (52, 20, 56, 32)):
    vgrad(box[0], box[1], box[2], box[3], NAVY, INK)
rect(40, 16, 44, 20, NAVY_L)
rect(48, 16, 52, 20, NAVY)
rect(52, 16, 56, 20, NAVY)
# 袖子层：肩甲（青色，蓬起）
rect(40, 32, 56, 36, CY0)
rect(40, 32, 56, 33, CY1)
for x in range(40, 56, 4):
    px(x, 35, INK)

# ══════════ 腿：深色裤 + 青色纹样
rect(0, 16, 16, 20, NAVY)
vgrad(4, 20, 8, 32, NAVY_L, NAVY)
rect(0, 20, 4, 32, NAVY)
rect(8, 20, 12, 32, NAVY)
rect(12, 20, 16, 32, NAVY)
# 青色靴口 + 鞋
rect(4, 26, 8, 29, CY0)
px(5, 27, CY1); px(6, 27, CY1)
rect(0, 26, 4, 29, CY0)
rect(4, 29, 8, 32, INK)
rect(0, 29, 4, 32, INK)
rect(8, 29, 12, 32, INK)
rect(12, 29, 16, 32, INK)
px(5, 30, INK2); px(2, 30, INK2)

# 左侧复制（含各自 overlay）
img.paste(img.crop((40, 16, 56, 48)), (32, 48))
img.paste(img.crop((0, 16, 16, 48)), (16, 48))

img.save(OUT)
data = list(img.convert("RGBA").getdata())
print("saved, colors =", len({c for c in data if c[3] > 0}))
