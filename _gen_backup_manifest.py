#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate local backup manifest: enumerate the 12 top-level backup items
(excluding .git and .workbuddy and any root-level temp/log files) and emit
a tab-separated file: relpath \t basename \t size
Used by the Quark daily-backup automation for basename-multiset gap checking.
"""
import os, sys

ROOT = r"E:\WorkBuddy\pokemon-study-site"

# Top-level items to back up (explicit; .git / .workbuddy excluded by design)
ITEMS = [
    "index.html",
    "assets",
    ".github",
    "android",
    "functions",
    "icons",
    "tools",
    "scripts",
    "manifest.webmanifest",
    "README.md",
    ".gitignore",
    "worker.js",
]

out_path = os.path.join(ROOT, "_upload_manifest_2026-08-27.txt")
rows = []

def walk(dirpath, relbase):
    for name in sorted(os.listdir(dirpath)):
        full = os.path.join(dirpath, name)
        rel = relbase + "/" + name if relbase else name
        if os.path.isdir(full):
            walk(full, rel)
        else:
            try:
                sz = os.path.getsize(full)
            except OSError:
                sz = -1
            rows.append((rel, name, sz))

for it in ITEMS:
    full = os.path.join(ROOT, it)
    if not os.path.exists(full):
        print("MISSING (skipped):", it, file=sys.stderr)
        continue
    if os.path.isdir(full):
        walk(full, "")
    else:
        sz = os.path.getsize(full)
        rows.append((it, it, sz))

with open(out_path, "w", encoding="utf-8") as f:
    for rel, name, sz in rows:
        f.write(f"{rel}\t{name}\t{sz}\n")

# Counts
from collections import Counter
bn = Counter(r[1] for r in rows)
dup = {k: v for k, v in bn.items() if v > 1}
print(f"TOTAL FILES: {len(rows)}")
print(f"UNIQUE BASENAMES: {len(bn)}")
print(f"DUPLICATE BASENAMES (count>1): {len(dup)}")
for k, v in sorted(dup.items()):
    print(f"  {k} x{v}")
print(f"MANIFEST WRITTEN: {out_path}")
