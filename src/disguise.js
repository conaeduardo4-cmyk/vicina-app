// Modalità anonima: l'app diventa celeste/blu, l'icona cambia e spariscono tutte le parole che ricordano un SOS.
// Le funzioni restano tutte uguali: cambia solo quello che si vede (testi, colori, icona, scorciatoie, notifiche).
const MAP = [
  [/SOS IN CORSO/g, 'SEGNALE IN CORSO'], [/SOS ATTIVO/g, 'SEGNALE ATTIVO'], [/\bSOS\b(?= attivo)/g, 'Segnale'],
  [/\bdell'SOS\b/g, 'del segnale'], [/\ball'SOS\b/g, 'al segnale'], [/\bnell'SOS\b/g, 'nel segnale'], [/\bdall'SOS\b/g, 'dal segnale'],
  [/\bl'SOS\b/g, 'il segnale'], [/\bL'SOS\b/g, 'Il segnale'], [/\bun SOS\b/g, 'un segnale'], [/\bUn SOS\b/g, 'Un segnale'],
  [/\bgli SOS\b/g, 'i segnali'], [/\bi tuoi SOS\b/g, 'i tuoi segnali'], [/\bdi SOS\b/g, 'di segnali'], [/\bSOS\b/g, 'Segnale'],
  [/\bSIRENA\b/g, 'SUONO'], [/\bSirena\b/g, 'Suono forte'], [/\bsirena\b/g, 'suono'],
  [/\bAllarmi\b/g, 'Avvisi'], [/\ballarmi\b/g, 'avvisi'], [/\bAllarme\b/g, 'Avviso'], [/\ballarme\b/g, 'avviso'],
  [/\bEmergenza\b/g, 'Urgenza'], [/\bemergenza\b/g, 'urgenza'], [/\bemergenze\b/g, 'urgenze'], [/\bEMERGENZA\b/g, 'URGENZA'],
  [/\bpericolo\b/g, 'difficoltà'], [/\bPericolo\b/g, 'Difficoltà'],
  [/\bPrimo soccorso\b/g, 'Prime cure'], [/\bprimo soccorso\b/g, 'prime cure'], [/\bsoccorritori\b/g, 'chi ti assiste'], [/\bSoccorso\b/g, 'Assistenza'], [/\bsoccorso\b/g, 'assistenza'],
  [/\bha bisogno di aiuto\b/g, 'ti sta cercando'], [/\bHa bisogno di aiuto\b/g, 'Ti sta cercando'], [/\bho bisogno di aiuto\b/gi, 'mi serve una mano'],
  [/\bchiedere aiuto\b/g, 'chiedere una mano'], [/\bchiedi aiuto\b/g, 'chiedi una mano'], [/\bAIUTO\b/g, 'ATTENZIONE'], [/\bAiuto\b/g, 'Supporto'], [/\baiuto\b/g, 'una mano'],
  [/\bSono al sicuro\b/g, 'Tutto ok'], [/\bsono al sicuro\b/g, 'tutto ok'], [/\bSei al sicuro\?/g, 'Tutto ok?'], [/\bè al sicuro\b/g, 'sta bene'], [/\bal sicuro\b/g, 'a posto'],
  [/\bSei protett([ao])\b/g, 'Sei collegat$1'], [/\bprotett([ao])\b/g, 'collegat$1'], [/\bchi ti protegge\b/g, 'la tua cerchia'],
  [/\banti-scippo\b/g, 'anti-furto'], [/\bscippo\b/g, 'furto'], [/\baggressione\b/g, 'situazione difficile'], [/\bAggressione\b/g, 'Situazione difficile']
];
const SKIP = '.raw, input, textarea, script, style, .no-dz, .sign-big, .sr-in, .steps-list';

export function createDisguise({ native, api, onChange }) {
  let on = false, obs = null;
  const orig = new WeakMap();
  const conv = t => MAP.reduce((s, [r, v]) => s.replace(r, v), t);
  const skip = n => { const el = n.nodeType === 1 ? n : n.parentElement; return !el || !!el.closest(SKIP); };
  function fixText(n) {
    if (skip(n)) return;
    const o = orig.has(n) ? orig.get(n) : n.nodeValue;
    if (!orig.has(n)) orig.set(n, o);
    const want = on ? conv(o) : o;
    if (n.nodeValue !== want) n.nodeValue = want;
  }
  function fixAttrs(el) {
    if (el.closest?.(SKIP)) return;
    for (const a of ['aria-label', 'placeholder', 'title']) {
      if (!el.hasAttribute?.(a)) continue;
      const k = 'data-o-' + a;
      if (!el.hasAttribute(k)) el.setAttribute(k, el.getAttribute(a));
      const o = el.getAttribute(k), want = on ? conv(o) : o;
      if (el.getAttribute(a) !== want) el.setAttribute(a, want);
    }
    // elementi con una versione neutra scritta a mano
    if (el.dataset?.dz != null) {
      if (el.dataset.dzO == null) el.dataset.dzO = el.textContent;
      const want = on ? el.dataset.dz : el.dataset.dzO;
      if (el.textContent !== want) el.textContent = want;
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return fixText(root);
    if (root.nodeType !== 1) return;
    fixAttrs(root);
    root.querySelectorAll?.('[aria-label],[placeholder],[title],[data-dz]').forEach(fixAttrs);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (/\S/.test(n.nodeValue)) fixText(n);
  }
  function observe() {
    obs?.disconnect();
    obs = new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'characterData') { if (orig.has(m.target) && m.target.nodeValue !== (on ? conv(orig.get(m.target)) : orig.get(m.target))) { orig.set(m.target, m.target.nodeValue); fixText(m.target); } else if (!orig.has(m.target)) fixText(m.target); }
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  async function apply(v, { fromUser = false } = {}) {
    on = !!v; globalThis.__vicinaDiscreet = on;
    document.documentElement.classList.toggle('dz', on);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#06101C' : '#0B0B10');
    walk(document.body);
    if (!obs) observe();
    onChange?.(on);
    if (!fromUser) return;
    // icona, scorciatoie, widget, canale notifiche, notifiche dal server
    let icon = true;
    try { await native.vx.setIcon(on ? 'blue' : 'default'); } catch { icon = false; }
    native.vx.updateWidget(on);
    native.vx.channels(on);
    api.setDiscreet?.(on);
    return { icon };
  }
  // l'icona sul telefono deve corrispondere alla modalità scelta (iPhone a volte non la cambia al primo colpo):
  // a ogni avvio e quando l'app torna in primo piano la riallineiamo
  async function syncIcon() {
    if (!native.vx?.native) return;
    try {
      const cur = await native.vx.getIcon();
      if (!cur?.supported) return;
      const want = on ? 'blue' : 'default';
      if (cur.name !== want) await native.vx.setIcon(want);
    } catch (e) { console.warn('icona', e); }
  }
  setTimeout(syncIcon, 2500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(syncIcon, 800); });
  // testo neutro per frasi costruite nel codice (es. SMS, titoli)
  return { apply, conv, syncIcon, get on() { return on; } };
}
