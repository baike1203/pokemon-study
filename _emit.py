# -*- coding: utf-8 -*-
# 把 _bank12.json 拼进 index.html：整块替换 HANZI_LEVELS[1] / [2] 的 chars（各 3 行）
import json, io

bank = json.load(open(r'E:/WorkBuddy/pokemon-study-site/_bank12.json', encoding='utf-8'))
words = bank["words"]

def entries(lvl):
    out = []
    for e in bank[lvl]:
        w = words[e["chr"]]
        if isinstance(w, list): w = w[0]
        assert 2 <= len(w) and e["chr"] in w
        out.append(f'["{e["chr"]}","{e["py"]}","{w}"]')
    return out

META = {
    "1": ("一年级上册", "部编版一上 300 字 · 看图+认字混合", "up"),
    "2": ("一年级下册", "部编版一下 405 字 · 看图+看拼音", "down"),
}

path = r'E:/WorkBuddy/pokemon-study-site/index.html'
lines = io.open(path, encoding='utf-8', newline='').read().split('\n')

def splice(lv_key):
    name, desc, lvl = META[lv_key]
    start = next(i for i, l in enumerate(lines) if l.startswith(f'  {lv_key}:{{ name:"{name}"'))
    end = next(i for i in range(start, len(lines)) if lines[i].strip() == ']},')
    block = [
        f'  {lv_key}:{{ name:"{name}", desc:"{desc}", chars:[',
        '    ' + ','.join(entries(lvl)),
        '  ]},',
    ]
    lines[start:end+1] = block
    return end - start + 1 - 3   # 替换掉的原行数

n1 = splice("1")
n2 = splice("2")
io.open(path, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print(f"level1 替换 {n1+3} 行 → 3 行; level2 替换 {n2+3} 行 → 3 行")
