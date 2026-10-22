"""Generate the share card + standalone QR code.

Run: python3 tools/make-share.py
Requires: Pillow, qrcode (pip install "qrcode[pil]")
"""

import os
import sys

import qrcode
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "share")
os.makedirs(OUT, exist_ok=True)

URL = "https://gmiantiao.github.io/noodle-journal/"
SANS = "/System/Library/Fonts/PingFang.ttc"


def font(size, semibold=False):
    # PingFang.ttc: 2 = SC Regular, 8 = SC Semibold
    return ImageFont.truetype(SANS, size, index=8 if semibold else 2)


# --- QR ---
qr = qrcode.QRCode(
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=16,
    border=2,
)
qr.add_data(URL)
qr.make(fit=True)
qr_img = qr.make_image(fill_color="#141416", back_color="#ffffff").convert("RGB")
qr_img.save(os.path.join(OUT, "qr.png"), optimize=True)

# --- card ---
W, H = 1080, 1440
img = Image.new("RGB", (W, H), "#ffffff")
d = ImageDraw.Draw(img)

INK = "#141416"
GRAY = "#9a9aa1"
INK2 = "#5e5e64"
RED = "#e23b2e"
SURFACE = "#f6f6f7"

# logo
logo = Image.open(os.path.join(ROOT, "icons", "icon-512.png")).convert("RGB").resize((180, 180), Image.LANCZOS)
mask = Image.new("L", (180, 180), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 179, 179], radius=40, fill=255)
img.paste(logo, (W // 2 - 90, 110), mask)

d.text((W / 2, 380), "面迹", font=font(92, True), fill=INK, anchor="mm")
d.text((W / 2, 462), "面条宇宙正在生成中", font=font(38), fill=GRAY, anchor="mm")

d.rounded_rectangle([W / 2 - 32, 516, W / 2 + 32, 522], radius=3, fill=RED)

d.text((W / 2, 612), "记录每一碗吃过的面", font=font(40, True), fill=INK2, anchor="mm")
d.text((W / 2, 676), "店 · 面 · 评分 · 价格 · 城市", font=font(30), fill=GRAY, anchor="mm")

# QR panel
d.rounded_rectangle([240, 756, 840, 1246], radius=40, fill=SURFACE)
qr_img = qr_img.resize((400, 400), Image.LANCZOS)
img.paste(qr_img, (340, 801))

d.text((W / 2, 1300), "gmiantiao.github.io/noodle-journal", font=font(28), fill=INK2, anchor="mm")
d.text((W / 2, 1366), "扫码打开 · 添加到主屏幕", font=font(30, True), fill=RED, anchor="mm")

path = os.path.join(OUT, "share-card.png")
img.save(path, optimize=True)
print("share assets written to", OUT)
