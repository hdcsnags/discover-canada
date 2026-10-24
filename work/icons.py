"""Render the app icon (maple leaf on red) to PNGs with PyMuPDF."""
import sys
from pathlib import Path
import fitz

root = Path(sys.argv[1])
svg = """<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>
<rect width='512' height='512' rx='112' fill='#c8102e'/>
<path fill='#fff8f0' d='M256 72l-24 56-40-16 10 60-48-10 32 52-44 20 60 36-14 40 60-14 8 64h0l8-64 60 14-14-40 60-36-44-20 32-52-48 10 10-60-40 16z'/>
</svg>"""
(root / "site" / "icons" / "icon.svg").write_text(svg, encoding="utf-8")
doc = fitz.open("svg", svg.encode("utf-8"))
page = doc[0]
for size in (192, 512, 180):
    zoom = size / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pix.save(root / "site" / "icons" / f"icon-{size}.png")
print("icons done")
