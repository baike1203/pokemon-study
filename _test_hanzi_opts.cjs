/* 识字/拼音题「同音字进选项」检测
   目的：找出题干为拼音时，选项里出现多个与答案同音（同拼同调）的题 —— 这类题有多个正确答案，孩子答对也可能被判错。
   跑法：node _test_hanzi_opts.cjs
*/
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function grabBracket(src, startIdx, open, close) {
  let depth = 0, inStr = null, esc = false;
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') { esc = true; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('bracket not closed from ' + startIdx);
}

function grabDecl(name) {
  // const NAME = ...;  或 function NAME(...){...}
  const reConst = new RegExp('^const ' + name + ' =', 'm');
  const m1 = reConst.exec(html);
  if (m1) {
    const start = m1.index + m1[0].length;
    // 找到该语句结束的分号（跳过字符串/括号）
    let i = start, depth = 0, inStr = null, esc = false;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (esc) { esc = false; continue; }
      if (inStr) {
        if (ch === '\\') { esc = true; continue; }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if ('{[('.includes(ch)) depth++;
      else if ('}])'.includes(ch)) depth--;
      else if (ch === ';' && depth === 0) break;
    }
    const body = html.slice(start, i + 1);
    return 'globalThis.' + name + ' =' + body;
  }
  const reFn = new RegExp('^function ' + name + '\\s*\\(', 'm');
  const m2 = reFn.exec(html);
  if (m2) {
    const braceStart = html.indexOf('{', m2.index);
    return html.slice(m2.index, braceStart) + grabBracket(html, braceStart, '{', '}');
  }
  throw new Error('decl not found: ' + name);
}

const NAMES = ['pick', 'shuffle', 'EMOJI_FOR', 'HANZI_LEVELS', 'HANZI_CONFUSE', 'HANZI',
  'emojiFor', 'confuseGroup', 'randomDistractors', 'confuseDistractors', 'pyDistinctDistractors',
  'blankPhrase', 'replaceChar', 'buildHanziQ', 'makeHanziQ'];

const code = NAMES.map(grabDecl).join('\n;\n');
(0, eval)(code);

const HL = globalThis.HANZI_LEVELS;

// 统计：按难度 + 题型，检查「选项中有多个与答案同拼音（同字音）」
const ROUNDS = 3000;
let problems = [];
let stats = {};

for (const lvKey of Object.keys(HL)) {
  const lv = +lvKey;
  const bank = HL[lvKey].chars;
  const typePlan = { 0: ['emoji'], 1: ['emoji', 'pinyin'], 2: ['emoji', 'pinyin'], 3: ['pinyin', 'word'], 4: ['confuse'], 5: ['fill', 'judge'] }[lv] || ['emoji'];
  for (const type of typePlan) {
    const key = `lv${lv}/${type}`;
    stats[key] = { n: 0, bad: 0, badPinyin: 0, dupOpts: 0, samePair: 0, samples: [] };
    for (let r = 0; r < ROUNDS; r++) {
      const q = buildHanziQ(type, bank, lv, 0);
      stats[key].n++;
      const opts = q.options || [];
      // 选项内是否存在「两个字读音完全相同（同拼同调）」的对
      const pyOf = o => (bank.find(x => x[0] === o) || [])[1];
      const pys = opts.map(pyOf);
      let pairs = [];
      for (let a = 0; a < opts.length; a++) for (let b = a + 1; b < opts.length; b++) {
        if (pys[a] && pys[a] === pys[b]) pairs.push(opts[a] + '/' + opts[b]);
      }
      if (pairs.length) {
        stats[key].samePair++;
        if (stats[key].samples.length < 6) stats[key].samples.push(`题干[${q.prompt}] 选项[${opts.join(' ')}] 答案[${q.answer}] 同音对[${pairs.join(',')}]`);
      }
      // 选项重复字
      if (new Set(opts).size !== opts.length) { stats[key].dupOpts++; problems.push([key, 'DUP_OPT', q]); }
      // 题干是拼音的题：选项里除答案外，还有没有同拼音的字
      if (type === 'pinyin') {
        const ans = q.answer;
        const ansRec = bank.find(x => x[0] === ans);
        if (ansRec) {
          const py = ansRec[1];
          const same = bank.filter(x => x[1] === py).map(x => x[0]);
          const clash = opts.filter(o => o !== ans && same.includes(o));
          if (clash.length) { stats[key].badPinyin++; if (problems.length < 40) problems.push([key, 'SAME_PY', q, { py, same, clash }]); }
        }
        // 选项数不为 4
        if (opts.length !== 4) { stats[key].bad++; problems.push([key, 'OPT_COUNT=' + opts.length, q]); }
      }
      // emoji 题：必须是「有图的题」或「合法退化为看拼音选字」，图必须属于答案字
      if (type === 'emoji') {
        if (q.prompt.trim() === '这个字是？') { stats[key].bad++; problems.push([key, 'EMPTY_PROMPT', q]); }
        else if (q.prompt.includes('这个字是？')) {
          const em = globalThis.emojiFor(q.answer);
          if (!em || !q.prompt.startsWith(em)) { stats[key].bad++; problems.push([key, 'EMOJI_MISMATCH', q]); }
        } else if (q.sub === '选出正确的汉字') { /* 合法退化：该难度有图字不足 30 个 */ }
        else { stats[key].bad++; problems.push([key, 'UNKNOWN_EMOJI_BRANCH', q]); }
      }
      // 填空题：题干挖空后是否仍含答案字（等于送答案）
      if (type === 'confuse' || type === 'fill') {
        if (q.prompt && q.prompt.includes(q.answer)) { stats[key].bad++; problems.push([key, 'ANSWER_IN_PROMPT', q]); }
        if (q.prompt && q.prompt.replace(/＿/g, '').length < 1) { stats[key].bad++; problems.push([key, 'NO_CONTEXT', q]); }
      }
    }
  }
}

/* ---- 冒险对战：HANZI 老表 + makeHanziQ 独立回归 ---- */
{
  let bad = 0, dup = 0, cnt = 0, samples = [];
  for (let r = 0; r < 5000; r++) {
    const q = globalThis.makeHanziQ();
    const opts = q.options, ans = q.answer;
    if (new Set(opts).size !== opts.length) dup++;
    if (/[\u4e00-\u9fa5]/.test(q.prompt)) continue;   // 看字选拼音：选项是拼音，另判
    cnt++;
    if (opts.length !== 4) { bad++; samples.push(`选项数=${opts.length} [${opts}]`); continue; }
    const pyOf = o => { const h = globalThis.HANZI.find(x => x[0] === o); return h ? h[1] : null; };
    const pys = opts.map(pyOf).filter(Boolean);
    if (new Set(pys).size !== pys.length) {
      bad++;
      if (samples.length < 5) samples.push(`题干[${q.prompt}] 选项[${opts.join(' ')}] 答案[${ans}] 读音[${pys.join('/')}]`);
    }
  }
  console.log(`\n=== 冒险对战 makeHanziQ（看拼音选字 ${cnt} 题 / 共 5000 轮）===`);
  console.log(`答案同音或干扰互相同音 = ${bad}   选项重复 = ${dup}`);
  samples.forEach(s => console.log('  · ' + s));
}

console.log('=== 统计（每题 3000 轮）===');
for (const k of Object.keys(stats)) {
  const s = stats[k];
  const pct = (s.samePair / s.n * 100).toFixed(1);
  console.log(`${k.padEnd(14)} n=${s.n}  同音干扰=${s.badPinyin}  选项含同音对=${s.samePair}(${pct}%)  重复选项=${s.dupOpts}  其他问题=${s.bad}`);
  for (const smp of s.samples) console.log('      · ' + smp);
}
console.log('\n=== 样例（最多 40 条）===');
for (const [k, tag, q, extra] of problems) {
  console.log(tag, k, '| prompt=', JSON.stringify(q.prompt), '| options=', JSON.stringify(q.options), '| answer=', q.answer, extra ? '| ' + JSON.stringify(extra) : '');
}
