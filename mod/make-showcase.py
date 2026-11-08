"""把皮肤拼成"纸娃娃"预览：正面全身 + 背面全身 + 头部特写。

MC 皮肤是 6 面 UV，拼出来只能看个大概；但比单看 UV 图直观得多。
图层顺序：base 再 overlay（overlay 的透明像素不覆盖底层）。
"""
from PIL import Image

SKIN = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\src\main\resources\assets\mc-companion"
    r"\textures\entity\whale_girl.png"
)
OUT = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\skin-showcase.png"
)
S = 14
BG = (24, 28, 40, 255)

src = Image.open(SKIN).convert("RGBA")


def part(box):
    return src.crop(box)


def blit(canvas, p, x, y):
    big = p.resize((p.width * S, p.height * S), Image.NEAREST)
    canvas.paste(big, (x * S, y * S), big)


def body_view(front):
    """返回一张全身图（头/身/手/腿）。front=False 就拼背面。"""
    W, H = 20, 32
    c = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    if front:
        head, head_ov = (8, 8, 16, 16), (40, 8, 48, 16)
        body, body_ov = (20, 20, 28, 32), (20, 36, 28, 48)
        arm, arm_ov = (44, 20, 48, 32), (44, 32, 48, 48)
        leg, leg_ov = (4, 20, 8, 32), (4, 32, 8, 48)
    else:
        head, head_ov = (24, 8, 32, 16), (56, 8, 64, 16)
        body, body_ov = (32, 20, 40, 32), (32, 36, 40, 48)
        arm, arm_ov = (52, 20, 56, 32), (52, 32, 56, 48)
        leg, leg_ov = (12, 20, 16, 32), (12, 32, 16, 48)
    # 腿 → 身 → 手 → 头
    blit(c, part(leg), 8, 20)
    blit(c, part(leg_ov), 8, 20)
    blit(c, part(leg), 12, 20)
    blit(c, part(leg_ov), 12, 20)
    blit(c, part(body), 6, 8)
    blit(c, part(body_ov), 6, 8)
    blit(c, part(arm), 4, 8)
    blit(c, part(arm_ov), 4, 8)
    blit(c, part(arm), 16, 8)
    blit(c, part(arm_ov), 16, 8)
    blit(c, part(head), 6, 0)
    blit(c, part(head_ov), 6, 0)
    return c


front = body_view(True)
back = body_view(False)
face = part((8, 8, 16, 16)).resize((8 * S * 2, 8 * S * 2), Image.NEAREST)
hat = part((40, 8, 48, 16)).resize((8 * S * 2, 8 * S * 2), Image.NEAREST)
face_all = Image.new("RGBA", (8 * S * 2, 8 * S * 2), (0, 0, 0, 0))
face_all.paste(face, (0, 0))
face_all.paste(hat, (0, 0), hat)

pad = 12
W = front.width + back.width + face_all.width + pad * 4
H = max(front.height, face_all.height) + pad * 2
canvas = Image.new("RGBA", (W, H), BG)
x = pad
canvas.paste(front, (x, pad), front)
x += front.width + pad
canvas.paste(back, (x, pad), back)
x += back.width + pad
canvas.paste(face_all, (x, (H - face_all.height) // 2), face_all)
canvas.save(OUT)
print("saved", OUT, canvas.size)
