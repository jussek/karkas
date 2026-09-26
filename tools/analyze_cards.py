#!/usr/bin/env python3
"""
Pixel-level analysis of the 144 card images in src/game/cards/.

Method:
- For each edge midpoint (N,E,S,W), sample a small window inside the tile.
- Classify by dominant color signature:
    * grass green  -> field
    * grey/brown   -> city wall (stone)
    * yellow/cream strip with dark borders -> road
- Also detect monastery via center region (building-like pixels, non-green).

This is NOT final classification; it produces evidence for catalog entries.
Ambiguous cards get reviewRequired=true.
"""
import numpy as np
from PIL import Image
import json, os, sys

CARDS_DIR = 'src/game/cards'
SIZE = 512  # upscaled size from /tmp/ups

def rgb_at(arr, x, y):
    return arr[y, x]

def classify_window(arr, cx, cy, half=18):
    """Sample window centered at (cx,cy) in 512-space."""
    x0, x1 = max(0, cx-half), min(arr.shape[1], cx+half)
    y0, y1 = max(0, cy-half), min(arr.shape[0], cy+half)
    win = arr[y0:y1, x0:x1].reshape(-1,3).astype(float)
    r, g, b = win[:,0], win[:,1], win[:,2]
    n = len(win)
    # grass: green dominant over red and blue
    grass = np.mean((g > r + 8) & (g > b + 20))
    # stone/city: low saturation, medium brightness OR reddish-brown roof
    mx = win.max(axis=1); mn = win.min(axis=1)
    sat = (mx - mn)
    val = mx
    greyish = np.mean((sat < 45) & (val > 60) & (val < 230))
    # road: pale yellow/cream band (high R,G, lower B)
    cream = np.mean((r > 170) & (g > 150) & (b < g - 15) & (np.abs(r - g) < 60))
    # dark outline (road borders are dark brown/black lines)
    dark = np.mean(val < 90)
    return dict(grass=float(grass), grey=float(greyish), cream=float(cream), dark=float(dark))

def edge_type(stats):
    # decide which feature touches this edge
    if stats['grass'] > 0.55:
        return 'field', stats['grass']
    if stats['cream'] > 0.30 and stats['cream'] > stats['grey']:
        return 'road', stats['cream']
    if stats['grey'] > 0.35:
        return 'city', stats['grey']
    # fallback: compare
    best = max([('field', stats['grass']), ('road', stats['cream']), ('city', stats['grey'])], key=lambda t: t[1])
    return best[0], best[1]

def main():
    results = {}
    for i in range(1, 145):
        path = f'/tmp/ups/{i:03d}.png'
        arr = np.array(Image.open(path).convert('RGB'))
        S = arr.shape[0]
        d = int(S * 0.06)  # depth inside tile for sampling
        m = S // 2
        pts = {
            'north': (m, d),
            'south': (m, S - d),
            'west': (d, m),
            'east':  (S - d, m),
        }
        edges = {}
        confs = {}
        for side, (x, y) in pts.items():
            st = classify_window(arr, x, y)
            t, c = edge_type(st)
            edges[side] = t
            confs[side] = round(c, 3)
        # center check for monastery: building pixels (non-grass, structured)
        cen = classify_window(arr, m, m, half=40)
        center_non_grass = 1 - cen['grass']
        results[i] = dict(asset=f'1 ({i}).jpg', edges=edges, conf=confs,
                          center=dict(nongrass=round(center_non_grass,3),
                                      grey=round(cen['grey'],3),
                                      cream=round(cen['cream'],3),
                                      dark=round(cen['dark'],3)))
    with open('/tmp/card_analysis.json', 'w') as f:
        json.dump(results, f, indent=1)
    print('analyzed', len(results))

if __name__ == '__main__':
    main()
