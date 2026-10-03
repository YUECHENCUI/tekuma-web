#!/usr/bin/env python3
"""Slim a Protomaps basemap PMTiles extract down to what the TEKUMA map draws.

Keeps only the layers / feature kinds styled in js/map.js (land, water, a few
roads, parks and place names) and drops everything else (POIs, buildings,
transit, land cover …). Administrative boundaries from the tile source are
ALWAYS removed: China's boundary, provinces and the nine-dash line are drawn
from the official Alibaba DataV data instead (data/geo/overlay.json).

usage:  python3 scripts/filter_tiles.py in.pmtiles out.pmtiles [--stats] [--major-from=9]
needs:  pip install pmtiles
"""
import gzip, struct, sys, collections
from pmtiles.reader import Reader, MmapSource, all_tiles
from pmtiles.writer import Writer
from pmtiles.tile import TileType, Compression, zxy_to_tileid

# ---- what to keep: layer -> predicate(props, zoom) ---------------------------
# (labels and roads are only drawn from zoom 7 up, so lower zooms carry none)
MAJOR_FROM = 10   # city archives pass --major-from=9 so the city view's first zoom already has main streets

def roads(p, z):
    k = p['kind']
    if z < 6: return False
    return k == 'highway' or (k == 'major_road' and z >= MAJOR_FROM) or (k == 'minor_road' and z >= 13)

def places(p, z):
    k, d = p['kind'], p['kind_detail']
    if z < 6: return False
    # cities / districts, plus towns at city zoom; no neighbourhoods (too noisy for this map)
    return k == 'locality' and (d == 'city' or (d == 'town' and z >= 11))

def landuse(p, z):
    return z >= 10 and p['kind'] in ('park', 'national_park', 'nature_reserve', 'forest', 'wood', 'golf_course', 'cemetery', 'garden', 'recreation_ground')

RULES = {
    'earth':   lambda p, z: True,
    'water':   lambda p, z: True,
    'roads':   roads,
    'places':  places,
    'landuse': landuse,
}
PROPS = ('kind', 'kind_detail')
# area layers keep polygons only (rivers as lines / label points would be drawn as bogus fills)
POLYGON_ONLY = {'earth', 'water', 'landuse'}

# ---- minimal protobuf helpers (Mapbox Vector Tile) ----------------------------
def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1; r |= (c & 0x7F) << s; s += 7
        if c < 0x80: return r, i

def enc_varint(v):
    out = bytearray()
    while True:
        c = v & 0x7F; v >>= 7
        if v: out.append(c | 0x80)
        else: out.append(c); return bytes(out)

def fields(b):
    """yield (field, payload, raw_bytes_including_key)"""
    i, n = 0, len(b)
    while i < n:
        s0 = i
        key, i = varint(b, i); f, t = key >> 3, key & 7
        if t == 0: j = i; _, i = varint(b, i); yield f, b[j:i], b[s0:i]
        elif t == 2: l, j = varint(b, i); i = j + l; yield f, b[j:i], b[s0:i]
        elif t == 5: i += 4; yield f, b[i - 4:i], b[s0:i]
        elif t == 1: i += 8; yield f, b[i - 8:i], b[s0:i]
        else: raise ValueError('unsupported wire type %d' % t)

def decode_value(vb):
    for f, v, _ in fields(vb):
        if f == 1: return v.decode('utf8', 'replace')
        if f == 2: return struct.unpack('<f', v)[0]
        if f == 3: return struct.unpack('<d', v)[0]
        if f in (4, 5): return varint(v, 0)[0]
        if f == 6: n = varint(v, 0)[0]; return (n >> 1) ^ -(n & 1)
        if f == 7: return bool(varint(v, 0)[0])
    return None

def filter_layer(lb, z):
    name, keys, vals, feats, other = None, [], [], [], bytearray()
    for f, v, raw in fields(lb):
        if f == 2: feats.append(v)
        else:
            other += raw
            if f == 1: name = v.decode()
            elif f == 3: keys.append(v.decode())
            elif f == 4: vals.append(v)
    pred = RULES.get(name)
    if pred is None: return name, None
    want = {i for i, k in enumerate(keys) if k in PROPS}
    out, kept, cache = bytearray(other), 0, {}
    for fb in feats:
        p = dict.fromkeys(PROPS, '')
        gtype = 0
        for f, v, _ in fields(fb):
            if f == 3: gtype = varint(v, 0)[0]
            if f != 2: continue
            i, arr = 0, []
            while i < len(v): x, i = varint(v, i); arr.append(x)
            for k in range(0, len(arr) - 1, 2):
                if arr[k] in want:
                    vi = arr[k + 1]
                    if vi not in cache: cache[vi] = decode_value(vals[vi])
                    p[keys[arr[k]]] = cache[vi]
        if name in POLYGON_ONLY and gtype != 3: continue
        if pred(p, z):
            out += b'\x12' + enc_varint(len(fb)) + fb; kept += 1
    return name, (bytes(out) if kept else None)

def main():
    global MAJOR_FROM
    src, dst = sys.argv[1], sys.argv[2]
    for a in sys.argv[3:]:
        if a.startswith('--major-from='): MAJOR_FROM = int(a.split('=')[1])
    seen, kept = collections.Counter(), collections.Counter()
    with open(src, 'rb') as f:
        reader = Reader(MmapSource(f)); header = reader.header(); meta = reader.metadata()
        tiles = sorted(all_tiles(reader.get_bytes), key=lambda t: zxy_to_tileid(*t[0]))
    n = 0
    with open(dst, 'wb') as out:
        w = Writer(out)
        for (z, x, y), data in tiles:
            res = bytearray()
            for f, v, raw in fields(gzip.decompress(data)):
                if f != 3: continue
                name, lb = filter_layer(v, z)
                seen[name] += len(raw)
                if lb:
                    enc = b'\x1a' + enc_varint(len(lb)) + lb
                    res += enc; kept[name] += len(enc)
            if res:
                w.write_tile(zxy_to_tileid(z, x, y), gzip.compress(bytes(res), 9)); n += 1
        header['tile_type'] = TileType.MVT
        header['tile_compression'] = Compression.GZIP
        header['internal_compression'] = Compression.GZIP
        m = {k: meta[k] for k in ('name', 'attribution', 'version', 'type') if k in meta}
        m['description'] = 'TEKUMA basemap: Protomaps basemap (OpenStreetMap, Natural Earth), filtered by scripts/filter_tiles.py'
        m['vector_layers'] = [{'id': k, 'fields': {}} for k in RULES]
        w.finalize(header, m)
    if '--stats' in sys.argv:
        print('  in  KB:', {k: v // 1024 for k, v in seen.most_common()})
        print('  out KB:', {k: v // 1024 for k, v in kept.most_common()})
    print(dst, n, 'tiles')

if __name__ == '__main__':
    main()
