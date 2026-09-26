import re, json
s = open('src/game/cards/catalog.ts').read()
entries = re.findall(r"\{\n    id: '(card-\d+)'[\s\S]*?\n  \},", s)
print("parsed entries:", len(entries))
for e in re.finditer(r"\{\n    id: '(card-\d+)'([\s\S]*?)\n  \},", s):
    cid, body = e.group(1), e.group(2)
    em = re.search(r"edges: \{([^}]*)\}", body)
    edges = {}
    for x in em.group(1).split(','):
        k, v = x.split(':')
        edges[k.strip()] = v.strip().strip("'")
    by = {0: edges['north'], 1: edges['east'], 2: edges['south'], 3: edges['west']}
    rm = re.search(r"roads: (\[[^\]]*(?:\[[^\]]*\][^\]]*)*\])", body)
    cm = re.search(r"cities: (\[[^\]]*(?:\[[^\]]*\][^\]]*)*\])", body)
    def parse(txt):
        txt = txt.replace(' ', '')
        if not txt.startswith('[['):
            return json.loads(txt)
        # nested
        out = []
        for g in re.findall(r"\[([0-9,]*)\]", txt):
            out.append([int(x) for x in g.split(',') if x != ''])
        return out
    for grp in parse(rm.group(1)):
        for i in grp:
            if by[i] != 'road': print('ROAD MISMATCH', cid, 'idx', i, 'edge', by[i], '| edges', edges)
    for grp in parse(cm.group(1)):
        for i in grp:
            if by[i] != 'city': print('CITY MISMATCH', cid, 'idx', i, 'edge', by[i], '| edges', edges)
    riv = re.search(r"riverEdges: \[([0-9, ]*)\]", body)
    rl = [int(x) for x in riv.group(1).replace(' ','').split(',') if x!=''] if riv else []
    for i in range(4):
        is_river_edge = by[i] == 'river'
        if is_river_edge != (i in rl):
            print('RIVER INVARIANT FAIL', cid, 'idx', i, by[i], 'riverEdges', rl)
