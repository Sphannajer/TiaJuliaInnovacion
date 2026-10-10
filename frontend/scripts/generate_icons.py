"""Genera iconos PWA PNG con los colores de marca.

Uso: python scripts/generate_icons.py
"""
import struct
import zlib
from pathlib import Path


def create_icon(size: int, path: Path) -> None:
    """Draw a simple citrus circle on bone background with brand orange."""
    background = (246, 243, 230)  # --brand-bone
    circle = (233, 144, 21)  # --brand-orange
    inner = (242, 212, 162)  # --brand-beige
    red = (201, 36, 41)  # --brand-red

    cx, cy, r = size / 2, size / 2, size * 0.38
    r_inner = size * 0.30
    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # filter type none
        for x in range(size):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist <= r_inner:
                color = inner
            elif dist <= r:
                color = circle
            else:
                color = background
            # simple "TJ" bar in red across the middle
            bar_top, bar_bottom = size * 0.42, size * 0.58
            bar_left, bar_right = size * 0.32, size * 0.68
            vertical_left, vertical_right = size * 0.46, size * 0.54
            if bar_top <= y <= bar_bottom and bar_left <= x <= bar_right:
                color = red
            elif bar_top <= y <= size * 0.78 and vertical_left <= x <= vertical_right:
                color = red
            row.extend(color)
        rows.append(bytes(row))

    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + chunk_type + data
        c += struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
        return c

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"created {path} ({size}x{size})")


if __name__ == "__main__":
    icons_dir = Path(__file__).resolve().parents[1] / "public" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    create_icon(192, icons_dir / "icon-192.png")
    create_icon(512, icons_dir / "icon-512.png")
