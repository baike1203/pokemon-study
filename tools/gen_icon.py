#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成宝可梦主题的圆角方形图标 (PNG)，纯标准库实现，无第三方依赖。
用法: python tools/gen_icon.py
输出:
  android/app/src/main/res/mipmap-*/ic_launcher.png   (安卓启动图标, 多密度)
  icons/icon-192.png, icons/icon-512.png              (PWA 图标)
"""
import struct
import zlib
import os
import math

BG = (58, 141, 222)        # 品牌蓝 (poke blue)
RED = (238, 21, 21)        # 红
WHITE = (245, 245, 245)    # 白
DARK = (20, 20, 20)        # 黑边/中心点


def make_png(path, size, draw):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # PNG filter type 0 (None)
        for x in range(size):
            raw += bytes(draw(x, y, size))
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def pokeball(x, y, s):
    u = x / (s - 1)
    v = y / (s - 1)
    rad = 0.18
    cx = min(u, 1 - u)
    cy = min(v, 1 - v)
    inside = True
    if cx < rad and cy < rad:
        dx = rad - cx
        dy = rad - cy
        if dx * dx + dy * dy > rad * rad:
            inside = False
    if not inside:
        return (0, 0, 0, 0)
    r, g, b = BG
    px = u - 0.5
    py = v - 0.5
    d = math.hypot(px, py)
    R = 0.34
    if d <= R:
        if py < 0:
            r, g, b = RED
        else:
            r, g, b = WHITE
        if abs(py) < R * 0.10:
            r, g, b = DARK
        if d < R * 0.18:
            r, g, b = DARK
        if d < R * 0.10:
            r, g, b = WHITE
        if d > R * 0.92:
            r, g, b = DARK
    return (r, g, b, 255)


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    densities = [
        ("mipmap-mdpi", 48),
        ("mipmap-hdpi", 72),
        ("mipmap-xhdpi", 96),
        ("mipmap-xxhdpi", 144),
        ("mipmap-xxxhdpi", 192),
    ]
    for dens, sz in densities:
        d = os.path.join(base, "android", "app", "src", "main", "res", dens)
        os.makedirs(d, exist_ok=True)
        make_png(os.path.join(d, "ic_launcher.png"), sz, pokeball)
        print("wrote", os.path.join(d, "ic_launcher.png"))
    # PWA icons
    for sz in (192, 512):
        d = os.path.join(base, "icons")
        os.makedirs(d, exist_ok=True)
        make_png(os.path.join(d, "icon-%d.png" % sz), sz, pokeball)
        print("wrote", os.path.join(d, "icon-%d.png" % sz))


if __name__ == "__main__":
    main()
