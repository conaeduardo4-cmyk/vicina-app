#!/usr/bin/env python3
"""Divide le chiavi in blocchi da ~3500 caratteri. 'python3 chunk.py N' stampa il blocco N (id<TAB>testo).
'python3 chunk.py status' dice quali blocchi sono tradotti (scripts/i18n/tr/NNN.json)."""
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__))
keys = json.load(open(os.path.join(H, 'keys.json')))
chunks, cur, size = [], [], 0
for i, k in enumerate(keys):
    if size + len(k) > 3500 and cur: chunks.append(cur); cur, size = [], 0
    cur.append(i); size += len(k)
if cur: chunks.append(cur)
if sys.argv[1] == 'status':
    done = [n for n in range(len(chunks)) if os.path.exists(os.path.join(H, 'tr', '%03d.json' % n))]
    print(len(chunks), 'blocchi; fatti:', len(done), '; mancano:', [n for n in range(len(chunks)) if n not in done][:20])
else:
    n = int(sys.argv[1])
    for i in chunks[n]: print('%d\t%s' % (i, keys[i]))
