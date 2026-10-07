# Genera le regole della modalità anonima (palette blu) a partire da style.css.
# Uso: python3 scripts/dev/gen-dz-css.py src/style.css > src/style-dz.css
import re, sys
css = open(sys.argv[1]).read()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
REP = [('#E8192C', '#2F80ED'), ('#e8192c', '#2F80ED'), ('#FF4D5E', '#56A8FF'), ('#FF3B4E', '#4D9BFF'), ('#FF5A68', '#6BB4FF'),
       ('#B0101E', '#1C5DB8'), ('#3A0710', '#0A2440'), ('rgba(232,25,44,', 'rgba(47,128,237,'), ('rgba(255,59,78,', 'rgba(77,155,255,'),
       ('rgba(255,77,94,', 'rgba(86,168,255,'), ('rgba(232, 25, 44,', 'rgba(47,128,237,'), ('#A50D24', '#1A56B0'), ('#B8102A', '#1E63C4'), ('#14060A', '#060E1A'), ('#16060A', '#06101C'), ('#FF8C7A', '#8CC8FF')]
RED = re.compile('|'.join(re.escape(a) for a, _ in REP), re.I)
SKIP = ('.tool-ov.siren', '.tool-ov.fired', '.tool-ov.sign', '@keyframes')

def blocks(s):
    out, i, n = [], 0, len(s)
    while i < n:
        j = s.find('{', i)
        if j < 0: break
        pre = s[i:j].strip(); depth, k = 1, j + 1
        while k < n and depth:
            depth += {'{': 1, '}': -1}.get(s[k], 0); k += 1
        out.append((pre, s[j + 1:k - 1])); i = k
    return out

def scope(sel):
    parts = []
    for x in sel.split(','):
        x = x.strip()
        if not x: continue
        if x.startswith(':root'): parts.append('html.dz' + x[5:])
        elif x.startswith('html'): parts.append('html.dz' + x[4:])
        else: parts.append('html.dz ' + x)
    return ','.join(parts)

def conv(body):
    decls = [d.strip() for d in body.split(';') if d.strip()]
    keep = [d for d in decls if RED.search(d)]
    for a, b in REP: keep = [d.replace(a, b) for d in keep]
    return ';'.join(keep)

res = []
for pre, body in blocks(css):
    if pre.startswith('@keyframes') or pre.startswith('@font-face'): continue
    if pre.startswith('@media') or pre.startswith('@supports'):
        inner = [(p2, conv(b2)) for p2, b2 in blocks(body) if not any(sk in p2 for sk in SKIP)]
        inner = [f'{scope(p2)}{{{b2}}}' for p2, b2 in inner if b2]
        if inner: res.append(pre + '{' + ''.join(inner) + '}')
        continue
    if any(sk in pre for sk in SKIP): continue
    c = conv(body)
    if c: res.append(f'{scope(pre)}{{{c}}}')
print('/* modalità anonima: generato da scripts/dev/gen-dz-css.py, palette blu al posto del rosso */')
print('\n'.join(res))
