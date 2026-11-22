"""Generates the home-screen icons and the link-preview image (og.png).

Run from the repo root:  python3 scripts/make-assets.py
Needs Pillow and TTF copies of the fonts (paths below).
"""
import math
import random
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SYNC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/Syncopate-Bold.ttf"
VT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/VT323-Regular.ttf"

BG0, BG1, BG2 = (4, 3, 11), (11, 8, 32), (29, 15, 54)
CYAN, MAGENTA, AMBER, RED, VIOLET = (61, 245, 255), (255, 61, 187), (255, 178, 61), (255, 61, 94), (138, 127, 214)
INK = (13, 10, 28)


def gradient(w, h, stops):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        for i in range(len(stops) - 1):
            (t0, c0), (t1, c1) = stops[i], stops[i + 1]
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                col = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                break
        for x in range(w):
            px[x, y] = col
    return img


def glow_layer(size, draw_fn, blur):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def rock_points(cx, cy, r, seed, n=11):
    rng = random.Random(seed)
    pts = []
    for i in range(n):
        a = i / n * math.tau
        rr = r * (0.72 + rng.random() * 0.28)
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return pts


def draw_rock(img, cx, cy, r, color, seed, width):
    pts = rock_points(cx, cy, r, seed)
    glow = glow_layer(img.size, lambda d: d.line(pts + [pts[0]], fill=color + (200,), width=width * 3), width * 2.5)
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    d.polygon(pts, fill=INK + (255,))
    d.line(pts + [pts[0]], fill=color + (255,), width=width, joint="curve")
    inner = rock_points(cx, cy, r * 0.55, seed)
    d.line(inner + [inner[0]], fill=color + (110,), width=max(1, width // 2), joint="curve")


def draw_earth(img, w, top, R, width):
    cx, cy = w / 2, top + R
    d = ImageDraw.Draw(img)
    halo = glow_layer(img.size, lambda g: g.ellipse([cx - R, cy - R, cx + R, cy + R], outline=CYAN + (160,), width=width * 8), width * 10)
    img.alpha_composite(halo)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(10, 22, 52, 255))
    # wireframe
    grid = Image.new("RGBA", img.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(grid)
    for k in range(-12, 13):
        a = k * 0.13
        rx = abs(math.sin(a)) * R
        g.ellipse([cx - rx, cy - R, cx + rx, cy + R], outline=CYAN + (55,), width=max(1, width // 2))
    rr = R
    unit = R / 490  # same spacing as the in-game globe
    for j in range(1, 9):
        rr -= (5 + j * j * 1.6) * unit
        g.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=CYAN + (55,), width=max(1, width // 2))
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
    img.paste(grid, (0, 0), Image.composite(grid, Image.new("RGBA", img.size), mask).getchannel("A"))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=CYAN + (255,), width=width)


def stars(img, n, seed, scale=1):
    rng = random.Random(seed)
    d = ImageDraw.Draw(img)
    w, h = img.size
    for _ in range(n):
        x, y = rng.random() * w, rng.random() * h
        s = rng.choice([1, 1, 1, 2, 2, 3]) * scale
        a = int(90 + rng.random() * 165)
        d.rectangle([x, y, x + s, y + s], fill=(244, 241, 255, a))


def chrome_text(img, xy, text, font, anchor="mm"):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255, anchor=anchor)
    bbox = mask.getbbox()
    top, bot = bbox[1], bbox[3]
    grad = Image.new("RGBA", (w, h))
    gp = ImageDraw.Draw(grad)
    stops = [(0, (255, 255, 255)), (0.36, (214, 236, 255)), (0.49, (123, 134, 224)), (0.5, (43, 31, 92)), (0.53, (255, 111, 210)), (0.78, (255, 214, 241)), (1, (255, 255, 255))]
    for y in range(top, bot + 1):
        t = (y - top) / max(1, bot - top)
        for i in range(len(stops) - 1):
            (t0, c0), (t1, c1) = stops[i], stops[i + 1]
            if t0 <= t <= t1:
                k = (t - t0) / max(1e-6, t1 - t0)
                col = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                break
        gp.line([(0, y), (w, y)], fill=col + (255,))
    glow = Image.new("RGBA", (w, h), CYAN + (0,))
    glow.putalpha(mask.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.55)))
    img.alpha_composite(glow)
    img.paste(grad, (0, 0), mask)


def icon(size, maskable=False):
    S = size * 4
    img = gradient(S, S, [(0, BG0), (0.6, BG1), (1, BG2)]).convert("RGBA")
    stars(img, int(S * 0.12), 7, scale=max(1, S // 256))
    pad = 0.12 if maskable else 0
    draw_earth(img, S, S * (0.74 - pad * 0.5), S * 1.25, max(2, S // 110))
    draw_rock(img, S * 0.5, S * (0.42 + pad * 0.05), S * (0.2 - pad * 0.3), AMBER, 17, max(3, S // 70))
    draw_rock(img, S * 0.2, S * 0.2, S * 0.06, VIOLET, 9, max(2, S // 140))
    draw_rock(img, S * 0.8, S * 0.26, S * 0.045, VIOLET, 12, max(2, S // 140))
    return img.resize((size, size), Image.LANCZOS).convert("RGB")


def og():
    W, H = 1200, 630
    img = gradient(W, H, [(0, BG0), (0.6, BG1), (1, BG2)]).convert("RGBA")
    stars(img, 520, 3, scale=1)
    draw_earth(img, W, 520, 1500, 3)
    draw_rock(img, 975, 190, 70, RED, 5, 4)
    draw_rock(img, 210, 150, 46, AMBER, 3, 4)
    draw_rock(img, 1080, 400, 26, AMBER, 8, 3)
    draw_rock(img, 120, 420, 16, VIOLET, 11, 2)
    draw_rock(img, 330, 330, 11, VIOLET, 13, 2)
    vt = ImageFont.truetype(VT, 30)
    vt_small = ImageFont.truetype(VT, 26)
    d = ImageDraw.Draw(img)
    d.text((210, 214), "2026 WJ  ·  ≈13 m", font=vt_small, fill=AMBER + (255,), anchor="mm")
    d.text((975, 282), "APOPHIS  ·  2029", font=vt_small, fill=RED + (255,), anchor="mm")
    chrome_text(img, (W / 2, 245), "CLOSE", ImageFont.truetype(SYNC, 118))
    chrome_text(img, (W / 2, 350), "APPROACH", ImageFont.truetype(SYNC, 76))
    d.text((W / 2, 430), "DEFEND EARTH FROM TODAY’S REAL ASTEROIDS", font=vt, fill=(244, 241, 255, 235), anchor="mm")
    d.text((W / 2, 470), "LIVE NASA/JPL DATA  ·  PLAY ON YOUR PHONE", font=vt_small, fill=CYAN + (255,), anchor="mm")
    # ship
    sx, sy, s = W / 2, 560, 3.2
    ship = [(0, -16), (5, -4), (13, 8), (5, 6), (3, 10), (-3, 10), (-5, 6), (-13, 8), (-5, -4)]
    pts = [(sx + x * s, sy + y * s) for x, y in ship]
    img.alpha_composite(glow_layer(img.size, lambda g: g.line(pts + [pts[0]], fill=CYAN + (220,), width=8), 6))
    d.polygon(pts, fill=(90, 106, 168, 255))
    d.line(pts + [pts[0]], fill=CYAN + (255,), width=3)
    d.polygon([(sx - 3 * s, sy + 10 * s), (sx, sy + 26 * s), (sx + 3 * s, sy + 10 * s)], fill=MAGENTA + (230,))
    # scanlines
    sl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sl)
    for y in range(0, H, 3):
        sd.line([(0, y), (W, y)], fill=(0, 0, 0, 40))
    img.alpha_composite(sl)
    return img.convert("RGB")


if __name__ == "__main__":
    icon(180).save("site/icons/apple-touch-icon.png")
    icon(192).save("site/icons/icon-192.png")
    icon(512).save("site/icons/icon-512.png")
    icon(512, maskable=True).save("site/icons/icon-512-maskable.png")
    og().save("site/og.png", optimize=True)
    print("assets written")
