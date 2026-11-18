/* 道馆 v4.1：馆主名字随立绘走 + 胜利收服演出 回归
   验：① 名字条必须长在馆主旁边的 .ar-boss-unit 里（不再钉在左下角）
       ② 打赢不再发精灵球/超级球，只记闪光图鉴
       ③ 收服演出时序：馆主回中 → 抛球 → 白闪吸收 → 落地 → 摇三下 → 星光 → 弹窗
   运行：NODE_PATH=C:/Users/Beekay/.workbuddy/binaries/node/workspace/node_modules node _test_gym_v41_catch.cjs */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/' + (process.env.GYM_HTML || 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function grabFn(name) {
  const m = new RegExp('^function ' + name + '\\([\\s\\S]*?\\n\\}', 'm').exec(html);
  if (!m) throw new Error('未找到 ' + name);
  return m[0];
}
function grabVar(sig) {
  const m = new RegExp('^' + sig + '.*$', 'm').exec(html);
  if (!m) throw new Error('未找到 ' + sig);
  return m[0];
}

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

/* ==================== 一、静态结构：名字条必须挂在馆主身上 ==================== */
const unitHtml = /<div class="ar-boss-unit"[\s\S]*?<\/div>\s*<\/div>/.exec(
  /<div class="ar-boss-unit" id="gymBossUnit">[\s\S]*?<div class="ar-namebar">[\s\S]*?<\/div>\s*<\/div>/.exec(html)[0]
);
check(!!unitHtml, '场景 HTML 里没有「馆主立绘 + 名字条」的整体外壳 .ar-boss-unit');
check(/class="ar-boss" id="gymBoss"/.test(html), '馆主 emoji 立绘节点 class/id 变了');
check(html.indexOf('id="gymBossUnit"') < html.indexOf('class="ar-namebar"'), '名字条没有排在馆主立绘之后（应在立绘下方）');
check(/\.ar-boss-unit\.retreat \{[^}]*left: calc\(100% - var\(--boss-lane/.test(html), '归位规则不在 .ar-boss-unit 上，或没按通道宽度计算（名字条不会跟着走）');
/* v3.54.1：平板视口只有 ~960 时答题框几乎占满，必须给馆主留一条站位通道，否则整块被压在弹窗下 */
check(/body\.gym-live \{ --boss-lane: clamp\(/.test(html), '没有定义馆主站位通道 --boss-lane');
check(/body\.gym-live \.overlay \{ padding-right: calc\(var\(--boss-lane\)/.test(html), '答题期 overlay 没给馆主让位置，答题框还是会盖住它');
check(/\.ar-boss-unit\.retreat \{[^}]*\* \.5/.test(html), 'retreat 没补偿入场动画残留的 translate(-50%)，馆主会左偏半个身位');
check(/\.ar-hitring \{[^}]*calc\(var\(--boss-lane/.test(html), '受击光圈没跟着通道缩放，窄屏会歪到馆主身外');
check(/\.ar-boss-unit\.retreat \.ar-name-tag \{ display: none/.test(html), '归位后「馆主」小标签还占着通道，名字条会溢出');
check(!/\.ar-boss\.retreat/.test(html), '还留着旧的 .ar-boss.retreat，会与整体归位打架');
check(!/\.ar-namebar \{[^}]*position: absolute/.test(html), '名字条仍是绝对定位（会被钉死在左下角）');
check(!/left: 210px; bottom: 24px/.test(html), '旧的名字条左下角坐标还在');

/* 胜利不再发球 */
check(!/state\.superBalls = \(state\.superBalls \|\| 0\) \+ 1/.test(html), '胜利还在发超级球');
check(!/🎁 奖励：超级球/.test(html), '胜利弹窗还写着精灵球奖励');
check(/function commitGymWin\(/.test(html), '缺 commitGymWin（胜利落库入口）');

/* ==================== 二、DOM 时序：收服演出 ==================== */
const dom = new JSDOM('<!DOCTYPE html><html><body>' +
  '<div id="gymArena" class="play dim idle">' +
  '  <div class="ar-world"></div>' +
  '  <div class="ar-boss-unit retreat" id="gymBossUnit">' +
  '    <img class="ar-boss" id="gymBoss" src="x.png">' +
  '    <div class="ar-namebar"><span class="ar-name-tag">馆主</span><span class="ar-name-txt">✦ 闪光 快龙</span></div>' +
  '  </div>' +
  '</div>' +
  '<div id="overlay" class="show"><div id="dialogContent"></div></div>' +
  '</body></html>', { runScripts: 'outside-only', url: 'https://local.test/' });
const w = dom.window;

/* jsdom 没有 Web Animations：用记录桩顶上，断言「谁在什么时候动了」 */
w.__anims = [];
w.Element.prototype.animate = function (frames, opts) {
  w.__anims.push({ el: ((this.id || '') + ' ' + (this.className || '')).trim(), frames: frames.length, dur: opts && opts.duration });
  return { cancel() {} };
};
w.__closeN = 0; w.__destroyN = 0; w.__victory = [];
w.__commitArgs = null;
w.__gymCinemaOut = null;

w.eval([
  'var gymCinema = false;',
  'var gymArenaEl = function(){ return document.getElementById("gymArena"); };',
  'var closeDialog = function(){ __closeN++; document.getElementById("overlay").classList.remove("show"); };',
  'var gymArenaDestroy = function(){ __destroyN++; };',
  'var commitGymWin = function(boss, right, hp){ __commitArgs = { boss: boss, right: right, hp: hp }; return boss; };',
  'var showGymVictory = function(id, right){ __victory.push({ id: id, right: right, cinema: gymCinema }); };',
  'var tone = function(){};',
  'var sfx = { whoosh(){}, hit(){}, fanfare(){} };',
  'var starBurst = function(){};',
  grabFn('gymCatchSequence')
].join('\n;\n'));

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const arena = w.document.getElementById('gymArena');
  const unit = w.document.getElementById('gymBossUnit');
  const ballAnims = () => w.__anims.filter(a => /ar-ball/.test(a.el));

  w.eval('gymCatchSequence(149, 20, 1)');

  /* --- 立刻：落库、收答题框、场景点亮、馆主回中 --- */
  check(w.__commitArgs && w.__commitArgs.boss === 149 && w.__commitArgs.right === 20, '收服演出没有先落库（成绩会丢）');
  check(w.__closeN === 1, '应先收起答题框，实际 closeDialog 调用 ' + w.__closeN + ' 次');
  check(w.__destroyN === 0, '收服演出一开始就把场景拆了，演给谁看');
  check(arena.classList.contains('catch'), '场景没进 catch 状态（不会重新点亮）');
  check(!arena.classList.contains('dim') && !arena.classList.contains('idle'), '场景仍是答题期的压暗/停帧状态');
  check(unit.classList.contains('catch-center') && !unit.classList.contains('retreat'), '馆主没有从右上角回到场地中央');
  check(!!w.document.getElementById('gymCatchBall'), '没生成精灵球');
  check(!!w.document.getElementById('gymCatchFlash'), '没生成白闪层');
  check(!!w.document.getElementById('gymCatchBurst'), '没生成收服金环');
  check(w.__anims.length === 0, '第一帧就动了，球还没扔出去');

  /* --- 260ms 后：抛球，5 段弧线；飞行必须够长（剑盾那一道弧看得清轨迹） --- */
  await sleep(340);
  check(ballAnims().length === 1 && ballAnims()[0].frames === 5, '抛球动画没播或关键帧数不对：' + JSON.stringify(ballAnims()));
  check(ballAnims()[0].dur >= 800, '抛球飞得太快（' + ballAnims()[0].dur + 'ms），孩子看不清轨迹');

  /* --- 1140ms：白闪 + 馆主被吸进球 --- */
  await sleep(820);
  check(w.document.getElementById('gymCatchFlash').classList.contains('on'), '命中瞬间没有白闪');
  check(w.__anims.some(a => /gymBoss(?![A-Za-z])/.test(a.el)), '馆主没有缩进精灵球');

  /* --- 1680ms：球落地（第二次动球） --- */
  await sleep(560);
  check(ballAnims().length === 2, '球没有落地那一跳，实际动画 ' + ballAnims().length);

  /* --- 2500 / 3340 / 4220：摇三下 --- */
  await sleep(840);
  check(ballAnims().length === 3, '第 1 下摇晃没播');
  await sleep(860);
  check(ballAnims().length === 4, '第 2 下摇晃没播');
  await sleep(900);
  check(ballAnims().length === 5, '第 3 下摇晃没播');
  /* 每一下都得摇够时间，别退回 0.38s 的"催进度"节奏 */
  [3, 4, 5].forEach(i => {
    check(ballAnims()[i-1].dur >= 580, '第 ' + (i-2) + ' 下摇得太快：' + ballAnims()[i-1].dur + 'ms');
  });
  check(w.__victory.length === 0, '球还没摇完就弹了收服成功');

  /* --- 5140ms：金环炸开 --- */
  await sleep(880);
  check(w.document.getElementById('gymCatchBurst').classList.contains('on'), '收服成功没有金环炸开');

  /* --- 5680ms：弹窗，且 gymCinema 必须复位，否则关窗后场景永不销毁 --- */
  await sleep(560);
  check(w.__victory.length === 1, '收服演出结束没有弹结算');
  check(w.__victory[0] && w.__victory[0].id === 149 && w.__victory[0].right === 20, '结算入参异常：' + JSON.stringify(w.__victory));
  check(w.__victory[0] && w.__victory[0].cinema === false, 'gymCinema 没复位，关窗后体育馆会一直盖在页面上');
  check(w.__destroyN === 0, '演出中途就把场景拆了（应在关结算弹窗时才拆）');

  console.log('通过 ' + pass + ' 失败 ' + fail);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
