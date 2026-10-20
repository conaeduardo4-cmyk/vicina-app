// Lingue di Vicina. L'app è scritta in italiano; per le altre lingue ogni testo che compare sullo schermo
// (nodi di testo e attributi come placeholder, aria-label, title) passa da un dizionario:
//  · prima la frase esatta,
//  · poi i «modelli» con parti variabili ("Avvisate {0} persone" ↔ "{0} people notified"), con le parti tradotte a loro volta,
//  · infine i pezzi separati da « · » o con la punteggiatura finale tolta.
// Così cambia lingua TUTTO, anche i testi costruiti dal codice, senza riscrivere ogni schermata.
// I testi scritti dalle persone (chat, nomi, note) stanno dentro elementi con translate="no" e non vengono toccati.
export const LANGS = [
  { code: 'it', name: 'Italiano', it: 'italiano', locale: 'it-IT', flag: '🇮🇹' },
  { code: 'en', name: 'English', it: 'inglese', locale: 'en-GB', flag: '🇬🇧' },
  { code: 'es', name: 'Español', it: 'spagnolo', locale: 'es-ES', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', it: 'francese', locale: 'fr-FR', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', it: 'tedesco', locale: 'de-DE', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', it: 'portoghese', locale: 'pt-PT', flag: '🇵🇹' },
  { code: 'ar', name: 'العربية', it: 'arabo', locale: 'ar', flag: '🇸🇦', rtl: true },
  { code: 'uk', name: 'Українська', it: 'ucraino', locale: 'uk-UA', flag: '🇺🇦' },
  { code: 'ro', name: 'Română', it: 'rumeno', locale: 'ro-RO', flag: '🇷🇴' },
  { code: 'sq', name: 'Shqip', it: 'albanese', locale: 'sq-AL', flag: '🇦🇱' }
];
const LOAD = {
  en: () => import('./lang/en.js'), es: () => import('./lang/es.js'), fr: () => import('./lang/fr.js'), de: () => import('./lang/de.js'),
  pt: () => import('./lang/pt.js'), ar: () => import('./lang/ar.js'), uk: () => import('./lang/uk.js'), ro: () => import('./lang/ro.js'), sq: () => import('./lang/sq.js')
};

const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let lang = 'it', info = LANGS[0], dict = null, byFirst = new Map(), lead = [], dzMap = [], cache = new Map();
const norm = s => s.replace(/\s+/g, ' ').trim();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const current = () => lang;
export const langInfo = () => info;
export const locale = () => info.locale;
export const isRtl = () => !!info.rtl;

// lingua scelta: Impostazioni › Lingua; al primo avvio quella del telefono (se c'è), altrimenti italiano
function pick() {
  try { const p = JSON.parse(store.get('prefs') || '{}'); if (p.lang && LANGS.some(l => l.code === p.lang)) return p.lang; } catch {}
  const nav = (navigator.languages || [navigator.language || 'it']).map(x => String(x).slice(0, 2).toLowerCase());
  return nav.find(c => LANGS.some(l => l.code === c)) || 'it';
}

function compile(d) {
  dict = new Map(); byFirst = new Map(); lead = []; cache = new Map();
  for (const [k, v] of Object.entries(d)) {
    if (!v || k === '__dz') continue;
    if (/\{\d+\}/.test(k)) {
      const parts = k.split(/(\{\d+\})/);
      const order = [];
      const re = new RegExp('^' + parts.map(p => { const m = /^\{(\d+)\}$/.exec(p); if (m) { order.push(+m[1]); return '([\\s\\S]+?)'; } return esc(p); }).join('') + '$');
      const pat = { re, order, out: v, len: k.length };
      const fw = norm(parts[0]).split(' ')[0];
      if (fw) { if (!byFirst.has(fw)) byFirst.set(fw, []); byFirst.get(fw).push(pat); }
      else lead.push(pat);
    } else dict.set(norm(k), v);
  }
  for (const l of byFirst.values()) l.sort((a, b) => b.len - a.len);
  lead.sort((a, b) => b.len - a.len);
  dzMap = (d.__dz || []).map(([a, b]) => [new RegExp(a, 'g'), b]);
}

function viaPattern(s) {
  const fw = s.split(' ')[0];
  const cands = [...(byFirst.get(fw) || []), ...lead];
  for (const p of cands) {
    const m = p.re.exec(s); if (!m) continue;
    const vals = {}; p.order.forEach((n, i) => { vals[n] = m[i + 1]; });
    return p.out.replace(/\{(\d+)\}/g, (_, n) => { const v = vals[n]; return v == null ? '' : (tr(v) ?? v); });
  }
  return null;
}
// traduce una frase (senza spazi ai lati); null se non la conosce
function tr(s) {
  if (!s) return null;
  if (cache.has(s)) return cache.get(s);
  let r = dict.get(s) ?? null;
  if (r == null && /\{|\}/.test(s) === false) r = viaPattern(s);
  if (r == null) {   // punteggiatura finale, virgolette, pezzi separati da « · »
    const m = /^([«"“(]?)([\s\S]*?)([.:!?…»"”)]*)$/.exec(s);
    if (m && (m[1] || m[3]) && m[2] && m[2] !== s) { const x = dict.get(m[2]) ?? viaPattern(m[2]); if (x != null) r = m[1] + x + m[3]; }
  }
  if (r == null && /^[A-ZÀ-Ý]/.test(s)) {   // stessa frase con l'iniziale minuscola (pezzi riusati a inizio frase)
    const low = s[0].toLowerCase() + s.slice(1), x = dict.get(low) ?? null;
    if (x != null) r = x.charAt(0).toLocaleUpperCase(lang) + x.slice(1);
  }
  if (r == null && /^[a-zà-ý]/.test(s)) {
    const up = s[0].toUpperCase() + s.slice(1), x = dict.get(up) ?? null;
    if (x != null) r = x.charAt(0).toLocaleLowerCase(lang) + x.slice(1);
  }
  if (r == null && s.includes(' · ')) { const ps = s.split(' · '); const xs = ps.map(p => tr(p.trim())); if (xs.some(x => x != null)) r = ps.map((p, i) => xs[i] ?? p).join(' · '); }
  if (cache.size > 6000) cache.clear();
  cache.set(s, r);
  return r;
}
const dz = s => (globalThis.__vicinaDiscreet && dzMap.length ? dzMap.reduce((a, [re, b]) => a.replace(re, b), s) : s);

// per i testi costruiti dal codice che non passano dallo schermo (avvisi di sistema, voce, SMS, notifiche…)
export function t(s) {
  if (lang === 'it' || s == null) return s;
  const str = String(s);
  if (str.includes('\n')) return str.split('\n').map(x => t(x)).join('\n');
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
  const x = tr(norm(m[2]));
  return x == null ? dz(str) : m[1] + dz(x) + m[3];
}

/* ---------------- traduzione della pagina ---------------- */
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const done = new WeakMap();      // nodo → ultimo testo scritto da noi (per non ritradurre)
const SKIP = 'script,style,code,textarea,[translate="no"],.notranslate,[contenteditable="true"]';
function fixText(n) {
  const v = n.nodeValue; if (!v || !/[A-Za-zÀ-ÿ]/.test(v)) return;
  if (done.get(n) === v) return;
  const el = n.parentElement; if (!el || el.closest(SKIP)) return;
  const out = t(v);
  done.set(n, out);
  if (out !== v) n.nodeValue = out;
}
function fixAttrs(el) {
  if (!el.getAttribute || el.closest?.('[translate="no"],.notranslate')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a); if (!v) continue;
    const key = 'i18n' + a; if (el[key] === v) continue;
    const out = t(v); el[key] = out; if (out !== v) el.setAttribute(a, out);
  }
  if (el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type) && el.value) { const o = t(el.value); if (o !== el.value) el.value = o; }
}
function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) return fixText(root);
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (root.closest(SKIP)) return; fixAttrs(root); }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => n.nodeType === 1 ? (n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) : NodeFilter.FILTER_ACCEPT
  });
  let n; while ((n = w.nextNode())) { if (n.nodeType === 3) fixText(n); else fixAttrs(n); }
}
let obs = null;
function observe() {
  obs = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') fixText(m.target);
      else if (m.type === 'attributes') fixAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

export async function init() {
  lang = pick(); info = LANGS.find(l => l.code === lang) || LANGS[0];
  globalThis.vLang = lang; globalThis.vLoc = info.locale; globalThis.vT = t;
  document.documentElement.lang = lang;
  document.documentElement.dir = info.rtl ? 'rtl' : 'ltr';
  if (lang === 'it') return;
  try { compile((await LOAD[lang]()).default); }
  catch (e) { console.warn('lingua', e); lang = 'it'; info = LANGS[0]; globalThis.vLang = 'it'; globalThis.vLoc = 'it-IT'; document.documentElement.lang = 'it'; document.documentElement.dir = 'ltr'; return; }
  walk(document.body); observe();
  document.title = t(document.title);
}

export function setLang(code) {
  if (!LANGS.some(l => l.code === code) || code === lang) return false;
  try { const p = JSON.parse(store.get('prefs') || '{}'); p.lang = code; store.set('prefs', JSON.stringify(p)); } catch {}
  location.reload();
  return true;
}
