/* 道馆挑战（v3.52.0）回归测试
   覆盖：各档位出题器 / 道馆组卷 / 馆主确定性 / 馆主池过滤 / 7天去重 / 跨天重置 / 闪光素材边界
   运行：node _test_gym.cjs */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');

function grab(name) {
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
  const m1 = new RegExp('^const ' + name + '\\s*=', 'm').exec(html);
  if (m1) {
    const b = m1.index + m1[0].length; let d = 0, s = null, e = false, started = false;
    for (let i = b; i < html.length; i++) {
      const ch = html[i];
      if (e) { e = false; continue; }
      if (s) { if (ch === '\\') { e = true; continue; } if (ch === s) s = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { s = ch; started = true; continue; }
      if (ch === '[' || ch === '{' || ch === '(') { d++; started = true; }
      else if (ch === ']' || ch === '}' || ch === ')') d--;
      else if (ch === ';' && d === 0 && started) return html.slice(m1.index, i + 1);
      else if (!/\s/.test(ch)) started = true;   // 裸数字/标识符也算已开始，否则会多吞下一行
    }
  }
  throw new Error('未找到 ' + name);
}

let pass = 0, fail = 0;
function check(ok, msg) { if (ok) pass++; else { fail++; console.log('✗ ' + msg); } }

/* ---------- 桩 ---------- */
globalThis.__rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
globalThis.__shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
globalThis.__pick = (arr, n) => { const c = [...arr]; globalThis.__shuffle(c); return c.slice(0, n); };
globalThis.__carry = () => null;
globalThis.__borrow = () => null;
globalThis.__today = '2026-11-18';
globalThis.__todayStr = () => globalThis.__today;
globalThis.__saveState = () => {};
globalThis.__state = {
  name: '苏打', mathDiff: '10', dex: [], shinyDex: [],
  gymDate: '', gymBossId: null, gymTries: 0, gymCleared: false, gymLog: {}
};

const SRC = [
  'var rnd=__rnd, shuffle=__shuffle, pick=__pick;',
  'var carryGuideOf=__carry, borrowGuideOf=__borrow;',
  'var todayStr=__todayStr, saveState=__saveState, state=__state;',
  grab('SHENGMU'), grab('YUNMU'), grab('ZHENGTI'),
  grab('YW_SM_CONFUSE'), grab('YW_YM_CONFUSE'), grab('YW_IDIOMS'), grab('YW_MINUS_STROKE'),
  grab('SHAPE_KINDS'), grab('shapeSvg'), grab('makeShapeCountQ'),
  grab('buildBasicQs'), grab('buildG1Qs'), grab('buildG1ExamQs'), grab('buildChineseQs'),
  grab('SHINY_READY_MAX'), grab('SHINY_EXTRA_IDS'), grab('hasShinyArt'),
  grab('GYM_TOTAL'), grab('GYM_PASS_RATE'), grab('GYM_MAX_TRIES'),
  grab('gymHash'), grab('gymBossOfToday'), grab('gymStatus'), grab('gymQuestions'),
  'globalThis.__API = { buildBasicQs, buildG1Qs, buildG1ExamQs, buildChineseQs, gymQuestions, gymBossOfToday, gymStatus, hasShinyArt, gymHash, GYM_TOTAL, GYM_PASS_RATE, GYM_MAX_TRIES, SHINY_READY_MAX, SHINY_EXTRA_IDS };'
].join('\n;\n');

const e2 = eval;
e2(SRC);
const API = globalThis.__API;
const S = globalThis.__state;

/* ---------- 1. 各档位出题器 ---------- */
['10', '20', 'mul', 'div'].forEach(d => {
  for (let i = 0; i < 400; i++) {
    const qs = API.buildBasicQs(d, 10);
    if (qs.length !== 10) { check(false, `buildBasicQs(${d}) 题数=${qs.length}`); break; }
    const ps = new Set(qs.map(q => q.prompt));
    if (ps.size !== 10) { check(false, `buildBasicQs(${d}) 有重复题干：` + qs.map(q => q.prompt).join(' | ')); break; }
    if (!qs.every(q => q.answerMode === 'input' && typeof q.answer === 'number')) { check(false, `buildBasicQs(${d}) 字段异常`); break; }
  }
});
check(true, '基础四档');

for (let i = 0; i < 300; i++) {
  const qs = API.buildG1Qs();
  if (qs.length !== 10 || new Set(qs.map(q => q.prompt)).size !== 10) { check(false, 'buildG1Qs 题数或去重异常'); break; }
}
check(true, '一年级专项');

for (let i = 0; i < 300; i++) {
  const qs = API.buildG1ExamQs();
  if (qs.length !== 10 || new Set(qs.map(q => q.prompt)).size !== 10) { check(false, 'buildG1ExamQs 题数或去重异常'); break; }
}
check(true, '一年级试卷专练');

for (let i = 0; i < 300; i++) {
  const qs = API.buildChineseQs();
  if (qs.length !== 10 || new Set(qs.map(q => q.prompt)).size !== 10) { check(false, 'buildChineseQs 题数或去重异常'); break; }
}
check(true, '语文');

/* ---------- 2. 道馆组卷：20 题、数学语文各 10、题干唯一 ---------- */
['10', '20', 'mul', 'div', 'g1', 'g1exam'].forEach(d => {
  S.mathDiff = d;
  for (let i = 0; i < 200; i++) {
    const qs = API.gymQuestions();
    if (qs.length !== 20) { check(false, `gymQuestions(${d}) 题数=${qs.length}`); break; }
    const m = qs.filter(q => q.subject === 'math').length;
    const c = qs.filter(q => q.subject === 'chinese').length;
    if (m !== 10 || c !== 10) { check(false, `gymQuestions(${d}) 数学${m}/语文${c}`); break; }
    if (new Set(qs.map(q => q.prompt)).size !== 20) { check(false, `gymQuestions(${d}) 有重复题干`); break; }
    if (!qs.every((q, idx) => q.id === 'gym' + idx)) { check(false, `gymQuestions(${d}) id 未重编`); break; }
    if (!qs.every(q => q.prompt && q.answer !== undefined)) { check(false, `gymQuestions(${d}) 字段缺失`); break; }
  }
  check(true, '组卷档位 ' + d);
});
S.mathDiff = '10';

/* ---------- 3. 馆主确定性 ---------- */
function resetGym(dex, shiny) {
  S.dex = dex; S.shinyDex = shiny || [];
  S.gymDate = ''; S.gymBossId = null; S.gymTries = 0; S.gymCleared = false; S.gymLog = {};
}
resetGym([1, 4, 7, 25, 150]);
const b1 = API.gymBossOfToday();
const b2 = API.gymBossOfToday();
const b3 = API.gymBossOfToday();
check(b1 === b2 && b2 === b3, '同一天多次调用馆主不一致：' + [b1, b2, b3].join(','));
check(b1 !== null && [1, 4, 7, 25, 150].includes(b1), '馆主不在已收服集合内：' + b1);

/* 跨天会换人（同名字同池子，换日期后哈希变化 → 大概率不同，允许偶发相同但连续 5 天不应全同） */
const seen = new Set();
for (let d = 18; d <= 22; d++) {
  globalThis.__today = `2026-11-${d}`;
  S.gymDate = ''; S.gymBossId = null;
  seen.add(API.gymBossOfToday());
}
globalThis.__today = '2026-11-18';
check(seen.size >= 2, '连续 5 天馆主完全不变（哈希可能失效）：' + [...seen].join(','));

/* ---------- 4. 馆主池过滤：无闪光图 / 已闪光 都不该当选 ---------- */
resetGym([152, 153, 154]);                      // 全部超出闪光图覆盖范围
check(API.gymBossOfToday() === null, '没有闪光素材的宝可梦竟当选馆主');

resetGym([1, 2, 3], [1, 2, 3]);                 // 全已闪光
check(API.gymBossOfToday() === null, '已全部闪光的池子仍返回了馆主');

resetGym([6, 152, 906]);                        // 6 与 906 有图，152 没有
const boss = API.gymBossOfToday();
check(boss === 6 || boss === 906, '池子过滤错误，选到了无闪光图的 152 或 null：' + boss);

/* ---------- 5. 7 天去重 ---------- */
resetGym([10, 11, 12, 13]);
S.gymLog = {
  '2026-11-17': { boss: 10 }, '2026-11-16': { boss: 11 }, '2026-11-15': { boss: 12 }
};
S.gymDate = ''; S.gymBossId = null;
const b7 = API.gymBossOfToday();
check(b7 === 13, '7 天去重失效：应只剩 13，实际 ' + b7);
/* 池子只剩最近出场过的 → 自动放宽（不能返回 null 让玩家没得玩） */
resetGym([10]);
S.gymLog = { '2026-11-17': { boss: 10 } };
S.gymDate = ''; S.gymBossId = null;
check(API.gymBossOfToday() === 10, '池子只有一只时未放宽 7 天去重');

/* ---------- 6. 跨天重置 ---------- */
resetGym([25]);
S.gymBossId = 25; S.gymDate = '2026-11-17'; S.gymTries = 2; S.gymCleared = true;
const st = API.gymStatus();
check(st.tries === 0, '跨天后 gymTries 未归零：' + st.tries);
check(st.cleared === false, '跨天后 gymCleared 未归零');
check(st.triesLeft === API.GYM_MAX_TRIES, '跨天后可用次数不对：' + st.triesLeft);

/* 当天已通关 → 不可再玩 */
S.gymDate = '2026-11-18'; S.gymBossId = 25; S.gymTries = 1; S.gymCleared = true;
check(API.gymStatus().canPlay === false, '已通关仍可再挑战');
/* 次数用完 → 不可再玩 */
S.gymCleared = false; S.gymTries = API.GYM_MAX_TRIES;
check(API.gymStatus().canPlay === false, '次数用完仍可挑战');
/* 正常 → 可玩 */
S.gymTries = 0;
check(API.gymStatus().canPlay === true, '正常状态竟不可挑战');

/* ---------- 7. 闪光素材边界 ---------- */
check(API.hasShinyArt(1) && API.hasShinyArt(151), '1-151 应都有闪光图');
check(!API.hasShinyArt(152) && !API.hasShinyArt(200), '152+ 不应标记为有闪光图');
check(API.hasShinyArt(906) && API.hasShinyArt(1000) && API.hasShinyArt(1025), '额外编号 906/1000/1025 应有闪光图');
check(API.SHINY_READY_MAX === 151, 'SHINY_READY_MAX 应为 151');
check(API.GYM_TOTAL === 20 && Math.ceil(API.GYM_TOTAL * API.GYM_PASS_RATE) === 16, '题数/门槛常量不对');
check(API.GYM_MAX_TRIES === 2, '每日次数应为 2');

/* ---------- 8. 哈希稳定性（同输入必同输出、不同日期大概率不同） ---------- */
check(API.gymHash('abc') === API.gymHash('abc'), 'gymHash 不稳定');
check(API.gymHash('2026-11-18|苏打') !== API.gymHash('2026-11-19|苏打'), 'gymHash 对不同日期无区分');

/* ---------- 9. 文件层面：151 张闪光图确实存在 ---------- */
let missing = [];
for (let i = 1; i <= 151; i++) {
  if (!fs.existsSync(__dirname + `/assets/sprites/home/shiny_${i}.png`)) missing.push(i);
}
check(missing.length === 0, '缺少闪光图：' + missing.join(','));

console.log(`通过 ${pass} 失败 ${fail}`);
process.exit(fail ? 1 : 0);
