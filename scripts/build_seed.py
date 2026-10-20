"""Gabungkan ekspor per dokumen di data/ menjadi src/seed.json.

Jalankan dari root repo:  python3 scripts/build_seed.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLLECTIONS = ["greens", "blends", "packs", "products", "ledger", "config"]

seed = {}
for coll in COLLECTIONS:
    seed[coll] = {f.stem: json.loads(f.read_text(encoding="utf-8"))
                  for f in sorted((ROOT / "data" / coll).glob("*.json"))}

out = ROOT / "src" / "seed.json"
out.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
print("ditulis:", out, {k: len(v) for k, v in seed.items()})
