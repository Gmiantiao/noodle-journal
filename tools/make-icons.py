"""Generate the app icons (512 / 192 / 180 / maskable).

Run: python3 tools/make-icons.py
Requires: Pillow
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter

S = 2048  # supersampled master
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
os.makedirs(OUT, exist_ok=True)

# Theme red (#e23b2e), slightly warmer at the top of the gradient.
TOP = (234, 96, 80)
BOTTOM = (196, 47, 36)
BASE = (226, 59, 46)
GLOW = (245, 137, 122)

# --- background gradient ---
img = Image.new("RGB", (S, S), BASE)
d = ImageDraw.Draw(img)
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    d.line([(0, y), (S, y)], fill=c)

# soft radial highlight
glow = Image.new("L", (S, S), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse([-S * 0.15, -S * 0.35, S * 1.05, S * 0.55], fill=42)
img = Image.composite(
    Image.new("RGB", (S, S), GLOW), img, glow.filter(ImageFilter.GaussianBlur(S // 12))
)
d = ImageDraw.Draw(img)

CREAM = (255, 247, 237)
NOODLE = (247, 214, 166)

# --- bowl ---
cx, rim_y = S * 0.5, S * 0.585
bowl_w, bowl_h = S * 0.42, S * 0.17
d.pieslice(
    [cx - bowl_w, rim_y - bowl_h * 1.25, cx + bowl_w, rim_y + bowl_h * 1.25],
    0, 180, fill=CREAM
)
# rim
d.rounded_rectangle(
    [cx - bowl_w * 1.06, rim_y - S * 0.035, cx + bowl_w * 1.06, rim_y + S * 0.035],
    radius=S * 0.022, fill=CREAM
)

# --- noodles rising out of the bowl ---
nw = int(S * 0.024)
for i, xoff in enumerate((-0.12, 0.0, 0.12)):
    x0 = cx + S * xoff
    hi = S * (0.20 + 0.03 * (i % 2))
    pts = []
    for k in range(41):
        t = k / 40
        y = rim_y + S * 0.01 - hi * t
        sway = math.sin(t * math.pi * 1.5 + i) * S * 0.018
        pts.append((x0 + S * 0.03 * t + sway, y))
    d.line(pts, fill=NOODLE, width=nw, joint="curve")

# --- chopsticks ---
for off in (0, S * 0.045):
    d.line(
        [(cx + S * 0.10, rim_y - S * 0.10 + off),
         (cx + S * 0.34, rim_y - S * 0.33 + off)],
        fill=NOODLE, width=int(S * 0.022)
    )

# --- steam ---
for xoff in (-0.10, 0.10):
    x = cx + S * xoff
    d.arc([x - S * 0.035, rim_y - S * 0.40, x + S * 0.035, rim_y - S * 0.30],
          200, 340, fill=(255, 247, 237, 255), width=int(S * 0.014))

img = img.resize((1024, 1024), Image.LANCZOS)

img.resize((512, 512), Image.LANCZOS).save(f"{OUT}/icon-512.png", optimize=True)
img.resize((192, 192), Image.LANCZOS).save(f"{OUT}/icon-192.png", optimize=True)
img.resize((180, 180), Image.LANCZOS).save(f"{OUT}/apple-touch-icon.png", optimize=True)

# maskable: keep artwork inside the 80% safe circle
mask = Image.new("RGB", (1024, 1024), BASE)
md = ImageDraw.Draw(mask)
for y in range(1024):
    t = y / 1023
    c = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    md.line([(0, y), (1024, y)], fill=c)
inner = img.resize((768, 768), Image.LANCZOS)
mask.paste(inner, (128, 128))
mask.resize((512, 512), Image.LANCZOS).save(f"{OUT}/icon-maskable-512.png", optimize=True)

print("icons written to", os.path.normpath(OUT))
