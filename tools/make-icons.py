# Draws the app icons into icons/. Needs Pillow. Run: python3 tools/make-icons.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
FONT = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"

FELT = (36, 84, 63)
TILE = (251, 239, 207)
EDGE = (184, 146, 74)
INK = (42, 28, 11)


def draw(size, tile_scale, rounded):
    img = Image.new("RGB", (size, size), FELT)
    d = ImageDraw.Draw(img)
    if rounded:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.18, fill=FELT)
    t = size * tile_scale
    x0 = (size - t) / 2
    y0 = (size - t) / 2 - size * 0.015
    shadow = size * 0.025
    d.rounded_rectangle([x0, y0 + shadow, x0 + t, y0 + t + shadow], radius=t * 0.12, fill=EDGE)
    d.rounded_rectangle([x0, y0, x0 + t, y0 + t], radius=t * 0.12, fill=TILE)
    big = ImageFont.truetype(FONT, int(t * 0.68))
    d.text((size / 2, y0 + t * 0.5), "M", font=big, fill=INK, anchor="mm")
    small = ImageFont.truetype(FONT, int(t * 0.2))
    d.text((x0 + t * 0.86, y0 + t * 0.84), "3", font=small, fill=INK, anchor="mm")
    return img


OUT.mkdir(exist_ok=True)
draw(512, 0.62, True).save(OUT / "icon-512.png")
draw(192, 0.62, True).save(OUT / "icon-192.png")
draw(512, 0.5, False).save(OUT / "icon-maskable-512.png")
# iOS adds its own rounded corners, so this one is square and full-bleed.
draw(180, 0.62, False).save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
