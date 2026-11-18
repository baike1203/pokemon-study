/* v3.51.3 DOM 回归：测试模式在所有环境都要输密码，?dev=1 不再免密 */
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

const dom = new JSDOM('<!DOCTYPE html><html><body>' +
  '<button id="testSwitch"></button><div id="dialogContent"></div></body></html>',
  { runScripts: 'outside-only', url: 'https://pokemon-study.pages.dev/?dev=1' });
const w = dom.window;

w.__dlg = '';
w.__toast = '';
w.__saved = 0;
w.__applied = 0;
w.__openDialog = function (body) { w.__dlg = body; w.document.getElementById('dialogContent').innerHTML = body; };
w.__closeDialog = function () { w.__dlg = ''; w.document.getElementById('dialogContent').innerHTML = ''; };
w.__toastFn = function (m) { w.__toast = m; };
w.__sfx = { click() {} };
w.__state = { testMode: false };
w.__saveState = function () { w.__saved++; };
w.__applyTestMode = function () { w.__applied++; };

function load() {
  w.eval([
    'var $=s=>document.querySelector(s);',
    'var sfx=__sfx, openDialog=__openDialog, closeDialog=__closeDialog;',
    'var toast=__toastFn, state=__state, saveState=__saveState, applyTestMode=__applyTestMode;',
    grab('TEST_MODE_PWD'), grab('bindSettingsTest'), 'bindSettingsTest();'
  ].join('\n;\n'));
}
load();

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const sw = () => w.document.getElementById('testSwitch');
const enter = pwd => {
  const inp = w.document.getElementById('testPwdInput');
  inp.value = pwd;
  w.document.getElementById('testPwdOk').click();
};

/* A：浏览器 + ?dev=1 —— 仍然弹密码框，不能直接进入 */
sw().click();
check(w.__dlg.includes('请输入测试模式密码'), 'A 未弹密码框（dev=1 仍然免密）');
check(w.__state.testMode === false, 'A dev=1 直接开启了测试模式');
enter('000000');
check(w.__state.testMode === false, 'A 错误密码竟然通过');
check(w.__toast.includes('密码错误'), 'A 错误密码未提示');
/* 输错后面板会关闭，再点一次开关重新弹密码框 */
sw().click();
enter('112233');
check(w.__state.testMode === true, 'A 正确密码未开启');
check(w.__saved === 1 && w.__applied === 1, 'A 未落盘/未应用测试模式');
check(sw().classList.contains('on'), 'A 开关未变亮');

/* B：再点一次关闭（不需要密码） */
sw().click();
check(w.__state.testMode === false && w.__saved === 2, 'B 关闭失败');

/* C：APK 原生校验路径 —— 仍走原生，不再前端比对 */
w.PokeBridge = { verifyTestCode: p => p === 'from-native' };
w.__state = { testMode: false }; w.__saved = 0; load();
sw().click();
enter('112233');
check(w.__state.testMode === false, 'C 原生拒绝的密码竟然通过');
sw().click();
enter('from-native');
check(w.__state.testMode === true, 'C 原生接受的密码未通过');

console.log('通过', pass, '失败', fail);
process.exit(fail ? 1 : 0);
