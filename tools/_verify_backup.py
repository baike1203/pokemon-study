#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""备份完整性校验：对比本地待备份文件数 与 夸克上传日志中的成功条目数。"""
import os, json, sys
from collections import Counter

ROOT = "E:/WorkBuddy/pokemon-study-site"
LOG = os.path.join(ROOT, "run_2026-08-14.log")
EXCL_DIRS = {".git", ".workbuddy"}
EXCL_FILES = {"_dl.log", "_gen2_names.txt", "_syntax_check.txt", "index.html.bak.inject"}

def local_files():
    out = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in EXCL_DIRS]
        for f in fn:
            rel = os.path.relpath(os.path.join(dp, f), ROOT)
            if rel.split(os.sep)[0] in EXCL_DIRS: continue
            if f in EXCL_FILES: continue
            if f.startswith("run_") and f.endswith(".log"): continue
            out.append(rel)
    return out

def uploaded_basenames():
    c = Counter()
    real = 0  # 非秒传（真实新上传）计数
    ok = 0
    with open(LOG, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line: continue
            try:
                o = json.loads(line)
            except Exception:
                continue
            if o.get("action") == "upload" and o.get("type") == "list":
                if o.get("code") == 0:
                    ok += 1
                    c[os.path.basename(o.get("data", {}).get("fileName", ""))] += 1
                    if o.get("data", {}).get("instantUpload") is False:
                        real += 1
    return c, ok, real

locals_ = local_files()
local_bases = Counter(os.path.basename(f) for f in locals_)
N = len(locals_)
up, ok_cnt, real_cnt = uploaded_basenames()

print(f"本地待备份文件总数 N = {N}")
print(f"日志成功上传条目数 M = {ok_cnt}  (其中真实新传 {real_cnt}, 秒传命中 {ok_cnt-real_cnt})")
print(f"本地不同 basename 数 = {len(local_bases)}; 日志上报 basename 数 = {len(up)}")

# 多重集合差集：本地比日志多出来的 basename = 可能缺失
missing = local_bases - up
print(f"缺失 basename 多重集合差 = {dict(missing) if missing else '无'}")

if ok_cnt >= N:
    print("结论：成功条目数 >= 本地文件数，备份完整。")
    sys.exit(0)
else:
    print(f"结论：成功条目数 {ok_cnt} < 本地文件数 {N}，疑似缺 {N-ok_cnt} 个文件，需单独补传。")
    sys.exit(1)
