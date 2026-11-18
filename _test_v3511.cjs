/* v3.51.1 出题器回归：立体图形计数题 */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');

/* 间接 eval 进全局作用域：function 声明可逸出，const 改写为 globalThis */
function grab(name) {
  const m1 = new RegExp('^const ' + name + ' =', 'm').exec(html);
  if (m1) {
    let i = m1.index + m1[0].length, d = 0, s = null, e = false;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (e) { e = false; continue; }
      if (s) { if (ch === '\\') { e = true; continue; } if (ch === s) s = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { s = ch; continue; }
      if ('{[('.includes(ch)) d++;
      else if ('}])'.includes(ch)) d--;
      else if (ch === ';' && d === 0) break;
    }
    return 'globalThis.' + name + ' =' + html.slice(m1.index + m1[0].length, i + 1);
  }
  const m2 = new RegExp('^function ' + name + '\\s*\\(', 'm').exec(html);
  if (m2) {
    const b = html.indexOf('{', m2.index); let d = 0, s = null, e = false;
    for (let i = b; i < html.length; i++) {
      const ch = html[i];
      if (e) { e = false; continue; }
      if (s) { if (ch === '\\') { e = true; continue; } if (ch === s) s = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { s = ch; continue; }
      if (ch === '{') d++;
      else if (ch === '}') { d--; if (d === 0) return html.slice(m2.index, i + 1); }
    }
  }
  throw new Error('未找到 ' + name);
}

/* 桩：间接 eval 在全局作用域执行，用不同名字避免 var 提升自赋值变 undefined */
globalThis.__rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
globalThis.__shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
globalThis.__pick = (arr, n) => { const c = [...arr]; globalThis.__shuffle(c); return c.slice(0, n); };
globalThis.__runCalled = null;
globalThis.__runQuiz = cfg => { globalThis.__runCalled = cfg; };

globalThis.__carryGuideOf = () => null;
globalThis.__borrowGuideOf = () => null;
const e2 = eval;
e2([
  'var rnd=__rnd, shuffle=__shuffle, pick=__pick, runQuiz=__runQuiz, carryGuideOf=__carryGuideOf, borrowGuideOf=__borrowGuideOf;',
  grab('SHAPE_KINDS'), grab('shapeSvg'), grab('makeShapeCountQ'),
  grab('mathQuizG1Exam'), grab('buildG1ExamQs'), grab('mathQuizG1'), grab('buildG1Qs')
].join('\n;\n'));

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } }

const EMOJI = /\p{Extended_Pictographic}/u;
const names = { cube: '正方体', cuboid: '长方体', sphere: '球', cylinder: '圆柱' };
const seen = new Set();
const ROUNDS = 5000;

for (let r = 0; r < ROUNDS; r++) {
  const q = globalThis.makeShapeCountQ(r);
  /* SVG 里每个 data-kind 数一遍，目标图形的 SVG 数必须等于答案 */
  const kinds = [...q.prompt.matchAll(/data-kind="(\w+)"/g)].map(m => m[1]);
  const targetName = /图中有几个(.+？|.+？)/.exec(q.prompt);
  /* 从目标文字反推目标 key：explain 中「所以X有 N 个」 */
  const m = /所以(.+?)有 (\d+) 个/.exec(q.explain);
  check(!!m, 'explain 格式错: ' + q.explain);
  if (!m) continue;
  const targetKey = Object.keys(names).find(k => names[k] === m[1]);
  check(!!targetKey, '目标形体名不认识: ' + m[1]);
  check(kinds.filter(k => k === targetKey).length === q.answer,
    'SVG 数量与答案不符: svg=' + JSON.stringify(kinds) + ' ans=' + q.answer + ' exp=' + q.explain);
  check(kinds.length >= 2 && kinds.length <= 8, '图形总数超范围: ' + kinds.length);
  check(new Set(kinds).size === 2, '应恰好两种形体: ' + JSON.stringify(kinds));
  check(!EMOJI.test(q.prompt) && !EMOJI.test(q.explain), '出现 emoji（会教错形体概念）');
  check(q.prompt.includes('<svg'), '缺 SVG');
  check(q.explain.includes(String(q.answer)), '解析不含正确答案');
  check(q.answerMode === 'input' && Number.isInteger(q.answer), '答案模式/类型错');
  check(q.id === 'ex_g' + r, 'id 错: ' + q.id);
  kinds.forEach(k => seen.add(k));
}

/* 四种形体都要出现过 */
check(seen.size === 4, '四种形体未全覆盖: ' + [...seen].join(','));

/* 整场 10 题、只有一道图形题、都有 explain 可选 */
globalThis.mathQuizG1Exam();
const qs = __runCalled.questions;
check(qs.length === 10, '整场题数=' + qs.length);
check(qs.filter(q => q.id && q.id.startsWith('ex_g')).length === 1, '图形题不是 1 道');
check(qs.every(q => q.prompt && q.answer !== undefined), '题目字段缺失');

/* 同一场里不许出现两道完全相同的题（题干相同即视作同题）。
   v3.51.2 前：十位个位 / 比大小 / 括号填数各有 2 题，随机值撞车就会出重复。 */
function assertNoDup(fn, tag, rounds) {
  let bad = 0, sample = '';
  for (let i = 0; i < rounds; i++) {
    fn();
    const list = __runCalled.questions;
    const keys = list.map(q => q.prompt.replace(/<[^>]*>/g, ''));  /* 图形 SVG 不算题干差异 */
    if (new Set(keys).size !== keys.length) {
      bad++;
      if (!sample) sample = keys.filter((k, n) => keys.indexOf(k) !== n).join(' / ');
    }
  }
  check(bad === 0, tag + ' 出现重复题 ' + bad + '/' + rounds + ' 场，例：' + sample);
}
assertNoDup(globalThis.mathQuizG1Exam, 'g1exam', 3000);
assertNoDup(globalThis.mathQuizG1, 'g1', 3000);

console.log('通过', pass, '失败', fail, '｜形体覆盖', [...seen].join('/'));
process.exit(fail ? 1 : 0);
