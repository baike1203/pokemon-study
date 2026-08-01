#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载宝可梦 HOME 官方渲染图（PokeAPI sprites 仓库）到 assets/sprites/home/{id}.png，
并抓取中文译名（zh-Hans）写入 _gen2_names.txt（可粘贴到 POKEMON 数组）。

用法：
  python download_sprites.py            # 默认下载 152..251（第二世代）
  python download_sprites.py 1 151     # 下载指定区间
  python download_sprites.py --names-only 152 251

特性：可断点续传（已存在的精灵图/已缓存的中文名会跳过），单次网络失败自动重试。
图片来源：https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/{id}.png
中文名来源：https://pokeapi.co/api/v2/pokemon-species/{id} 的 names[zh-hans]
"""
import sys, os, json, time, urllib.request, urllib.error

REPO_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/{id}.png"
SPECIES_API = "https://pokeapi.co/api/v2/pokemon-species/{id}"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "assets", "sprites", "home"))
NAMES_CACHE = os.path.join(HERE, "_gen2_names_cache.json")
UA = {"User-Agent": "pokemon-study-downloader/1.0"}

def fetch(url, timeout=30, retries=4):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), r.headers.get("Content-Type", "")
        except Exception as e:
            last = e
            time.sleep(0.5 * (attempt + 1))
    raise last

def load_cache():
    if os.path.exists(NAMES_CACHE):
        try:
            return json.load(open(NAMES_CACHE, "r", encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_cache(cache):
    with open(NAMES_CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0)

def main():
    args = sys.argv[1:]
    names_only = False
    if args and args[0] == "--names-only":
        names_only = True
        args = args[1:]
    start, end = 152, 251
    if len(args) >= 2:
        start, end = int(args[0]), int(args[1])
    elif len(args) == 1:
        start = end = int(args[0])

    os.makedirs(OUT_DIR, exist_ok=True)
    cache = load_cache()
    print(f"# 区间 {start}..{end}  names_only={names_only}  已缓存名={len(cache)}")

    for i in range(start, end + 1):
        # 1) 下载精灵图（已存在则跳过）
        if not names_only:
            dest = os.path.join(OUT_DIR, f"{i}.png")
            if not os.path.exists(dest):
                try:
                    data, ctype = fetch(REPO_BASE.format(id=i))
                    if ctype.startswith("image") and len(data) > 200:
                        with open(dest, "wb") as f:
                            f.write(data)
                        print(f"  img {i:>3}  OK  ({len(data)} bytes)")
                    else:
                        print(f"  img {i:>3}  SKIP (非图片: {ctype})")
                except Exception as e:
                    print(f"  img {i:>3}  ERR {e}")
                time.sleep(0.05)
            else:
                print(f"  img {i:>3}  skip (已存在)")

        # 2) 抓中文名（已缓存则跳过）
        if str(i) in cache and cache[str(i)]:
            continue
        try:
            jbytes, _ = fetch(SPECIES_API.format(id=i))
            obj = json.loads(jbytes.decode("utf-8"))
            zh = ""
            for n in obj.get("names", []):
                ln = (n.get("language", {}) or {}).get("name", "").lower()
                if ln == "zh-hans":
                    zh = n.get("name", "")
                    break
            cache[str(i)] = zh or obj.get("name", str(i))
            print(f"  name {i:>3}  {cache[str(i)]}")
        except Exception as e:
            print(f"  name {i:>3}  ERR {e}")
        time.sleep(0.1)
    save_cache(cache)

    # 输出本区间中文名数组（顺序追加到 POKEMON 末尾）
    ordered = [cache.get(str(i), "") for i in range(start, end + 1)]
    snippet = "/* --- 第二世代 152-251 --- */\n"
    for r0 in range(0, len(ordered), 10):
        chunk = ordered[r0:r0+10]
        snippet += '"' + '","'.join(chunk) + '"' + ("," if r0+10 < len(ordered) else "") + "\n"
    out_path = os.path.join(HERE, "_gen2_names.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(snippet)
    print("\n===== 已写入 " + out_path + " =====")
    print(snippet)

if __name__ == "__main__":
    main()
