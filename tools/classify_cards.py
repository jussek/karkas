"""
Stage 2.5 card classifier.

Classifies each of the 144 real card images in src/game/cards/ by sampling
the color profile along the inner strip adjacent to each edge (N/E/S/W).

Heuristic palette rules (grass vs road-cream vs city-grey vs river-blue) are
derived from the images themselves; ambiguous edges/topology are marked
reviewRequired per stage policy. This tool only produces DATA for the catalog;
it does not encode any memory-based Carcassonne layout.
"""
from PIL import Image
import numpy as np, os, json

CARDS_DIR = 'src/game/cards'

# reference colors
GRASS = np.array([160, 180, 75], float)   # green meadow
ROAD  = np.array([225, 205, 160], float)  # cream/tan road fill
CITY  = np.array([150, 130, 120], float)  # grey/brown city stone
RIVER = np.array([90, 150, 210], float)   # blue water

def side_strip(arr, side):
    h, w, _ = arr.shape
    m = int(h * 0.14)          # skip outer border artwork
    t = 6                      # strip thickness
    lo, hi = int(w*0.30), int(w*0.70)
    if side == 'N': return arr[m:m+t, lo:hi]
    if side == 'S': return arr[h-m-t:h-m, lo:hi]
    if side == 'W': return arr[lo:hi, m:m+t]
    if side == 'E': return arr[lo:hi, w-m-t:w-m]

def classify_strip(strip):
    """Return (label, confidence) for a sampled strip."""
    px = strip.reshape(-1, 3).astype(float)
    # fraction of pixels closest to each reference
    def frac(ref):
        d = np.linalg.norm(px - ref, axis=1)
        return (d < 60).mean()
    fg, fr, fc, fw = frac(GRASS), frac(ROAD), frac(CITY), frac(RIVER)
    # water is very distinctive: high blue relative to red
    mean = px.mean(axis=0)
    blue_dominant = mean[2] > mean[0] + 25
    scores = {'field': fg, 'road': fr, 'city': fc, 'river': max(fw, 0.6 if blue_dominant else 0)}
    best = max(scores, key=scores.get)
    s = scores[best]
    second = sorted(scores.values(), reverse=True)[1]
    conf = 'high' if s > 0.5 and s - second > 0.15 else ('medium' if s > 0.35 else 'low')
    return best, conf, scores

def center_has_monastery(arr):
    h, w, _ = arr.shape
    c = arr[int(h*0.38):int(h*0.62), int(w*0.38):int(w*0.62)].reshape(-1,3).astype(float)
    # monastery building: lots of bright/greyish non-grass pixels in center
    non_grass = (np.linalg.norm(c - GRASS, axis=1) > 70).mean()
    grey = ((abs(c[:,0]-c[:,1]) < 30) & (abs(c[:,1]-c[:,2]) < 40) & (c.mean(axis=1) > 110)).mean()
    return non_grass > 0.55 and grey > 0.15

results = {}
for i in range(1, 145):
    fn = f"1 ({i}).jpg"
    arr = np.asarray(Image.open(os.path.join(CARDS_DIR, fn)).convert('RGB'))
    labels, confs = {}, {}
    for side in ['N','E','S','W']:
        lab, conf, sc = classify_strip(side_strip(arr, side))
        labels[side] = lab
        confs[side] = conf
    results[i] = {
        'asset': fn,
        'edges': labels,
        'confidence': confs,
        'monastery_center': bool(center_has_monastery(arr)),
    }

with open('/tmp/classified.json', 'w') as f:
    json.dump(results, f, indent=1)

# summary
from collections import Counter
edge_counter = Counter()
amb = 0
for r in results.values():
    if 'low' in r['confidence'].values(): amb += 1
print("total:", len(results))
print("ambiguous(low-conf) cards:", amb)
print("monastery candidates:", sum(1 for r in results.values() if r['monastery_center']))
cnt = Counter(tuple(sorted(r['edges'].values())) for r in results.values())
for k,v in cnt.most_common(20): print(v, k)
