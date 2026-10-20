#!/usr/bin/env python3
"""Estrae dal codice di Vicina tutti i testi italiani mostrati all'utente.
Ogni template `...${x}...` diventa un modello con segnaposto {0}, {1}… e viene spezzato sui tag HTML
(come i nodi di testo che il browser crea). Scrive scripts/i18n/strings.json (chiave → contesto)."""
import re, json, sys, os, html
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
FILES = ['src/app.js', 'src/tools.js', 'src/tools-extra.js', 'src/tools-more.js', 'src/tools-more2.js', 'src/tools-more3.js',
         'src/lock.js', 'src/appello.js', 'src/centrale.js', 'src/qr.js', 'src/map.js', 'src/native.js', 'src/native-web.js',
         'src/api-supabase.js', 'src/terms.js', 'src/demo-api.js', 'src/disguise.js', 'src/main.js', 'src/interprete.js']
SKIP_FILES_FOR_DISGUISE = {'src/disguise.js'}

def lex(src):
    """Restituisce i letterali: ('str', testo) oppure ('tpl', [parti], [espressioni]) con annidamenti."""
    out = []; i = 0; n = len(src); prev = ''
    def read_string(q, i):
        j = i + 1; buf = []
        while j < n:
            c = src[j]
            if c == '\\':
                nx = src[j + 1] if j + 1 < n else ''
                buf.append({'n': '\n', 't': '\t', "'": "'", '"': '"', '\\': '\\', '`': '`', '$': '$'}.get(nx, nx)); j += 2; continue
            if c == q: return ''.join(buf), j + 1
            if c == '\n' and q != '`': return ''.join(buf), j
            buf.append(c); j += 1
        return ''.join(buf), j
    def read_template(i):
        j = i + 1; parts = []; exprs = []; buf = []
        while j < n:
            c = src[j]
            if c == '\\':
                nx = src[j + 1] if j + 1 < n else ''
                buf.append({'n': '\n', 't': '\t', '`': '`', '$': '$', '\\': '\\', "'": "'"}.get(nx, nx)); j += 2; continue
            if c == '`': parts.append(''.join(buf)); return ('tpl', parts, exprs), j + 1
            if c == '$' and j + 1 < n and src[j + 1] == '{':
                parts.append(''.join(buf)); buf = []
                depth = 1; k = j + 2; start = k
                while k < n and depth:
                    ch = src[k]
                    if ch in '\'"':
                        _, k = read_string(ch, k); continue
                    if ch == '`':
                        _, k = read_template(k); continue
                    if ch == '{': depth += 1
                    elif ch == '}': depth -= 1
                    k += 1
                exprs.append(src[start:k - 1]); j = k; continue
            buf.append(c); j += 1
        parts.append(''.join(buf)); return ('tpl', parts, exprs), j
    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            k = src.find('\n', i); i = n if k < 0 else k; continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            k = src.find('*/', i + 2); i = n if k < 0 else k + 2; continue
        if c in '\'"':
            s, i = read_string(c, i); out.append(('str', s)); prev = 'x'; continue
        if c == '`':
            t, i = read_template(i); out.append(t); prev = 'x'; continue
        if c == '/' and (prev in '' or prev in '(,=:[!&|?{};+-*%<>~^' ):
            # letterale regex
            j = i + 1; cls = False
            while j < n:
                ch = src[j]
                if ch == '\\': j += 2; continue
                if ch == '[': cls = True
                elif ch == ']': cls = False
                elif ch == '/' and not cls: break
                elif ch == '\n': break
                j += 1
            j += 1
            while j < n and src[j].isalpha(): j += 1
            i = j; prev = 'x'; continue
        if not c.isspace():
            if c.isalnum() or c in '_$': 
                m = re.match(r'[A-Za-z0-9_$]+', src[i:]); w = m.group(0); i += len(w)
                prev = '(' if w in ('return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do') else 'x'
                continue
            prev = c if c in '(,=:[!&|?{};+-*%<>~^' else 'x'
        i += 1
    return out

def nested(exprs):
    res = []
    for e in exprs: res += lex(e)
    return res

TAG = re.compile(r'<[^<>]*>')
def ui_text(s):
    t = s.strip()
    if len(t) < 2 and not re.search(r'[A-Za-zÀ-ÿ]', t): return False
    if not re.search(r'[A-Za-zÀ-ÿ]', t): return False
    if re.fullmatch(r'[a-z0-9_.:#/\-]+', t): return False           # identificatori, classi, percorsi
    if re.fullmatch(r'[A-Za-z0-9_\-]+', t) and not re.search(r'[A-Z]', t[:1]): return False
    if re.match(r'^(https?:|tel:|sms:|mailto:|data:|vicina:|maps:|geo:|intent:|capacitor)', t): return False
    if re.search(r'[{};]\s*$', t) and re.search(r':\s*[^ ]+;', t): return False   # css
    if re.fullmatch(r'[\w\-]+(\s+[\w\-]+)*', t) and all(re.fullmatch(r'[a-z][\w\-]*', w) for w in t.split()) and not re.search(r'[àèéìòù]', t):
        # parole tutte minuscole senza accenti: classi css oppure testo? tenuto se contiene parole italiane comuni
        if not re.search(r'\b(il|la|lo|le|gli|un|una|di|da|per|con|che|non|sei|ti|mi|si|è|al|alla|del|della|nel|sul|in|a|e|o|ora|tutti|chiama|apri|invia|prova)\b', t): return False
    return True

def ph_norm(s):
    return re.sub(r'\s+', ' ', s).strip()

def frags_of_template(parts):
    """Ricompone il template con {n} e lo spezza sui tag HTML."""
    s = ''
    for k, p in enumerate(parts):
        s += p.replace('{', '{{').replace('}', '}}')
        if k < len(parts) - 1: s += '\x00%d\x00' % k
    # attributi con testo dentro ai tag
    attrs = []
    for m in re.finditer(r'(?:aria-label|placeholder|title|alt|data-dz)="([^"]*)"', s):
        attrs.append(m.group(1))
    pieces = TAG.split(s) + attrs
    out = []
    for p in pieces:
        p = html.unescape(p)
        # rinumera i segnaposto da 0 nel pezzo
        idx = {}
        def rep(m):
            k = m.group(1)
            if k not in idx: idx[k] = len(idx)
            return '{%d}' % idx[k]
        q = re.sub(r'\x00(\d+)\x00', rep, p)
        for q in split_md(q):
            core = re.sub(r'\{\d+\}', '', q)
            if not ui_text(core): continue
            if re.fullmatch(r'(\{\d+\}\s*)+', q): continue
            out.append(q)
    return out

def split_md(q):
    res = []
    for line in re.split(r'\n', q):
        for part in re.split(r'\*\*', line):
            part = re.sub(r'^\s*[-•]\s+', '', part)
            part = ph_norm(part)
            if part: res.append(part)
    return res

def collect(path):
    src = open(os.path.join(ROOT, path), encoding='utf-8').read()
    found = []
    def walk(toks):
        for t in toks:
            if t[0] == 'str':
                if '<' in t[1] and '>' in t[1]:
                    found.extend(frags_of_template([t[1]]))
                else:
                    raw = html.unescape(t[1])
                    for s in ([ph_norm(raw)] + (split_md(raw) if ('**' in raw or '\n' in raw) else [])):
                        if ui_text(s) and not re.search(r'\{\d+\}', s): found.append(s)
            else:
                found.extend(frags_of_template(t[1]))
                walk(nested(t[2]))
    walk(lex(src))
    return found

def collect_html(path):
    s = open(os.path.join(ROOT, path), encoding='utf-8').read()
    s = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>|<svg[\s\S]*?</svg>|<!--[\s\S]*?-->', ' ', s)
    out = []
    for m in re.finditer(r'(?:aria-label|placeholder|title|alt|data-dz|content)="([^"]*)"', s):
        v = ph_norm(html.unescape(m.group(1)))
        if ui_text(v) and not re.match(r'^(width|#|[0-9])', v): out.append(v)
    for p in TAG.split(s):
        v = ph_norm(html.unescape(p))
        if ui_text(v): out.append(v)
    return out

if __name__ == '__main__':
    allk = {}
    for f in FILES:
        if not os.path.exists(os.path.join(ROOT, f)): continue
        for k in collect(f): allk.setdefault(k, f)
    for k in collect_html('index.html'): allk.setdefault(k, 'index.html')
    # testi non UI evidenti
    BAD = re.compile(r'^(use strict|GET|POST|PUT|DELETE|Content-Type|application/|image/|audio/|video/|text/|utf-8|Bearer|apikey|Authorization)')
    keys = sorted(k for k in allk if not BAD.match(k))
    json.dump({k: allk[k] for k in keys}, open(os.path.join(os.path.dirname(__file__), 'strings.json'), 'w'), ensure_ascii=False, indent=0)
    print(len(keys), 'testi;', sum(len(k.split()) for k in keys), 'parole')
