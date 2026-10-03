#!/usr/bin/env python3
"""Regenerate the self-hosted web-font subsets.

The Chinese face (Noto Sans SC = Source Han Sans, OFL) is ~18 MB in full, so the
site ships only the characters it actually uses. Run this after changing any
text (js/i18n.js, data/projects.json, *.html):

    pip install fonttools brotli
    python3 scripts/subset-fonts.py

Sources (OFL 1.1) are downloaded once into assets/fonts/src/ (git-ignored):
  Instrument Sans  https://github.com/Instrument/instrument-sans
  Noto Sans SC     https://github.com/notofonts/noto-cjk
Outputs: assets/fonts/InstrumentSans-latin.woff2  (variable wdth+wght)
         assets/fonts/NotoSansSC-<weight>.woff2   (static weights, site glyphs only)
"""
import os, re, sys, urllib.request, glob
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/fonts/src')
OUT = os.path.join(ROOT, 'assets/fonts')
GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
FONTS = {
    'InstrumentSans.ttf': GF + 'instrumentsans/InstrumentSans%5Bwdth,wght%5D.ttf',
    'NotoSansSC.ttf': GF + 'notosanssc/NotoSansSC%5Bwght%5D.ttf',
}
CJK_WEIGHTS = [400, 500]          # body / headings; keep in sync with css/style.css @font-face

def fetch():
    os.makedirs(SRC, exist_ok=True)
    for name, url in FONTS.items():
        p = os.path.join(SRC, name)
        if not os.path.exists(p):
            print('downloading', name); urllib.request.urlretrieve(url, p)

def site_text():
    files = glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, 'js/*.js')) + \
            [os.path.join(ROOT, 'data/projects.json')]
    text = ''
    for f in files:
        text += open(f, encoding='utf8').read()
    # decode \uXXXX escapes that may appear in JSON
    text += re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), text)
    cjk = {c for c in text if ord(c) > 0x2E7F}
    # always include common punctuation and digits so small edits don't break
    extra = '，。、；：？！“”‘’（）《》【】—…·「」『』〜％＋－０１２３４５６７８９'
    return ''.join(sorted(cjk | set(extra)))

def run_subset(src, dst, text=None, unicodes=None):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = True        # keep TrueType hinting: Windows / Linux Chrome space unhinted text unevenly
    font = src if isinstance(src, TTFont) else TTFont(src)
    s = subset.Subsetter(opts)
    s.populate(text=text or '', unicodes=unicodes or [])
    s.subset(font)
    subset.save_font(font, dst, opts)
    print('%-34s %6.1f KB' % (os.path.relpath(dst, ROOT), os.path.getsize(dst) / 1024))

def main():
    fetch()
    latin = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D,
             0x2022, 0x2026, 0x2032, 0x2033, 0x2039, 0x203A, 0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2197, 0x00D7, 0x2212]
    run_subset(os.path.join(SRC, 'InstrumentSans.ttf'), os.path.join(OUT, 'InstrumentSans-latin.woff2'), unicodes=latin)
    text = site_text()
    print(len(text), 'CJK characters used on the site')
    for w in CJK_WEIGHTS:
        f = instancer.instantiateVariableFont(TTFont(os.path.join(SRC, 'NotoSansSC.ttf')), {'wght': w})
        run_subset(f, os.path.join(OUT, 'NotoSansSC-%d.woff2' % w), text=text)

if __name__ == '__main__':
    main()
