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
    beep: () => wavUrl(t => { const x = t % 1; return [880, ph => (x < 0.18 || (x > 0.3 && x < 0.48) ? sq(ph) * 0.9 : 0)]; }, 1),
    // fischietto di soccorso: 3 fischi acuti e pausa (segnale internazionale di richiesta d'aiuto)
    whistle: () => wavUrl(t => { const x = t % 3.2, on = x < 0.45 || (x > 0.75 && x < 1.2) || (x > 1.5 && x < 1.95); return [3150 + 60 * Math.sin(t * 60), ph => (on ? Math.sin(ph) * 0.95 : 0)]; }, 3.2),
    // metronomo RCP: 110 colpi al minuto
    cpr: () => wavUrl(t => [1200, ph => (t < 0.045 ? sq(ph) : 0)], 60 / 110)
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
  let cdTimer = null, cdCancel = null;
  async function countdown({ secs, title, text, onCancel = null, okLabel = null }) {
    cdCancel = onCancel;
    if (ovKind === 'cd') return;
    const ok = canSos();
    let left = secs;
    const stop = await play('beep');
    showOv('cd', `<div class="cd-wrap"><div class="cd-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/><circle class="cd-arc" id="cd-arc" cx="50" cy="50" r="45"/></svg><b id="cd-n">${left}</b></div>
      <h1>${esc(title)}</h1><p>${esc(ok ? text : 'Non hai nessuno da avvisare: se sei in pericolo chiama il 112.')}</p></div>
      <div class="cd-foot"><button class="btn white big" data-a="cd-cancel">${I('check')}${okLabel || 'Sto bene, annulla'}</button>
      ${ok ? `<button class="btn red" data-a="cd-now">${I('alert')}Invia l'SOS adesso</button>` : `<a class="btn red" href="tel:112">${I('phone')}Chiama 112</a>`}</div>`,
      () => { clearInterval(cdTimer); stop(); keepAwake(false); });
    keepAwake(true);
    const arc = () => { const a = $('#cd-arc'); if (a) a.style.strokeDashoffset = String(283 * (1 - left / secs)); };
    arc(); buzz([300, 200, 300]);
    clearInterval(cdTimer);
    cdTimer = setInterval(() => {
      left--; const n = $('#cd-n'); if (n) n.textContent = Math.max(0, left); arc();
      if (left % 5 === 0) buzz([250, 150, 250]);
      if (left <= 0) { clearInterval(cdTimer); cdCancel = null; if (walk?.repeat) endWalk(); closeOv(); if (ok) sos(); }
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
  async function startWalk(min, dest, { repeat = 0, endAt = 0, quiet = false } = {}) {
    walk = { until: Date.now() + min * 60000, dest, start: Date.now(), min, repeat, endAt };
    saveWalk(); closeSheet(); runWalk(); native.haptic('medium');
    if (!quiet) toast(repeat ? `Ok, ti chiedo come stai ogni ${repeat} minuti` : `Ok, ti seguo per ${min} minuti`);
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
    bar.innerHTML = `<div class="wk-top"><i class="wk-dot"></i><b>${walk.repeat ? 'Serata fuori' : 'Accompagnami'}${walk.dest ? ' · ' + esc(walk.dest) : ''}</b><span class="wk-t">${walk.repeat ? 'check-in tra ' : ''}${mmss(left)}</span></div>
      <div class="wk-track"><i style="width:${Math.max(0, Math.min(100, 100 * (1 - left / (walk.until - walk.start))))}%"></i></div>
      <div class="wk-acts">${walk.repeat ? `<button class="btn green sm" data-a="walk-checkin">${I('check')}Sto bene</button><button class="btn ghost sm" data-a="walk-ok">Fine serata</button>` : `<button class="btn green sm" data-a="walk-ok">${I('check')}Sono arrivat${sx()}</button><button class="btn ghost sm" data-a="walk-more">+10 min</button>`}</div>`;
    if (left <= 0 && walk.repeat) {
      // Serata fuori: «Tutto bene?» con 60 secondi; se rispondi riparte il prossimo check-in
      const w = walk; walk.until = Date.now() + 3600e3; saveWalk();
      countdown({ secs: 60, title: 'Tutto bene?', text: `Check-in della serata${w.dest ? ' (' + w.dest + ')' : ''}. Se non rispondi entro 60 secondi avviso la tua cerchia.`,
        okLabel: 'Sto bene', onCancel: () => { if (!walk) return; if (walk.endAt && Date.now() > walk.endAt) return endWalk('Serata finita: check-in spenti'); walk.until = Date.now() + walk.repeat * 60000; saveWalk(); rWalk(); } });
      return;
    }
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


  /* ---------- fischietto ---------- */
  async function whistle() {
    const stop = await play('whistle');
    showOv('whistle', `<div class="sr-in"><b>${I('bell')}FISCHIETTO</b><span>3 fischi e una pausa: il segnale di richiesta d'aiuto. Si sente lontano, anche sotto le macerie.</span></div>
      <button class="btn white big sr-stop" data-a="tool-close">${I('x')}Ferma</button>`, () => { stop(); keepAwake(false); });
    keepAwake(true);
  }

  /* ---------- allarme «se lo lasci» e allarme movimento ---------- */
  let dmsStop = null, dmsHoldT = null;
  function deadman() {
    showOv('dms', `<div class="dms-in"><p class="dms-t" id="dms-t">Appoggia il pollice e tienilo premuto</p>
      <button class="dms-pad" id="dms-pad" aria-label="Tieni premuto">${I('shield')}<span id="dms-s">Tieni premuto</span></button>
      <p class="dms-sub" id="dms-sub">Se il telefono ti viene strappato o lo lasci, parte la sirena e dopo 15 secondi l'SOS.</p></div>
      <button class="btn ghost" data-a="tool-close" id="dms-close">${I('x')}Esci</button>`, () => { dmsStop?.(); dmsStop = null; clearInterval(cdTimer); keepAwake(false); });
    keepAwake(true);
    const pad = $('#dms-pad'); let armed = false;
    pad.addEventListener('pointerdown', e => { e.preventDefault(); if (ov.classList.contains('fired')) return; armed = true; ov.classList.add('armed'); $('#dms-s').textContent = 'Armato'; $('#dms-t').textContent = 'Non lasciare il dito'; $('#dms-close').hidden = true; native.haptic('medium'); });
    const lift = async () => {
      if (!armed || ov.classList.contains('fired')) return;
      armed = false; ov.classList.remove('armed'); ov.classList.add('fired');
      dmsStop = await play('siren'); buzz([600, 200, 600, 200, 600]);
      let left = 15;
      $("#dms-t").innerHTML = `SOS tra <b class="dms-n" id="dms-n">${left}</b>`;
      $('#dms-s').textContent = 'Tieni premuto 3 s per fermare';
      $('#dms-sub').textContent = 'Se sei tu: tieni premuto il cerchio per 3 secondi.';
      clearInterval(cdTimer);
      cdTimer = setInterval(() => { left--; const n = $('#dms-n'); if (n) n.textContent = Math.max(0, left); if (left <= 0) { clearInterval(cdTimer); if (canSos()) sos(); $('#dms-t').textContent = canSos() ? 'SOS inviato' : 'Chiama il 112'; } }, 1000);
    };
    pad.addEventListener('pointerup', lift); pad.addEventListener('pointercancel', lift);
    // per fermare: tenere premuto 3 secondi
    pad.addEventListener('pointerdown', () => { if (!ov.classList.contains('fired')) return; clearTimeout(dmsHoldT); dmsHoldT = setTimeout(() => { closeOv(); toast('Allarme disattivato'); }, 3000); });
    ['pointerup', 'pointercancel'].forEach(ev => pad.addEventListener(ev, () => clearTimeout(dmsHoldT)));
  }
  let motionArmed = null;
  function motionAlarm() {
    let left = 5;
    showOv('dms motion', `<div class="dms-in"><p class="dms-t" id="mo-t">Appoggia il telefono: si arma tra <b id="mo-n">${left}</b> s</p>
      <div class="dms-pad still" id="mo-pad">${I('lock')}<span id="mo-s">Allarme movimento</span></div>
      <p class="dms-sub">Se qualcuno lo sposta (dal tavolo, dalla borsa) parte la sirena. Per fermarla tieni premuto il cerchio 3 secondi.</p></div>
      <button class="btn ghost" data-a="tool-close">${I('x')}Disattiva</button>`, () => { if (motionArmed) window.removeEventListener('devicemotion', motionArmed); motionArmed = null; dmsStop?.(); dmsStop = null; clearInterval(cdTimer); keepAwake(false); });
    keepAwake(true);
    clearInterval(cdTimer);
    cdTimer = setInterval(() => {
      left--; const n = $('#mo-n'); if (n) n.textContent = left;
      if (left > 0) return;
      clearInterval(cdTimer); $('#mo-t').textContent = 'Armato'; ov.classList.add('armed');
      let base = null;
      motionArmed = async e => {
        const a = e.accelerationIncludingGravity; if (!a) return;
        const v = [a.x || 0, a.y || 0, a.z || 0];
        if (!base) { base = v; return; }
        const d = Math.hypot(v[0] - base[0], v[1] - base[1], v[2] - base[2]);
        if (d > 2.2 && !ov.classList.contains('fired')) {
          ov.classList.remove('armed'); ov.classList.add('fired'); $('#mo-t').textContent = 'Telefono spostato!'; $('#mo-s').textContent = 'Tieni premuto 3 s per fermare';
          dmsStop = await play('siren'); buzz([600, 200, 600]);
          const pad = $('#mo-pad'); let ht;
          pad.addEventListener('pointerdown', () => { ht = setTimeout(() => { closeOv(); toast('Allarme disattivato'); }, 3000); });
          ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => pad.addEventListener(ev, () => clearTimeout(ht)));
        }
      };
      window.addEventListener('devicemotion', motionArmed);
    }, 1000);
  }
  async function motionPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { return (await DeviceMotionEvent.requestPermission()) === 'granted'; } catch { return false; }
    }
    return true;
  }

  /* ---------- cartello a schermo intero (anche in altre lingue) ---------- */
  const SIGNS = [
    ['call112', { it: 'CHIAMATE IL 112', en: 'CALL 112 – EMERGENCY', es: 'LLAMEN AL 112', fr: 'APPELEZ LE 112', de: 'RUFEN SIE 112 AN' }],
    ['help', { it: 'HO BISOGNO DI AIUTO', en: 'I NEED HELP', es: 'NECESITO AYUDA', fr: "J'AI BESOIN D'AIDE", de: 'ICH BRAUCHE HILFE' }],
    ['amb', { it: "CHIAMATE UN'AMBULANZA", en: 'CALL AN AMBULANCE', es: 'LLAMEN A UNA AMBULANCIA', fr: 'APPELEZ UNE AMBULANCE', de: 'RUFEN SIE EINEN KRANKENWAGEN' }],
    ['police', { it: 'CHIAMATE LA POLIZIA', en: 'CALL THE POLICE', es: 'LLAMEN A LA POLICÍA', fr: 'APPELEZ LA POLICE', de: 'RUFEN SIE DIE POLIZEI' }],
    ['speak', { it: 'NON POSSO PARLARE, SCRIVIMI', en: "I CAN'T SPEAK, PLEASE WRITE", es: 'NO PUEDO HABLAR, ESCRÍBEME', fr: 'JE NE PEUX PAS PARLER, ÉCRIVEZ-MOI', de: 'ICH KANN NICHT SPRECHEN, BITTE SCHREIBEN' }],
    ['deaf', { it: 'SONO SORDO/A', en: 'I AM DEAF', es: 'SOY SORDO/A', fr: 'JE SUIS SOURD(E)', de: 'ICH BIN GEHÖRLOS' }],
    ['sick', { it: 'MI SENTO MALE', en: 'I FEEL SICK', es: 'ME SIENTO MAL', fr: 'JE ME SENS MAL', de: 'MIR GEHT ES SCHLECHT' }],
    ['lost', { it: 'MI SONO PERSO/A', en: 'I AM LOST', es: 'ME HE PERDIDO', fr: 'JE SUIS PERDU(E)', de: 'ICH HABE MICH VERLAUFEN' }],
    ['follow', { it: 'MI STANNO SEGUENDO, AIUTATEMI', en: 'SOMEONE IS FOLLOWING ME, HELP', es: 'ME ESTÁN SIGUIENDO, AYÚDENME', fr: 'ON ME SUIT, AIDEZ-MOI', de: 'ICH WERDE VERFOLGT, HELFEN SIE MIR' }]
  ];
  const LANGS = [['it', 'Italiano'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch']];
  function sheetSign() {
    const lang = ls.get('signLang') || 'it', allerg = med().allergies;
    const ALL = { it: 'ALLERGIA: ', en: 'ALLERGIC TO: ', es: 'ALÉRGICO/A A: ', fr: 'ALLERGIQUE À : ', de: 'ALLERGISCH GEGEN: ' };
    openSheet(`<h2>Cartello</h2><p class="sub">Un messaggio enorme da mostrare a chi hai intorno: in un posto rumoroso, se non puoi parlare o all'estero.</p>
      <div class="choice wrap" id="sg-lang">${LANGS.map(([k, n]) => `<button data-l="${k}" class="${k === lang ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="sign-list">${SIGNS.map(([k, t]) => `<button class="sign-opt" data-a="sign-show" data-t="${esc(t[lang])}">${esc(t[lang])}</button>`).join('')}
      ${allerg ? `<button class="sign-opt" data-a="sign-show" data-t="${esc(ALL[lang] + allerg.toUpperCase())}">${esc(ALL[lang] + allerg.toUpperCase())}</button>` : ''}</div>
      <label class="field"><span>Oppure scrivi tu</span><input id="sg-own" maxlength="80" placeholder="Es. MIA FIGLIA SI È PERSA"></label>
      <button class="btn" data-a="sign-own">Mostra</button>`, 'sign');
  }
  function signShow(text) {
    closeSheet();
    showOv('sign', `<div class="sign-big" id="sign-big">${esc(text)}</div><div class="sign-acts"><button class="btn ghost sm" data-a="sign-color">Cambia colori</button><button class="btn ghost sm" data-a="tool-close">${I('x')}Chiudi</button></div>`, () => keepAwake(false));
    keepAwake(true);
    // il testo si adatta allo schermo
    const el = $('#sign-big'); let fs = 120; el.style.fontSize = fs + 'px';
    while ((el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) && fs > 22) { fs -= 4; el.style.fontSize = fs + 'px'; }
  }

  /* ---------- messaggio rapido alla cerchia ---------- */
  const QUICK = () => [`Sono arrivat${sx()} 🏠`, 'Sto bene 👍', 'Sto tornando, ti scrivo quando arrivo', 'Mi chiami? Non posso scrivere', 'Mi serve un passaggio', 'Sono in ritardo, tutto ok', 'Non mi sento al sicuro, tienimi d\'occhio'];
  function sheetQuick() {
    openSheet(`<h2>Messaggio rapido</h2><p class="sub">Un tocco e arriva in tutte le chat della tua cerchia.</p>
      <div class="quick-list">${QUICK().map(q => `<button class="quick-opt" data-a="quick-pick" data-t="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <label class="field"><span>Messaggio</span><input id="qk-txt" maxlength="300" placeholder="Scrivi o scegli sopra"></label>
      <label class="row toggle-row"><i class="ic-dot blue">${I('pin')}</i><div class="fl wrap"><b>Aggiungi la mia posizione</b><span>Link a Google Maps</span></div><input type="checkbox" class="switch" id="qk-pos" checked></label>
      ${ctx.hasSms() ? `<label class="row toggle-row"><i class="ic-dot green">${I('sms')}</i><div class="fl wrap"><b>Anche ai contatti SMS</b><span>Chi non ha l'app lo riceve via SMS</span></div><input type="checkbox" class="switch" id="qk-sms"></label>` : ''}
      <button class="btn" data-a="quick-send">${I('send')}Invia alla cerchia</button>`, 'quick');
  }

  /* ---------- primo soccorso (offline) ---------- */
  const FA = [
    ['cpr', 'heart', 'red', 'Non respira: RCP', 'Massaggio cardiaco con metronomo', [
      'Controlla che la zona sia sicura per te.',
      'Scuotila per le spalle e chiamala ad alta voce. Se non risponde e non respira normalmente, inizia subito.',
      '<b>Chiama il 112</b> in vivavoce e fatti portare un <b>defibrillatore (DAE)</b> se c\'è.',
      'Mani una sopra l\'altra al <b>centro del torace</b>, braccia tese: spingi giù di <b>5–6 cm</b>, <b>100–120 volte al minuto</b>. Usa il metronomo qui sotto.',
      'Se sai farlo: 30 compressioni e 2 insufflazioni. Se no, solo compressioni, senza fermarti.',
      'Quando arriva il DAE accendilo e segui la voce. Continua finché arrivano i soccorsi o la persona respira.'], 'cpr'],
    ['choke', 'alert', 'amber', 'Soffocamento', 'Adulto che non riesce a respirare', [
      'Se tossisce, incoraggiala a tossire: non dare colpi.',
      'Se non riesce a tossire, parlare o respirare: falla piegare in avanti e dai <b>5 colpi decisi tra le scapole</b> con il palmo.',
      'Poi <b>5 compressioni addominali</b> (manovra di Heimlich): da dietro, pugno sopra l\'ombelico, tira forte verso di te e verso l\'alto.',
      'Alterna 5 colpi e 5 compressioni finché il boccone esce.',
      'Se perde i sensi: <b>chiama il 112</b> e inizia l\'RCP.',
      'Neonati e bambini piccoli: chiama il 112 e segui le istruzioni dell\'operatore.']],
    ['bleed', 'alert', 'red', 'Emorragia', 'Ferita che sanguina molto', [
      '<b>Premi forte e direttamente</b> sulla ferita con un panno pulito (o con la mano).',
      'Se il panno si inzuppa non toglierlo: aggiungine un altro sopra e continua a premere.',
      'Fai sdraiare la persona e, se è un arto, tienilo sollevato.',
      'Se il sangue è tanto o non si ferma <b>chiama il 112</b>.',
      'Il laccio emostatico solo su braccia o gambe, se il sangue non si ferma con la pressione e sai usarlo.']],
    ['burn', 'spark', 'amber', 'Ustione', 'Raffreddare subito', [
      'Metti la parte ustionata sotto <b>acqua corrente fresca per 20 minuti</b>.',
      'Togli anelli, orologi e vestiti non attaccati alla pelle.',
      'Copri con pellicola trasparente o un panno pulito.',
      'Niente ghiaccio, burro, olio o creme.',
      '<b>112</b> se è estesa, profonda, sul viso, mani o genitali, o se è un bambino.']],
    ['faint', 'user', 'blue', 'Svenimento', 'Perde i sensi per poco', [
      'Falla sdraiare e <b>solleva le gambe</b>.',
      'Allenta vestiti stretti e fai entrare aria.',
      'Se non si riprende entro un minuto <b>chiama il 112</b>.',
      'Se respira ma non risponde mettila in <b>posizione laterale di sicurezza</b>.']],
    ['seizure', 'live', 'violet', 'Crisi epilettica', 'Convulsioni', [
      '<b>Non trattenerla</b> e non mettere niente in bocca.',
      'Allontana gli oggetti pericolosi e proteggi la testa (giacca, cuscino).',
      '<b>Cronometra</b> la crisi: usa il cronometro qui sotto.',
      'Quando finisce mettila in posizione laterale di sicurezza e resta con lei.',
      '<b>112</b> se dura più di 5 minuti, se è la prima volta, se si è ferita o non si riprende.'], 'timer'],
    ['stroke', 'user', 'red', 'Ictus', 'Faccia, braccio, parola', [
      '<b>Faccia</b>: chiedi di sorridere. Un lato non si muove?',
      '<b>Braccio</b>: chiedi di alzare le braccia. Uno cade?',
      '<b>Parola</b>: chiedi di ripetere una frase. Parla male o non capisce?',
      'Anche un solo segno: <b>chiama subito il 112</b>. Ogni minuto conta.',
      'Annota <b>l\'ora</b> in cui sono iniziati i sintomi: serve ai medici.'], 'clock'],
    ['heart', 'heart', 'red', 'Infarto', 'Dolore al petto', [
      'Segnali: dolore o peso al petto che può arrivare a braccio, mandibola o schiena, sudore freddo, nausea, fiato corto.',
      '<b>Chiama subito il 112</b>. Non accompagnarla tu in auto.',
      'Falla stare seduta e tranquilla, slaccia i vestiti stretti.',
      'Se perde i sensi e non respira: <b>RCP</b>.']],
    ['allergy', 'alert', 'amber', 'Reazione allergica grave', 'Gonfiore, fatica a respirare', [
      'Segnali: gonfiore di labbra o lingua, fatica a respirare, orticaria diffusa, malessere improvviso.',
      '<b>Chiama il 112</b>.',
      'Se ha l\'<b>autoiniettore di adrenalina</b>, aiutala a usarlo sulla parte esterna della coscia.',
      'Sdraiata con le gambe sollevate; seduta se respira male.']],
    ['heat', 'spark', 'amber', 'Colpo di calore', 'Caldo, confusione', [
      'Portala all\'ombra o al fresco.',
      'Raffreddala: acqua fresca sulla pelle, panni bagnati, ventilazione.',
      'Se è cosciente falle bere acqua a piccoli sorsi.',
      '<b>112</b> se è confusa, non suda o perde i sensi.']],
    ['pls', 'user', 'blue', 'Posizione laterale di sicurezza', 'Respira ma non risponde', [
      'Inginocchiati al suo fianco, il braccio più vicino a te piegato ad angolo retto.',
      'Porta l\'altro braccio sul petto, il dorso della mano contro la guancia vicina a te.',
      'Piega il ginocchio lontano da te e tira la persona verso di te, sul fianco.',
      'Inclina la testa all\'indietro per tenere libere le vie aeree. Controlla che continui a respirare.']]
  ];
  const sheetFA = () => openSheet(`<h2>Primo soccorso</h2><p class="sub">Indicazioni rapide, anche offline. Non sostituiscono un corso: in emergenza chiama il 112 e segui l'operatore.</p>
    <div class="card">${FA.map(([k, ic, c, t, s]) => `<button class="row" data-a="fa" data-k="${k}"><i class="ic-dot ${c}">${I(ic)}</i><div class="fl"><b>${t}</b><span>${s}</span></div>${I('chev', 'chev')}</button>`).join('')}</div>`, 'fa');
  function sheetFAItem(k) {
    const f = FA.find(x => x[0] === k); if (!f) return;
    const extra = f[6] === 'cpr' ? `<button class="btn red" data-a="cpr">${I('heart')}Avvia il metronomo RCP</button><button class="btn ghost" data-a="near-aed">${I('pin')}Trova il defibrillatore più vicino</button>`
      : f[6] === 'timer' ? `<button class="btn" data-a="stopwatch">${I('clock')}Avvia il cronometro</button>`
      : f[6] === 'clock' ? `<button class="btn ghost" data-a="note-time">${I('clock')}Annota l'ora adesso</button><p class="note" id="noted"></p>` : '';
    openSheet(`<button class="back-link" data-a="fa-list">${I('back')}Primo soccorso</button><h2>${f[3]}</h2>
      <a class="btn red sm call-now" href="tel:112">${I('phone')}Chiama il 112</a>
      <ol class="steps-list">${f[5].map(x => `<li>${x}</li>`).join('')}</ol>${extra}`, 'fa-item');
  }
  // metronomo RCP a schermo intero
  function cpr() {
    closeSheet(); let n = 0, cyc = 0, t;
    play('cpr').then(stop => {
      showOv('cpr', `<div class="cpr-in"><p class="cpr-eye">RCP · 110 al minuto</p><div class="cpr-dot" id="cpr-dot"></div><b class="cpr-n" id="cpr-n">0</b><span class="cpr-s" id="cpr-s">Spingi a ogni battito · 5–6 cm</span></div>
        <div class="cd-foot"><a class="btn white" href="tel:112">${I('phone')}Chiama il 112</a><button class="btn ghost" data-a="tool-close">${I('x')}Ferma</button></div>`, () => { stop(); clearInterval(t); keepAwake(false); });
      keepAwake(true);
      t = setInterval(() => {
        n++; const d = $('#cpr-dot'); if (d) { d.classList.remove('go'); void d.offsetWidth; d.classList.add('go'); }
        const c = $('#cpr-n'); if (c) c.textContent = ((n - 1) % 30) + 1;
        if (n % 30 === 0) { cyc++; const s = $('#cpr-s'); if (s) s.textContent = `${cyc} cicli · se sai farlo: 2 insufflazioni, poi riprendi`; }
      }, 60000 / 110);
    });
  }
  function stopwatch() {
    closeSheet(); const t0 = Date.now(); let t;
    showOv('cpr sw', `<div class="cpr-in"><p class="cpr-eye">Cronometro crisi</p><b class="cpr-n" id="sw-n">0:00</b><span class="cpr-s" id="sw-s">Oltre 5 minuti: chiama il 112</span></div>
      <div class="cd-foot"><a class="btn white" href="tel:112">${I('phone')}Chiama il 112</a><button class="btn ghost" data-a="tool-close">${I('x')}Stop</button></div>`, () => { clearInterval(t); keepAwake(false); });
    keepAwake(true);
    t = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000), e = $('#sw-n'); if (e) e.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (s === 300) { ov.classList.add('late'); buzz([400, 200, 400]); } }, 250);
  }

  /* ---------- guide alle emergenze ---------- */
  const EM = [
    ['follow', 'eye', 'violet', 'Ti senti seguit' + 'a/o', [
      'Non andare a casa: non far sapere dove abiti.',
      'Entra in un posto <b>affollato e illuminato</b> (bar, negozio, farmacia) e chiedi aiuto.',
      'Cambia lato della strada per capire se ti segue davvero.',
      'Chiama qualcuno e resta al telefono, o usa <b>Accompagnami</b> o la <b>Finta chiamata</b>.',
      'Se continua a seguirti <b>chiama il 112</b> o tieni premuto l\'SOS.'], ['walk', 'fake']],
    ['attack', 'alert', 'red', 'Aggressione o molestia', [
      'La tua sicurezza viene prima delle cose: lascia borsa o telefono se serve.',
      'Allontanati verso altre persone e <b>grida</b> forte: «AIUTO, CHIAMATE IL 112».',
      'Usa la <b>Sirena</b> per attirare l\'attenzione e l\'<b>SOS</b> per avvisare la cerchia.',
      'Appena sei al sicuro <b>chiama il 112</b>. Per violenza e stalking c\'è anche il <b>1522</b> (gratis, 24 ore su 24).',
      'Annota subito i dettagli nel <b>Diario</b> (aspetto, ora, luogo): servono alla denuncia.',
      'In caso di violenza sessuale vai al pronto soccorso prima di lavarti o cambiarti: si conservano le prove.'], ['siren', 'diary']],
    ['quake', 'alert', 'amber', 'Terremoto', [
      '<b>Durante</b>: riparati sotto un tavolo robusto o vicino a un muro portante, lontano da finestre e mobili alti.',
      'Non usare l\'ascensore e non correre fuori durante la scossa.',
      'All\'aperto allontanati da edifici, alberi, lampioni e linee elettriche.',
      '<b>Dopo</b>: esci con calma dalle scale, chiudi gas e luce se puoi, raggiungi l\'area di attesa del tuo comune.',
      'Se sei bloccat' + 'a/o: non urlare di continuo, usa il <b>Fischietto</b> o batti su un tubo.'], ['whistle']],
    ['fire', 'spark', 'red', 'Incendio in casa', [
      'Esci subito e <b>chiudi le porte</b> dietro di te. Chiama il <b>115</b> o il 112 da fuori.',
      'Con il fumo stai <b>bassa/o</b>, vicino al pavimento, con un panno bagnato su naso e bocca.',
      'Tocca la porta prima di aprirla: se è calda non aprire.',
      'Non usare l\'ascensore.',
      'Se sei bloccat' + 'a/o in una stanza: chiudi le fessure con panni bagnati e fatti vedere dalla finestra con la <b>Luce</b> o la <b>Sirena</b>.'], ['light', 'siren']],
    ['gas', 'alert', 'amber', 'Fuga di gas', [
      'Non accendere luci, interruttori, fiamme o accendini.',
      'Apri porte e finestre e chiudi il rubinetto del gas al contatore.',
      'Esci e <b>chiama il 112 o il 115 da fuori casa</b> (non usare il telefono dentro).']],
    ['flood', 'live', 'blue', 'Alluvione', [
      'Sali ai piani alti. Non scendere in cantine, garage o sottopassi.',
      'Non attraversare strade allagate, né a piedi né in auto: bastano pochi centimetri d\'acqua che scorre per trascinarti.',
      'Stacca la corrente solo se puoi farlo senza toccare l\'acqua.',
      'Segui gli avvisi della Protezione civile e del tuo comune.']],
    ['crash', 'alert', 'red', 'Incidente stradale', [
      'Accendi le quattro frecce, indossa il giubbotto catarifrangente e metti il triangolo.',
      '<b>Chiama il 112</b> e di\' dove sei (usa <b>Dove sono</b>).',
      'Non spostare i feriti, a meno di un pericolo immediato (fuoco).',
      'Non togliere il casco a chi va in moto.',
      'Se qualcuno non respira: <b>RCP</b>.'], ['where', 'fa']]
  ];
  const TOOLNAME = { walk: 'Accompagnami', fake: 'Finta chiamata', siren: 'Sirena', diary: 'Diario', whistle: 'Fischietto', light: 'Luce', where: 'Dove sono', fa: 'Primo soccorso' };
  const sheetEM = () => openSheet(`<h2>Cosa fare se…</h2><p class="sub">Guide brevi per le situazioni più comuni. Funzionano offline.</p>
    <div class="card">${EM.map(([k, ic, c, t]) => `<button class="row" data-a="em" data-k="${k}"><i class="ic-dot ${c}">${I(ic)}</i><div class="fl"><b>${t}</b></div>${I('chev', 'chev')}</button>`).join('')}</div>`, 'em');
  function sheetEMItem(k) {
    const e = EM.find(x => x[0] === k); if (!e) return;
    openSheet(`<button class="back-link" data-a="em-list">${I('back')}Cosa fare se…</button><h2>${e[3]}</h2>
      <ol class="steps-list">${e[4].map(x => `<li>${x}</li>`).join('')}</ol>
      ${(e[5] || []).length ? `<div class="em-tools">${e[5].map(a => `<button class="btn ghost sm" data-a="${a}">${TOOLNAME[a]}</button>`).join('')}</div>` : ''}
      <a class="btn red" href="tel:112">${I('phone')}Chiama il 112</a>`, 'em-item');
  }

  /* ---------- prove: foto con data e posizione, registrazione audio, diario ---------- */
  function photoProof() {
    closeSheet();
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      toast('Aggiungo data e posizione…');
      const pos = await native.getPos().catch(() => null);
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(f); });
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
      const fs = Math.max(14, Math.round(c.width / 38)), pad = fs * 0.7, d = new Date();
      const lines = [d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) + '  ' + d.toLocaleTimeString('it-IT'),
        pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}  ±${Math.max(5, Math.round(pos.acc || 0))} m` : 'Posizione non disponibile'];
      const h = lines.length * fs * 1.35 + pad * 2;
      g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(0, c.height - h, c.width, h);
      g.fillStyle = '#fff'; g.font = `600 ${fs}px -apple-system, Roboto, sans-serif`; g.textBaseline = 'top';
      lines.forEach((l, i) => g.fillText(l, pad, c.height - h + pad + i * fs * 1.35));
      g.fillStyle = '#FF4D5E'; g.font = `800 ${fs * 0.8}px -apple-system, Roboto, sans-serif`; g.textAlign = 'right'; g.fillText('VICINA', c.width - pad, c.height - h + pad);
      const url = c.toDataURL('image/jpeg', 0.85);
      lastProof = { url, text: 'Foto del ' + lines.join(' · ') + (pos ? '\n' + mapsLink(pos) : '') };
      openSheet(`<h2>Foto con data e posizione</h2><p class="sub">Salvala subito: dal menu scegli «Salva immagine» o mandala a chi vuoi.</p>
        <img class="proof-img" src="${url}" alt="Foto con data e posizione">
        <button class="btn" data-a="proof-share">${I('share')}Salva o condividi</button>
        <button class="btn ghost" data-a="proof-diary">${I('book')}Aggiungi una nota al diario</button>`, 'proof');
    };
    inp.click();
  }
  let lastProof = null, recSess = null, recT = null;
  async function recordProof() {
    closeSheet();
    try { recSess = await native.startRecording(); } catch { return toast('Serve il permesso del microfono'); }
    const t0 = Date.now();
    showOv('rec', `<div class="cpr-in"><p class="cpr-eye">${I('mic')}Registrazione in corso</p><div class="rec-dot"></div><b class="cpr-n" id="rec-n">0:00</b><span class="cpr-s">Tieni l'app aperta. Lo schermo può restare acceso al minimo.</span></div>
      <div class="cd-foot"><button class="btn white big" data-a="rec-stop">${I('check')}Ferma e salva</button><button class="btn ghost" data-a="rec-cancel">Annulla</button></div>`, () => { clearInterval(recT); keepAwake(false); try { recSess?.cancel(); } catch {} recSess = null; });
    keepAwake(true);
    recT = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000), e = $('#rec-n'); if (e) e.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
  }
  async function recordStop() {
    const r = recSess; recSess = null; clearInterval(recT);
    const res = await r?.stop().catch(() => null); closeOv();
    if (!res?.blob?.size) return toast('Registrazione vuota');
    const d = new Date(), name = `vicina-audio-${d.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${res.ext}`;
    lastAudio = { blob: res.blob, name };
    openSheet(`<h2>Registrazione salvata</h2><p class="sub">${Math.round(res.ms / 1000)} secondi · ${d.toLocaleString('it-IT')}. Salvala in File o mandala a chi vuoi.</p>
      <audio controls src="${URL.createObjectURL(res.blob)}" class="proof-audio"></audio>
      <button class="btn" data-a="audio-share">${I('share')}Salva o condividi</button>`, 'audio');
  }
  let lastAudio = null;
  // diario degli episodi (utile per una denuncia: cosa, quando, dove)
  const DK = () => 'diary:' + uid();
  const diary = () => { try { return JSON.parse(ls.get(DK()) || '[]'); } catch { return []; } };
  function sheetDiary() {
    const l = diary().sort((a, b) => b.at - a.at);
    openSheet(`<h2>Diario</h2><p class="sub">Annota episodi di molestie, stalking o minacce: data, luogo e cosa è successo. Resta solo sul telefono e puoi esportarlo per una denuncia.</p>
      <button class="btn" data-a="diary-new">${I('plus')}Nuovo episodio</button>
      ${l.length ? `<div class="card diary-list">${l.map(e => `<div class="row diary-row"><div class="fl wrap"><b>${new Date(e.at).toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${e.place ? ' · ' + esc(e.place) : ''}</b><span>${esc(e.text)}</span></div><button class="iconbtn sm" data-a="diary-del" data-id="${e.id}" aria-label="Elimina">${I('trash')}</button></div>`).join('')}</div>
      <button class="btn ghost" data-a="diary-export">${I('share')}Esporta tutto</button>` : '<p class="note">Ancora nessun episodio.</p>'}`, 'diary');
  }
  function sheetDiaryNew(pre = '') {
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    openSheet(`<button class="back-link" data-a="diary">${I('back')}Diario</button><h2>Nuovo episodio</h2>
      <label class="field"><span>Quando</span><input id="dy-at" type="datetime-local" value="${now}"></label>
      <label class="field"><span>Dove</span><input id="dy-place" maxlength="80" placeholder="Es. fermata bus via Roma"></label>
      <button class="btn ghost sm" data-a="diary-here">${I('pin')}Usa la mia posizione</button>
      <label class="field"><span>Cosa è successo</span><textarea id="dy-text" rows="5" maxlength="2000" placeholder="Chi, cosa ha detto o fatto, testimoni, com'era vestito…">${esc(pre)}</textarea></label>
      <button class="btn" data-a="diary-save">Salva</button>`, 'diary-new');
  }

  /* ---------- bussola ---------- */
  let compassH = null;
  async function compass() {
    closeSheet();
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return toast('Serve il permesso «Movimento e orientamento»'); } catch { return; }
    }
    const pos = await native.getPos().catch(() => null);
    showOv('compass', `<div class="cmp-in"><p class="cpr-eye">Bussola</p><div class="cmp-rose" id="cmp-rose"><span class="n">N</span><span class="e">E</span><span class="s">S</span><span class="w">O</span><i></i></div>
      <b class="cpr-n" id="cmp-deg">–</b><span class="cpr-s" id="cmp-dir">Tieni il telefono in piano</span>
      ${pos ? `<p class="cmp-ll">${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}</p>` : ''}</div>
      <div class="cd-foot"><button class="btn ghost" data-a="tool-close">${I('x')}Chiudi</button></div>`, () => { if (compassH) { window.removeEventListener('deviceorientationabsolute', compassH); window.removeEventListener('deviceorientation', compassH); } compassH = null; });
    const DIRS = ['Nord', 'Nord-est', 'Est', 'Sud-est', 'Sud', 'Sud-ovest', 'Ovest', 'Nord-ovest'];
    compassH = e => {
      let h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null ? 360 - e.alpha : null;
      if (h == null) return; h = (h + 360) % 360;
      const r = $('#cmp-rose'); if (r) r.style.transform = `rotate(${-h}deg)`;
      const d = $('#cmp-deg'); if (d) d.textContent = Math.round(h) + '°';
      const t = $('#cmp-dir'); if (t) t.textContent = 'Verso ' + DIRS[Math.round(h / 45) % 8];
    };
    window.addEventListener('deviceorientationabsolute', compassH); window.addEventListener('deviceorientation', compassH);
  }

  /* ---------- foglio «Strumenti» ---------- */
  const TOOLS = [
    ['Adesso', [
      ['siren', 'bell', 'red', 'Sirena', 'Suono forte e lampeggio'],
      ['whistle', 'bell', 'amber', 'Fischietto', 'Segnale di soccorso'],
      ['deadman', 'shield', 'red', 'Se lo lasci, suona', 'Allarme anti-scippo'],
      ['motion', 'lock', 'violet', 'Allarme movimento', 'Se qualcuno lo sposta'],
      ['light', 'spark', 'blue', 'Luce', 'Schermo bianco o SOS luminoso'],
      ['fake', 'phone', 'green', 'Finta chiamata', 'Una scusa per andartene'],
      ['sign', 'eye', 'amber', 'Cartello', 'Messaggio gigante, anche in inglese']]],
    ['In giro', [
      ['walk', 'shield', 'red', 'Accompagnami', 'Se non arrivi parte l\'SOS'],
      ['quick', 'send', 'green', 'Messaggio rapido', '«Sono arrivata», «Sto bene»…'],
      ['where', 'pin', 'blue', 'Dove sono', 'Indirizzo e coordinate'],
      ['compass', 'pin', 'violet', 'Bussola', 'Orientarsi senza internet']]],
    ['Prove', [
      ['photo', 'camera', 'blue', 'Foto con data', 'Data, ora e posizione stampate'],
      ['record', 'mic', 'red', 'Registra audio', 'Per avere una prova'],
      ['diary', 'book', 'violet', 'Diario', 'Episodi da denunciare']]],
    ['Salute e guide', [
      ['fa', 'heart', 'red', 'Primo soccorso', 'RCP con metronomo e altro'],
      ['em', 'alert', 'amber', 'Cosa fare se…', 'Terremoto, incendio, aggressione'],
      ['med', 'heart', 'red', 'Scheda medica', 'Per i soccorritori'],
      ['nums', 'phone', 'green', 'Numeri utili', '112, 1522, 118…'],
      ['ai', 'spark', 'amber', 'Assistente', 'Chiedi cosa fare']]]
  ];
  const allTools = () => { const l = TOOLS.map(([g, x]) => [g, [...x]]); extras.flatMap(x => x.groups || []).forEach(([g, x, after]) => { const f = l.find(y => y[0] === g); if (f) f[1].push(...x); else l.splice(after ?? l.length, 0, [g, [...x]]); }); return l; };
  const toolCard = ([a, ic, c, t, s]) => `<button class="tool" data-a="${a}" data-find="${(t + ' ' + s).toLowerCase()}"><i class="ic-dot ${c}">${I(ic)}</i><b>${t}</b><span>${s}</span></button>`;
  const sheetTools = () => { const T = allTools(); openSheet(`<h2>Strumenti</h2><p class="sub">${T.reduce((a, g) => a + g[1].length, 0)} strumenti: molti funzionano anche senza internet.</p>
    <label class="search"><svg class="i"><use href="#i-search"/></svg><input id="tool-find" placeholder="Cerca uno strumento…" autocomplete="off"></label>
    <div id="tool-groups">${T.map(([g, l]) => `<div class="tool-group"><div class="label">${g}</div><div class="tools-grid">${l.map(toolCard).join('')}</div></div>`).join('')}</div>
    <p class="note no-find" id="tool-none" hidden>Nessuno strumento trovato.</p>
    <label class="row toggle-row"><i class="ic-dot violet">${I('alert')}</i><div class="fl wrap"><b>Scuoti per SOS</b><span>Scuoti forte il telefono: dopo 5 secondi parte l'SOS (con l'app aperta)</span></div><input type="checkbox" class="switch" data-pref="shake" ${prefs.shake ? 'checked' : ''}></label>`, 'tools');
    const f = $('#tool-find');
    f?.addEventListener('input', () => {
      const q = f.value.trim().toLowerCase(); let n = 0;
      $('#tool-groups').querySelectorAll('.tool').forEach(b => { const ok = !q || b.dataset.find.includes(q); b.hidden = !ok; if (ok) n++; });
      $('#tool-groups').querySelectorAll('.tool-group').forEach(g => { g.hidden = ![...g.querySelectorAll('.tool')].some(b => !b.hidden); });
      $('#tool-none').hidden = n > 0;
    });
  };

  /* ---------- pagina «Strumenti» (scheda della barra in basso) ---------- */
  const FEATURED = [['panic', 'alert', 'red', 'Panico', 'Sirena, flash e avviso'], ['walk', 'shield', 'violet', 'Accompagnami', 'Se non arrivi parte l\'SOS'], ['home', 'pin', 'green', 'Portami a casa', 'Strada + timer'],
    ['safe-places', 'shield', 'blue', 'Luoghi sicuri', 'Polizia, pronto soccorso'], ['fake', 'phone', 'amber', 'Finta chiamata', 'Per andartene'], ['fa', 'heart', 'red', 'Primo soccorso', 'RCP e altro']];
  const slug = g => g.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '-');
  function renderScreen(el) {
    const T = allTools(), n = T.reduce((a, g) => a + g[1].length, 0);
    el.innerHTML = `<div class="tl-head"><p class="eyebrow">${n} strumenti</p><h1 class="title">Strumenti</h1>
        <label class="search"><svg class="i"><use href="#i-search"/></svg><input id="tl-find" placeholder="Cerca: casa, taxi, ferita, QR…" autocomplete="off"></label>
        <div class="tl-chips" id="tl-chips"><button class="on" data-g="">Tutti</button>${T.map(([g]) => `<button data-g="${slug(g)}">${g}</button>`).join('')}</div></div>
      <div class="tl-body" id="tl-body">
        <section class="tl-sec" data-sec="feat"><div class="sec-h"><b>In evidenza</b><span>I più usati quando serve</span></div>
          <div class="tl-feat">${FEATURED.map(([a, ic, c, t, sub]) => `<button class="tl-big ${c}" data-a="${a}" data-find="${(t + ' ' + sub).toLowerCase()}"><i>${I(ic)}</i><b>${t}</b><span>${sub}</span></button>`).join('')}</div></section>
        ${T.map(([g, l]) => `<section class="tl-sec" data-sec="${slug(g)}"><div class="sec-h"><b>${g}</b><span>${l.length}</span></div><div class="tools-grid">${l.map(toolCard).join('')}</div></section>`).join('')}
        <p class="note" id="tl-none" hidden>Nessuno strumento trovato.</p>
        <div class="card tl-shake"><label class="row toggle-row"><i class="ic-dot violet">${I('alert')}</i><div class="fl wrap"><b>Scuoti per SOS</b><span>Scuoti forte il telefono: dopo 5 secondi parte l'SOS (con l'app aperta)</span></div><input type="checkbox" class="switch" data-pref="shake" ${prefs.shake ? 'checked' : ''}></label></div>
      </div>`;
    const body = el.querySelector('#tl-body'), find = el.querySelector('#tl-find');
    find.addEventListener('input', () => {
      const q = find.value.trim().toLowerCase(); let k = 0;
      body.querySelectorAll('.tool,.tl-big').forEach(b => { const ok = !q || (b.dataset.find || '').includes(q); b.hidden = !ok; if (ok && b.classList.contains('tool')) k++; });
      body.querySelectorAll('.tl-sec').forEach(sct => { sct.hidden = ![...sct.querySelectorAll('.tool,.tl-big')].some(b => !b.hidden); });
      el.querySelector('#tl-none').hidden = k > 0 || !q;
    });
    el.querySelector('#tl-chips').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('#tl-chips button').forEach(x => x.classList.toggle('on', x === b));
      const sec = b.dataset.g ? body.querySelector(`[data-sec="${b.dataset.g}"]`) : null;
      body.querySelectorAll('.tl-sec').forEach(x => { x.hidden = !!b.dataset.g && x !== sec; });
      el.scrollTo?.({ top: 0, behavior: 'smooth' });
    });
    el.addEventListener('change', e => { const k = e.target.dataset.pref; if (!k) return; prefs[k] = e.target.checked; savePrefs(); prefChanged(k, prefs[k], e.target); });
    return n;
  }

  /* ---------- azioni ---------- */
  const extras = [];
  async function handle(a, t) {
    for (const x of extras) if (await x.handle(a, t)) return true;
    switch (a) {
      case 'tools': closeSheet(); if (ctx.showTools) ctx.showTools(); else sheetTools(); return true;
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
      case 'cd-cancel': { const cb = cdCancel; cdCancel = null; closeOv(); native.haptic('medium'); if (cb) { cb(); toast('Bene così. Al prossimo check-in.'); } else toast('Annullato. Bene così.'); return true; }
      case 'walk-checkin': if (walk) { walk.until = Date.now() + walk.repeat * 60000; saveWalk(); rWalk(); toast('Ok, prossimo check-in tra ' + walk.repeat + ' minuti'); } return true;
      case 'cd-now': cdCancel = null; closeOv(); sos(); return true;
      case 'whistle': closeSheet(); whistle(); return true;
      case 'deadman': closeSheet(); deadman(); return true;
      case 'motion': closeSheet(); if (await motionPermission()) motionAlarm(); else toast('Serve il permesso «Movimento»'); return true;
      case 'sign': closeSheet(); sheetSign(); return true;
      case 'sign-show': signShow(t.dataset.t); return true;
      case 'sign-own': { const v = ($('#sg-own')?.value || '').trim(); if (v) signShow(v.toUpperCase()); else toast('Scrivi il messaggio'); return true; }
      case 'sign-color': ov.classList.toggle('alt'); return true;
      case 'quick': closeSheet(); sheetQuick(); return true;
      case 'quick-pick': { const i = $('#qk-txt'); if (i) i.value = t.dataset.t; document.querySelectorAll('.quick-opt').forEach(x => x.classList.toggle('on', x === t)); return true; }
      case 'quick-send': {
        const txt = ($('#qk-txt')?.value || '').trim(); if (!txt) return toast('Scegli o scrivi un messaggio'), true;
        const withPos = $('#qk-pos')?.checked, sms = $('#qk-sms')?.checked;
        let full = txt;
        if (withPos) { const p = await native.getPos(); if (p) full += '\n📍 ' + mapsLink(p); }
        closeSheet();
        const n = await ctx.quickSend(full, { sms });
        toast(n ? `Inviato a ${n} ${n === 1 ? 'chat' : 'chat'}` : 'Nessuna chat a cui inviarlo');
        return true;
      }
      case 'fa': closeSheet(); t.dataset.k ? sheetFAItem(t.dataset.k) : sheetFA(); return true;
      case 'fa-list': sheetFA(); return true;
      case 'cpr': cpr(); return true;
      case 'stopwatch': stopwatch(); return true;
      case 'note-time': { const e = $('#noted'); if (e) e.textContent = 'Sintomi iniziati alle ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ': dillo al 112.'; native.haptic('light'); return true; }
      case 'em': closeSheet(); t.dataset.k ? sheetEMItem(t.dataset.k) : sheetEM(); return true;
      case 'em-list': sheetEM(); return true;
      case 'photo': photoProof(); return true;
      case 'proof-share': if (lastProof && !(await native.shareImages([lastProof.url], lastProof.text))) toast('Condivisione non disponibile'); return true;
      case 'proof-diary': sheetDiaryNew(lastProof ? lastProof.text + '\n' : ''); return true;
      case 'record': recordProof(); return true;
      case 'rec-stop': recordStop(); return true;
      case 'rec-cancel': closeOv(); toast('Registrazione annullata'); return true;
      case 'audio-share': if (lastAudio && !(await native.shareBlob(lastAudio.blob, lastAudio.name, 'Registrazione Vicina'))) toast('Condivisione non disponibile'); return true;
      case 'diary': closeSheet(); sheetDiary(); return true;
      case 'diary-new': sheetDiaryNew(); return true;
      case 'diary-here': { const p = await native.getPos(); const i = $('#dy-place'); if (p && i) i.value = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`; else toast('Posizione non disponibile'); return true; }
      case 'diary-save': {
        const text = ($('#dy-text')?.value || '').trim(); if (!text) return toast('Scrivi cosa è successo'), true;
        const at = Date.parse($('#dy-at').value) || Date.now(), l = diary();
        l.push({ id: Date.now().toString(36), at, place: ($('#dy-place').value || '').trim(), text });
        ls.set(DK(), JSON.stringify(l)); toast('Episodio salvato'); sheetDiary(); return true;
      }
      case 'diary-del': { ls.set(DK(), JSON.stringify(diary().filter(e => e.id !== t.dataset.id))); sheetDiary(); toast('Episodio eliminato'); return true; }
      case 'diary-export': {
        const p = profile() || {};
        const txt = `DIARIO EPISODI – ${p.name || ''} ${p.surname || ''}\nEsportato il ${new Date().toLocaleString('it-IT')}\n\n` + diary().sort((a, b) => a.at - b.at).map((e, i) => `${i + 1}. ${new Date(e.at).toLocaleString('it-IT')}${e.place ? ' – ' + e.place : ''}\n${e.text}`).join('\n\n');
        await native.share({ title: 'Diario episodi', text: txt }); return true;
      }
      case 'compass': compass(); return true;
    }
    return false;
  }
  // scelta nei pulsanti «choice» dei fogli
  document.addEventListener('click', e => {
    const b = e.target.closest('#wk-min button, #fk-when button, #md-blood button, #sg-lang button'); if (!b) return;
    if (b.dataset.l) { ls.set('signLang', b.dataset.l); setTimeout(sheetSign, 0); return; }
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
  const h = { showOv, closeOv, play, keepAwake, buzz, countdown, startWalk, sheetWalk, siren, light, whistle, fakeRing, sheetWhere, sheetMed, med, diary, sheetDiaryNew, sheetQuick, mmss, ov, sx, get walk() { return walk; }, get ovKind() { return ovKind; } };
  return { handle, rWalk, restore, medicalLine, prefChanged, busy, sheetMed, h, renderScreen, count: () => allTools().reduce((a, g) => a + g[1].length, 0), setExtra: x => { extras.push(x); } };
}
