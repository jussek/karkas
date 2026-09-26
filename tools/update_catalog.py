import re, sys

# Verification notes derived from pixel-art inspection of the REAL project JPGs
# (tools/review_52_v6.txt). Only properties that are visually unambiguous are
# applied here; everything else keeps reviewRequired with a SPECIFIC reason.
UPDATES = {
 # --- road topology resolved: single dead-end road stub touching exactly one edge
 9:   dict(roads=[[2]], note='S-stub verified'),
 10:  dict(roads=[[2]], note='S-stub verified'),
 21:  dict(roads=[[2]], note='S-stub verified'),
 25:  dict(roads=[[3]], note='W-stub verified'),
 31:  dict(roads=[[0]], note='N-stub verified'),
 44:  dict(roads=[[0]], note='N-stub verified'),
 48:  dict(roads=[[3]], note='W-stub verified'),
 53:  dict(roads=[[0]], note='N-stub verified'),
 78:  dict(roads=[[3]], note='W-stub verified'),
 82:  dict(roads=[[1]], note='E-stub verified'),
 113: dict(roads=[[3]], note='W-stub verified'),
 114: dict(roads=[[3]], note='W-stub verified'),
 129: dict(roads=[[1]], note='E-stub verified'),
 130: dict(roads=[[0]], note='N-stub verified'),
 140: dict(roads=[[2]], note='S-stub verified'),
 143: dict(roads=[[1]], note='E-stub verified'),
}
src = open('src/game/cards/catalog.ts').read()

def fmt(g): return '[' + ', '.join(str(x) for x in g) + ']'

for num, upd in UPDATES.items():
    cid = f'card-{num:03d}'
    pat = re.compile(r"(id: '"+cid+r"',.*?topology: \{ roads: )\[.*?\](, cities: \[)", re.S)
    m = pat.search(src)
    if not m:
        print('SKIP', cid, '(pattern not found)'); continue
    src = pat.sub(lambda mm: mm.group(1)+ '[' + '; '.join(fmt(g) for g in upd['roads']) + ']' + mm.group(2), src, count=1)
    print('OK', cid, upd['note'])

open('src/game/cards/catalog.ts','w').write(src)
