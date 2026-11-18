/* v3.51.4 DOM 回归：测试模式开关默认隐藏，连点「云端语音保存」5 次才露出；
   开启仍需密码 112233，关闭后立即重新隐藏并上锁。 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');

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
    return 'var ' + name + ' =' + html.slice(m1.index + m1[0].length, i + 1);
  }
  const m = new RegExp('^function ' + name + '\\([\\s\\S]*?\\n\\}', 'm').exec(html);
  if (!m) throw new Error('未找到 ' + name);
  return m[0];
}

const CODE = [
  'var $=s=>document.querySelector(s);',
  'var sfx=__sfx, openDialog=__openDialog, closeDialog=__closeDialog;',
  'var toast=__toastFn, state=__state, saveState=__saveState, applyTestMode=__applyTestMode;',
  'var speakWorker=__speakWorker;',
  'var testSwitchUnlocked=false, ttsSaveClicks=0, ttsSaveLastAt=0;',
  grab('applyTestSwitchVisibility'), grab('TEST_MODE_PWD'),
  grab('bindSettingsTTS'), grab('bindSettingsTest'),
  'bindSettingsTTS(); bindSettingsTest(); applyTestSwitchVisibility();'
].join('\n;\n');

function makeEnv(initialTestMode) {
  const dom = new JSDOM('<!DOCTYPE html><html><body>' +
    '<div id="testModeRow"><button id="testSwitch"></button></div>' +
    '<input id="ttsWorker"><div id="ttsStatus"></div>' +
    '<button id="ttsSave"></button><button id="ttsTest"></button><audio id="ttsManual"></audio>' +
    '<div id="dialogContent"></div></body></html>',
    { runScripts: 'outside-only', url: 'https://pokemon-study.pages.dev/?dev=1' });
  const w = dom.window;
  w.__dlg = ''; w.__toast = ''; w.__saved = 0; w.__applied = 0;
  w.__openDialog = b => { w.__dlg = b; w.document.getElementById('dialogContent').innerHTML = b; };
  w.__closeDialog = () => { w.__dlg = ''; w.document.getElementById('dialogContent').innerHTML = ''; };
  w.__toastFn = m => { w.__toast = m; };
  w.__sfx = { click() {} };
  w.__speakWorker = function () {};
  w.__state = { testMode: !!initialTestMode, ttsWorker: '' };
  w.__saveState = () => { w.__saved++; };
  w.__applyTestMode = () => { w.__applied++; };
  w.eval(CODE);
  return {
    w,
    row: () => w.document.getElementById('testModeRow'),
    sw: () => w.document.getElementById('testSwitch'),
    save: () => w.document.getElementById('ttsSave').click(),
    enter: pwd => {
      const inp = w.document.getElementById('testPwdInput');
      if (!inp) throw new Error('密码框没打开');
      inp.value = pwd;
      w.document.getElementById('testPwdOk').click();
    }
  };
}

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

/* A：浏览器 + ?dev=1 —— 入口默认隐藏，连点 5 次才出现，密码 112233 */
const a = makeEnv();
check(a.row().style.display === 'none', 'A 测试开关常态未隐藏');
for (let i = 0; i < 4; i++) a.save();
check(a.row().style.display === 'none', 'A 点 4 次保存就露出了开关');
a.save();
check(a.row().style.display !== 'none', 'A 点 5 次保存仍未露出开关');
a.sw().click();
check(a.w.__dlg.includes('请输入测试模式密码'), 'A 未弹密码框');
check(a.w.__state.testMode === false, 'A dev=1 仍然免密');
a.enter('000000');
check(a.w.__state.testMode === false && a.w.__toast.includes('密码错误'), 'A 错误密码通过');
a.sw().click();
a.enter('112233');
check(a.w.__state.testMode === true, 'A 正确密码未开启');
check(a.w.__saved === 6 && a.w.__applied === 1, 'A 保存次数/应用次数异常：' + a.w.__saved + '/' + a.w.__applied);
a.sw().click();
check(a.w.__state.testMode === false, 'A 关闭失败');
check(a.row().style.display === 'none', 'A 关闭后开关未立即隐藏');
for (let i = 0; i < 4; i++) a.save();
check(a.row().style.display === 'none', 'A 关闭后没重新上锁（4 次就露出）');

/* B：APK 原生校验优先 —— 前端 112233 不再直接生效 */
const b = makeEnv();
b.w.PokeBridge = { verifyTestCode: p => p === 'from-native' };
b.evalReload = null;
for (let i = 0; i < 5; i++) b.save();
b.sw().click();
b.enter('112233');
check(b.w.__state.testMode === false, 'B 原生拒绝的密码竟然通过');
b.sw().click();
b.enter('from-native');
check(b.w.__state.testMode === true, 'B 原生接受的密码未通过');

/* C：测试模式已开启时重新打开设置，开关仍可见（否则没法关） */
const c = makeEnv(true);
check(c.row().style.display !== 'none', 'C 测试模式开启时重载，开关被隐藏');
c.sw().click();
check(c.w.__state.testMode === false && c.row().style.display === 'none', 'C 关闭后未立即隐藏');

console.log('通过', pass, '失败', fail);
process.exit(fail ? 1 : 0);
