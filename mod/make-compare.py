from PIL import Image

MINE = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\src\main\resources\assets\mc-companion"
    r"\textures\entity\whale_girl.png"
)
THEIRS = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\cache\skin-blue-whale.png"
)
OUT = (
    r"C:\Users\guoqingwanga\Documents\deepseek-harness\default-workspace"
    r"\plugins\mc-companion\mod\skin-compare.png"
)
S = 9


def compose(path, overlay):
    src = Image.open(path).convert("RGBA")

    def part(box):
        return src.crop(box)

    def paste(canvas, p, x, y):
        big = p.resize((p.width * S, p.height * S), Image.NEAREST)
        canvas.paste(big, (x * S, y * S), big)

    c = Image.new("RGBA", (46 * S, 34 * S), (232, 238, 246, 255))
    for ax in (6, 23):
        paste(c, part((44, 20, 48, 32)), ax, 10)
        if overlay:
            paste(c, part((44, 32, 48, 48)), ax, 10)
    for lx in (10, 14):
        paste(c, part((4, 20, 8, 32)), lx, 22)
        if overlay:
            paste(c, part((4, 32, 8, 48)), lx, 22)
    paste(c, part((20, 20, 28, 32)), 10, 10)
    if overlay:
        paste(c, part((20, 36, 28, 48)), 10, 10)
    paste(c, part((8, 8, 16, 16)), 10, 2)
    if overlay:
        paste(c, part((40, 8, 48, 16)), 10, 2)
    paste(c, part((24, 8, 32, 16)), 33, 2)      # 后脑
    paste(c, part((32, 20, 40, 32)), 31, 10)    # 后背
    return c


a = compose(MINE, True)
b = compose(THEIRS, False)
out = Image.new("RGBA", (a.width + b.width + 24, max(a.height, b.height)), (232, 238, 246, 255))
out.paste(a, (0, 0))
out.paste(b, (a.width + 24, 0))
out.save(OUT)
print("saved", OUT, a.size, b.size)
