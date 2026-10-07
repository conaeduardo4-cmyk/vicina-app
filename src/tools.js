// Strumenti di sicurezza di Vicina: Accompagnami, sirena e luce, finta chiamata, «Dove sono», scheda medica,
// numeri utili, scuoti per SOS. Tutto funziona sul telefono, anche senza internet (tranne l'indirizzo in «Dove sono»).
export function createTools(ctx) {
  const { $, I, esc, toast, openSheet, closeSheet, native, ls, prefs, savePrefs, sos, canSos, hhmm, mapsLink, male, uid, profile, wait } = ctx;
  const host = $('#ov-send').parentElement;
  const ov = document.createElement('div'); ov.className = 'tool-ov'; ov.id = 'ov-tool'; host.appendChild(ov);
  let ovKind = null, ovCleanup = null;
  const showOv = (kind, html, cleanup) => { closeOv(); ovKind = kind; ovCleanup = cleanup || null; ov.className = 'tool-ov on ' + kind; ov.innerHTML = html; };
  function closeOv() { try { ovCleanup?.(); } catch {} ovCleanup = null; ovKind = null; ov.className = 'tool-ov'; ov.innerHTML = ''; }
  const sx = () => (male() ? 'o' : 'a');

  /* ---------- suoni generati al volo (nessun file da scaricare, funzionano offline) ---------- */
  const RATE = 22050;
  function wavUrl(fn, secs) {
    const n = Math.floor(RATE * secs), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE, [f, a] = fn(t); ph += 2 * Math.PI * f / RATE;
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, a(ph))) * 32000, true);
    }
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  const sq = ph => (Math.sin(ph) > 0 ? 0.85 : -0.85) * 0.6 + Math.sin(ph) * 0.4;
  const SND = {};
  const sound = k => SND[k] || (SND[k] = {
    // sirena: sale e scende tra 650 e 1600 Hz, onda «ruvida» che si sente di più
    siren: () => wavUrl(t => { const x = t % 1.6, u = x < 0.8 ? x / 0.8 : 2 - x / 0.8; return [650 + 950 * u, sq]; }, 1.6),
    // squillo di telefono generico
    ring: () => wavUrl(t => { const x = t % 3, on = x < 0.4 || (x > 0.6 && x < 1.0); return [t % 0.05 < 0.025 ? 440 : 480, ph => (on ? Math.sin(ph) * 0.9 : 0)]; }, 3),
    // bip di avviso (conto alla rovescia)
    beep: () => wavUrl(t => { const x = t % 1; return [880, ph => (x < 0.18 || (x > 0.3 && x < 0.48) ? sq(ph) * 0.9 : 0)]; }, 1)
  }[k]());
  async function play(k) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // suona anche con l'iPhone in silenzioso (iOS 17+)
    const a = new Audio(sound(k)); a.loop = true; a.volume = 1;
    try { await a.play(); } catch (e) { console.warn('audio', e); }
    return () => { try { a.pause(); a.src = ''; } catch {} };
  }
  let wake = null;
  const keepAwake = async on => { try { if (on) wake = await navigator.wakeLock?.request('screen'); else { await wake?.release(); wake = null; } } catch {} };
  const buzz = p => { try { native.vibrate(p); } catch {} };

  /* ---------- conto alla rovescia prima dell'SOS (Accompagnami scaduto, scuoti) ---------- */
  let cdTimer = null;
  async function countdown({ secs, title, text }) {
    if (ovKind === 'cd') return;
    const ok = canSos();
    let left = secs;
    const stop = await play('beep');
    showOv('cd', `<div class="cd-wrap"><div class="cd-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/><circle class="cd-arc" id="cd-arc" cx="50" cy="50" r="45"/></svg><b id="cd-n">${left}</b></div>
      <h1>${esc(title)}</h1><p>${esc(ok ? text : 'Non hai nessuno da avvisare: se sei in pericolo chiama il 112.')}</p></div>
      <div class="cd-foot"><button class="btn white big" data-a="cd-cancel">${I('check')}Sto bene, annulla</button>
      ${ok ? `<button class="btn red" data-a="cd-now">${I('alert')}Invia l'SOS adesso</button>` : `<a class="btn red" href="tel:112">${I('phone')}Chiama 112</a>`}</div>`,
      () => { clearInterval(cdTimer); stop(); keepAwake(false); });
    keepAwake(true);
    const arc = () => { const a = $('#cd-arc'); if (a) a.style.strokeDashoffset = String(283 * (1 - left / secs)); };
    arc(); buzz([300, 200, 300]);
    clearInterval(cdTimer);
    cdTimer = setInterval(() => {
      left--; const n = $('#cd-n'); if (n) n.textContent = Math.max(0, left); arc();
      if (left % 5 === 0) buzz([250, 150, 250]);
      if (left <= 0) { clearInterval(cdTimer); closeOv(); if (ok) sos(); }
    }, 1000);
  }

  /* ---------- Accompagnami: timer di sicurezza ---------- */
  const WK = () => 'walk:' + uid();
  let walk = null, walkTick = null, walkStopPos = null;
  const loadWalk = () => { try { return JSON.parse(ls.get(WK()) || 'null'); } catch { return null; } };
  const saveWalk = () => ls.set(WK(), walk ? JSON.stringify(walk) : '');
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  function sheetWalk() {
    if (walk) return toast('Accompagnami è già attivo');
    openSheet(`<h2>Accompagnami</h2><p class="sub">Dimmi quanto ci metti. Se non confermi di essere arrivat${sx()} in tempo, ti chiedo se va tutto bene e dopo 30 secondi parte l'SOS da solo.</p>
      <label class="field"><span>Dove vai? (facoltativo)</span><input id="wk-dest" maxlength="40" placeholder="Es. a casa, dalla stazione"></label>
      <div class="field"><span>Quanto tempo</span><div class="choice wrap" id="wk-min">${[10, 15, 20, 30, 45, 60, 90].map(m => `<button data-m="${m}" class="${m === 20 ? 'on' : ''}">${m < 60 ? m + ' min' : m / 60 + (m === 60 ? ' ora' : ' ore')}</button>`).join('')}</div></div>
      <button class="btn red" data-a="walk-start">${I('shield')}Inizia</button>
      <p class="note">Tieni il telefono con te: Vicina resta attiva anche a schermo spento finché non tocchi «Sono arrivat${sx()}».</p>`, 'walk');
  }
  async function startWalk(min, dest) {
    walk = { until: Date.now() + min * 60000, dest, start: Date.now(), min };
    saveWalk(); closeSheet(); runWalk(); native.haptic('medium');
    toast(`Ok, ti seguo per ${min} minuti`);
  }
  async function runWalk() {
    clearInterval(walkTick);
    // la posizione in background tiene sveglia l'app (iPhone e Android) mentre il timer corre
    if (!walkStopPos) { try { walkStopPos = await native.watchLive(p => { if (walk) walk.last = p; }, { title: 'Accompagnami attivo', message: 'Vicina ti segue fino a quando confermi di essere arrivato.' }); } catch {} }
    walkTick = setInterval(rWalk, 1000); rWalk();
  }
  function endWalk(msg) {
    walk = null; saveWalk(); clearInterval(walkTick); walkTick = null;
    try { walkStopPos?.(); } catch {} walkStopPos = null;
    rWalk(); if (msg) toast(msg);
  }
  function rWalk() {
    const bar = $('#walk-bar'); if (!bar) return;
    if (!walk) { bar.hidden = true; return; }
    const left = walk.until - Date.now();
    bar.hidden = false;
    bar.classList.toggle('late', left < 120000);
    bar.innerHTML = `<div class="wk-top"><i class="wk-dot"></i><b>Accompagnami${walk.dest ? ' · ' + esc(walk.dest) : ''}</b><span class="wk-t">${mmss(left)}</span></div>
      <div class="wk-track"><i style="width:${Math.max(0, Math.min(100, 100 * (1 - left / (walk.until - walk.start))))}%"></i></div>
      <div class="wk-acts"><button class="btn green sm" data-a="walk-ok">${I('check')}Sono arrivat${sx()}</button><button class="btn ghost sm" data-a="walk-more">+10 min</button></div>`;
    if (left <= 0) {
      const w = walk; endWalk();
      countdown({ secs: 30, title: 'Tutto bene?', text: `Il tempo di Accompagnami è finito${w.dest ? ' (' + w.dest + ')' : ''} e non hai confermato. Tra 30 secondi avviso chi ti protegge.` });
    }
  }

  /* ---------- sirena e luce ---------- */
  async function siren() {
    const stop = await play('siren');
    showOv('siren', `<div class="sr-in"><b>${I('alert')}AIUTO</b><span>Sirena attiva</span></div>
      <button class="btn white big sr-stop" data-a="tool-close">${I('x')}Ferma la sirena</button>`, () => { stop(); keepAwake(false); });
    keepAwake(true); buzz([500, 200, 500, 200, 500]);
  }
  let morse = null;
  function light(mode = 'fix') {
    clearInterval(morse);
    showOv('light lt-' + mode, `<div class="lt-acts"><button class="btn ${mode === 'fix' ? 'white' : 'ghost'} sm" data-a="light" data-m="fix">Luce fissa</button><button class="btn ${mode === 'sos' ? 'white' : 'ghost'} sm" data-a="light" data-m="sos">SOS luminoso</button><button class="btn ghost sm" data-a="tool-close">${I('x')}Chiudi</button></div>`,
      () => { clearInterval(morse); keepAwake(false); });
    keepAwake(true);
    if (mode === 'sos') {   // · · ·  — — —  · · ·  (1 = acceso, 0 = spento, un passo = 220 ms)
      const P = '1010100011101110111000101010000000'; let i = 0;
      morse = setInterval(() => { ov.classList.toggle('dark', P[i] === '0'); i = (i + 1) % P.length; }, 220);
    }
  }

  /* ---------- finta chiamata ---------- */
  let fakeT = null;
  function sheetFake() {
    openSheet(`<h2>Finta chiamata</h2><p class="sub">Ti arriva una chiamata finta, con suoneria: una scusa pronta per allontanarti da una situazione che non ti piace.</p>
      <label class="field"><span>Chi chiama</span><input id="fk-name" maxlength="30" value="${esc(ls.get('fakeName') || 'Mamma')}"></label>
      <div class="field"><span>Quando</span><div class="choice wrap" id="fk-when">${[[5, 'Tra 5 s'], [30, 'Tra 30 s'], [60, 'Tra 1 min'], [300, 'Tra 5 min']].map(([s, l], i) => `<button data-s="${s}" class="${i === 1 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <button class="btn" data-a="fake-go">${I('phone')}Programma la chiamata</button>
      <p class="note">Lascia Vicina aperta (anche con lo schermo acceso al minimo): la chiamata arriva dentro l'app.</p>`, 'fake');
  }
  async function fakeRing(name) {
    const stop = await play('ring'); let vib = setInterval(() => buzz([800, 400, 800]), 3000); buzz([800, 400, 800]);
    const ini = esc(String(name).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
    showOv('call', `<div class="call-top"><span>Chiamata in arrivo</span><b>${esc(name)}</b><small>cellulare</small></div><div class="call-av">${ini}</div>
      <div class="call-btns"><button data-a="fake-no" class="cb red" aria-label="Rifiuta">${I('phone')}</button><button data-a="fake-yes" class="cb green" aria-label="Rispondi">${I('phone')}</button></div>
      <div class="call-lbl"><span>Rifiuta</span><span>Rispondi</span></div>`, () => { stop(); clearInterval(vib); keepAwake(false); });
    keepAwake(true);
  }
  let callT = null;
  function fakeAnswer() {
    const name = $('#ov-tool .call-top b')?.textContent || '';
    const t0 = Date.now();
    showOv('call on-call', `<div class="call-top"><b>${esc(name)}</b><small id="call-t">00:00</small></div><div class="call-av">${esc(name.slice(0, 1).toUpperCase())}</div>
      <div class="call-btns one"><button data-a="tool-close" class="cb red" aria-label="Termina">${I('phone')}</button></div><div class="call-lbl one"><span>Termina</span></div>`, () => clearInterval(callT));
    clearInterval(callT); callT = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000), e = $('#call-t'); if (e) e.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }, 1000);
  }

  /* ---------- Dove sono ---------- */
  let here = null;
  async function sheetWhere(refresh) {
    openSheet(`<h2>Dove sono</h2><p class="sub">Da leggere al 112 o da mandare a qualcuno.</p><div class="where" id="where"><div class="where-load">${I('pin')}Cerco il GPS…</div></div>`, 'where');
    const p = await native.getPos();
    if (!$('#where')) return;
    if (!p) { $('#where').innerHTML = `<div class="where-load">${I('pin')}Posizione non disponibile: controlla che il GPS sia acceso e che Vicina abbia il permesso.</div><button class="btn ghost" data-a="where">Riprova</button>`; return; }
    here = { ...p, addr: '' };
    rWhere();
    try {   // indirizzo (serve internet; se non c'è restano le coordinate)
      const c = new AbortController(); setTimeout(() => c.abort(), 6000);
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=18&accept-language=it`, { signal: c.signal, headers: { Accept: 'application/json' } });
      const j = await r.json(), a = j.address || {};
      here.addr = [[a.road || a.pedestrian || a.footway || a.square, a.house_number].filter(Boolean).join(' '), a.village || a.town || a.city || a.municipality, a.county ? '(' + a.county + ')' : ''].filter(Boolean).join(', ') || j.display_name || '';
      if (here.lat === p.lat) rWhere();
    } catch { /* offline */ }
  }
  function rWhere() {
    const el = $('#where'); if (!el || !here) return;
    const lat = here.lat.toFixed(5), lng = here.lng.toFixed(5);
    el.innerHTML = `${here.addr ? `<p class="where-addr">${esc(here.addr)}</p>` : ''}
      <div class="where-ll"><div><small>Latitudine</small><b>${lat}</b></div><div><small>Longitudine</small><b>${lng}</b></div></div>
      <p class="note">Precisione circa ${Math.max(5, Math.round(here.acc || 0))} m · alle ${hhmm(Date.now())}</p>
      <div class="row2"><button class="btn ghost sm" data-a="where-copy">${I('copy')}Copia</button><button class="btn ghost sm" data-a="where-share">${I('share')}Condividi</button></div>
      <div class="row2"><button class="btn ghost sm" data-a="where-maps">${I('pin')}Mappe</button><a class="btn red sm" href="tel:112">${I('phone')}Chiama 112</a></div>`;
  }
  const hereText = () => `Sono qui${here.addr ? ': ' + here.addr : ''}\n${mapsLink(here)}\nCoordinate: ${here.lat.toFixed(5)}, ${here.lng.toFixed(5)} (±${Math.max(5, Math.round(here.acc || 0))} m)`;

  /* ---------- scheda medica ---------- */
  const MK = () => 'medical:' + uid();
  const med = () => { try { return JSON.parse(ls.get(MK()) || '{}'); } catch { return {}; } };
  const BLOOD = ['Non so', '0+', '0−', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−'];
  function sheetMed() {
    const m = med();
    openSheet(`<h2>Scheda medica</h2><p class="sub">Può salvare tempo prezioso ai soccorritori. Resta solo su questo telefono.</p>
      <div class="field"><span>Gruppo sanguigno</span><div class="choice wrap" id="md-blood">${BLOOD.map(b => `<button data-b="${b}" class="${(m.blood || 'Non so') === b ? 'on' : ''}">${b}</button>`).join('')}</div></div>
      <label class="field"><span>Allergie</span><input id="md-all" maxlength="120" placeholder="Es. penicillina, arachidi" value="${esc(m.allergies)}"></label>
      <label class="field"><span>Farmaci che prendi</span><input id="md-meds" maxlength="120" placeholder="Es. insulina" value="${esc(m.meds)}"></label>
      <label class="field"><span>Patologie</span><input id="md-cond" maxlength="120" placeholder="Es. asma, diabete, epilessia" value="${esc(m.conditions)}"></label>
      <label class="field"><span>Altro da sapere</span><input id="md-notes" maxlength="160" placeholder="Es. porto le lenti a contatto" value="${esc(m.notes)}"></label>
      <label class="row toggle-row"><i class="ic-dot red">${I('heart')}</i><div class="fl wrap"><b>Aggiungila agli SMS di SOS</b><span>I contatti senza app la ricevono insieme alla posizione</span></div><input type="checkbox" class="switch" id="md-sms" ${m.inSms !== false ? 'checked' : ''}></label>
      <button class="btn" data-a="med-save">Salva</button>
      ${hasMed(m) ? `<button class="btn ghost" data-a="med-show">${I('eye')}Mostra ai soccorritori</button>` : ''}`, 'med');
  }
  const hasMed = m => !!(m && ((m.blood && m.blood !== 'Non so') || m.allergies || m.meds || m.conditions || m.notes));
  function medicalLine() {
    const m = med(); if (!hasMed(m) || m.inSms === false) return '';
    return 'Info mediche: ' + [m.blood && m.blood !== 'Non so' ? 'gruppo ' + m.blood : '', m.allergies && 'allergie ' + m.allergies, m.meds && 'farmaci ' + m.meds, m.conditions && 'patologie ' + m.conditions, m.notes].filter(Boolean).join('; ');
  }
  function medShow() {
    const m = med(), p = profile() || {};
    let age = ''; if (p.dob) { const d = new Date(p.dob), n = new Date(); age = n.getFullYear() - d.getFullYear() - (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0); }
    const row = (k, v) => v ? `<div class="md-row"><small>${k}</small><b>${esc(v)}</b></div>` : '';
    closeSheet();
    showOv('medcard', `<div class="md-card"><p class="md-eye">${I('heart')}SCHEDA MEDICA</p><h1>${esc((p.name || '') + ' ' + (p.surname || ''))}</h1>${age !== '' && !isNaN(age) ? `<p class="md-age">${age} anni</p>` : ''}
      ${row('Gruppo sanguigno', m.blood && m.blood !== 'Non so' ? m.blood : '')}${row('Allergie', m.allergies)}${row('Farmaci', m.meds)}${row('Patologie', m.conditions)}${row('Altro', m.notes)}${row('Telefono', p.phone)}</div>
      <button class="btn white big" data-a="tool-close">Chiudi</button>`, () => keepAwake(false));
    keepAwake(true);
  }

  /* ---------- numeri utili (Italia) ---------- */
  const NUMS = [
    ['112', 'Numero unico di emergenza', 'Carabinieri, polizia, ambulanza, vigili del fuoco', 'red'],
    ['118', 'Emergenza sanitaria', 'Ambulanza', 'red'],
    ['113', 'Polizia di Stato', '', 'blue'],
    ['115', 'Vigili del fuoco', 'Incendi, crolli, persone bloccate', 'amber'],
    ['1522', 'Antiviolenza e stalking', 'Gratuito, 24 ore su 24, anche in chat', 'violet'],
    ['114', 'Emergenza infanzia', 'Bambini e adolescenti in pericolo', 'violet'],
    ['1530', 'Guardia costiera', 'Emergenze in mare', 'blue'],
    ['116117', 'Guardia medica', 'Dove il servizio è attivo', 'green'],
    ['0223272327', 'Telefono Amico', 'Ascolto per chi si sente solo o in difficoltà', 'green']
  ];
  const sheetNums = () => openSheet(`<h2>Numeri utili</h2><p class="sub">Tocca per chiamare. Il 112 funziona anche senza SIM e senza credito.</p>
    <div class="card">${NUMS.map(([n, t, s, c]) => `<a class="row" href="tel:${n}"><i class="ic-dot ${c}">${I('phone')}</i><div class="fl"><b>${t}</b><span>${s ? esc(s) + ' · ' : ''}${n.length > 6 ? n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1 $2 $3') : n}</span></div>${I('chev', 'chev')}</a>`).join('')}</div>`, 'nums');

  /* ---------- scuoti per SOS ---------- */
  let shakeOn = false, peaks = [];
  const onMotion = e => {
    const a = e.accelerationIncludingGravity || e.acceleration; if (!a) return;
    const g = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2), now = Date.now();
    if (g < 27) return;
    if (peaks.length && now - peaks[peaks.length - 1] < 140) return;
    peaks = peaks.filter(t => now - t < 1800); peaks.push(now);
    if (peaks.length >= 4 && !ovKind && uid() && canSos()) { peaks = []; native.haptic('heavy'); countdown({ secs: 5, title: 'SOS tra 5 secondi', text: 'Hai scosso il telefono. Se è stato un errore, tocca «Sto bene, annulla».' }); }
  };
  async function shake(on, ask) {
    if (on && ask && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { if ((await DeviceMotionEvent.requestPermission()) !== 'granted') { toast('Serve il permesso «Movimento»'); return false; } } catch { return false; }
    }
    if (on && !shakeOn) window.addEventListener('devicemotion', onMotion);
    if (!on && shakeOn) window.removeEventListener('devicemotion', onMotion);
    shakeOn = on; return true;
  }

  /* ---------- foglio «Strumenti» ---------- */
  const TOOLS = [
    ['walk', 'shield', 'red', 'Accompagnami', 'Timer: se non arrivi parte l\'SOS'],
    ['siren', 'bell', 'amber', 'Sirena', 'Suono forte e lampeggio'],
    ['light', 'spark', 'blue', 'Luce', 'Schermo bianco o SOS luminoso'],
    ['fake', 'phone', 'green', 'Finta chiamata', 'Una scusa per andartene'],
    ['where', 'pin', 'blue', 'Dove sono', 'Indirizzo e coordinate'],
    ['med', 'heart', 'red', 'Scheda medica', 'Per i soccorritori'],
    ['nums', 'book', 'violet', 'Numeri utili', '112, 1522, 118…'],
    ['ai', 'spark', 'amber', 'Assistente', 'Chiedi cosa fare']
  ];
  const sheetTools = () => openSheet(`<h2>Strumenti</h2><p class="sub">Tutto funziona anche senza internet.</p>
    <div class="tools-grid">${TOOLS.map(([a, ic, c, t, s]) => `<button class="tool" data-a="${a}"><i class="ic-dot ${c}">${I(ic)}</i><b>${t}</b><span>${s}</span></button>`).join('')}</div>
    <label class="row toggle-row"><i class="ic-dot violet">${I('alert')}</i><div class="fl wrap"><b>Scuoti per SOS</b><span>Scuoti forte il telefono: dopo 5 secondi parte l'SOS (con l'app aperta)</span></div><input type="checkbox" class="switch" data-pref="shake" ${prefs.shake ? 'checked' : ''}></label>`, 'tools');

  /* ---------- azioni ---------- */
  async function handle(a, t) {
    switch (a) {
      case 'tools': sheetTools(); return true;
      case 'walk': closeSheet(); sheetWalk(); return true;
      case 'walk-start': { const b = $('#wk-min .on'); startWalk(Number(b?.dataset.m || 20), ($('#wk-dest')?.value || '').trim()); return true; }
      case 'walk-ok': endWalk(`Bene, sei arrivat${sx()}`); native.haptic('medium'); return true;
      case 'walk-more': if (walk) { walk.until = Math.max(walk.until, Date.now()) + 600000; saveWalk(); rWalk(); toast('+10 minuti'); } return true;
      case 'siren': closeSheet(); siren(); return true;
      case 'light': closeSheet(); light(t.dataset.m || 'fix'); return true;
      case 'fake': closeSheet(); sheetFake(); return true;
      case 'fake-go': {
        const name = ($('#fk-name')?.value || '').trim() || 'Mamma', s = Number($('#fk-when .on')?.dataset.s || 30);
        ls.set('fakeName', name); closeSheet(); clearTimeout(fakeT);
        fakeT = setTimeout(() => fakeRing(name), s * 1000);
        toast(s < 60 ? `Chiamata tra ${s} secondi` : `Chiamata tra ${s / 60} minuti`); return true;
      }
      case 'fake-yes': fakeAnswer(); return true;
      case 'fake-no': closeOv(); return true;
      case 'where': closeSheet(); sheetWhere(); return true;
      case 'where-copy': if (here) { await native.copy(hereText()); toast('Posizione copiata'); } return true;
      case 'where-share': if (here) await native.share({ title: 'La mia posizione', text: hereText() }); return true;
      case 'where-maps': if (here) native.openMaps(here.lat, here.lng, 'La mia posizione'); return true;
      case 'med': closeSheet(); sheetMed(); return true;
      case 'med-save': {
        const m = { blood: $('#md-blood .on')?.dataset.b || 'Non so', allergies: $('#md-all').value.trim(), meds: $('#md-meds').value.trim(), conditions: $('#md-cond').value.trim(), notes: $('#md-notes').value.trim(), inSms: $('#md-sms').checked };
        ls.set(MK(), JSON.stringify(m)); closeSheet(); toast('Scheda medica salvata'); return true;
      }
      case 'med-show': medShow(); return true;
      case 'nums': closeSheet(); sheetNums(); return true;
      case 'tool-close': closeOv(); return true;
      case 'cd-cancel': closeOv(); native.haptic('medium'); toast('Annullato. Bene così.'); return true;
      case 'cd-now': closeOv(); sos(); return true;
    }
    return false;
  }
  // scelta nei pulsanti «choice» dei fogli
  document.addEventListener('click', e => {
    const b = e.target.closest('#wk-min button, #fk-when button, #md-blood button'); if (!b) return;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });

  async function prefChanged(k, on, input) {
    if (k === 'shake') {
      const ok = await shake(on, true);
      if (on && !ok) { prefs.shake = false; savePrefs(); if (input) input.checked = false; return; }
      toast(on ? 'Scuoti per SOS attivo' : 'Scuoti per SOS disattivato');
    }
  }
  function restore() {
    walk = loadWalk();
    if (walk && walk.until) {
      if (walk.until > Date.now()) runWalk();
      else if (Date.now() - walk.until < 2 * 3600e3) { const w = walk; endWalk(); countdown({ secs: 30, title: 'Tutto bene?', text: `Accompagnami è scaduto alle ${hhmm(w.until)} e non hai confermato. Tra 30 secondi avviso chi ti protegge.` }); }
      else endWalk();
    } else { walk = null; rWalk(); }
    if (prefs.shake) shake(true, false);
  }
  const busy = () => !!ovKind;
  return { handle, rWalk, restore, medicalLine, prefChanged, busy, sheetMed };
}
