#!/usr/bin/env python3
"""產生擴充功能圖示（藍底 + 白色快轉箭頭）。沒有 Pillow，直接手寫 PNG。

用法： python3 icons/generate.py
"""
import struct, zlib, pathlib

BG = (37, 99, 235, 255)   # #2563eb
FG = (255, 255, 255, 255)
SS = 4                    # 每個像素取 4x4 個樣本做抗鋸齒


def inside_round_rect(u, v, radius):
    dx = max(radius - u, u - (1 - radius), 0.0)
    dy = max(radius - v, v - (1 - radius), 0.0)
    return dx * dx + dy * dy <= radius * radius


def inside_triangle(u, v, x0, x1):
    if not x0 <= u <= x1:
        return False
    return abs(v - 0.5) <= 0.26 * (1 - (u - x0) / (x1 - x0))


def sample(u, v):
    """回傳 (是否在圖示內, 是否是箭頭)"""
    if not inside_round_rect(u, v, 0.22):
        return False, False
    arrow = inside_triangle(u, v, 0.16, 0.50) or inside_triangle(u, v, 0.50, 0.84)
    return True, arrow


def render(size):
    rows = []
    for py in range(size):
        row = bytearray(b"\x00")  # 每列開頭的 filter type
        for px in range(size):
            solid = arrow = 0
            for sy in range(SS):
                for sx in range(SS):
                    u = (px + (sx + 0.5) / SS) / size
                    v = (py + (sy + 0.5) / SS) / size
                    inside, is_arrow = sample(u, v)
                    solid += inside
                    arrow += is_arrow
            total = SS * SS
            alpha = solid / total
            mix = arrow / total
            rgb = tuple(round(BG[i] * (1 - mix) + FG[i] * mix) for i in range(3))
            row += bytes(rgb) + bytes([round(255 * alpha)])
        rows.append(bytes(row))
    return b"".join(rows)


def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, size):
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
           + chunk(b"IDAT", zlib.compress(render(size), 9)) + chunk(b"IEND", b""))
    path.write_bytes(png)
    print(f"{path} ({len(png)} bytes)")


if __name__ == "__main__":
    out = pathlib.Path(__file__).parent
    for size in (16, 48, 128):
        write_png(out / f"{size}.png", size)
