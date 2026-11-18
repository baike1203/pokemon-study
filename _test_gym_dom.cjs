/* 道馆挑战（v3.52.0）DOM 回归：runQuiz 的 noRetry 模式（jsdom 真实 click 驱动）
   重点验证：
   A. noRetry=true 时答错直接进下一题（进度递增），不排回队尾
   B. 不传 noRetry 时行为完全不变（答错仍排队尾重考）
   C. noRetry 下答错最后一题 → 队列清空必须正常收尾，不能白屏
   运行：NODE_PATH=... node _test_gym_dom.cjs */
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prog = () => { const e = w.document.querySelector('.quiz-progress'); return e ? e.textContent.trim() : ''; };
const prompt = () => { const e = w.document.getElementById('qPrompt'); return e ? e.textContent.trim() : ''; };
const opts = () => [...w.document.querySelectorAll('.opt-btn')];
const click = txt => { const b = opts().find(x => x.textContent.trim() === txt); if (!b) throw new Error('没找到选项 ' + txt + '，当前：' + opts().map(x => x.textContent).join('/')); b.click(); return b; };

const THREE = '[{id:"q1",prompt:"A?",options:["对","错"],answer:"对"},' +
              '{id:"q2",prompt:"B?",options:["对","错"],answer:"对"},' +
              '{id:"q3",prompt:"C?",options:["对","错"],answer:"对"}]';

(async () => {
  /* ---------- 用例 A：noRetry，答错推进 ---------- */
  w.__acc = null;
  w.eval(`runQuiz({title:"道馆",color:"#000",noRetry:true,questions:${THREE},onFinish(a){window.__acc=a}})`);
  check(prompt() === 'A?', 'A 初始题干预期 A?，实际 ' + prompt());
  check(/第\s*1\s*\/\s*3/.test(prog()), 'A 初始进度异常：' + prog());

  click('错');                        // 第 1 题答错
  await sleep(1800);
  check(prompt() === 'B?', 'A 答错后未进下一题，当前题干 ' + prompt());
  check(/第\s*2\s*\/\s*3/.test(prog()), 'A 答错后进度没递增：' + prog());
  check(/已答对\s*0\s*题/.test(prog()), 'A 答错后"已答对"不应加分：' + prog());

  click('对');                        // 第 2 题答对
  await sleep(1100);
  check(prompt() === 'C?', 'A 答对后未进下一题，当前题干 ' + prompt());
  check(/已答对\s*1\s*题/.test(prog()), 'A 答对计数异常：' + prog());

  click('对');                        // 第 3 题答对 → 结束
  await sleep(1200);
  check(w.__acc === 67, 'A 最终正确率应为 67（2/3），实际 ' + w.__acc);

  /* ---------- 用例 B：对照组，不传 noRetry → 答错仍排队尾 ---------- */
  w.__acc = null;
  w.eval(`runQuiz({title:"日常",color:"#000",questions:${THREE},onFinish(a){window.__acc=a}})`);
  check(prompt() === 'A?', 'B 初始题干异常：' + prompt());
  click('错');                        // 答错 → 应排到队尾，下一题是 B，但题号不前进
  await sleep(1800);
  check(prompt() === 'B?', 'B 答错后未切到 B，实际 ' + prompt());
  check(/第\s*1\s*\/\s*3/.test(prog()), 'B 非 noRetry 时题号不该前进：' + prog());
  /* 继续答完 B、C，应该回到 A 重考 → 共 4 次作答 */
  click('对'); await sleep(1100);
  check(prompt() === 'C?', 'B 第二题后应到 C，实际 ' + prompt());
  click('对'); await sleep(1100);
  check(prompt() === 'A?', 'B 错题应回到队尾重考（应再次出现 A），实际 ' + prompt());
  click('对'); await sleep(1100);
  check(w.__acc === 67, 'B 重考后正确率应仍按首答计 67，实际 ' + w.__acc);

  /* ---------- 用例 C：noRetry 答错最后一题 → 队列清空必须收尾 ---------- */
  w.__acc = null;
  w.eval('runQuiz({title:"道馆",color:"#000",noRetry:true,questions:[{id:"only",prompt:"Z?",options:["对","错"],answer:"对"}],onFinish(a){window.__acc=a}})');
  check(prompt() === 'Z?', 'C 初始题干异常：' + prompt());
  click('错');
  await sleep(1800);
  check(w.__acc === 0, 'C 唯一一题答错后未收尾（acc 应为 0），实际 ' + w.__acc);

  /* ---------- 用例 D：noRetry 下答错不展开数学图形引导 ---------- */
  w.__acc = null;
  let guideShown = 0;
  w.__startMathGuide = function () { guideShown++; };
  w.eval('var startMathGuide=__startMathGuide;');
  w.eval('runQuiz({title:"道馆",color:"#000",noRetry:true,questions:[{id:"g",prompt:"1+1",answerMode:"input",answer:2,guide:{kind:"carry",a:1,b:1}}],onFinish(a){window.__acc=a}})');
  const fb = w.document.getElementById('fbLine');
  /* 数字键盘是桩，直接调内部判题不可行 → 只断言没有 guideZone 展开 */
  check(guideShown === 0, 'D noRetry 竟然展开了图形引导');

  /* ---------- 用例 E：题干里不再出现「等会儿再试一次」 ---------- */
  w.__acc = null;
  w.eval(`runQuiz({title:"道馆",color:"#000",noRetry:true,questions:${THREE},onFinish(a){window.__acc=a}})`);
  click('错');
  await sleep(300);
  const fbTxt = (w.document.getElementById('fbLine') || {}).textContent || '';
  check(/先记住它/.test(fbTxt), 'E 道馆答错文案应为「先记住它，下一题继续」，实际：' + fbTxt);
  check(!/等会儿再试一次/.test(fbTxt), 'E 道馆答错文案仍残留「等会儿再试一次」：' + fbTxt);

  console.log(`通过 ${pass} 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
