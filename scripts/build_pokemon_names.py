#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 download_sprites.py 抓到的中文名（_gen2_names_cache.json）按世代分段插入到
index.html 的 POKEMON 数组末尾（在最后一个 gen2 名字 "时拉比" 之后、]; 之前）。

用法：
  python build_pokemon_names.py        # 干跑 dry-run：打印将插入的内容 + 可疑名，不写文件
  python build_pokemon_names.py --apply  # 实际写入 index.html

特性：
  - 自动按 BOOKS 的世代区间（gen3..gen9）分段加注释
  - 标出"非中文/空"的名字（PokeAPI 缺 zh-hans 时可能退化为英文名），便于人工补正
  - 不去重、不改动现有 1-251 内容
"""
import sys, os, json, re

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "_gen2_names_cache.json")
INDEX = os.path.join(HERE, "..", "index.html")

# 与 index.html 中 BOOKS 对齐（只处理 gen3..gen9）
GEN_RANGES = [
    ("第三世代 · 丰缘", 252, 386),
    ("第四世代 · 神奥", 387, 493),
    ("第五世代 · 合众", 494, 649),
    ("第六世代 · 卡洛斯", 650, 721),
    ("第七世代 · 阿罗拉", 722, 809),
    ("第八世代 · 伽勒尔", 810, 905),
    ("第九世代 · 帕底亚", 906, 1025),
]

def is_chinese(s):
    if not s:
        return False
    # 含至少一个 CJK 汉字即视为中文（容忍夹杂数字/字母，如 3D龙Z）
    return any('\u4e00' <= ch <= '\u9fff' for ch in s)

def main():
    apply = "--apply" in sys.argv
    cache = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE, "r", encoding="utf-8"))
    else:
        print("!! 找不到名字缓存 _gen2_names_cache.json，请先跑 download_sprites.py")
        return

    blocks = []
    suspicious = []
    for label, lo, hi in GEN_RANGES:
        names = [cache.get(str(i), "") for i in range(lo, hi + 1)]
        # 检查可疑名
        for i, nm in enumerate(names, start=lo):
            if not is_chinese(nm):
                suspicious.append((i, nm))
        # 构造分段文本：每行 10 个
        lines = [f"/* --- {label} {lo}-{hi} --- */"]
        for r0 in range(0, len(names), 10):
            chunk = names[r0:r0 + 10]
            lines.append('"' + '","'.join(chunk) + '"')
        blocks.append("\n".join(lines))

    insertion = ",\n" + "\n".join(blocks) + "\n"  # 末尾换行留给 ];

    # 报告
    print(f"# 各世代条目数: " + ", ".join(f"{lab.split(' ')[0]}={hi-lo+1}" for lab,lo,hi in GEN_RANGES))
    print(f"# 可疑(非中文/空)条目: {len(suspicious)}")
    for i, nm in suspicious:
        print(f"   id={i}  -> '{nm}'  (需人工补正)")
    if not apply:
        print("\n===== DRY-RUN 插入内容预览(前 30 行) =====")
        print(insertion.split("\n")[:30] if False else insertion[:1200])
        print("... (省略)")
        print("\n(加 --apply 实际写入 index.html)")
        return

    html = open(INDEX, "r", encoding="utf-8").read()
    marker = '"时拉比"'
    pos = html.rfind(marker)
    if pos < 0:
        print("!! 找不到 '时拉比' 插入锚点")
        return
    # 锚点后应是换行 + ]; —— 我们把 "时拉比" 后追加逗号并插入新块
    # 定位 "时拉比" 之后第一个 ']' 之前
    after = html[pos + len(marker):]
    m = re.search(r"\n\s*\];", after)
    if not m:
        print("!! 找不到数组结尾 ];")
        return
    insert_at = pos + len(marker) + m.start()  # 指向 "\n];" 的 \n
    new_html = html[:insert_at] + "," + insertion + html[insert_at:]
    open(INDEX, "w", encoding="utf-8").write(new_html)
    print("OK 已写入 index.html (POKEMON 数组追加 gen3-9)")

if __name__ == "__main__":
    main()
