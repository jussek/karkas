import re

src = open('src/game/cards/catalog.ts').read()

def get_block(cid):
    m = re.search(r"id: '"+cid+r"',.*?\n  \},", src, re.S)
    return m.group(0)

def replace_block(old, new):
    global src
    assert old in src
    src = src.replace(old, new, 1)

# card-072: W-edge road stub verified (roads was empty -> set [[3]])
b = get_block('card-072'); replace_block(b, b.replace("roads: []", "roads: [[3]]"))

# Remaining review cards: rewrite reviewReason to the SPECIFIC open question.
REASONS = {
 'card-011': "city segmentation unresolved: north and west are both city edges; whether they form ONE continuous city segment around the NW corner or two separate segments cannot be determined because the wall line is broken by a small tower at the corner.",
 'card-024': "monastery shield count unresolved: center monastery is confirmed, but the number of shields painted around it (0-3) cannot be read reliably from this scan resolution.",
 'card-029': "center building identity unresolved: a large structure occupies the tile center inside the S-W city; cannot determine whether it is a city expansion (counts toward city) or a standalone monastery.",
 'card-035': "road/city junction geometry unresolved: three road edges (E,S,W) each terminate at the boundary of the N city with visible gate openings; whether the roads merge into one shared city feature or touch as separate endpoints changes scoring and needs manual check.",
 'card-040': "city segmentation unresolved: north and south city edges face each other across the tile; whether one continuous walled city wraps through E/W margins or two separate cities cannot be determined at this scan resolution.",
 'card-065': "city segmentation unresolved: north and west city edges meet near the NW corner; whether the wall is continuous around the corner (one segment) or split by a road/gate opening needs manual check.",
 'card-067': "road endpoint unresolved: an internal road runs from the S edge toward the N city wall; whether it terminates at the city (gate) or continues beyond the N edge is not discernible on this scan.",
 'card-082': "road routing ambiguity: road pixels appear at all four edge middle-thirds, but interior rendering shows only two short dead-end stubs (E,S); straight N-S / E-W connections are contradicted by the interior - needs manual verification.",
 'card-092': "possible center building detected: gray structure at tile center; cannot confirm monastery vs field decoration at this scan resolution.",
 'card-114': "road endpoint unresolved: internal road from the W edge fades before reaching the E-side settlement cluster; whether it connects to the eastern feature or ends in a field dead end cannot be determined.",
 'card-126': "city segmentation unresolved: east and west city edges both show city walls; whether they belong to one city wrapping through N/S margins or two separate cities cannot be determined.",
 'card-127': "city extent unresolved: S city wall extends toward the E edge margin; whether the city segment includes the east edge (two-edge group) or stays a single S segment needs manual check.",
 'card-129': "monastery shield count unresolved: river source side (S) and monastery presence are confirmed; the number of shields around the monastery (0-3) cannot be read reliably from this scan.",
}
for cid, reason in REASONS.items():
    b = get_block(cid)
    nb = re.sub(r"reviewReason: '[^']*'", "reviewReason: '" + reason + "'", b)
    if 'reviewReason' not in b:
        nb = b[:-len('\n  },')] + ",\n    reviewReason: '" + reason + "'\n  },"
    replace_block(b, nb)

open('src/game/cards/catalog.ts','w').write(src)
print('pass2 ok')
