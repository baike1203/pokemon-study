#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 scripts/evo_chains_extra.txt (EVO_CHAINS_EXTRA 字面量) 注入 index.html。
锚点: EVO_CHAINS 数组结束的 "];" 之后、注释 "进化所需重复次数" 之前插入，
确保 EVO_CHAINS.push(...) 在 BASE_FORMS IIFE(依赖 EVO_CHAINS) 之前执行。
幂等: 若已包含标记则跳过。"""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HTML = os.path.join(ROOT, "index.html")
TXT  = os.path.join(HERE, "evo_chains_extra.txt")

def main():
    literal = open(TXT, encoding="utf-8").read().strip()
    html = open(HTML, encoding="utf-8").read()
    if "EVO_CHAINS_EXTRA" in html:
        print("已包含 EVO_CHAINS_EXTRA，跳过注入。")
        return
    anchor = re.compile(r"\];\s*\n/\* 进化所需重复次数")
    if not anchor.search(html):
        raise SystemExit("找不到注入锚点(进化所需重复次数)")
    block = (
        "];\n\n"
        "/* ===== 第二至九世代进化链（PokeAPI 抓取注入，离线可用；基础形态+进化路径，与第一世代同构） ===== */\n"
        + literal + "\n"
        "EVO_CHAINS.push(...EVO_CHAINS_EXTRA);\n\n"
        "/* 进化所需重复次数"
    )
    html = anchor.sub(block, html, count=1)
    open(HTML, "w", encoding="utf-8").write(html)
    print("注入完成: EVO_CHAINS 现含 gen2-9 链。")

if __name__ == "__main__":
    main()
