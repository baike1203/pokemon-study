#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
抓取 152-1025 宝可梦的基础信息(属性/身高/体重/中文分类)，注入 POKEDATA。
- 属性/身高/体重来自 https://pokeapi.co/api/v2/pokemon/{id}
- 中文分类(genera)来自 https://pokeapi.co/api/v2/pokemon-species/{id} 的 zh-hans
  (注: PokeAPI 的 flavor_text_entries 不含中文, 故用中文"分类"代替"简介", 离线可靠)
- 支持断点续传(缓存已抓到的编号)、失败重试、结果缓存
- 抓取结果写 scripts/pokedata_extra_cache.json(可忽略)，并输出 scripts/pokedata_extra.json(152-1025 的纯数据)

用法:
  python scripts/fetch_pokedata.py            # 抓 152-1025(默认)
  python scripts/fetch_pokedata.py 152 251    # 只抓某区间(测试)
"""
import json, sys, os, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "pokedata_extra_cache.json")
OUT   = os.path.join(HERE, "pokedata_extra.json")

# PokeAPI 英文属性 -> 中文(与 index.html 的 TYPE_COLOR 键一致)
TYPE_ZH = {
    "normal": "一般", "fire": "火", "water": "水", "grass": "草", "electric": "电",
    "ice": "冰", "fighting": "格斗", "poison": "毒", "ground": "地面", "flying": "飞行",
    "psychic": "超能力", "bug": "虫", "rock": "岩石", "ghost": "幽灵", "dragon": "龙",
    "dark": "恶", "steel": "钢", "fairy": "妖精",
}

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

def zh(list_of_entries, key="language", name="zh-hans"):
    """从带 language 字段的条目列表中取 zh-hans 的值。"""
    for e in list_of_entries:
        if e.get(key, {}).get("name", "").lower() == name:
            return e
    return None

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
        time.sleep(0.6 * (attempt + 1))
    print(f"  !! 失败 {url}: {last}")
    return None

def build_entry(pid):
    p = fetch_json(f"https://pokeapi.co/api/v2/pokemon/{pid}")
    sp = fetch_json(f"https://pokeapi.co/api/v2/pokemon-species/{pid}")
    if p is None and sp is None:
        return None
    types = []
    if p:
        for t in p.get("types", []):
            z = TYPE_ZH.get(t["type"]["name"])
            if z and z not in types:
                types.append(z)
    h = w = None
    if p:
        h = round(p.get("height", 0) * 10, 1)    # 分米 -> cm
        w = round(p.get("weight", 0) / 10.0, 1)  # 十克 -> kg
    g = ""
    if sp:
        gen = zh(sp.get("genera", []))
        if gen:
            g = gen.get("genus", "").strip()
    return {"t": types, "h": h, "w": w, "g": g}

def main():
    args = sys.argv[1:]
    lo, hi = 152, 1025
    if len(args) >= 2 and args[0].isdigit():
        lo, hi = int(args[0]), int(args[1])
    cache = load_cache()
    total = hi - lo + 1
    done = 0
    for pid in range(lo, hi + 1):
        key = str(pid)
        if cache.get(key) and cache[key].get("t") and ("g" in cache[key]):
            done += 1
            continue
        e = build_entry(pid)
        if e is None:
            print(f"  skip {pid} (no data)")
            continue
        cache[key] = e
        done += 1
        if done % 10 == 0:
            save_cache(cache)
            print(f"  [{done}/{total}] 已抓到 {pid}: {e['t']} h={e['h']} w={e['w']} 分类={e['g']}")
    save_cache(cache)
    out = {str(pid): cache.get(str(pid)) for pid in range(152, 1026) if cache.get(str(pid))}
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    missing = [pid for pid in range(152, 1026) if not cache.get(str(pid)) or not cache[str(pid)].get("t")]
    nog = [pid for pid in range(152, 1026) if cache.get(str(pid)) and not cache[str(pid)].get("g")]
    print(f"\n完成: 缓存 {len(cache)} 条, 缺类型 {len(missing)} -> {missing[:10]}")
    print(f"缺分类 {len(nog)} -> {nog[:10]}")
    print(f"输出: {OUT}")

if __name__ == "__main__":
    main()
