const fs = require("fs");
const path = require("path");

const base = "E:/WorkBuddy/pokemon-study-site";
const manifest = path.join(base, "_upload_manifest_2026-08-21.txt");
const logFile = path.join(base, "run_2026-08-21.log");

const rels = fs.readFileSync(manifest, "utf8").split("\n").filter(Boolean);

// Local: basename -> list of {rel, size}
const local = new Map();
for (const rel of rels) {
  const full = path.join(base, rel);
  let size = -1;
  try { size = fs.statSync(full).size; } catch (e) { size = -2; }
  const base2 = path.basename(rel);
  if (!local.has(base2)) local.set(base2, []);
  local.get(base2).push({ rel, size });
}

// Log: parse JSON objects, collect successful (code:0) {base, size}
const log = fs.readFileSync(logFile, "utf8");
const logMap = new Map(); // base -> array of sizes (successful)
let totalLogged = 0, successLogged = 0, failLogged = 0;
const lines = log.split("\n");
for (const line of lines) {
  const t = line.trim();
  if (!t) continue;
  let obj;
  try { obj = JSON.parse(t); } catch (e) { continue; }
  if (obj.code === undefined && obj.fileName === undefined) continue;
  totalLogged++;
  const fn = obj.fileName;
  const sz = obj.fileSize;
  if (obj.code === 0) {
    successLogged++;
    if (fn) {
      if (!logMap.has(fn)) logMap.set(fn, []);
      logMap.get(fn).push(sz);
    }
  } else {
    failLogged++;
  }
}

// Diff: for each local file, need a successful log entry with same base AND size
const gaps = [];
for (const [base2, arr] of local) {
  const logArr = logMap.get(base2) || [];
  for (const item of arr) {
    const idx = logArr.indexOf(item.size);
    if (idx === -1) {
      gaps.push(item.rel + " (size=" + item.size + ")");
    } else {
      logArr.splice(idx, 1); // consume one match
    }
  }
}

console.log("LOCAL_FILES=" + rels.length);
console.log("LOG_TOTAL=" + totalLogged + " LOG_SUCCESS=" + successLogged + " LOG_FAIL=" + failLogged);
if (gaps.length === 0) {
  console.log("RESULT=ALL_COVERED");
} else {
  console.log("RESULT=GAPS:" + gaps.length);
  for (const g of gaps) console.log("GAP:" + g);
}
