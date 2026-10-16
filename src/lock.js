// Blocco dell'app: codice personale (4-6 cifre) + Face ID / Touch ID su iPhone, sblocco con il volto o impronta su Android.
// Il codice non viene mai salvato in chiaro: solo un'impronta SHA-256 con sale casuale, su questo telefono.
// IMPORTANTE: anche con l'app bloccata l'SOS e il 112 restano sempre raggiungibili dalla schermata di blocco.
export function createLock(ctx) {
  const { $, I, esc, toast, openSheet, closeSheet, native, ls, prefs, savePrefs } = ctx;
  const KEY = 'appLock';
  const cfg = () => { try { return JSON.parse(ls.get(KEY) || 'null'); } catch { return null; } };
  const saveCfg = c => ls.set(KEY, c ? JSON.stringify(c) : '');
  const enabled = () => !!(prefs.lock && cfg()?.hash);
  const bio = { available: false, type: 'none', checked: false };
  const AFTER = [[0, 'Subito'], [60, 'Dopo 1 minuto'], [300, 'Dopo 5 minuti'], [900, 'Dopo 15 minuti']];

  // ---------- impronta del codice ----------
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  async function hash(pin, salt) {
    const d = new TextEncoder().encode('vicina:' + salt + ':' + pin);
    if (crypto?.subtle) return hex(await crypto.subtle.digest('SHA-256', d));
    let h = 2166136261; for (const x of d) { h ^= x; h = Math.imul(h, 16777619) >>> 0; } return 'f' + h.toString(16);   // riserva (non dovrebbe servire)
  }
  const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
  async function check(pin) { const c = cfg(); return !!c && (await hash(pin, c.salt)) === c.hash; }

  // ---------- biometria del telefono ----------
  async function bioInfo() {
    if (bio.checked) return bio;
    try { const r = await native.vx?.bioInfo?.(); if (r) Object.assign(bio, { available: !!r.available, type: r.type || 'biometric' }); } catch {}
    bio.checked = true; return bio;
  }
  const bioName = () => ({ faceid: 'Face ID', touchid: 'Touch ID', opticid: 'Optic ID', face: 'Sblocco con il volto', 'face-or-finger': 'Volto o impronta', finger: 'Impronta digitale' }[bio.type] || 'Dati biometrici');
  const bioIcon = () => (bio.type === 'touchid' || bio.type === 'finger' ? 'key' : 'user');

  // ---------- schermata di blocco ----------
  let el = null, entry = '', fails = 0, waitUntil = 0, unlocking = false, hiddenAt = 0;
  const locked = () => !!el?.classList.contains('on');
  const discreet = () => !!globalThis.__vicinaDiscreet;
  function build() {
    el = document.createElement('div'); el.id = 'lock'; el.className = 'lock';
    el.innerHTML = `<div class="lk-top"><div class="lk-logo">${I('shield')}</div><h2 id="lk-t">Vicina è bloccata</h2><p id="lk-s">Inserisci il codice</p>
        <b class="lk-dots" id="lk-dots"></b><p class="lk-in" id="lk-in" hidden></p></div>
      <div class="lk-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-lk="${n}">${n}</button>`).join('')}<button data-lk="bio" id="lk-bio" aria-label="Sblocca con i dati biometrici" hidden>${I('user')}</button><button data-lk="0">0</button><button data-lk="del" aria-label="Cancella">⌫</button></div>
      <div class="lk-foot"><button class="lk-sos" id="lk-sos"><b id="lk-sos-t">SOS</b><small>tieni premuto</small><i id="lk-prog"></i></button><a class="lk-112" href="tel:112">${I('phone')}112</a></div>
      <button class="lk-forgot" data-lk="forgot">Codice dimenticato?</button>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-lk]'); if (!b) return; native.haptic('light'); key(b.dataset.lk); });
    // SOS dalla schermata di blocco: tieni premuto 1,5 secondi (come in Home)
    const sos = el.querySelector('#lk-sos'); let t0 = 0, raf = 0;
    const stop = () => { cancelAnimationFrame(raf); t0 = 0; el.querySelector('#lk-prog').style.width = '0'; };
    const loop = () => { const p = Math.min(1, (Date.now() - t0) / 1500); el.querySelector('#lk-prog').style.width = p * 100 + '%'; if (p >= 1) { stop(); native.vibrate([200, 100, 200]); ctx.sos(); el.querySelector('#lk-s').textContent = discreet() ? 'Avviso inviato' : 'SOS inviato: sblocca per gestirlo'; return; } raf = requestAnimationFrame(loop); };
    sos.addEventListener('pointerdown', e => { e.preventDefault(); t0 = Date.now(); native.haptic('medium'); loop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => sos.addEventListener(ev, stop));
  }
  function dots() {
    const len = Math.max(4, cfg()?.len || 4);
    el.querySelector('#lk-dots').textContent = '●'.repeat(entry.length) + '○'.repeat(Math.max(0, len - entry.length));
  }
  async function show(reason) {
    if (!enabled()) return;
    if (!el) build();
    entry = ''; dots();
    el.querySelector('#lk-sos-t').textContent = discreet() ? 'AIUTO' : 'SOS';
    el.querySelector('#lk-s').textContent = 'Inserisci il codice';
    el.classList.add('on'); document.body.classList.add('is-locked');
    await bioInfo();
    const bb = el.querySelector('#lk-bio');
    bb.hidden = !(bio.available && cfg()?.bio);
    bb.innerHTML = I(bioIcon()); bb.setAttribute('aria-label', 'Sblocca con ' + bioName());
    if (reason !== 'hidden' && document.visibilityState === 'visible' && bio.available && cfg()?.bio) setTimeout(tryBio, 350);
  }
  function hide() { el?.classList.remove('on'); document.body.classList.remove('is-locked'); entry = ''; ctx.onUnlock?.(); }
  async function tryBio() {
    if (unlocking || !locked() || !bio.available || !cfg()?.bio) return;
    unlocking = true;
    try {
      const r = await native.vx.bioAuth({ reason: 'Sblocca Vicina' });
      if (r?.ok) { fails = 0; hide(); }
    } catch {}
    unlocking = false;
  }
  async function key(k) {
    if (k === 'bio') return tryBio();
    if (k === 'forgot') return forgot();
    if (Date.now() < waitUntil) { el.querySelector('#lk-s').textContent = `Troppi tentativi: riprova tra ${Math.ceil((waitUntil - Date.now()) / 1000)} s`; return; }
    if (k === 'del') entry = entry.slice(0, -1);
    else if (entry.length < 6) entry += k;
    dots();
    const len = cfg()?.len || 4;
    if (entry.length < len) return;
    const ok = await check(entry); entry = '';
    if (ok) { fails = 0; hide(); return; }
    fails++; native.vibrate(250); dots();
    el.querySelector('.lk-top').classList.remove('shake'); void el.offsetWidth; el.querySelector('.lk-top').classList.add('shake');
    if (fails >= 5) { waitUntil = Date.now() + 30000 * Math.min(8, fails - 4); el.querySelector('#lk-s').textContent = 'Troppi tentativi: aspetta un po\''; }
    else el.querySelector('#lk-s').textContent = `Codice errato (${fails}/5)`;
  }
  async function forgot() {
    const ok = await ctx.dialog({ title: 'Codice dimenticato?', text: 'Per sicurezza devi uscire dall\'account e accedere di nuovo con email e password: il blocco verrà tolto e potrai crearne uno nuovo. L\'SOS e il 112 restano usabili da qui anche senza codice.', ok: 'Esci e accedi di nuovo', cancel: 'Annulla', danger: true });
    if (!ok) return;
    prefs.lock = false; savePrefs(); saveCfg(null); hide(); ctx.logout();
  }
  // un SOS della cerchia mentre l'app è bloccata: lo diciamo sulla schermata di blocco
  function incoming(name) { if (!locked()) return; el.querySelector('#lk-in').hidden = false; el.querySelector('#lk-in').textContent = `${discreet() ? 'Avviso' : 'SOS'} da ${name}: sblocca per vederlo`; native.vibrate([400, 200, 400]); }

  // all'avvio e quando l'app torna in primo piano dopo il tempo scelto
  document.addEventListener('visibilitychange', () => {
    if (!enabled()) return;
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); if ((cfg()?.after ?? 60) === 0 && ctx.ready()) show('hidden'); }   // «Subito»: nasconde anche l'anteprima nel multitasking
    else if (ctx.ready() && hiddenAt && Date.now() - hiddenAt >= (cfg()?.after ?? 60) * 1000) { hiddenAt = 0; if (locked()) tryBio(); else show('resume'); }
    else if (locked()) tryBio();
  });

  // ---------- impostazioni ----------
  async function sheet() {
    await bioInfo();
    const c = cfg(), on = enabled();
    openSheet(`<h2>Blocco dell'app</h2><p class="sub">Chiede ${bio.available ? esc(bioName()) + ' o ' : ''}un codice quando apri Vicina. <b>L'SOS e il 112 funzionano sempre</b>, anche con l'app bloccata.</p>
      ${on ? `<div class="card">
          ${bio.available ? `<label class="row toggle-row"><i class="ic-dot blue">${I(bioIcon())}</i><div class="fl wrap"><b>${esc(bioName())}</b><span>Sblocca senza scrivere il codice</span></div><input type="checkbox" class="switch" data-lkpref="bio" ${c.bio ? 'checked' : ''}></label>` : `<div class="row"><i class="ic-dot gray">${I('user')}</i><div class="fl wrap"><b>Dati biometrici non disponibili</b><span>Attiva Face ID, il volto o l'impronta nelle impostazioni del telefono per usarli qui</span></div></div>`}
        </div>
        <div class="field"><span>Blocca</span><div class="choice wrap" id="lk-after">${AFTER.map(([s, t]) => `<button data-s="${s}" class="${(c.after ?? 60) === s ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        <button class="btn ghost" data-a="lock-new">${I('key')}Cambia codice</button>
        <button class="btn ghost" data-a="lock-test">${I('lock')}Prova il blocco adesso</button>
        <button class="btn danger" data-a="lock-off">Disattiva il blocco</button>`
      : `<button class="btn" data-a="lock-new">${I('lock')}Crea un codice</button>`}
      <p class="note">Il codice resta solo su questo telefono (salvato in forma cifrata). Se lo dimentichi: esci e riaccedi con email e password.</p>`, 'lock');
  }
  function sheetNew(fromSetup) {
    openSheet(`<h2>${cfg()?.hash ? 'Nuovo codice' : 'Crea un codice'}</h2><p class="sub">Da 4 a 6 cifre. Evita date di nascita e sequenze come 1234.</p>
      <label class="field"><span>Codice</span><input id="lk-p1" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"></label>
      <label class="field"><span>Ripeti il codice</span><input id="lk-p2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"></label>
      <button class="btn" data-a="lock-save" data-setup="${fromSetup ? 1 : ''}">${I('check')}Salva</button>
      ${fromSetup ? '<button class="btn link" data-a="lock-skip">Non ora</button>' : ''}`, 'lock-new');
    setTimeout(() => $('#lk-p1')?.focus(), 200);
  }
  // proposta alla fine della configurazione guidata (una volta sola)
  function offerAfterSetup() {
    if (enabled() || ls.get('lockOffered')) return false;
    ls.set('lockOffered', '1');
    bioInfo().then(() => {
      openSheet(`<h2>Proteggi Vicina</h2><p class="sub">Chi prende il tuo telefono non vede cerchia, chat e posizioni. Puoi usare un codice${bio.available ? ' e ' + esc(bioName()) : ''}. <b>L'SOS resta sempre a portata di dito.</b></p>
        <button class="btn" data-a="lock-new" data-setup="1">${I('lock')}Crea un codice</button><button class="btn link" data-a="lock-skip">Non ora (puoi farlo da Impostazioni)</button>`, 'lock-offer');
    });
    return true;
  }
  async function handle(a, t) {
    switch (a) {
      case 'lock-sheet': await sheet(); return true;
      case 'lock-new': sheetNew(!!t.dataset.setup); return true;
      case 'lock-skip': closeSheet(); ctx.afterOffer?.(); return true;
      case 'lock-save': {
        const p1 = ($('#lk-p1')?.value || '').trim(), p2 = ($('#lk-p2')?.value || '').trim();
        if (!/^\d{4,6}$/.test(p1)) return toast('Il codice deve avere da 4 a 6 cifre'), true;
        if (p1 !== p2) return toast('I due codici non coincidono'), true;
        if (/^(\d)\1+$/.test(p1) || '0123456789'.includes(p1) || '9876543210'.includes(p1)) return toast('Codice troppo facile: scegline un altro'), true;
        await bioInfo();
        const old = cfg() || {}, salt = newSalt();
        saveCfg({ salt, hash: await hash(p1, salt), len: p1.length, bio: old.hash ? !!old.bio : bio.available, after: old.after ?? 60 });
        prefs.lock = true; savePrefs(); closeSheet();
        toast(bio.available && cfg().bio ? `Blocco attivo con codice e ${bioName()}` : 'Blocco con codice attivo');
        if (t.dataset.setup) ctx.afterOffer?.(); else { ctx.refresh?.(); sheet(); }
        return true;
      }
      case 'lock-off': {
        openSheet(`<h2>Disattiva il blocco</h2><p class="sub">Per sicurezza inserisci il codice attuale.</p>
          <label class="field"><span>Codice</span><input id="lk-cur" type="password" inputmode="numeric" maxlength="6"></label>
          <button class="btn danger" data-a="lock-off-ok">Disattiva</button>`, 'lock-off');
        setTimeout(() => $('#lk-cur')?.focus(), 200); return true;
      }
      case 'lock-off-ok': {
        if (!(await check(($('#lk-cur')?.value || '').trim()))) return toast('Codice errato'), true;
        prefs.lock = false; savePrefs(); saveCfg(null); closeSheet(); ctx.refresh?.(); toast('Blocco disattivato'); return true;
      }
      case 'lock-test': closeSheet(); show('test'); return true;
    }
    return false;
  }
  document.addEventListener('change', e => {
    if (e.target?.dataset?.lkpref !== 'bio') return;
    const c = cfg(); if (!c) return;
    c.bio = e.target.checked; saveCfg(c); toast(c.bio ? bioName() + ' attivo' : bioName() + ' disattivato');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('#lk-after button'); if (!b) return;
    const c = cfg(); if (!c) return;
    c.after = Number(b.dataset.s); saveCfg(c);
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });

  const label = () => !enabled() ? 'Disattivato' : (bio.available && cfg()?.bio ? bioName() + ' e codice' : 'Codice');
  return { show, hide, locked, enabled, incoming, handle, offerAfterSetup, label, bioInfo };
}
