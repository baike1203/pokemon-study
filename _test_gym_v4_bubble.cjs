/* 道馆 v4：台词气泡节流 + 馆主受击动画 回归
   验：答对 1~4 题不说话 / 第 5 题说话且自动淡出 / 答错立刻说话 / 每次答对触发受击 animate
   运行：NODE_PATH=C:/Users/Beekay/.workbuddy/binaries/node/workspace/node_modules node _test_gym_v4_bubble.cjs */
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
  return m[0].replace(/^const /, 'var ');
}

const dom = new JSDOM('<!DOCTYPE html><html><body>' +
  '<div id="overlay"><div id="dialogBox"><div id="dialogContent"></div>' +
  '<button id="dialogClose"></button></div></div></body></html>',
  { runScripts: 'outside-only', url: 'https://local.test/' });
const w = dom.window;

w.__hits = [];                        // 受击 animate 调用记录
w.HTMLImageElement.prototype.animate = function (frames, opts) {
  w.__hits.push({ frames: frames.length, dur: opts && opts.duration });
  return { cancel() {} };
};
w.__openDialog = (body) => { w.document.getElementById('dialogContent').innerHTML = body; w.document.getElementById('overlay').style.display = 'flex'; };
w.__closeDialog = () => { w.document.getElementById('dialogContent').innerHTML = ''; };
w.__bindNumPad = () => ({ detach() {} });
w.__bindPinyinPad = () => ({ detach() {} });
w.__sfx = { correct() {}, wrong() {}, click() {}, hit() {}, miss() {}, drum() {}, whoosh() {} };
w.__speak = () => {};
w.__recordAccuracy = () => {};
w.__startMathGuide = () => {};
w.__questions = Array.from({ length: 24 }, (_, i) => ({ id: 'q' + i, prompt: 'Q' + i, options: ['对', '错'], answer: '对' }));
w.__gymStatus = () => ({ canPlay: true, boss: 25, triesLeft: 1 });
w.__gymQuestions = () => w.__questions.map(q => Object.assign({}, q));
/* 真实 gymArenaBuild 会建 #gymBoss 与 #gymTalkBubble，桩里补上 */
w.__arenaBuilt = 0; w.__arenaDestroyed = 0;
w.__arenaBuild = () => {
  w.__arenaBuilt++;
  if (!w.document.getElementById('gymBoss')) {
    const img = w.document.createElement('img');
    img.id = 'gymBoss'; img.className = 'ar-boss';
    w.document.body.appendChild(img);
  }
  if (!w.document.getElementById('gymTalkBubble')) {
    const b = w.document.createElement('div');
    b.id = 'gymTalkBubble'; b.className = 'ar-bubble';
    b.textContent = '来吧，让我看看你的实力！';
    w.document.body.appendChild(b);
  }
};
w.__arenaPlay = cb => cb();
w.__arenaDim = () => {};
w.__arenaDestroy = () => { w.__arenaDestroyed++; };
w.__win = []; w.__fail = [];
w.__finishWin = (right, hp) => w.__win.push({ right, hp });
w.__finishFail = (right, hp) => w.__fail.push({ right, hp });

w.eval([
  'var quizToken = 0;',
  'var $=s=>document.querySelector(s);',
  'var openDialog=__openDialog, closeDialog=__closeDialog;',
  'var bindNumPad=__bindNumPad, bindPinyinPad=__bindPinyinPad;',
  'var sfx=__sfx, speak=__speak, recordAccuracy=__recordAccuracy;',
  'var pick=function(a){return a.slice(0,1);};',
  'var startMathGuide=__startMathGuide;',
  'var NUMPAD_KEYS="", PY_BOARD="", PY_TONE_ROW="", PY_FN_KEYS="", pyNormalize=x=>x;',
  'var gymStatus=__gymStatus, gymQuestions=__gymQuestions;',
  'var gymArenaBuild=__arenaBuild, gymArenaPlay=__arenaPlay, gymArenaDim=__arenaDim, gymArenaDestroy=__arenaDestroy;',
  'var gymArenaEl=function(){return document.getElementById("gymArena")||document.body;};',
  'var finishGymBattle=__finishWin, finishGymBattleFail=__finishFail;',
  grabLine('const GYM_QUESTION_TOTAL'), grabLine('const GYM_WIN_RIGHT'), grabLine('const GYM_MY_HP'),
  grabFn('gymNeedRight'), grabFn('gymHpHtml'), grabFn('runQuiz'), grabFn('startGymBattle')
].join('\n;\n'));

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bubble = () => w.document.getElementById('gymTalkBubble');
const bubbleShown = () => !!(bubble() && bubble().classList.contains('show'));
const click = (txt) => {
  const b = [...w.document.querySelectorAll('.opt-btn')].find(x => x.textContent.trim() === txt);
  if (!b) throw new Error('没找到选项 ' + txt);
  b.click();
};

(async () => {
  w.eval('startGymBattle()');
  const b0 = bubble().textContent;
  check(b0 === '来吧，让我看看你的实力！', '入场台词文案异常：' + b0);

  /* ---------- 1. 连对 4 题：一句都不说，show 不出现 ---------- */
  for (let i = 0; i < 4; i++) { click('对'); await sleep(1050); }
  check(!bubbleShown(), '答对 1~4 题不应弹台词，实际 shown=' + bubbleShown());
  check(bubble().textContent === b0, '答对 1~4 题台词被改动了：' + bubble().textContent);

  /* ---------- 2. 第 5 题答对：说第 1 句且短暂显示后自动淡出 ---------- */
  click('对'); await sleep(300);
  check(bubbleShown(), '第 5 题答对应弹台词');
  check(bubble().textContent === '漂亮！这一击我记住了。', '第 5 题台词应为第 1 句，实际 ' + bubble().textContent);
  await sleep(2200);
  check(!bubbleShown(), '台词应在 2 秒后自动淡出，否则持续抢注意力');

  /* ---------- 3. 答错：立刻说一句（第 1 句 miss） ---------- */
  click('错'); await sleep(300);
  check(bubbleShown(), '答错应立即弹台词');
  check(bubble().textContent === '答错啦，轮到我还击了！', '第 1 次答错台词异常：' + bubble().textContent);

  /* ---------- 4. 第 10 题（累计答对 10）说第 2 句 ---------- */
  await sleep(2200);
  for (let i = 0; i < 4; i++) { click('对'); await sleep(1050); }
  check(!bubbleShown(), '答对 6~9 题不应弹台词');
  click('对'); await sleep(300);
  check(bubble().textContent === '唔……有点本事。', '第 10 题应说第 2 句，实际 ' + bubble().textContent);

  /* ---------- 5. 每次答对都触发受击 animate（含刚答的这题共 10 次） ---------- */
  check(w.__hits.length === 10, '答对 10 题应触发 10 次受击动画，实际 ' + w.__hits.length);
  check(w.__hits.every(h => h.dur === 560 && h.frames >= 6), '受击动画参数异常：' + JSON.stringify(w.__hits[0]));

  /* ---------- 6. 答错不触发馆主受击（是馆主出招打我们） ---------- */
  const before = w.__hits.length;
  click('错'); await sleep(1700);          // 等答错反馈结束、切到下一题
  check(w.__hits.length === before, '答错不应触发馆主受击动画');
  check(!bubbleShown(), '答错台词也应自动淡出');

  /* ---------- 7. 累计答对 15 题：说第 3 句 ---------- */
  for (let i = 0; i < 4; i++) { click('对'); await sleep(1050); }
  click('对'); await sleep(300);
  check(bubble().textContent === '好球！再来一题试试！', '第 15 题应说第 3 句，实际 ' + bubble().textContent);

  console.log('通过 ' + pass + ' 失败 ' + fail);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
