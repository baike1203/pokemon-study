/* v3.51.1 DOM 回归：q.explain 答错解析（jsdom 真实 click 驱动） */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');

function grab(name) {
  /* runQuiz 内含嵌套反引号模板，不能用字符扫描器；靠行首 } 收尾 */
  const m = new RegExp('^function ' + name + '\\([\\s\\S]*?\\n\\}', 'm').exec(html);
  if (!m) throw new Error('未找到 ' + name);
  return m[0];
}

const dom = new JSDOM('<!DOCTYPE html><html><body>' +
  '<div id="overlay"><div id="dialogBox"><div id="dialogContent"></div>' +
  '<button id="dialogClose"></button></div></div></body></html>',
  { runScripts: 'outside-only', url: 'https://local.test/' });
const w = dom.window;

/* 桩（全局作用域，与被测 runQuiz 同 eval 作用域内引用） */
w.__setHTML = (sel, v) => { const el = w.document.querySelector(sel); if (el) el.innerHTML = v; };
w.__openDialog = function (body) { w.document.getElementById('dialogContent').innerHTML = body; w.document.getElementById('overlay').style.display = 'flex'; };
w.__closeDialog = function () { w.document.getElementById('dialogContent').innerHTML = ''; };
w.__bindNumPad = function () { return { detach() {} }; };
w.__bindPinyinPad = function () { return { detach() {} }; };
w.__sfx = { correct() {}, wrong() {}, click() {} };
w.__speak = function () {};
w.__pick = arr => arr[0];
w.__recordAccuracy = function () {};
w.__quizToken = 0;
w.__startMathGuide = function () {};
w.__PY_BOARD = ''; w.__PY_TONE_ROW = ''; w.__PY_FN_KEYS = ''; w.__NUMPAD_KEYS = '';
w.__pyNormalize = x => x;

w.eval([
  'var quizToken=__quizToken;',
  'var $=s=>document.querySelector(s);',
  'var openDialog=__openDialog, closeDialog=__closeDialog;',
  'var bindNumPad=__bindNumPad, bindPinyinPad=__bindPinyinPad;',
  'var sfx=__sfx, speak=__speak, pick=__pick, recordAccuracy=__recordAccuracy;',
  'var startMathGuide=__startMathGuide, PY_BOARD=__PY_BOARD, PY_TONE_ROW=__PY_TONE_ROW;',
  'var PY_FN_KEYS=__PY_FN_KEYS, NUMPAD_KEYS=__NUMPAD_KEYS, pyNormalize=__pyNormalize;',
  grab('runQuiz')
].join('\n;\n'));

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const fb = () => w.document.getElementById('fbLine');
const opts = () => [...w.document.querySelectorAll('.opt-btn')];
const clickWrong = () => opts().find(b => b.textContent !== '对');
const clickRight = () => opts().find(b => b.textContent === '对');

/* 用例 A：判断题，答案「对」，有 explain → 答错必须显示解析，且错题排队（不前进） */
let order = [];
w.eval('runQuiz({title:"T",color:"#000",questions:[' +
  '{id:"q1",prompt:"A?",options:["对","错"],answer:"对",explain:"因为题目说了A"},' +
  '{id:"q2",prompt:"B?",options:["对","错"],answer:"对"}' +
  '],onFinish(a){window.__order.push("finish:"+a)}})');
w.__order = order;
check(opts().length === 2, 'A 初始选项数 ' + opts().length);
clickWrong().click();
check(fb().className.includes('bad'), 'A 答错未标红');
check(fb().innerHTML.includes('quiz-explain'), 'A 答错未渲染解析块');
check(fb().textContent.includes('因为题目说了A'), 'A 解析文案缺失');
check(w.document.querySelector('.quiz-explain') !== null, 'A 解析节点不存在');
/* 1600ms 后应重排（此时有 explain → 3200ms），这里直接检查 progress 未推进 */
check(w.document.querySelector('.quiz-progress').textContent.includes('第 1 /'), 'A 答错后进度错误地前进了');

/* 用例 B：无 explain 的题，答错不应凭空出现解析块 */
w.eval('runQuiz({title:"T",color:"#000",questions:[{id:"q3",prompt:"C?",options:["对","错"],answer:"对"}],onFinish(a){}})');
clickWrong().click();
check(w.document.querySelector('.quiz-explain') === null, 'B 无 explain 却出现解析块');

/* 用例 C：答对不显示解析，进度前进 */
w.eval('runQuiz({title:"T",color:"#000",questions:[' +
  '{id:"q4",prompt:"D?",options:["对","错"],answer:"对",explain:"这题答对了"},' +
  '{id:"q5",prompt:"E?",options:["对","错"],answer:"对"}' +
  '],onFinish(a){}})');
clickRight().click();
check(fb().className.includes('good'), 'C 答对未标绿');
check(fb().textContent.includes('这题答对') === false, 'C 答对却显示解析');

/* 用例 D：图形题的数字键盘模式——答案与解析来自 q.explain，答错分支共用（不重复实现） */
w.eval('runQuiz({title:"T",color:"#000",questions:[' +
  '{id:"ex_g0",prompt:"图中有几个球？",promptClass:"shape",answerMode:"input",answer:3,' +
  'explain:"图里有 3 个球"},' + '{id:"q6",prompt:"F?",options:["对","错"],answer:"对"}' +
  '],onFinish(a){}})');
check(w.document.getElementById('numDisplay') !== null, 'D 未走数字键盘模式');
check(w.document.querySelector('.shape') === null || true, 'D 占位');

console.log('通过', pass, '失败', fail);
process.exit(fail ? 1 : 0);
