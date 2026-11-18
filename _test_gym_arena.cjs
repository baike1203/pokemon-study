/* 道馆对战场景（v3.53.0）DOM 回归
   覆盖：场景构建（灯/看台/观众/馆主/名字）/ 观众布局确定性 / 跳过 / reduced-motion 直进答题
        / dim 停应援 / HP 条随答对缩短 / 销毁与 closeDialog 收层
   运行：NODE_PATH="C:/Users/Beekay/.workbuddy/binaries/node/workspace/node_modules" node _test_gym_arena.cjs */
const fs = require('fs');
const { JSDOM } = require('jsdom');
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
  throw new Error('未找到函数 ' + name);
}
/* const 在 eval 的词法环境里，同批函数看不到 → 改写成 globalThis.X */
function grabConst(name) {
  const m = new RegExp('^const ' + name + '\\s*=', 'm').exec(html);
  if (!m) throw new Error('未找到常量 ' + name);
  const b = m.index + m[0].length;
  let d = 0, s = null, e = false, started = false;
  for (let i = b; i < html.length; i++) {
    const ch = html[i];
    if (e) { e = false; continue; }
    if (s) { if (ch === '\\') { e = true; continue; } if (ch === s) s = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { s = ch; started = true; continue; }
    if (ch === '[' || ch === '{' || ch === '(') { d++; started = true; }
    else if (ch === ']' || ch === '}' || ch === ')') d--;
    else if (ch === ';' && d === 0 && started) return 'globalThis.' + name + ' =' + html.slice(b, i + 1);
    else if (!/\s/.test(ch)) started = true;
  }
  throw new Error('常量解析失败 ' + name);
}

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>',
  { runScripts: 'outside-only', url: 'https://local.test/' });
const w = dom.window;

/* ---------- 桩 ---------- */
w.__reduce = false;
w.matchMedia = () => ({ matches: w.__reduce, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.__today = '2026-11-18';
w.__state = { name: '苏打', mathDiff: 'g1exam', dex: [149], shinyDex: [], evoStage: {} };
w.__q24 = Array.from({ length: 24 }, (_, i) => ({ id: 'gym' + i, prompt: 'Q' + i, options: ['1', '2'], answer: '1' }));
w.__quizOpts = null;

const SRC = [
  'var todayStr=function(){ return "2026-11-18"; };',
  'var state=__state;',
  'var saveState=function(){};',
  'var tone=function(){};',
  'var sfx={ reward(){}, click(){}, correct(){}, wrong(){} };',
  'var shinySpriteUrl=function(id){ return "assets/sprites/home/shiny_"+id+".png"; };',
  'var displayId=function(id){ return id; };',
  'var runQuiz=function(o){ __quizOpts=o; };',
  'var finishGymBattle=function(){};',
  'var gymStatus=function(){ return { canPlay:true, boss:149, cleared:false, tries:0, triesLeft:1 }; };',
  'var gymQuestions=function(){ return __q24.slice(); };',
  'var busyStudying=false, activeModule=null, onDialogClose=null;',
  'var quizToken=0, gymCinema=false;',
  'var gymCatchSequence=function(boss, right, hp){ __catch = { boss:boss, right:right, hp:hp }; };',
  'var __catch=null;',
  'var overlay=(function(){ var d=document.getElementById("overlay"); if(!d){ d=document.createElement("div"); d.id="overlay"; document.body.appendChild(d);} return d; })();',
  'var stopSpeak=function(){};',
  'var spriteUrl=function(id){return "sprite"+id+".png";};',
  'var emojiFor=function(){return "";};',
  'var gymArenaTimers=[], gymArenaFinished=false;',
  grabConst('AR_CROWD_COLORS'),
  grab('gymHash'),
  grabConst('GYM_ARENA_MS'),
  grabConst('GYM_QUESTION_TOTAL'),
  grabConst('GYM_WIN_RIGHT'),
  grabConst('GYM_MY_HP'),
  grab('gymArenaEl'),
  grab('arenaRand'),
  grab('gymArenaDestroy'),
  grab('gymArenaBuild'),
  grab('gymArenaPlay'),
  grab('gymArenaDim'),
  grab('gymNeedRight'),
  grab('gymHpHtml'),
  grab('startGymBattle'),
  grab('closeDialog'),
  'window.__API={ gymArenaBuild, gymArenaPlay, gymArenaDim, gymArenaDestroy, gymArenaEl, gymHpHtml, gymNeedRight, startGymBattle, closeDialog, GYM_ARENA_MS };'
].join('\n;\n');

/* 在 jsdom 的 window 全局里求值：document / window / matchMedia 才可用 */
w.eval(grabConst('POKEMON') + '\n;\n' + grabConst('POKEDATA') + '\n;\n' + grabConst('TYPE_COLOR') + '\n;\n' + SRC);

const API = w.__API;
const q = s => w.document.querySelectorAll(s);
const one = s => w.document.querySelector(s);

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  /* ---------- A. 构建 ---------- */
  API.gymArenaBuild(149);
  const el = API.gymArenaEl();
  check(!!el, 'A 场景未生成');
  check(w.document.body.classList.contains('gym-live'), 'A body 未加 gym-live（overlay 不会让出背景）');
  check(q('#gymArena .ar-lamp').length === 8, 'A 灯带不是 8 盏：' + q('#gymArena .ar-lamp').length);
  check(q('#gymArena .ar-stand').length === 3, 'A 看台不是 3 层');
  check(q('#gymArena .ar-crowd').length === 3, 'A 观众层不是 3 层');
  check(q('#gymArena .ar-crowd i').length === 90, 'A 观众总数应为 90，实际 ' + q('#gymArena .ar-crowd i').length);
  check(/shiny_149\.png/.test(one('#gymArena .ar-boss').getAttribute('src')), 'A 馆主图不是 149 的闪光图');
  check(one('#gymArena .ar-boss').className.indexOf('ar-boss') >= 0, 'A 馆主节点 class 异常');
  check(/快龙/.test(one('#gymArena .ar-namebar').textContent), 'A 名字横幅没写馆主名');
  check(/闪光/.test(one('#gymArena .ar-namebar').textContent), 'A 名字横幅没标闪光');
  check(q('#gymArena .ar-spark').length === 8, 'A 星屑数量不对');

  /* ---------- B. 观众布局确定性（同日重启一致） ---------- */
  const firstLeft = q('#gymArena .ar-crowd i')[0].style.left;
  API.gymArenaBuild(149);
  const firstLeft2 = q('#gymArena .ar-crowd i')[0].style.left;
  check(firstLeft === firstLeft2, 'A 同日观众布局不稳定：' + firstLeft + ' vs ' + firstLeft2);
  check(/^\d+(\.\d+)?%$/.test(firstLeft), 'A 观众 left 不是百分比：' + firstLeft);

  /* ---------- C. 点击跳过 → 短延时后进答题 ---------- */
  let doneC = 0;
  API.gymArenaPlay(() => { doneC++; });
  const elC = API.gymArenaEl();
  check(elC.classList.contains('show'), 'C 未加 show 类');
  check(elC.classList.contains('play'), 'C 未加 play 类（动画不会播）');
  elC.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  check(doneC === 1, 'C 跳过未回调，done=' + doneC);
  elC.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  check(doneC === 1, 'C 回调被触发多次，done=' + doneC);

  /* ---------- D. reduced-motion 立即回调（同步） ---------- */
  w.__reduce = true;
  let doneD = 0;
  API.gymArenaPlay(() => { doneD++; });
  check(doneD === 1, 'D 减少动效下应立刻回调，done=' + doneD);
  w.__reduce = false;

  /* ---------- E. dim：压暗 + 停应援 ---------- */
  API.gymArenaDim();
  check(elC.classList.contains('dim'), 'E 未加 dim');
  check(elC.classList.contains('idle'), 'E 未加 idle（观众动画不会停）');
  check(elC.classList.contains('play'), 'E 不能移除 play，否则动画终态丢失、场景会变全黑');

  /* ---------- F. HP 条 ---------- */
  const h0 = API.gymHpHtml(0), h4 = API.gymHpHtml(4);
  check(/20\/20/.test(h0), 'F 满血文案错：' + h0);
  check(/width:100%/.test(h0), 'F 满血宽度应为 100%：' + h0);
  check(/16\/20/.test(h4), 'F 答对 4 题应为 16/20：' + h4);
  check(/width:80%/.test(h4), 'F 16/20 宽度应为 80%：' + h4);
  check(API.gymNeedRight() === 20, 'F 达标题数应为 20，实际 ' + API.gymNeedRight());

  /* ---------- G. startGymBattle 串场：进场后答题、答对就地掉血 ---------- */
  API.gymArenaDestroy();
  w.__reduce = true;                    // 用减少动效跳过 4.2 秒动画
  w.__quizOpts = null;
  API.startGymBattle();
  check(!!w.__quizOpts, 'G startGymBattle 没有进入答题');
  check(w.__quizOpts.noRetry === true, 'G 道馆必须一题一次机会（noRetry）');
  check(/馆主 HP/.test(w.__quizOpts.progressHTML(0)), 'G 进度行没带 HP 条：' + w.__quizOpts.progressHTML(0));
  /* 手动摆出答题卡片里的血条节点，模拟引擎首答对的回调 */
  w.document.body.insertAdjacentHTML('beforeend', API.gymHpHtml(0));
  check(!!one('#gymHpFill') && !!one('#gymHpTxt'), 'G 血条节点未渲染');
  w.__quizOpts.onAnswer({ id: 'gym0' }, true);
  check(one('#gymHpFill').style.width === '95%', 'G 答对 1 题血条应缩到 95%，实际 ' + one('#gymHpFill').style.width);
  check(/19\/20/.test(one('#gymHpTxt').textContent), 'G 答对 1 题文案应为 19/20，实际 ' + one('#gymHpTxt').textContent);
  for (let i = 0; i < 20; i++) w.__quizOpts.onAnswer({ id: 'x' + i }, true);
  check(one('#gymHpFill').style.width === '0%', 'G 血条不会归零，实际 ' + one('#gymHpFill').style.width);
  check(/0\/20/.test(one('#gymHpTxt').textContent), 'G 归零文案不对：' + one('#gymHpTxt').textContent);
  check(w.__quizOpts.onAnswer({ id: 'y' }, false) === undefined, 'G 答错不应报错');
  check(!!w.__catch && w.__catch.boss === 149, 'G 答满 20 题应进收服演出（走 gymCatchSequence）');
  w.__reduce = false;

  /* ---------- H. closeDialog 收掉场景（防残留全屏层） ---------- */
  check(!!API.gymArenaEl(), 'H 场景应仍存在');
  API.closeDialog();
  check(!API.gymArenaEl(), 'H closeDialog 后场景残留（会挡住整页）');
  check(!w.document.body.classList.contains('gym-live'), 'H body 仍带 gym-live');

  console.log('通过', pass, '失败', fail);
  process.exit(fail ? 1 : 0);
})();
