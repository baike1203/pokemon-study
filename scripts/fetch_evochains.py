#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
抓取 152-1025 宝可梦的进化链，生成 EVO_CHAINS_EXTRA（注入 index.html）。

思路:
- 对每个 id(152..1025) 取 pokemon-species -> evolution_chain.url, 得到链 id(去重)
- 取每条 evolution-chain, 递归 walk 成所有线性路径(root->leaf)
- 过滤规则(避免污染 gen1 与跨本不可达):
    * base(路径首元素) 必须 >=152   (gen1 基础形态如伊布/多边兽不纳入)
    * 路径所有成员必须都在 [152,1025]
    * 路径所有成员必须同属一个世代本(同一 BOOKS 区间)  -> 否则该链整条丢弃, 相关宝可梦退化为直接可抽
- 输出的每条链是线性数组 [base, evo1, evo2, ...];
  多级分支(如 Wurmple->Silcoon/Cascoon->...) 会自然拆成多条线性链(共享 base),
  配合 index.html 中已聚合的 tryEvolve 即可两条分支都能进化到。

输出:
- scripts/evo_chains_extra.json   纯数据(便于校验)
- scripts/evo_chains_extra.txt    JS 数组字面量(待注入 index.html)
- 同时打印统计: 各世代链数 / 覆盖宝可梦数 / 未覆盖(必为无进化的独立个体, 属正常)
"""
import json, os, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "evo_cache.json")
OUT_JSON = os.path.join(HERE, "evo_chains_extra.json")
OUT_JS = os.path.join(HERE, "evo_chains_extra.txt")

# 世代本区间(仅 gen2-9 相关, gen1 已由 EVO_CHAINS 内建)
BOOKS = [
    (152, 251), (252, 386), (387, 493), (494, 649),
    (650, 721), (722, 809), (810, 905), (906, 1025),
]
def book_of(i):
    for (lo, hi) in BOOKS:
        if lo <= i <= hi:
            return (lo, hi)
    return None

UA = {"User-Agent": "poke-study/1.0 (educational kids app)"}

def load_cache():
    if os.path.exists(CACHE):
        try:
            return json.load(open(CACHE, encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_cache(c):
    json.dump(c, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)

def fetch_json(url, retries=6):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
        except Exception as e:
            last = e
        time.sleep(0.5 * (attempt + 1))
    print(f"  !! 失败 {url}: {last}")
    return None

def sid_of(url):
    return int(url.rstrip("/").split("/")[-1])

def walk(node, path, out):
    sid = sid_of(node["species"]["url"])
    path = path + [sid]
    kids = node.get("evolves_to") or []
    if not kids:
        out.append(path)
    else:
        for k in kids:
            walk(k, path, out)

def main():
    cache = load_cache()
    # 1) 取每个物种 -> 链 id
    chain_ids = set()
    species_total = 1025 - 152 + 1
    done = 0
    for pid in range(152, 1026):
        key = str(pid)
        if cache.get(key, {}).get("chain") is not None:
            if cache[key]["chain"]:
                chain_ids.add(cache[key]["chain"])
            done += 1
            continue
        sp = fetch_json(f"https://pokeapi.co/api/v2/pokemon-species/{pid}/")
        cid = None
        if sp:
            cid = sid_of(sp["evolution_chain"]["url"])
        cache[key] = {"chain": cid}
        if cid:
            chain_ids.add(cid)
        done += 1
        if done % 50 == 0:
            save_cache(cache)
            print(f"  [species {done}/{species_total}] 链数={len(chain_ids)}")
    save_cache(cache)
    print(f"去重后链数: {len(chain_ids)}")

    # 2) 取每条链, walk 成线性路径
    raw_paths = []
    for cid in sorted(chain_ids):
        ch = fetch_json(f"https://pokeapi.co/api/v2/evolution-chain/{cid}/")
        if not ch:
            continue
        paths = []
        walk(ch["chain"], [], paths)
        raw_paths.extend(paths)
    print(f"walk 得到线性路径: {len(raw_paths)}")

    # 3) 过滤
    chains = []
    skipped_base_gen1 = 0
    skipped_cross = 0
    skipped_oob = 0
    for p in raw_paths:
        if len(p) < 2:
            continue  # 无进化的独立个体 -> 不作为链(直接可抽)
        base = p[0]
        if base < 152:
            skipped_base_gen1 += 1
            continue
        if any(x < 152 or x > 1025 for x in p):
            skipped_oob += 1
            continue
        books = {book_of(x) for x in p}
        books.discard(None)
        if len(books) != 1:
            skipped_cross += 1
            continue
        chains.append(p)

    # 去重(同一线性路径可能由不同链 walk 出重复)
    uniq = []
    seen = set()
    for c in chains:
        t = tuple(c)
        if t not in seen:
            seen.add(t)
            uniq.append(c)
    chains = uniq
    print(f"过滤后有效链: {len(chains)} (跳过 base<152:{skipped_base_gen1}, 越界:{skipped_oob}, 跨本:{skipped_cross})")

    # 4) 统计每世代覆盖
    from collections import defaultdict
    per_book = defaultdict(lambda: {"chains": 0, "members": set()})
    for c in chains:
        b = book_of(c[0])
        per_book[b]["chains"] += 1
        per_book[b]["members"].update(c)
    for (lo, hi) in BOOKS:
        info = per_book.get((lo, hi))
        if info:
            covered = len(info["members"])
            print(f"  gen {lo}-{hi}: 链 {info['chains']} 覆盖 {covered}/{hi-lo+1}")
        else:
            print(f"  gen {lo}-{hi}: 链 0")

    # 5) 写出
    json.dump(chains, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    lines = ["  " + str(c) + "," for c in chains]
    js = "const EVO_CHAINS_EXTRA = [\n" + "\n".join(lines) + "\n];"
    open(OUT_JS, "w", encoding="utf-8").write(js)
    print(f"写出: {OUT_JSON}\n{OUT_JS}")

if __name__ == "__main__":
    main()
