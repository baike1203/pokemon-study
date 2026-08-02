#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 scripts/pokedata_extra_cache.json (152-1025) 注入 index.html 的 POKEDATA。
策略: 在 POKEDATA 原字面量之后、buildTypes 之前，插入
  const POKEDATA_EXTRA = [ ...gen2-9 条目... ];
  POKEDATA.push(...POKEDATA_EXTRA);
这样不改动第一世代(gen1)的数据字面量，回滚/合并最安全。

用法:
  python scripts/build_pokedata.py            # 注入(若已注入则替换)
  python scripts/build_pokedata.py --check    # 仅校验数据完整性, 不写文件
"""
import json, sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HTML = os.path.join(ROOT, "index.html")
CACHE = os.path.join(HERE, "pokedata_extra_cache.json")
ANCHOR = "/* ---------- 由 POKEDATA 派生各属性系的宝可梦编号列表"

def load_extra():
    c = json.load(open(CACHE, encoding="utf-8"))
    missing = [i for i in range(152, 1026) if not c.get(str(i)) or not c[str(i)].get("t")]
    if missing:
        raise SystemExit(f"数据不完整, 缺失 {len(missing)} 条 -> {missing[:10]}\n请先跑 fetch_pokedata.py")
    # 按编号顺序生成条目(152..1025)
    entries = []
    for i in range(152, 1026):
        e = c[str(i)]
        entries.append(json.dumps(e, ensure_ascii=False))
    return entries

def build_block(entries):
    body = ",\n  ".join(entries)
    return (
        "/* 第二代以后(152-1025)基础信息: 属性/身高/体重/中文分类, "
        "由 scripts/fetch_pokedata.py 从 PokeAPI 抓取注入, 离线可用 */\n"
        "const POKEDATA_EXTRA = [\n  " + body + "\n];\n"
        "POKEDATA.push(...POKEDATA_EXTRA);\n"
    )

def main():
    check_only = "--check" in sys.argv
    entries = load_extra()
    print(f"数据完整: 152-1025 共 {len(entries)} 条")
    if check_only:
        print("仅校验, 未写文件。")
        return
    s = open(HTML, encoding="utf-8").read()
    # 若已注入, 先移除旧块
    s = re.sub(r"/\* 第二代以后\(152-1025\)基础信息.*?POKEDATA\.push\(\.\.\.POKEDATA_EXTRA\);\n", "", s, flags=re.S)
    idx = s.find(ANCHOR)
    if idx == -1:
        raise SystemExit("找不到插入锚点(由 POKEDATA 派生...注释), 中止")
    block = build_block(entries)
    s = s[:idx] + block + "\n" + s[idx:]
    open(HTML, "w", encoding="utf-8").write(s)
    # 校验
    verify = s.count("POKEDATA_EXTRA") >= 1 and "POKEDATA.push(...POKEDATA_EXTRA)" in s
    print("注入" + ("成功" if verify else "失败!") + f" (POKEDATA_EXTRA 块已写入, 条数 {len(entries)})")

if __name__ == "__main__":
    main()
