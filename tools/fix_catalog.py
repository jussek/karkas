import re

p = 'src/game/cards/catalog.ts'
s = open(p).read()


def patch(cid, new_block):
    global s
    pat = "\\{\\n    id: '" + cid + "'[\\s\\S]*?\\n  \\},"
    m = re.search(pat, s)
    assert m, cid
    s = s[: m.start()] + new_block + s[m.end():]


patch('card-043', """{
    id: 'card-043',
    asset: '1 (43).jpg',
    edges: { north: 'field', east: 'field', south: 'field', west: 'field' },
    topology: { roads: [], cities: [] },
    shields: 0,
    reviewRequired: true,
    reviewReason: 'EDGE_CLASSIFICATION: all four border strips read as field on this scan, but a road/city feature may exist that does not reach any tile border; center-feature check required.',
  },""")

patch('card-053', """{
    id: 'card-053',
    asset: '1 (53).jpg',
    edges: { north: 'field', east: 'road', south: 'road', west: 'field' },
    topology: { roads: [[1, 2]], cities: [] },
    shields: 0,
  },""")

patch('card-060', """{
    id: 'card-060',
    asset: '1 (60).jpg',
    edges: { north: 'field', east: 'field', south: 'field', west: 'field' },
    topology: { roads: [], cities: [] },
    shields: 0,
    reviewRequired: true,
    reviewReason: 'EDGE_CLASSIFICATION: all four border strips read as field on this scan, but a road/city feature may exist that does not reach any tile border; center-feature check required.',
  },""")

patch('card-083', """{
    id: 'card-083',
    asset: '1 (83).jpg',
    edges: { north: 'road', east: 'field', south: 'field', west: 'field' },
    topology: { roads: [[0]], cities: [] },
    shields: 0,
  },""")

patch('card-113', """{
    id: 'card-113',
    asset: '1 (113).jpg',
    edges: { north: 'field', east: 'city', south: 'field', west: 'field' },
    topology: { roads: [], cities: [[1]] },
    shields: 0,
  },""")

patch('card-129', """{
    id: 'card-129',
    asset: '1 (129).jpg',
    edges: { north: 'field', east: 'field', south: 'river', west: 'field' },
    topology: { roads: [], cities: [], monastery: true, riverEdges: [2] },
    shields: 0,
    riverCard: true,
    riverKind: 'start',
    reviewRequired: true,
    reviewReason: 'monastery shield count unresolved: river source side (S) and monastery presence are confirmed; the number of shields around the monastery (0-3) cannot be read reliably from this scan.',
  },""")

patch('card-143', """{
    id: 'card-143',
    asset: '1 (143).jpg',
    edges: { north: 'field', east: 'field', south: 'field', west: 'field' },
    topology: { roads: [], cities: [] },
    shields: 0,
    reviewRequired: true,
    reviewReason: 'EDGE_CLASSIFICATION: all four border strips read as field on this scan, but a road/city feature may exist that does not reach any tile border; center-feature check required.',
  },""")

open(p, 'w').write(s)
print('patched OK')
