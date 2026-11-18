/* v3.51 存档与分发回归：老档补语文卡、难度迁移、隐藏态保留、模块点击分发。 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

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

const STUB = `
var BOOK_ORDER = ["gen1"];
var BOOKS = { gen1:{minId:1,maxId:151} };
function bookCapacity(g){ return 151; }
function todayStr(){ return "2026-11-18"; }
function defaultState(){ return { name:"苏打", daily:{date:"2026-11-18",done:{}}, dex:[], stat:{} }; }
var __OPENED = "";
var activeModule = null;
var state = null;
function chineseQuiz(){ __OPENED = "chinese"; }
function pinyinHome(){ __OPENED = "pinyin"; }
function mathTask(){ __OPENED = "math"; }
function hanziTask(){ __OPENED = "hanzi"; }
function poemHome(){ __OPENED = "poem"; }
function razTask(){ __OPENED = "english"; }
function writingTask(){ __OPENED = "writing"; }
function checkinTask(t){ __OPENED = "check:" + t.key; }
`;
(0, eval)(STUB + '\n' + [
  'TASKS', 'FIXED_TASK_KEYS', 'defaultModules', 'taskListOf', 'taskList', 'kindOf', 'normalizeState', 'openModule'
].map(grab).join('\n;\n'));

let fail = 0;
function check(cond, msg) { if (!cond) { fail++; console.log('  ✗ ' + msg); } }

const norm = globalThis.normalizeState;
const mod6 = () => [
  { key:'pinyin', cls:'pinyin', icon:'🔤', name:'拼音乐园', desc:'', kind:'fixed', enabled:true },
  { key:'math', cls:'math', icon:'🔢', name:'数学闯关', desc:'', kind:'fixed', enabled:true },
  { key:'hanzi', cls:'hanzi', icon:'✍️', name:'识字达人', desc:'', kind:'fixed', enabled:true },
  { key:'poem', cls:'poem', icon:'📜', name:'古诗小舟', desc:'', kind:'fixed', enabled:true },
  { key:'english', cls:'english', icon:'📖', name:'英语 RAZ', desc:'', kind:'check', enabled:true },
  { key:'writing', cls:'writing', icon:'✏️', name:'写字练习', desc:'', kind:'check', enabled:true }
];

// A：老存档（6 模块、难度 100）→ 自动补语文，难度迁 20
const A = norm({ taskModules: mod6(), mathDiff:'100', dex:[] });
check(A.taskModules.length === 7, 'A 老档应有 7 个模块，实际 ' + A.taskModules.length);
const ac = A.taskModules.find(m => m.key === 'chinese');
check(!!ac, 'A 老档没有补出语文模块');
check(ac && ac.kind === 'fixed', 'A 语文模块 kind 应为 fixed');
check(ac && ac.enabled === true, 'A 新补语文应默认开启');
check(A.mathDiff === '20', 'A 难度 100 应迁到 20，实际 ' + A.mathDiff);
check(A.taskModules.filter(m => m.key === 'chinese').length === 1, 'A 语文模块重复');

// B：50 档也迁
const B = norm({ taskModules: mod6(), mathDiff:'50', dex:[] });
check(B.mathDiff === '20', 'B 难度 50 应迁到 20，实际 ' + B.mathDiff);

// C：全新用户
const C = norm({ dex:[] });
check(C.taskModules.length === 7, 'C 新用户应有 7 个模块，实际 ' + C.taskModules.length);
check(!!C.taskModules.find(m => m.key === 'chinese'), 'C 新用户缺语文模块');

// D：家长已隐藏语文 → 不被覆盖
const mods = mod6();
mods.push({ key:'chinese', cls:'chinese', icon:'📚', name:'语文', desc:'', kind:'fixed', enabled:false });
const D = norm({ taskModules: mods, dex:[] });
const dc = D.taskModules.find(m => m.key === 'chinese');
check(dc && dc.enabled === false, 'D 被隐藏的语文不应被重新开启');
check(globalThis.taskListOf(D).length === 6, 'D 隐藏后今日任务应为 6 个，实际 ' + globalThis.taskListOf(D).length);

// E：点击分发（state 需指向含自定义模块的存档）
state = C;
state.taskModules.push({ key:'custom_1', cls:'check', name:'跳绳', kind:'check', enabled:true });
globalThis.openModule('chinese');
check(__OPENED === 'chinese', 'E 点语文卡应进 chineseQuiz，实际 ' + __OPENED);
globalThis.openModule('math');
check(__OPENED === 'math', 'E 点数学卡应进 mathTask，实际 ' + __OPENED);
globalThis.openModule('custom_1');
check(__OPENED === 'check:custom_1', 'E 自定义模块应进打卡，实际 ' + __OPENED);

console.log('存档/分发用例：A 老档补齐 ✅  B 难度迁移 ✅  C 新用户 ✅  D 隐藏态保留 ✅  E 点击分发 ✅');
console.log(fail === 0 ? '全部通过 ✅' : '失败 ' + fail + ' 项 ❌');
process.exit(fail === 0 ? 0 : 1);
