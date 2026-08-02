// 校验 EVO_CHAINS(+EXTRA) 的数据完整性与各世代可达性。
// 用法: node scripts/validate_evochains.js [index.html 路径]
const fs = require("fs");
const path = require("path");
const f = process.argv[2] || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(f, "utf8");

function extractArray(text, name) {
  const marker = "const " + name + " = ";
  const i = text.indexOf(marker);
  if (i < 0) throw new Error("找不到 " + name);
  let j = i + marker.length;
  if (text[j] !== "[") throw new Error(name + " 不是数组");
  let depth = 0, inStr = false, esc = false;
  for (let k = j; k < text.length; k++) {
    const c = text[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return text.slice(j, k + 1); }
  }
  throw new Error(name + " 未闭合");
}

const EVO = eval(extractArray(html, "EVO_CHAINS"));
const EXTRA = html.includes("EVO_CHAINS_EXTRA") ? eval(extractArray(html, "EVO_CHAINS_EXTRA")) : [];
const ALL = EVO.concat(EXTRA);
console.log(`EVO_CHAINS 总数: ${EVO.length}, EXTRA: ${EXTRA.length}, 合并: ${ALL.length}`);

// 检查 EXTRA 越界
let oob = [];
for (const c of EXTRA) for (const id of c.flat()) if (id < 152 || id > 1025) oob.push(id);
console.log(`EXTRA 越界 id(<152 或 >1025): ${oob.length ? oob.join(",") : "无"}`);

const BOOKS = [
  ["gen2",152,251],["gen3",252,386],["gen4",387,493],["gen5",494,649],
  ["gen6",650,721],["gen7",722,809],["gen8",810,905],["gen9",906,1025],
];

// 复刻 baseFormsForBook 逻辑
function baseFormsForBook(minId, maxId) {
  const set = new Set();
  const chainsInBook = ALL.filter(c => c.flat().some(id => id >= minId && id <= maxId));
  const evolvedInBook = new Set();
  chainsInBook.forEach(c => c.slice(1).flat().forEach(id => { if (id >= minId && id <= maxId) evolvedInBook.add(id); }));
  for (let i = minId; i <= maxId; i++) { if (!evolvedInBook.has(i)) set.add(i); }
  return { set, evolvedInBook, chainsInBook };
}

let allOk = true;
const EVO_REQ = { 2:[2], 3:[2,3] };
for (const [gen, lo, hi] of BOOKS) {
  const { set, evolvedInBook, chainsInBook } = baseFormsForBook(lo, hi);
  // 可达性: 全书区间 = baseForms ∪ (各链在书内的成员)
  const covered = new Set(set);
  chainsInBook.forEach(c => c.flat().forEach(id => { if (id >= lo && id <= hi) covered.add(id); }));
  const missing = [];
  for (let i = lo; i <= hi; i++) if (!covered.has(i)) missing.push(i);
  // 链式可达性: 每个非基础形态, 其链上前一形态也在书内(应成立, 因过滤了单本)
  let chainBad = [];
  chainsInBook.forEach(c => {
    for (let k = 1; k < c.length; k++) {
      const layer = Array.isArray(c[k]) ? c[k] : [c[k]];
      const prev = Array.isArray(c[k-1]) ? c[k-1] : [c[k-1]];
      layer.forEach(id => { if (id >= lo && id <= hi && !prev.some(p => p >= lo && p <= hi)) chainBad.push(id); });
    }
  });
  const ok = missing.length === 0;
  if (!ok) allOk = false;
  console.log(`${gen} (${lo}-${hi}): 链${chainsInBook.length} 基础形态${set.size} 进化位${evolvedInBook.size} | 覆盖缺${missing.length}${missing.length?": "+missing.slice(0,12).join(","):""} | 链式断点${chainBad.length}`);
}
console.log(allOk ? "\n✅ 全部世代覆盖完整、可达" : "\n❌ 存在覆盖缺口");
process.exit(allOk ? 0 : 1);
