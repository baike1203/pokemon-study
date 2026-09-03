# -*- coding: utf-8 -*-
# 构建识字字库：上册(一上300字)+下册(一下405字) → _bank12.json
import json, unicodedata

# ============ 上册：逐课 读音表（与 list304 逐位对齐，含多音字按课读音） ============
SEG = [
    ("天地人你我他", "tiān dì rén nǐ wǒ tā"),
    ("一二三四五上下", "yī èr sān sì wǔ shàng xià"),
    ("口耳目手足站坐", "kǒu ěr mù shǒu zú zhàn zuò"),
    ("日月水火山石田禾", "rì yuè shuǐ huǒ shān shí tián hé"),
    ("对云雨风花鸟虫", "duì yún yǔ fēng huā niǎo chóng"),
    ("六七八九十", "liù qī bā jiǔ shí"),
    ("爸妈", "bà mā"),
    ("马土不", "mǎ tǔ bù"),
    ("画打", "huà dǎ"),
    ("棋鸡", "qí jī"),
    ("字词语句子", "zì cí yǔ jù zǐ"),
    ("桌纸", "zhuō zhǐ"),
    ("文数学音乐", "wén shù xué yīn yuè"),
    ("妹奶白皮", "mèi nǎi bái pí"),
    ("小桥台", "xiǎo qiáo tái"),
    ("雪儿", "xuě ér"),
    ("草家是", "cǎo jiā shì"),
    ("车羊走也", "chē yáng zǒu yě"),
    ("秋气了树叶片大飞会个", "qiū qì le shù yè piàn dà fēi huì gè"),
    ("的船两头在里看见闪星", "de chuán liǎng tóu zài lǐ kàn jiàn shǎn xīng"),
    ("江南可采莲鱼东西北", "jiāng nán kě cǎi lián yú dōng xī běi"),
    ("尖说春青蛙夏弯地就冬", "jiān shuō chūn qīng wā xià wān de jiù dōng"),
    ("男女开关正反", "nán nǚ kāi guān zhèng fǎn"),
    ("远有色近听无声去还来", "yuǎn yǒu sè jìn tīng wú shēng qù hái lái"),
    ("多少黄牛只猫边鸭苹果杏桃", "duō shǎo huáng niú zhī māo biān yā píng guǒ xìng táo"),
    ("书包尺作业本笔刀课早校", "shū bāo chǐ zuò yè běn bǐ dāo kè zǎo xiào"),
    ("明力尘从众双木林森条心", "míng lì chén cóng zhòng shuāng mù lín sēn tiáo xīn"),
    ("升国旗中红歌起么美丽立", "shēng guó qí zhōng hóng gē qǐ me měi lì lì"),
    ("午晚昨今年", "wǔ wǎn zuó jīn nián"),
    ("影前后黑狗左右它好朋友", "yǐng qián hòu hēi gǒu zuǒ yòu tā hǎo péng yǒu"),
    ("比尾巴谁长短把伞兔最公", "bǐ wěi bā shuí cháng duǎn bǎ sǎn tù zuì gōng"),
    ("写诗点要过给当串们以成", "xiě shī diǎn yào guò gěi dāng chuàn men yǐ chéng"),
    ("数彩半空问到方没更绿出长", "shǔ cǎi bàn kōng wèn dào fāng méi gèng lǜ chū zhǎng"),
    ("睡那海真老师吗同什才亮", "shuì nà hǎi zhēn lǎo shī ma tóng shén cái liàng"),
    ("时候觉得自己很穿衣服快", "shí hòu jué de zì jǐ hěn chuān yī fú kuài"),
    ("蓝又笑着向和贝娃挂活金", "lán yòu xiào zhe xiàng hé bèi wá guà huó jīn"),
    ("哥姐弟叔爷", "gē jiě dì shū yé"),
    ("群竹牙用几步为参加洞着", "qún zhú yá yòng jǐ bù wèi cān jiā dòng zháo"),
    ("乌鸦处找办旁许法放进高", "wū yā chù zhǎo bàn páng xǔ fǎ fàng jìn gāo"),
    ("住孩玩吧发芽爬呀久回全变", "zhù hái wán ba fā yá pá ya jiǔ huí quán biàn"),
    ("工厂医院生", "gōng chǎng yī yuàn shēng"),
]

up = []   # [{chr, py}] 按课序，含多音字重复出现
for chars, pys in SEG:
    cl, pl = chars, pys.split()
    assert len(cl) == len(pl), f"段不齐: {chars} ({len(cl)}字 vs {len(pl)}音)"
    for c, p in zip(cl, pl):
        up.append({"chr": c, "py": p})

# ============ 下册 ============
words_map = {}
down = json.load(open(r'E:/WorkBuddy/pokemon-study-site/_xh2.json', encoding='utf-8'))
PIN = {  # 人工裁决：pypinyin 默认读音与教材识字表不符的多音字（圆：源页拼音缺失）
    "觉": "jiào", "得": "děi", "兴": "xìng", "空": "kòng", "闷": "mēn",
    "斗": "dǒu", "背": "bēi", "结": "jiē", "仔": "zǐ", "朝": "zhāo", "圆": "yuán",
}
for e in down:
    if e["chr"] in PIN:
        e["py"] = PIN[e["chr"]]
    ws = e.get("words") or []
    if ws and e["chr"] not in words_map:
        words_map[e["chr"]] = ws

# ============ 组词合并：intowz + sohu（上册源，下册已在上面并入） ============
for src in [r'E:/WorkBuddy/pokemon-study-site/_sc.json', r'E:/WorkBuddy/pokemon-study-site/_sohu.json']:
    try:
        m = json.load(open(src, encoding='utf-8'))
        for c, ws in m.items():
            if ws and c not in words_map:
                words_map[c] = ws
    except FileNotFoundError:
        pass

uniq = []
seen = set()
for e in up:
    if e["chr"] in seen:
        continue
    seen.add(e["chr"])
    uniq.append(e)
missing = [e["chr"] for e in uniq if e["chr"] not in words_map]
print("上册去重", len(uniq), "字；缺组词", len(missing), "：")
print("".join(missing))

json.dump({"up": uniq, "down": down, "words": words_map},
          open(r'E:/WorkBuddy/pokemon-study-site/_bank12.json', 'w', encoding='utf-8'),
          ensure_ascii=False)
print("已写 _bank12.json")
