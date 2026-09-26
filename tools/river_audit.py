#!/usr/bin/env python3
"""River-edge audit for the 144 real card JPGs in src/game/cards/.

For each side (N,E,S,W) we measure the fraction of "water-blue" pixels in a
band along that border. River tiles show a strong blue band on exactly the
sides the river crosses; non-river sides stay green/tan/grey.

Blue detection: B > R + 25 and B > G + 8 and B > 90 (sky-blue water).
We also print the global blue-fraction of the whole image to spot lake/source
tiles.

Output: JSON lines {id, asset, n, e, s, w, river_sides, blue_frac}.
"""
import json
import os
import sys
from PIL import Image

CARDS_DIR = "src/game/cards"
BAND = 14  # pixel band width along each border


def is_blue(r, g, b):
    return b > r + 25 and b > g + 8 and b > 90


def side_blue_fraction(img, side):
    w, h = img.size
    px = img.load()
    total = 0
    hits = 0
    rng_x = range(0, w)
    rng_y = range(0, h)
    if side == "n":
        rows = range(0, BAND)
        for y in rows:
            for x in rng_x:
                total += 1
                r, g, b = px[x, y][:3]
                if is_blue(r, g, b):
                    hits += 1
    elif side == "s":
        for y in range(h - BAND, h):
            for x in rng_x:
                total += 1
                r, g, b = px[x, y][:3]
                if is_blue(r, g, b):
                    hits += 1
    elif side == "w":
        for y in rng_y:
            for x in range(0, BAND):
                total += 1
                r, g, b = px[x, y][:3]
                if is_blue(r, g, b):
                    hits += 1
    elif side == "e":
        for y in rng_y:
            for x in range(w - BAND, w):
                total += 1
                r, g, b = px[x, y][:3]
                if is_blue(r, g, b):
                    hits += 1
    return hits / total if total else 0.0


def global_blue_fraction(img):
    w, h = img.size
    small = img.resize((60, 60))
    px = small.load()
    hits = 0
    for y in range(60):
        for x in range(60):
            r, g, b = px[x, y][:3]
            if is_blue(r, g, b):
                hits += 1
    return hits / 3600.0


def main():
    results = []
    for i in range(1, 145):
        fname = f"1 ({i}).jpg"
        path = os.path.join(CARDS_DIR, fname)
        if not os.path.exists(path):
            print(f"MISSING_ASSET: {fname}", file=sys.stderr)
            continue
        img = Image.open(path).convert("RGB")
        fr = {s: side_blue_fraction(img, s) for s in ("n", "e", "s", "w")}
        gbf = global_blue_fraction(img)
        # threshold: >=25% of the border band must be water-blue
        river_sides = [s for s in ("n", "e", "s", "w") if fr[s] >= 0.25]
        results.append({
            "id": f"card-{i:03d}",
            "asset": fname,
            "bands": {k: round(v, 3) for k, v in fr.items()},
            "global_blue": round(gbf, 3),
            "river_sides": river_sides,
        })
    print(json.dumps(results, indent=None))


if __name__ == "__main__":
    main()
