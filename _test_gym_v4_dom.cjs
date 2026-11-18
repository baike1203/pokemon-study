/* 道馆 v4 DOM 回归（jsdom 真实 click 驱动）
   验：20 对提前结算 / 第 3 错撑住暂停 / 第 4 错当场失败 / 双血条数值正确
   运行：NODE_PATH=C:/Users/Beekay/.workbuddy/binaries/node/workspace/node_modules node _test_gym_v4_dom.cjs */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/' + (process.env.GYM_HTML || 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function grabFn(name) {
  const m = new RegExp('^function ' + name + '\\([\\s\\S]*?\\n\\}', 'm').exec(html);
  if (!m) throw new Error('未找到 ' + name);
  return m[0];
}
function grabLine(prefix) {
  const m = new RegExp('^' + prefix + '.*$', 'm').exec(html);
  if (!m) throw new Error('未找到 ' + prefix);
  return m[0];
}

const dom = new JSDOM('<!DOCTYPE html><html><body>' +
  '<div id="overlay"><div id="dialogBox"><div id="dialogContent"></div>' +
  '<button id="dialogClose"></button></div></div></body></html>',
  { runScripts: 'outside-only', url: 'https://local.test/' });
const w = dom.window;

w.__openDialog = function (body) { w.document.getElementById('dialogContent').innerHTML = body; w.document.getElementById('overlay').style.display = 'flex'; };
w.__closeCount = 0;
w.__closeDialog = function () { w.__closeCount++; w.document.getElementById('dialogContent').innerHTML = ''; };
w.__bindNumPad = () => ({ detach() {} });
w.__bindPinyinPad = () => ({ detach() {} });
w.__sfx = { correct() {}, wrong() {}, click() {} };
w.__speak = () => {};
w.__pick = arr => arr[0];
w.__recordAccuracy = () => {};
w.__startMathGuide = () => {};
w.__questions = Array.from({ length: 24 }, (_, i) => ({ id: 'q' + i, prompt: 'Q' + i, options: ['对', '错'], answer: '对' }));
w.__gymStatus = () => ({ canPlay: true, boss: 25, triesLeft: 1 });
w.__gymQuestions = () => w.__questions.map(q => Object.assign({}, q));
w.__arenaBuild = () => { w.__arenaBuilt++; };
w.__arenaPlay = cb => cb();
w.__arenaDim = () => {};
w.__arenaDestroy = () => { w.__arenaDestroyed++; };
w.__arenaBuilt = 0; w.__arenaDestroyed = 0;
w.__win = []; w.__fail = []; w.__catch = [];

/* 结算函数打桩：只记录调用，避免依赖完整 state/DOM。
   v4.1 起胜利不再直接调 finishGymBattle，而是先进「收服演出」（gymCatchSequence），
   演出结束后由它自己落库 + 弹窗，所以这里改盯 gymCatchSequence 的入参。 */
w.__finishWin = (right, hp) => w.__win.push({ right, hp });
w.__finishFail = (right, hp) => w.__fail.push({ right, hp });
w.__catchSeq = (boss, right, hp) => w.__catch.push({ boss, right, hp });

w.eval([
  'var quizToken = 0;',
  'var $=s=>document.querySelector(s);',
  'var openDialog=__openDialog, closeDialog=__closeDialog;',
  'var bindNumPad=__bindNumPad, bindPinyinPad=__bindPinyinPad;',
  'var sfx=__sfx, speak=__speak, pick=__pick, recordAccuracy=__recordAccuracy;',
  'var startMathGuide=__startMathGuide;',
  'var NUMPAD_KEYS="", PY_BOARD="", PY_TONE_ROW="", PY_FN_KEYS="", pyNormalize=x=>x;',
  'var gymStatus=__gymStatus, gymQuestions=__gymQuestions;',
  'var gymArenaBuild=__arenaBuild, gymArenaPlay=__arenaPlay, gymArenaDim=__arenaDim, gymArenaDestroy=__arenaDestroy;',
  'var gymArenaEl=function(){return null;};',
  'var finishGymBattle=__finishWin, finishGymBattleFail=__finishFail, gymCatchSequence=__catchSeq;',
  grabLine('const GYM_QUESTION_TOTAL').replace(/^const /, 'var '),
  grabLine('const GYM_WIN_RIGHT').replace(/^const /, 'var '),
  grabLine('const GYM_MY_HP').replace(/^const /, 'var '),
  grabFn('gymNeedRight'), grabFn('gymHpHtml'), grabFn('runQuiz'), grabFn('startGymBattle')
].join('\n;\n'));

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prompt = () => { const e = w.document.getElementById('qPrompt'); return e ? e.textContent.trim() : ''; };
const hpTxt = () => { const e = w.document.getElementById('gymHpTxt'); return e ? e.textContent.trim() : ''; };
const myTxt = () => { const e = w.document.getElementById('gymMyHpTxt'); return e ? e.textContent.trim() : ''; };
const prog = () => { const e = w.document.querySelector('.quiz-progress'); return e ? e.textContent.trim() : ''; };
const click = txt => {
  const b = [...w.document.querySelectorAll('.opt-btn')].find(x => x.textContent.trim() === txt);
  if (!b) throw new Error('没找到选项 ' + txt + '，当前题干 ' + prompt());
  b.click();
};

(async () => {
  /* ---------- 用例 1：常量与血条渲染 ---------- */
  check(w.GYM_QUESTION_TOTAL === 24 && w.GYM_WIN_RIGHT === 20 && w.GYM_MY_HP === 3,
    '常量不对：' + [w.GYM_QUESTION_TOTAL, w.GYM_WIN_RIGHT, w.GYM_MY_HP].join('/'));
  check(/馆主 HP 20\/20/.test(hpTxt()) === false, '开局不该有血条');
  w.eval('startGymBattle()');
  check(prompt() === 'Q0', '开局题干异常：' + prompt());
  check(hpTxt() === '馆主 HP 20/20', 'BOSS 血初始异常：' + hpTxt());
  check(myTxt() === '我方 3/3', '我方血初始异常：' + myTxt());
  check(/已答对 0 \/ 20/.test(prog()), '进度行未显示 20 目标：' + prog());
  check(!/24 题|第\s*1\s*\/\s*24/.test(prog()), '进度行不应出现 24 题进度：' + prog());
  check(w.__arenaBuilt === 1, '场景未构建');

  /* ---------- 用例 2：连对 20 题 → 提前结算，剩余题不出 ---------- */
  for (let i = 0; i < 20; i++) {
    click('对');
    await sleep(1050);
  }
  check(w.__catch.length === 1, '第 20 对后未进入收服演出，catch=' + JSON.stringify(w.__catch));
  check(w.__catch[0] && w.__catch[0].right === 20 && w.__catch[0].boss === 25,
    '收服演出入参异常（应为 馆主 25 / 答对 20）：' + JSON.stringify(w.__catch));
  check(w.__fail.length === 0, '通关却调用了失败结算');
  check(hpTxt() === '馆主 HP 0/20', 'BOSS 血未归零：' + hpTxt());
  check(prompt() === 'Q19', '第 20 对后不应再出第 21 题，当前 ' + prompt());
  await sleep(1200);
  check(w.__catch.length === 1 && prompt() === 'Q19', '提前结算后仍有旧计时器继续出题');

  /* ---------- 用例 3：错题撑住暂停 → 继续战斗 → 第 4 错失败 ---------- */
  w.__win = []; w.__fail = []; w.__catch = []; w.__arenaDestroyed = 0;
  w.eval('startGymBattle()');
  w.__closeCount = 0;   // 开局那次 closeDialog 是必要的，从这里开始盯「继续战斗」不再关窗
  for (let i = 1; i <= 3; i++) {
    click('错');
    await sleep(1700);
    if (i < 3) {
      check(myTxt() === '我方 ' + (3 - i) + '/3', `第 ${i} 错后我方血异常：` + myTxt());
      check(prompt() === 'Q' + i, `第 ${i} 错后未进下一题：` + prompt());
    }
  }
  check(!!w.document.getElementById('gymEndureGo'), '第 3 错未弹撑住对话');
  check(/再答对 20 题/.test(w.document.getElementById('dialogContent').textContent), '撑住文案未显示剩余目标');
  await sleep(1800);
  check(!!w.document.getElementById('gymEndureGo'), '撑住对话等待中被自动切题覆盖');
  check(w.__fail.length === 0, '撑住不应算失败');

  w.document.getElementById('gymEndureGo').click();
  await sleep(100);
  check(w.__closeCount === 0, '点「继续战斗」调用了 closeDialog，会销毁道馆场景跳回图鉴');
  check(prompt() === 'Q3', '点继续战斗后未恢复出题，当前 ' + prompt());
  check(myTxt() === '我方 1/3', '撑住后恢复出题我方血应为 1：' + myTxt());
  click('错');
  await sleep(1700);
  check(w.__fail.length === 1, '第 4 错未当场失败，fail=' + JSON.stringify(w.__fail));
  check(w.__fail[0] && w.__fail[0].right === 0 && w.__fail[0].hp === 0, '失败结算参数异常：' + JSON.stringify(w.__fail));
  check(w.__arenaDestroyed === 1, '失败后场景未销毁');
  check(!w.document.getElementById('gymEndureGo'), '失败后不应还能撑住');

  /* ---------- 用例 4：对 19 + 错 3 → 不提前通关，第 4 错仍失败 ---------- */
  w.__win = []; w.__fail = []; w.__catch = []; w.__arenaDestroyed = 0;
  w.eval('startGymBattle()');
  for (let i = 0; i < 19; i++) { click('对'); await sleep(1050); }
  check(w.__catch.length === 0, '19 对不应进收服演出');
  check(hpTxt() === '馆主 HP 1/20', '19 对后 BOSS 应剩 1：' + hpTxt());
  for (let i = 0; i < 3; i++) { click('错'); await sleep(1700); }
  check(w.__fail.length === 0, '错 3 次仍应撑住，不应失败');
  check(!!w.document.getElementById('gymEndureGo'), '错 3 次应弹撑住');
  w.document.getElementById('gymEndureGo').click(); await sleep(100);
  click('错'); await sleep(1700);
  check(w.__fail.length === 1 && w.__win.length === 0 && w.__catch.length === 0, '19 对后再错 4 次应失败而非通关');

  console.log('通过 ' + pass + ' 失败 ' + fail);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
