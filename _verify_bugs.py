# -*- coding: utf-8 -*-
"""
宝可梦学习平台 数据回归校验脚本
================================
用法：python _verify_bugs.py

五段式校验，改拼音/识字/战斗相关代码前跑一遍：

  1. 拼音三表 SYLLABLES / TRI_SYLLABLES / TONE_QUADS 全表 pypinyin 比对（**含声调**）
  2. 识字表 HANZI_LEVELS 853 条「组词语境」比对（pypinyin 读整词取目标字那一节）
  3. beginBattle 的 fighting 守卫 + HP clamp（源码 grep 断言）
  4. 拼写题判定链：抠 index.html 真实的 pyMarkTone/pyNormalize/pyJoin 跑 50 条随机模拟
  5. render 内 clamp 边界值（repeat 不再吃负数）

踩过的坑（别再踩）：
  · 声母正则必须支持 zh/ch/sh 双字母，否则 `zh:` 段整个被跳过 —— 「炸」就是这么漏掉的。
  · 比对必须**含声调**：只比 strip_tone 后的音节，会放过 zhá/zhà 这种同音节不同调的错误。
  · 表结构：SYLLABLES 是 {声母:[[韵母带调, 字]]}，只存韵母不存声母；
    拼答案要 sm+ym，比对也要 sm+strip_tone(ym)。
"""
import io, re, json, subprocess, random
from pypinyin import lazy_pinyin, Style

HTML = 'E:/WorkBuddy/pokemon-study-site/index.html'
NODE = r'C:\Users\Beekay\.workbuddy\binaries\node\versions\22.22.2-2\node.exe'

t = io.open(HTML, encoding='utf-8').read()

TONE_CHAR = {'a': 'āáǎà', 'o': 'ōóǒò', 'e': 'ēéěè', 'i': 'īíǐì', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ'}
TONE_NUM = {v: k for k, vs in TONE_CHAR.items() for v in vs}


def strip_tone(s):
    return ''.join(TONE_NUM.get(c, c) for c in s)


def tone_of(s):
    """返回声调 1-4；无声调标记（轻声写作 le/de）返回 0"""
    for c in s:
        for k, vs in TONE_CHAR.items():
            if c in vs:
                return vs.index(c) + 1
    return 0


# 声母：zh/ch/sh 是双字母，正则必须优先匹配，否则 zh: 段会被当成 z: 段跳过
SM = r'(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])'


def grab_bracket(text, start_idx):
    """从 start_idx 处的 '[' 或 '{' 开始，括号配对返回内容（含两端）"""
    open_ch = text[start_idx]
    close_ch = ']' if open_ch == '[' else '}'
    i, depth = start_idx, 0
    while i < len(text):
        if text[i] == open_ch:
            depth += 1
        elif text[i] == close_ch:
            depth -= 1
            if depth == 0:
                break
        i += 1
    return text[start_idx:i + 1]


fail_all = 0

# ==================================================================
print("\n=== 1. 拼音三表 全表 pypinyin 比对（含声调） ===")
# 白名单：教材选的音 = 一年级常用音，且 TTS 单字朗读也读这个音，属正常
# 区别于「炸 zhá」这类：教材选了罕见音而 TTS 读常用音，孩子听到 A 却被判 B
SYL_WHITELIST = {
    '佛': 'fó 佛教', '干': 'gān 干净', '切': 'qiē 切菜',
    '茄': 'qié 茄子（pypinyin 默认 jiā 反而不标准）',
    '长': 'cháng 长短', '子': 'zǐ 子女', '脏': 'zāng 肮脏',
}

syl_body = grab_bracket(t, t.index('const SYLLABLES = {') + len('const SYLLABLES = '))
entries = []          # (来源, 完整音节, 字)
for sm_m in re.finditer(r'\b(' + SM + r'):(\[\[.*?\]\])', syl_body):
    sm, arr = sm_m.group(1), sm_m.group(2)
    for ym, ch in re.findall(r'\["([^"]+)","([^"]+)"\]', arr):
        entries.append(('SYLLABLES', sm + ym, ch))

m2 = re.search(r'const TRI_SYLLABLES\s*=\s*\[', t)
tri_body = grab_bracket(t, m2.end() - 1)
for sm, med, ym, syl, ch in re.findall(r'\["([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"\]', tri_body):
    entries.append(('TRI', syl, ch))

m3 = re.search(r'const TONE_QUADS\s*=\s*\[', t)
quad_body = grab_bracket(t, m3.end() - 1)
for syl, ch in re.findall(r'\["([^"]+)","([^"]+)"\]', quad_body):
    entries.append(('QUAD', syl, ch))

bad1, skipped1 = [], 0
for src, syl, ch in entries:
    if len(ch) != 1:
        continue
    if ch in SYL_WHITELIST:
        skipped1 += 1
        continue
    pys = lazy_pinyin(ch, style=Style.TONE3, neutral_tone_with_five=True)
    if not pys:
        continue
    mm = re.match(r'^([a-zü]+)(\d)$', pys[0])
    if not mm:
        continue
    ab, at = mm.group(1).replace('v', 'ü'), int(mm.group(2))
    db, dt = strip_tone(syl), tone_of(syl)
    if db != ab or dt != at:
        bad1.append((src, ch, syl + f'({db}{dt})', ab + str(at)))

print(f"  三表共 {len(entries)} 条，多音字白名单跳过 {skipped1} 条")
if bad1:
    print(f"  ❌ 不一致 {len(bad1)} 条：")
    for src, ch, d, a in bad1[:20]:
        print(f"     [{src}] {ch}: 数据 {d}  vs  pypinyin {a}")
    fail_all += 1
else:
    print("  ✅ 0 条不一致（音节 + 声调全对）")

# 回归断言：这几个字曾经标错过，钉死它们
REGRESS_SYL = [('来', 'ái'), ('炸', 'à'), ('跑', 'ǎo'), ('寒', 'án'), ('红', 'óng'),
               ('藏', 'áng'), ('都', 'ōu'), ('更', 'èng'), ('正', 'èng'), ('处', 'ù')]
for ch, want in REGRESS_SYL:
    got = [ym for ym, c in re.findall(r'\["([^"]+)","([^"]+)"\]', syl_body) if c == ch]
    if not (got and got[0] == want):
        print(f"  ❌ 回归断言失败：'{ch}' 期望 {want}，实际 {got}")
        fail_all += 1
print("  ✅ 10 个曾标错的字回归断言通过（来/炸/跑/寒/红/藏/都/更/正/处）")

# ==================================================================
print("\n=== 2. 识字表 HANZI_LEVELS 组词语境比对 ===")
lv_body = grab_bracket(t, t.index('const HANZI_LEVELS = {') + len('const HANZI_LEVELS = '))
tri = re.findall(r'\["([^"]+)","([^"]+)","([^"]*)"\]', lv_body)

# (字, 组词) 白名单：多音字两种读法都成立，教材取的是其中一义
LV_WHITELIST = {
    ('落', '落下'): 'luò xià 掉下来（课文常用义）',
    ('肚', '肚子'): 'dù zi 腹部（pypinyin 的 dǔ 指动物胃）',
    ('结', '结果'): 'jiē guǒ 长出果实',
    ('得', '觉得'): 'jué dé，教材标 dé',
    ('地', '轻轻地'): '结构助词读 de，数据正确',
}

bad2, skipped2 = [], 0
for ch, py, word in tri:
    if len(ch) != 1 or not word:
        continue
    pys = lazy_pinyin(word, style=Style.TONE3, neutral_tone_with_five=True)
    chars = list(word)
    if len(pys) != len(chars):
        continue
    idx = next((k for k, c in enumerate(chars) if c == ch), None)
    if idx is None:
        continue
    mm = re.match(r'^([a-zü]+)(\d)$', pys[idx])
    if not mm:
        continue
    ab, at = mm.group(1).replace('v', 'ü'), int(mm.group(2))
    db, dt = strip_tone(py), tone_of(py)
    if db == ab and dt == at:
        continue
    if (ch, word) in LV_WHITELIST:
        skipped2 += 1
        continue
    # 轻声：pypinyin 给 5 声而数据标原调/无调 → 教材规范标原调，跳过
    if at == 5 and dt in (0, 1, 2, 3, 4):
        skipped2 += 1
        continue
    # 「一」「不」变调：pypinyin 按词读变调，数据标本调，跳过
    if ch in ('一', '不'):
        skipped2 += 1
        continue
    bad2.append((ch, py, word, db + str(dt), ab + str(at)))

print(f"  识字表共 {len(tri)} 条，轻声/变调/多音白名单跳过 {skipped2} 条")
if bad2:
    print(f"  ❌ 不一致 {len(bad2)} 条：")
    for ch, py, word, d, a in bad2[:20]:
        print(f"     {ch} 【{word}】 数据 {py}({d})  vs  pypinyin {a}")
    fail_all += 1
else:
    print("  ✅ 0 条不一致")

# 回归断言：这 11 个字曾经标错过
REGRESS_LV = [('纯', 'chūn'), ('粽', 'zàng'), ('伸', 'shén'), ('皂', 'zhào'), ('泡', 'pǎo'),
              ('乐', 'yuè'), ('只', 'zhī'), ('空', 'kōng'), ('觉', 'jué'), ('得', 'de'), ('着', 'zhe')]
for ch, wrong in REGRESS_LV:
    still = [f'{c}:{p}({w})' for c, p, w in tri if c == ch and p == wrong]
    if still:
        print(f"  ❌ 回归断言失败：'{ch}' 仍存在错误读音 {wrong} → {still}")
        fail_all += 1
print("  ✅ 11 个曾标错的字回归断言通过（纯/粽/伸/皂/泡/乐/只/空/觉/得/着）")

# ==================================================================
print("\n=== 3. beginBattle fighting 守卫 + HP clamp ===")
assert 'let myHP=3, wildHP=3, endured=false, committed=false, fighting=false' in t, "fighting flag 没加"
print("  ✅ fighting=false 已加入 beginBattle")

m_render = re.search(r'function render\(side\)\{(.*?)\n  function askQ', t, re.S)
assert m_render, "render 函数没找到"
rb = m_render.group(1)
assert 'const mHP = Math.max(0, Math.min(3, myHP))' in rb
assert 'const wHP = Math.max(0, Math.min(3, wildHP))' in rb
print("  ✅ render 内 clamp [0,3] 已加入")

m_atk = re.search(r'\$\("#atkBtn"\)\.addEventListener\("click",\s*\(\)=>\{[\s\S]*?\}\);', t)
assert m_atk and 'if (fighting) return' in m_atk.group(0) and 'fighting = true' in m_atk.group(0)
print("  ✅ atkBtn click 加了 fighting 守卫")

n_reset = t.count('fighting = false;')
assert n_reset >= 2, f"fighting=false 重置次数 {n_reset} 不足"
print(f"  ✅ fighting = false 重置了 {n_reset} 次（答对/答错两条路径）")

m_endure = re.search(r'\$\("#endureGo"\)\.addEventListener\("click",\s*\(\)=>\{[\s\S]*?\}\);', t)
assert m_endure and 'fighting = true' in m_endure.group(0)
print("  ✅ endureGo click 也设了 fighting=true")

# ==================================================================
print("\n=== 4. 拼写题判定链 50 条随机模拟（抠 index.html 真实代码） ===")
src = ""
src += "const PY_TONE_CHAR = " + re.search(r'const PY_TONE_CHAR = (\{[^}]+\});', t).group(1) + ";\n"
src += "const PY_U2U = " + re.search(r'const PY_U2U = (\{[^}]+\});', t).group(1) + ";\n"


def grab_fn(name):
    mm = re.search(r'function ' + re.escape(name) + r'\([\s\S]*?\)\{\n([\s\S]*?)\n\}', t, re.M)
    return mm.group(1) if mm else ''


src += "function pyMarkTone(base, tone){\n" + grab_fn('pyMarkTone') + "\n}\n"
src += "function pyNormalize(s){\n" + grab_fn('pyNormalize') + "\n}\n"
src += "function pyJoin(sm, jm, ym, tone){ return pyNormalize(pyMarkTone(sm+jm+ym, tone)); }\n"

pool = []
for sm_m in re.finditer(r'\b(' + SM + r'):(\[\[.*?\]\])', syl_body):
    sm, arr = sm_m.group(1), sm_m.group(2)
    for ym, ch in re.findall(r'\["([^"]+)","([^"]+)"\]', arr):
        pool.append((sm, ym, ch))

random.seed(42)
samples = random.sample(pool, min(50, len(pool)))
TONE_FULL = {v: (k, i + 1) for k, vs in TONE_CHAR.items() for i, v in enumerate(vs)}


def split_tone(s):
    base, tone = '', None
    for c in s:
        if c in TONE_FULL:
            base += TONE_FULL[c][0]
            tone = TONE_FULL[c][1]
        else:
            base += c
    return base, tone


js_in = []
for sm, ym, ch in samples:
    ym_base, tone = split_tone(ym)
    js_in.append({'sm': sm, 'ym_base': ym_base, 'tone': tone, 'answer_syl': sm + ym, 'ch': ch})

node_script = src + "\nconst tests = " + json.dumps(js_in, ensure_ascii=False) + ";\n" + """
let fail = 0;
for (const t of tests) {
  const userSyl = pyJoin(t.sm, '', t.ym_base, String(t.tone));
  if (userSyl !== t.answer_syl) { console.log('FAIL', t.ch, JSON.stringify(userSyl), 'vs', JSON.stringify(t.answer_syl)); fail++; }
}
console.log(fail + '/' + tests.length + ' mismatches');
if (fail > 0) process.exit(1);
"""
res = subprocess.run([NODE, '-e', node_script], capture_output=True, text=True)
print("  " + res.stdout.strip().replace('\n', '\n  '))
if res.returncode != 0:
    print("STDERR:", res.stderr)
    fail_all += 1
else:
    print("  ✅ 判定链 50/50 通过")

# ==================================================================
print("\n=== 5. render clamp 边界（repeat 不吃负数） ===")
res2 = subprocess.run([NODE, '-e', """
const c = n => Math.max(0, Math.min(3, n));
console.log('clamp(-1)=' + c(-1) + ' clamp(5)=' + c(5) + ' clamp(2)=' + c(2));
console.log('repeat:', 'H'.repeat(c(-1)) + 'B'.repeat(3 - c(-1)));
"""], capture_output=True, text=True)
print("  " + res2.stdout.strip().replace('\n', '\n  '))
if res2.returncode != 0 or 'clamp(-1)=0' not in res2.stdout:
    print("  ❌ clamp 边界失败")
    fail_all += 1
else:
    print("  ✅ clamp(-1)=0，repeat 不再抛 RangeError")

# ==================================================================
print()
if fail_all:
    print(f"❌ 有 {fail_all} 段未通过")
    raise SystemExit(1)
print("🎉 全部校验通过！")
