"""Validate all chapter JSON files against the schema rules in CONTENT_BRIEF.md."""
import json, sys
from pathlib import Path

root = Path(sys.argv[1]) / "site" / "data"
idx = json.loads((root / "index.json").read_text(encoding="utf-8"))
problems = []
totals = {"sections": 0, "focus": 0, "cards": 0, "quiz": 0}
for ch in idx["chapters"]:
    f = root / ch["file"]
    if not f.exists():
        problems.append(f"MISSING {f.name}")
        continue
    d = json.loads(f.read_text(encoding="utf-8"))
    if d["id"] != ch["id"]:
        problems.append(f"{f.name}: id {d['id']} != {ch['id']}")
    secs = {s["id"] for s in d["sections"]}
    for s in d["sections"]:
        if not s.get("blocks"):
            problems.append(f"{f.name}: section {s['id']} has no blocks")
        for b in s["blocks"]:
            if b["type"] not in ("p", "list", "quote", "caption", "table", "h"):
                problems.append(f"{f.name}: {s['id']} bad block type {b['type']}")
        for fp in s.get("focus", []):
            if len(fp.split()) > 30:
                problems.append(f"{f.name}: {s['id']} long focus ({len(fp.split())} words)")
        totals["focus"] += len(s.get("focus", []))
    for c in d.get("cards", []):
        if c["section"] not in secs:
            problems.append(f"{f.name}: card {c['id']} unknown section {c['section']}")
    for q in d.get("quiz", []):
        if q["section"] not in secs:
            problems.append(f"{f.name}: quiz {q['id']} unknown section {q['section']}")
        if len(q["choices"]) != 4:
            problems.append(f"{f.name}: quiz {q['id']} has {len(q['choices'])} choices")
        if not (0 <= q["answer"] < len(q["choices"])):
            problems.append(f"{f.name}: quiz {q['id']} answer out of range")
        if len(set(q["choices"])) != len(q["choices"]):
            problems.append(f"{f.name}: quiz {q['id']} duplicate choices")
    dist = [0, 0, 0, 0]
    for q in d.get("quiz", []):
        dist[q["answer"]] += 1
    totals["sections"] += len(d["sections"]); totals["cards"] += len(d.get("cards", [])); totals["quiz"] += len(d.get("quiz", []))
    print(f"{d['order']:>2} {d['id']:<14} sections={len(d['sections']):<3} cards={len(d.get('cards', [])):<4} quiz={len(d.get('quiz', [])):<3} answers={dist} size={f.stat().st_size // 1024}KB")
off = root / idx["official"]
if off.exists():
    o = json.loads(off.read_text(encoding="utf-8"))
    print(f"   official       mcq={len(o['mcq'])} short={len(o['short'])}")
else:
    problems.append("MISSING official-questions.json")
print("TOTALS", totals)
print("PROBLEMS:" if problems else "No problems.")
for p in problems:
    print("  -", p)
