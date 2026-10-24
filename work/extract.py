"""Extract Discover Canada per-page text and page images.
Booklet page N == PDF page N (each PDF page is one half of a spread via cropbox)."""
import sys, json, re
from pathlib import Path
import fitz

root = Path(sys.argv[1])
pdf = root / "discover.pdf"
out_txt = root / "work" / "pages"
out_img = root / "site" / "book"
out_txt.mkdir(parents=True, exist_ok=True)
out_img.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf)
pages = {}
for i, page in enumerate(doc):
    n = i + 1
    text = page.get_text("text")
    # normalise whitespace a little, keep paragraph breaks
    text = text.replace("­", "")
    pages[n] = text
    (out_txt / f"p{n:02d}.txt").write_text(text, encoding="utf-8")
    # render image at ~1100px wide
    w = page.rect.width
    zoom = 1100 / w
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pix.save(out_img / f"p{n:02d}.jpg", jpg_quality=72)

chapters = [
    ("oath", "The Oath of Citizenship", 2, 2),
    ("message", "Message to Our Readers", 3, 3),
    ("applying", "Applying for Citizenship", 6, 7),
    ("rights", "Rights and Responsibilities of Citizenship", 8, 9),
    ("who-we-are", "Who We Are", 10, 13),
    ("history", "Canada's History", 14, 23),
    ("modern", "Modern Canada", 24, 27),
    ("govern", "How Canadians Govern Themselves", 28, 29),
    ("elections", "Federal Elections", 30, 35),
    ("justice", "The Justice System", 36, 37),
    ("symbols", "Canadian Symbols", 38, 41),
    ("economy", "Canada's Economy", 42, 43),
    ("regions", "Canada's Regions", 44, 51),
    ("study-questions", "Study Questions", 52, 53),
    ("more-info", "For More Information", 54, 57),
    ("authorities", "Authorities", 64, 65),
    ("quotes", "Memorable Quotes", 66, 67),
]
out_ch = root / "work" / "chapters"
out_ch.mkdir(exist_ok=True)
for slug, title, a, b in chapters:
    parts = [f"# {title}\n"]
    for n in range(a, b + 1):
        parts.append(f"\n\n<!-- page {n} -->\n\n{pages[n]}")
    (out_ch / f"{slug}.md").write_text("".join(parts), encoding="utf-8")
print("pages", len(pages), "chapters", len(chapters))
