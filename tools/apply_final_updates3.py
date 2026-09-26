import re

src = open('src/game/cards/catalog.ts').read()

def get_block(cid):
    return re.search(r"id: '"+cid+r"',.*?\n  \},", src, re.S).group(0)

def replace_block(old,new):
    global src; assert old in src; src = src.replace(old,new,1)

# card-042: edges verified all-field (S/W road pixels are interior castle walls only); drop review.
b=get_block('card-042')
nb=re.sub(r"\s*reviewRequired: true,", "", b); nb=re.sub(r"\s*reviewReason: '[^']*',?", "", nb)
replace_block(b,nb)

# card-056: SE city confirmed; N/E/S/W field. roads=[[3]] stale -> []. Drop review.
b=get_block('card-056')
nb=b.replace("roads: [[3]]","roads: []")
nb=re.sub(r"\s*reviewRequired: true,", "", nb); nb=re.sub(r"\s*reviewReason: '[^']*',?", "", nb)
replace_block(b,nb)

# card-057: E-edge settlement cluster reaches the east border => east=city; keep W field-stub road.
b=get_block('card-057')
nb=b.replace("east: 'field'","east: 'city'").replace("cities: []","cities: [[1]]")
nb=re.sub(r"reviewReason: '[^']*'", "reviewReason: 'city extent unresolved: an eastern settlement touches the E edge, but whether it wraps around the NE/N corner (making north a second city edge) or stays a single E segment cannot be determined at this scan resolution.'", nb)
replace_block(b,nb)

# card-077: image shows one connected road network touching N,E,S,W (castle courtyard crossing); fix topology, drop review.
b=get_block('card-077')
nb=b.replace("edges: { north: 'road', east: 'field', south: 'field', west: 'road' }","edges: { north: 'road', east: 'road', south: 'road', west: 'road' }")
nb=nb.replace("roads: [[0, 3]]","roads: [[0, 1, 2, 3]]")
nb=re.sub(r"\s*reviewRequired: true,", "", nb); nb=re.sub(r"\s*reviewReason: '[^']*',?", "", nb)
replace_block(b,nb)

# card-141: NE village with road to E edge; N-edge ambiguity persists -> specific reason.
b=get_block('card-141')
nb=re.sub(r"reviewReason: '[^']*'", "reviewReason: 'edge classification unresolved: the NE village walls extend along the top margin; whether the north edge itself is city or field cannot be separated from the roof shading at this scan resolution.'", nb)
replace_block(b,nb)

open('src/game/cards/catalog.ts','w').write(src)
print('pass3 ok')
