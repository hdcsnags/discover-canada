"""Tripwire: every number (years, percentages, counts) in cards/quiz/focus must appear in the chapter's booklet text.
Numbers that appear in a card but not in the booklet are either invented or came from another chapter — list them."""
import json, re, sys
from pathlib import Path

root = Path(sys.argv[1])
chapters = root / "work" / "chapters"
data = root / "site" / "data"
idx = json.loads((data / "index.json").read_text(encoding="utf-8"))
alltext = "\n".join(p.read_text(encoding="utf-8") for p in chapters.glob("*.md"))
norm = lambda s: re.sub(r"[–—’“”]", lambda m: {"–": "-", "—": "-", "’": "'", "“": '"', "”": '"'}[m.group()], s)
alltext_n = norm(alltext).replace(",", "")
num_re = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?%?(?![\w])")
flagged = 0
for ch in idx["chapters"]:
    f = data / ch["file"]
    if not f.exists():
        continue
    d = json.loads(f.read_text(encoding="utf-8"))
    text = norm((chapters / (ch["id"] + ".md")).read_text(encoding="utf-8")).replace(",", "")
    items = []
    for s in d["sections"]:
        for fp in s.get("focus", []):
            items.append((s["id"] + " focus", fp))
    for c in d.get("cards", []):
        items.append((c["id"], c["front"] + " " + c["back"]))
    for q in d.get("quiz", []):
        items.append((q["id"], q["q"] + " " + q["choices"][q["answer"]] + " " + q.get("why", "")))
    for ident, txt in items:
        for n in set(num_re.findall(norm(txt).replace(",", ""))):
            if n in ("1", "2", "3", "4", "5", "6", "7", "8", "9", "10"):
                continue
            if n not in text:
                where = "elsewhere in booklet" if n in alltext_n else "NOT IN BOOKLET"
                print(f"{ch['id']:<12} {ident:<40} {n:<8} {where}")
                flagged += 1
print("flagged", flagged)
