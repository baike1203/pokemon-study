# -*- coding: utf-8 -*-
"""
验证 BUG 1 + BUG 2 修复：
1. SYLLABLES 全表 pypinyin 一致性（之前对"来"标错成 4 声）
2. beginBattle 的 fighting 守卫 + clamp：源码层面确认
3. 拼写题判定：用 Node 抠 index.html 里的 PY_TONE_CHAR/pyMarkTone/pyNormalize 跑 50 条随机模拟
"""
import io, re, json, subprocess, random
from pypinyin import lazy_pinyin, Style

t = io.open('E:/WorkBuddy/pokemon-study-site/index.html', encoding='utf-8').read()

# ============== 1. SYLLABLES 全表比对 ==============
print("\n=== 1. SYLLABLES 全表 pypinyin 比对 ===")
TONE_CHAR = {'a':'āáǎà','o':'ōóǒò','e':'ēéěè','i':'īíǐì','u':'ūúǔù','ü':'ǖǘǚǜ'}
TONE_NUM = {v:k for k,vs in TONE_CHAR.items() for v in vs}
def strip_tone(s): return ''.join(TONE_NUM.get(c,c) for c in s)

m = re.search(r'const SYLLABLES\s*=\s*(\{.*?\n\});', t, re.S)
assert m, "SYLLABLES 没找到"
body = m.group(1)

# 多音字白名单：pypinyin 默认读音 ≠ 教材选择，但两者都合法（一/多音字教育版本选择）
# 佛 → fó (Buddha), 都 → dū (capital, 首都), 茄 → qié (eggplant)
KNOWN_MULTI = {'佛', '都', '茄'}

# 用声母:[["x","y"],...] 结构遍历
bad = []
total = 0
multi_skipped = 0
sm_iter_re = re.compile(r'\b([bcdfghjklmnpqrstvwxyz]):(\[\[.*?\]\])')
for sm_match in sm_iter_re.finditer(body):
    sm = sm_match.group(1)
    array_body = sm_match.group(2)  # 如 [["ā","八"],["á","拔"],...]
    for ym, ch in re.findall(r'\["([^"]+)","([^"]+)"\]', array_body):
        total += 1
        if len(ch) != 1: continue
        if ch in KNOWN_MULTI: multi_skipped += 1; continue
        pys = lazy_pinyin(ch, style=Style.TONE3, neutral_tone_with_five=True)
        if not pys: continue
        m2 = re.match(r'^([a-zü]+)(\d)$', pys[0])
        if not m2: continue
        actual = m2.group(1).replace('v','ü')
        if sm + strip_tone(ym) != actual:
            bad.append((sm, ym, ch, sm + strip_tone(ym), actual))
print(f"  共 {total} 条，多音字(白名单)跳过 {multi_skipped} 条")
print(f"  不一致 {len(bad)} 条")
assert len(bad) == 0, f"还有 {len(bad)} 条数据错: {bad[:3]}"
# 特别验证 '来'
found = False
for m3 in re.finditer(r'\["([^"]+)","来"\]', body):
    found = True
    ym = m3.group(1)
    assert ym == 'ái', f"'来' 期望 ái(2声)，实际 {ym!r}"
    print(f"  ✅ '来' = {ym} (2声)")
    break
assert found, "'来' 没找到"

# ============== 2. beginBattle fighting + clamp ==============
print("\n=== 2. beginBattle fighting + clamp ===")
assert 'let myHP=3, wildHP=3, endured=false, committed=false, fighting=false' in t, "fighting flag 没加"
print("  ✅ fighting=false 已加入 beginBattle")

# clamp 在 render 里
m_render = re.search(r'function render\(side\)\{(.*?)\n  function askQ', t, re.S)
assert m_render, "render 函数没找到"
render_body = m_render.group(1)
assert 'const mHP = Math.max(0, Math.min(3, myHP))' in render_body
assert 'const wHP = Math.max(0, Math.min(3, wildHP))' in render_body
print("  ✅ render 内 clamp [0,3] 已加入")

# atkBtn fighting 守卫
m_atk = re.search(r'\$\("#atkBtn"\)\.addEventListener\("click",\s*\(\)=>\{[\s\S]*?\}\);', t)
assert m_atk, "atkBtn handler 没找到"
assert 'if (fighting) return' in m_atk.group(0)
assert 'fighting = true' in m_atk.group(0)
print("  ✅ atkBtn click 加了 fighting 守卫")

# judge 内 render 后重置 fighting
fighting_reset_count = t.count('fighting = false;')
assert fighting_reset_count >= 2, f"fighting=false 重置次数 {fighting_reset_count} 不足"
print(f"  ✅ fighting = false 重置了 {fighting_reset_count} 次（答对/答错两条路径）")

# endureGo 也设 fighting=true
m_endure = re.search(r'\$\("#endureGo"\)\.addEventListener\("click",\s*\(\)=>\{[\s\S]*?\}\);', t)
assert m_endure, "endureGo handler 没找到"
assert 'fighting = true' in m_endure.group(0)
print("  ✅ endureGo click 也设了 fighting=true（撑住弹窗继续战斗）")

# ============== 3. 拼写题判定 Node 模拟 50 次 ==============
print("\n=== 3. 拼写题判定 50 次模拟（抠 index.html 真实代码） ===")

# 抠 PY_TONE_CHAR + pyMarkTone + pyNormalize + pyJoin
src = ""
src += "const PY_TONE_CHAR = " + re.search(r'const PY_TONE_CHAR = (\{[^}]+\});', t).group(1) + ";\n"
src += "const PY_U2U = " + re.search(r'const PY_U2U = (\{[^}]+\});', t).group(1) + ";\n"

# 用 multiline + 行首 ^} 抓函数体（避免内层 } 干扰）
def grab_body(name):
    m = re.search(r'function ' + re.escape(name) + r'\([\s\S]*?\)\{\n([\s\S]*?)\n\}', t, re.M)
    return m.group(1) if m else ''

src += "function pyMarkTone(base, tone){\n" + grab_body('pyMarkTone') + "\n}\n"
src += "function pyNormalize(s){\n" + grab_body('pyNormalize') + "\n}\n"
src += "function pyJoin(sm, jm, ym, tone){ return pyNormalize(pyMarkTone(sm+jm+ym, tone)); }\n"

# 抽 50 个 SYLLABLES 条目（按 (sm, ym_with_tone, ch) 三元组复原）
random.seed(42)
all_entries = []
sm_iter_re = re.compile(r'\b([bcdfghjklmnpqrstvwxyz]):(\[\[.*?\]\])')
for sm_match in sm_iter_re.finditer(body):
    sm = sm_match.group(1)
    array_body = sm_match.group(2)
    for ym, ch in re.findall(r'\["([^"]+)","([^"]+)"\]', array_body):
        all_entries.append((sm, ym, ch))

print(f"  SYLLABLES 共 {len(all_entries)} 条")
samples = random.sample(all_entries, min(50, len(all_entries)))

# 把每条 (sm, ym, ch) 转成 js 测试输入 {sm, ym_base(去声调), tone(1-4), answer_syl, ch}
TONE_NUM_FULL = {v:(k,t+1) for k,vs in TONE_CHAR.items() for t,v in enumerate(vs)}
def split_tone(s):
    base = ''
    tone = None
    for c in s:
        if c in TONE_NUM_FULL:
            base += TONE_NUM_FULL[c][0]
            tone = TONE_NUM_FULL[c][1]
        else:
            base += c
    return base, tone

js_input = []
for sm, ym, ch in samples:
    ym_base, tone = split_tone(ym)
    # answer 是声母+带声调的韵母（如 xū），不是单独韵母 ū
    js_input.append({'sm': sm, 'ym_base': ym_base, 'tone': tone, 'answer_syl': sm + ym, 'ch': ch})

# 写 node 脚本测试
node_script = src + "\nconst tests = " + json.dumps(js_input, ensure_ascii=False) + ";\n"
node_script += """
let fail = 0;
for (const t of tests) {
  const userSyl = pyJoin(t.sm, '', t.ym_base, String(t.tone));
  const ansSyl = t.answer_syl;
  const ok = userSyl === ansSyl;
  if (!ok) { console.log('FAIL', t.ch, JSON.stringify(userSyl), 'vs', JSON.stringify(ansSyl)); fail++; }
}
console.log(fail + '/' + tests.length + ' mismatches');
if (fail > 0) process.exit(1);
"""
res = subprocess.run([r'C:\Users\Beekay\.workbuddy\binaries\node\versions\22.22.2-2\node.exe', '-e', node_script], capture_output=True, text=True)
print("  " + res.stdout.strip().replace('\n', '\n  '))
if res.returncode != 0:
    print("STDERR:", res.stderr)
    raise SystemExit(1)
assert '0/50 mismatches' in res.stdout, f"expected 0 mismatches, got: {res.stdout}"
print("  ✅ 50 条随机判定全部通过")

# ============== 4. 模拟 beginBattle 重入场景：直接抓 render 表达式测 -1 ==============
print("\n=== 4. 验证 render 内 repeat 不再受 -1 影响 ===")
node_script2 = """
const mHP1 = Math.max(0, Math.min(3, -1));
const mHP2 = Math.max(0, Math.min(3, 5));
const mHP3 = Math.max(0, Math.min(3, 2));
console.log('clamp(-1)=' + mHP1 + ', clamp(5)=' + mHP2 + ', clamp(2)=' + mHP3);
console.log('repeats:', '❤️'.repeat(mHP1) + '🖤'.repeat(3-mHP1));
console.log('OK');
"""
res2 = subprocess.run([r'C:\Users\Beekay\.workbuddy\binaries\node\versions\22.22.2-2\node.exe', '-e', node_script2], capture_output=True, text=True)
print("  " + res2.stdout.strip().replace('\n', '\n  '))
assert res2.returncode == 0
assert 'clamp(-1)=0' in res2.stdout, "clamp(-1) 应该返回 0"

print("\n🎉 全部验证通过！")
