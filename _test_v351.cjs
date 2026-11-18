/* v3.51 出题器回归：语文模块 + 数学试卷专练。
   跑 3000 轮，断言题目结构、选项、以及静态题库的教学答案。 */
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

// 桩 + 被测代码同一次 eval（记忆坑 6）
const STUB = `
var __CAP = null;
function runQuiz(cfg){ __CAP = cfg; }
function openDialog(){}
function sfx(){}
`;
(0, eval)(STUB + '\n' + [
  'rnd', 'pick', 'shuffle', 'carryGuideOf',
  'SHENGMU', 'YUNMU', 'ZHENGTI',
  'YW_SM_CONFUSE', 'YW_YM_CONFUSE', 'YW_IDIOMS', 'YW_MINUS_STROKE',
  'chineseQuiz', 'buildChineseQs', 'SHAPE_KINDS', 'shapeSvg', 'makeShapeCountQ',
  'mathQuizG1Exam', 'buildG1ExamQs'
].map(grab).join('\n;\n'));

let fail = 0;
function check(cond, msg) { if (!cond) { fail++; if (fail <= 12) console.log('  ✗ ' + msg); } }

// ---------- 静态题库教学正确性 ----------
const SM = globalThis.SHENGMU, YM = globalThis.YUNMU, ZT = globalThis.ZHENGTI;

// 声母辨析：例字的声母必须等于答案，且答案唯一命中
let smBad = 0;
globalThis.YW_SM_CONFUSE.forEach(o => {
  const hits = SM.filter(x => x[1] === o.ch).map(x => x[0]);
  if (hits.length !== 1 || hits[0] !== o.answer) { smBad++; console.log('  声母错题:', o.ch, '答案', o.answer, '表中', hits); }
});
check(smBad === 0, '声母辨析例字与答案不符 ' + smBad + ' 条');

// 韵母辨析：例字的韵母必须等于答案
let ymBad = 0;
globalThis.YW_YM_CONFUSE.forEach(o => {
  const hits = YM.filter(x => x[1] === o.ch).map(x => x[0]);
  if (hits.length !== 1 || hits[0] !== o.answer) { ymBad++; console.log('  韵母错题:', o.ch, '答案', o.answer, '表中', hits); }
});
check(ymBad === 0, '韵母辨析例字与答案不符 ' + ymBad + ' 条');

// 四字词语：挖空填答案后必须没有空格残留，且答案唯一在选项中
globalThis.YW_IDIOMS.forEach(o => {
  check(o.q.includes('（ ）'), '词语题格式不对: ' + o.q);
  check(o.opts.filter(x => x === o.answer).length === 1, '词语题答案不在选项中: ' + o.q);
});
// 减一笔：答案唯一
globalThis.YW_MINUS_STROKE.forEach(o => {
  check(o.opts.filter(x => x === o.answer).length === 1, '减一笔答案不在选项中: ' + o.q);
  check(new Set(o.opts).size === o.opts.length, '减一笔有重复选项: ' + o.q);
});

// ---------- 动态出题 3000 轮 ----------
const ROUNDS = 3000;
const stat = { chinese: 0, exam: 0 };
for (let r = 0; r < ROUNDS; r++) {
  // 语文
  globalThis.chineseQuiz();
  const cq = __CAP.questions;
  check(cq.length === 10, '语文题量不是 10: ' + cq.length);
  check(__CAP.moduleKey === 'chinese', '语文 moduleKey 错误');
  cq.forEach(q => {
    stat.chinese++;
    check(!!q.id && !!q.prompt, '语文题缺字段: ' + JSON.stringify(q));
    const isCat = /属于哪一类/.test(q.prompt);
    check(Array.isArray(q.options) && q.options.length === (isCat ? 3 : 4), '语文题选项数不对: ' + q.id + ' 实际 ' + (q.options || []).length);
    check(new Set(q.options).size === q.options.length, '语文题选项重复: ' + q.id);
    check(q.options.includes(q.answer), '语文题选项不含答案: ' + q.id + ' ans=' + q.answer);
    if (/属于哪一类/.test(q.prompt)) {
      const syl = q.prompt.match(/「([^」]+)」/)[1];
      const belong = { '声母': SM, '韵母': YM, '整体认读音节': ZT };
      check(belong[q.answer].some(x => x[0] === syl), '音节分类错误: ' + syl + ' → ' + q.answer);
      const otherCats = Object.keys(belong).filter(k => k !== q.answer);
      check(otherCats.every(k => !belong[k].some(x => x[0] === syl)), '音节跨类重复: ' + syl);
    }
  });
  const ck = cq.map(q => q.prompt);
  check(new Set(ck).size === ck.length, '语文同场出现重复题: ' + ck.filter((k,n)=>ck.indexOf(k)!==n).join(' / '));

  // 数学试卷专练
  globalThis.mathQuizG1Exam();
  const mq = __CAP.questions;
  check(mq.length === 10, '数学试卷题量不是 10: ' + mq.length);
  check(__CAP.moduleKey === 'math', '数学 moduleKey 错误');
  mq.forEach(q => {
    stat.exam++;
    check(!!q.id && !!q.prompt, '数学题缺字段: ' + JSON.stringify(q));
    if (q.answerMode === 'input') {
      check(Number.isFinite(Number(q.answer)), '数学输入题答案非数字: ' + q.id);
    } else {
      check(Array.isArray(q.options) && q.options.includes(q.answer), '数学选择题选项不含答案: ' + q.id);
    }
    // 按题干反推答案
    let m;
    if ((m = /1 个十和 (\d+) 个一合起来是几/.exec(q.prompt))) {
      check(Number(q.answer) === 10 + Number(m[1]), '十位个位答案错: ' + q.prompt);
    } else if ((m = /^(\d+) \+ (\d+)　○　(\d+) \+ (\d+)$/.exec(q.prompt))) {
      const L = +m[1] + +m[2], R = +m[3] + +m[4];
      const want = L > R ? '>' : L < R ? '<' : '=';
      check(q.answer === want, '比大小答案错: ' + q.prompt + ' → ' + q.answer);
    } else if ((m = /（  ）\+ (\d+) = (\d+)/.exec(q.prompt))) {
      check(Number(q.answer) === Number(m[2]) - Number(m[1]), '括号填数答案错: ' + q.prompt);
    } else if ((m = /^(\d+)，(\d+)，(\d+)，(\d+)，（  ）$/.exec(q.prompt))) {
      const seq = [+m[1], +m[2], +m[3], +m[4]];
      const step = seq[1] - seq[0];
      check(seq[2] - seq[1] === step && seq[3] - seq[2] === step, '找规律序列不等差: ' + q.prompt);
      check(Number(q.answer) === seq[3] + step, '找规律答案错: ' + q.prompt);
      check(Number(q.answer) <= 20, '找规律超出 20: ' + q.prompt);
    } else if ((m = /前面有 (\d+) 人，后面有 (\d+) 人/.exec(q.prompt))) {
      check(Number(q.answer) === +m[1] + +m[2] + 1, '排队问题答案错: ' + q.prompt);
    } else if ((m = /^(\d+) \+ (\d+) = \?$/.exec(q.prompt))) {
      check(Number(q.answer) === +m[1] + +m[2], '进位加答案错: ' + q.prompt);
    } else if (q.id && q.id.indexOf("ex_g") === 0) {
      /* v3.51.1 立体图形计数：数 SVG 中目标形体的 data-kind 数量 = 答案 */
      const kinds = [...q.prompt.matchAll(/data-kind="(\w+)"/g)].map(x => x[1]);
      const target = /所以(.+?)有 (\d+) 个/.exec(q.explain || "");
      const NAME = { cube:"正方体", cuboid:"长方体", sphere:"球", cylinder:"圆柱" };
      const key = target && Object.keys(NAME).find(k => NAME[k] === target[1]);
      check(!!key && kinds.filter(k => k === key).length === Number(q.answer),
        '图形计数答案错: ' + q.explain);
    } else {
      check(false, '未识别的数学题型: ' + q.prompt);
    }
  });
}

console.log('跑题数：语文 ' + stat.chinese + ' / 数学 ' + stat.exam);
console.log('静态题库：声母 ' + SM.length + ' 韵母 ' + YM.length + ' 整体认读 ' + ZT.length
  + ' 辨析 ' + globalThis.YW_SM_CONFUSE.length + '/' + globalThis.YW_YM_CONFUSE.length
  + ' 词语 ' + globalThis.YW_IDIOMS.length + ' 减一笔 ' + globalThis.YW_MINUS_STROKE.length);
console.log(fail === 0 ? '全部通过 ✅' : '失败 ' + fail + ' 项 ❌');
process.exit(fail === 0 ? 0 : 1);
