import re

# Final verification decisions from pixel-art inspection of the REAL project JPGs
# (renders in tools/review_52_v7.txt). Only unambiguous properties are applied;
# everything else keeps reviewRequired with a SPECIFIC reason.

# 1) Road topology verified as a single connected group touching exactly the road edges:
ROADS_SINGLE = {
 10:[2,3], 23:[2,3], 34:[0,2], 39:[0,1], 48:[2,3], 67:[2], 70:[0,3], 71:[0,1,2],
 78:[0,1,2,3], 80:[1,3], 81:[1,3], 116:[1,3], 118:[0,1], 122:[2,3], 130:[0,2],
 140:[0,1,3], 142:[0,3],
}
# 2) Cards where road-topology was the ONLY review cause and it is now verified -> clear review
CLEAR_ROAD = [10,23,34,39,48,70,71,78,80,81,116,118,122,130,140,142]
# 3) Dead-end stub cards (single-edge road group [[e]]): edges+topology verified -> clear review
CLEAR_STUB = [9,21,25,31,44,53,82,113,114,143]
# 4) Edge-classification corrections verified from images (field<->road swaps at middle third):
EDGE_FIX = {
 25:{'west':'road'}, 43:{'north':'field','east':'field'}, 44:{'east':'field'},
 46:{'south':'road'}, 47:{'north':'field'}, 52:{'west':'road'}, 60:{'east':'field'},
 62:{'south':'road'}, 67:{'north':'field'}, 72:{'west':'road'}, 76:{'east':'field','west':'field'},
 79:{'east':'field'}, 83:{'north':'road','east':'field'}, 114:{'west':'field'},
 127:{'east':'field'}, 141:{'north':'road'}, 143:{'north':'field'},
}
# 5) After edge fixes + stub/road verification these become fully verified (no other open cause):
ALSO_CLEAR = [25,43,44,46,47,52,60,62,72,76,79,83,143]

src = open('src/game/cards/catalog.ts').read()

def block(cid):
    return re.compile(r"(id: '"+cid+r"',.*?\n  \},)", re.S)

def fmt(g): return '[' + ', '.join(str(x) for x in g) + ']'

applied = []
for num, grp in ROADS_SINGLE.items():
    cid=f'card-{num:03d}'
    pat=re.compile(r"(id: '"+cid+r"',.*?)roads: \[.*?\](?=, cities)", re.S)
    src,n = pat.subn(lambda m: m.group(1)+'roads: ['+fmt(grp)+']', src, count=1)
    applied.append((cid,'roads',n))

for num, fixes in EDGE_FIX.items():
    cid=f'card-{num:03d}'
    m=re.search(r"id: '"+cid+r"',.*?edges: \{([^}]*)\}", src, re.S)
    inner=m.group(1)
    for side,val in fixes.items():
        inner=re.sub(side+r": '\w+'", f"{side}: '{val}'", inner)
    src = src[:m.start(1)] + inner + src[m.end(1):]
    applied.append((cid,'edges',1))

def set_review(cid, want):
    global src
    def repl(m):
        b=m.group(1)
        if want:
            if 'reviewRequired:' in b:
                b=re.sub(r"reviewRequired: \w+", "reviewRequired: false", b)
            else:
                b=re.sub(r"(\n  \},)$", ",\n    reviewRequired: false\n  }," , b)
        else:
            b=re.sub(r"\s*reviewRequired: true,", "", b)
            b=re.sub(r"\s*reviewReason: '[^']*',?", "", b)
        return b
    pat=re.compile(r"(id: '"+cid+r"',.*?\n  \},)", re.S)
    src,n=pat.subn(repl, src, count=1)
    applied.append((cid,f'review->{want}',n))

for num in CLEAR_ROAD+CLEAR_STUB+ALSO_CLEAR:
    set_review(f'card-{num:03d}', False)

open('src/game/cards/catalog.ts','w').write(src)
for a in applied: print(a)
