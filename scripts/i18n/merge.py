#!/usr/bin/env python3
"""Unisce scripts/i18n/tr/*.json in src/lang/<lingua>.js (chiave italiana -> traduzione)."""
import json, os, glob
H = os.path.dirname(os.path.abspath(__file__))
R = os.path.dirname(os.path.dirname(H))
keys = json.load(open(os.path.join(H, 'keys.json')))
LANGS = ['en', 'es', 'fr', 'de', 'pt', 'ar', 'uk', 'ro', 'sq']
EXTRA = {'en': {'O': 'W'}, 'de': {'O': 'W'}}
out = {l: {} for l in LANGS}
for f in sorted(glob.glob(os.path.join(H, 'tr', '*.json'))):
    for i, vals in json.load(open(f)).items():
        k = keys[int(i)]
        for l, v in zip(LANGS, vals):
            if v and v != k: out[l][k] = v
kset = set(keys)
for l in LANGS:
    d = out[l]
    # "{0}Testo": se "Testo" esiste già da solo, il modello non serve (e potrebbe catturare frasi a caso)
    for k in [k for k in d if k.startswith('{0}') and k[3:] in d and '{' not in k[3:]]: del d[k]
    d.update(EXTRA.get(l, {}))
    with open(os.path.join(R, 'src', 'lang', l + '.js'), 'w') as fh:
        fh.write('// generato da scripts/i18n/merge.py\nexport default ' + json.dumps(d, ensure_ascii=False, indent=0) + ';\n')
    print(l, len(d))
