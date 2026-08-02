#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性修复：给 POKEMON 数组里所有以 \" 结尾、缺逗号的元素行补逗号。
（build_pokemon_names.py 早期版本生成的每行 10 名缺行间逗号，会导致语法错误。）
用法：python fix_pokemon_array.py            # dry-run
      python fix_pokemon_array.py --apply    # 实际修复
"""
import sys, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, "..", "index.html")
apply = "--apply" in sys.argv

html = open(INDEX, "r", encoding="utf-8").read()
lines = html.split("\n")
# 定位 const POKEMON = [ 所在行 与 其后第一个独立的 ]; 行
start = None
for i, ln in enumerate(lines):
    if "const POKEMON = [" in ln:
        start = i
        break
assert start is not None, "找不到 const POKEMON"
end = None
for i in range(start + 1, len(lines)):
    if lines[i].strip() == "];":
        end = i
        break
assert end is not None, "找不到 POKEMON 的 ];"

fixed = 0
new_lines = list(lines)
for i in range(start + 1, end):
    s = lines[i].strip()
    if not s:
        continue
    if s.startswith("/*") or s.startswith("//"):
        continue
    # 去掉已存在结尾逗号后判断是否以 " 结尾
    core = s[:-1] if s.endswith(",") else s
    if core.endswith('"'):
        # 需要以 " 或 ", 结尾
        if not s.endswith('",') and not s.endswith('"'):
            continue
        if s.endswith('"'):
            new_lines[i] = lines[i].rstrip() + ","
            fixed += 1

print(f"# 检查区间: 行 {start+1}..{end-1}，补逗号 {fixed} 处")
if apply:
    open(INDEX, "w", encoding="utf-8").write("\n".join(new_lines))
    print("OK 已修复并写回 index.html")
else:
    print("(dry-run，加 --apply 实际修复)")
