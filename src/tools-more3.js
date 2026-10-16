// Strumenti di Vicina, quarta parte: 50 strumenti nuovi.
// 16 strumenti interattivi (codice anti-costrizione, SOS a tempo, finta videochiamata, ritrova il punto…)
// e 34 guide brevi per situazioni precise (truffe, montagna, mare, tracker nascosti, viaggi…). Quasi tutto funziona offline.
export function createMore3(ctx, base, extra) {
  const { $, I, esc, toast, openSheet, closeSheet, native, ls, mapsLink, hhmm, uid, profile } = ctx;
  const { showOv, closeOv, keepAwake, sx, countdown, play } = base.h;
  const ov = base.h.ov;
  const { km, dist } = extra.nav;
  const K = k => 'x3:' + k + ':' + uid();
  const load = (k, d) => { try { const v = JSON.parse(ls.get(K(k)) || 'null'); return v ?? d; } catch { return d; } };
  const save = (k, v) => ls.set(K(k), JSON.stringify(v));
  const steps = l => `<ol class="steps-list">${l.map(x => `<li>${x}</li>`).join('')}</ol>`;
  const call = (n, t) => `<a class="btn red" href="tel:${n}">${I('phone')}${t}</a>`;
  const c112 = () => call(112, 'Chiama il 112');
  const guide = (title, sub, list, more = '') => { closeSheet(); openSheet(`<h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${steps(list)}${more}`, 'g3'); };
  const tools = (l) => `<div class="em-tools">${l.map(([a, t]) => `<button class="btn ghost sm" data-a="${a}">${t}</button>`).join('')}</div>`;
  const send = (t, o) => ctx.quickSend(t, o);
  const diaryAdd = (text, place = '') => { const k = 'diary:' + uid(); let l = []; try { l = JSON.parse(ls.get(k) || '[]'); } catch {} l.push({ id: Date.now().toString(36), at: Date.now(), place, text }); ls.set(k, JSON.stringify(l)); };
  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  /* ---------- 1. codice anti-costrizione ---------- */
  // Blocca lo schermo: con il codice vero si esce; con il codice d'emergenza sembra annullato ma parte l'SOS; 3 errori = SOS.
  function duressSetup() {
    const c = load('duress', {});
    closeSheet();
    openSheet(`<h2>Codice anti-costrizione</h2><p class="sub">Se qualcuno ti costringe a «spegnere l'allarme», usa il <b>codice d'emergenza</b>: lo schermo dice «Annullato», ma la tua cerchia riceve l'SOS. Con il codice vero esci davvero. 3 codici sbagliati fanno partire l'SOS.</p>
      <div class="field2"><label class="field"><span>Codice vero</span><input id="dr-ok" inputmode="numeric" maxlength="4" placeholder="4 cifre" value="${esc(c.ok || '')}"></label>
      <label class="field"><span>Codice d'emergenza</span><input id="dr-sos" inputmode="numeric" maxlength="4" placeholder="4 cifre" value="${esc(c.sos || '')}"></label></div>
      <button class="btn" data-a="x3-duress-save">Salva</button>
      ${c.ok && c.sos ? `<button class="btn red" data-a="x3-duress-lock">${I('lock')}Blocca adesso</button>` : ''}
      <p class="note">I codici restano solo su questo telefono. Scegline due facili da ricordare sotto stress.</p>`, 'x3-duress');
  }
  let drIn = '', drBad = 0;
  function duressLock() {
    const c = load('duress', {}); if (!c.ok || !c.sos) return duressSetup();
    closeSheet(); drIn = ''; drBad = 0;
    showOv('x3-lock', `<div class="x3-lock"><p class="cpr-eye">${I('lock')}Bloccato</p><b class="x3-dots" id="dr-dots">○○○○</b><p class="x3-msg" id="dr-msg">Inserisci il codice per sbloccare</p>
      <div class="x3-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(n => n === '' ? '<span></span>' : `<button data-a="x3-pin" data-n="${n}">${n}</button>`).join('')}</div></div>`, () => keepAwake(false));
    keepAwake(true);
  }
  function duressKey(n) {
    if (n === '⌫') drIn = drIn.slice(0, -1); else if (drIn.length < 4) drIn += n;
    const d = $('#dr-dots'); if (d) d.textContent = '●'.repeat(drIn.length) + '○'.repeat(4 - drIn.length);
    native.haptic('light');
    if (drIn.length < 4) return;
    const c = load('duress', {}), v = drIn; drIn = '';
    if (v === c.ok) { closeOv(); toast('Sbloccato'); return; }
    if (v === c.sos) { closeOv(); toast('Allarme annullato'); ctx.sos?.(); return; }   // sembra annullato, ma parte l'SOS
    drBad++;
    const m = $('#dr-msg'); if (m) m.textContent = drBad >= 3 ? 'Codice errato' : `Codice errato (${drBad}/3)`;
    if (d) d.textContent = '○○○○';
    if (drBad >= 3) { closeOv(); ctx.sos?.(); }
  }

  /* ---------- 2. SOS a tempo ---------- */
  let qtT = null;
  function quickTimer(min) {
    closeSheet(); clearInterval(qtT);
    let left = Math.round(min * 60);
    showOv('x3-qt', `<div class="cpr-in"><p class="cpr-eye">${I('clock')}SOS a tempo</p><b class="cpr-n" id="qt-n">${mmss(left)}</b><span class="cpr-s">Se non tocchi «Sto bene» parte il conto alla rovescia dell'SOS.</span></div>
      <div class="cd-foot"><button class="btn white big" data-a="tool-close">${I('check')}Sto bene</button><button class="btn ghost" data-a="x3-qt-more">+1 minuto</button></div>`, () => { clearInterval(qtT); keepAwake(false); });
    keepAwake(true);
    qtT = setInterval(() => {
      left--; const n = $('#qt-n'); if (n) n.textContent = mmss(Math.max(0, left));
      if (left === 10) native.vibrate([300, 150, 300]);
      if (left <= 0) { clearInterval(qtT); closeOv(); countdown({ secs: 10, title: 'Tutto bene?', text: 'Il tempo è scaduto. Tra 10 secondi avviso la tua cerchia.' }); }
    }, 1000);
    ov.dataset.qt = '1'; quickTimer.add = s => { left += s; };
  }

  /* ---------- 3. raffica di foto ---------- */
  let burstImgs = [];
  async function burst() {
    closeSheet(); burstImgs = [];
    toast('Scatto 3 foto…');
    for (let i = 0; i < 3; i++) { const d = await native.snap('environment').catch(() => null); if (d) burstImgs.push(d); }
    if (!burstImgs.length) return toast('Fotocamera non disponibile: controlla il permesso');
    const p = await native.getPos().catch(() => null);
    diaryAdd(`Raffica di ${burstImgs.length} foto alle ${hhmm(Date.now())}`, p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : '');
    openSheet(`<h2>Raffica di foto</h2><p class="sub">${burstImgs.length} foto scattate alle ${hhmm(Date.now())}. Salvale o mandale subito: restano solo finché non chiudi.</p>
      <div class="x3-grid">${burstImgs.map(d => `<img src="${d}" alt="Foto">`).join('')}</div>
      <button class="btn" data-a="x3-burst-share">${I('share')}Salva o condividi</button>`, 'x3-burst');
  }

  /* ---------- 4. finta videochiamata ---------- */
  let fvStream = null, fvT = null;
  async function fakeVideo() {
    closeSheet();
    const name = ls.get('fakeName') || 'Mamma';
    try { fvStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); } catch { fvStream = null; }
    const t0 = Date.now();
    showOv('x3-video', `<div class="x3-vc"><div class="x3-vc-other"><b>${esc(name.slice(0, 1).toUpperCase())}</b></div><div class="x3-vc-top"><b>${esc(name)}</b><span id="fv-t">In collegamento…</span></div>
      ${fvStream ? '<video id="fv-me" autoplay playsinline muted></video>' : ''}
      <div class="call-btns one"><button data-a="tool-close" class="cb red" aria-label="Termina">${I('phone')}</button></div></div>`, () => { clearInterval(fvT); fvStream?.getTracks().forEach(t => t.stop()); fvStream = null; keepAwake(false); });
    keepAwake(true);
    const v = $('#fv-me'); if (v && fvStream) { v.srcObject = fvStream; v.play().catch(() => {}); }
    fvT = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000) - 3, e = $('#fv-t'); if (e && s >= 0) e.textContent = mmss(s); }, 1000);
  }

  /* ---------- 5. parola d'ordine ---------- */
  function safeWord() {
    closeSheet(); const w = load('word', '');
    openSheet(`<h2>Parola d'ordine</h2><p class="sub">Una parola innocua (es. «ciliegie») che, se la scrivi o la dici al telefono, significa: <b>sono in pericolo, chiama il 112</b>. Utile quando qualcuno ti sta guardando.</p>
      <label class="field"><span>La tua parola</span><input id="sw-w" maxlength="30" value="${esc(w)}" placeholder="Es. ciliegie"></label>
      <button class="btn" data-a="x3-word-send">${I('send')}Salva e spiegala alla cerchia</button>
      <p class="note">Il messaggio arriva in tutte le chat della tua cerchia. Ripetilo a voce con le persone più vicine.</p>`, 'x3-word');
  }

  /* ---------- 6. «Tutto ok?» a un'amica ---------- */
  function askOk() {
    closeSheet();
    openSheet(`<h2>Tutto ok?</h2><p class="sub">Chiedi alla tua cerchia come sta: e se non rispondono, Vicina ti ricorda di ricontrollare.</p>
      <div class="big-acts">${[10, 20, 30].map(m => `<button class="big-act" data-a="x3-askok-go" data-m="${m}">${I('chat')}<b>Ricordamelo tra ${m} min</b><span>alle ${hhmm(Date.now() + m * 60000)}</span></button>`).join('')}</div>`, 'x3-askok');
  }

  /* ---------- 7. se trovi questo telefono ---------- */
  function lostPhone() {
    closeSheet(); const c = load('lost', {}), p = profile() || {};
    openSheet(`<h2>Se trovi questo telefono</h2><p class="sub">Una schermata grande con un numero da chiamare: se perdi il telefono o ti senti male, chi lo trova sa chi avvisare.</p>
      <label class="field"><span>Nome da mostrare</span><input id="lp-n" maxlength="40" value="${esc(c.name || [p.name, p.surname].filter(Boolean).join(' '))}"></label>
      <label class="field"><span>Numero da chiamare</span><input id="lp-p" type="tel" maxlength="20" value="${esc(c.phone || '')}" placeholder="+39 333 123 4567"></label>
      <button class="btn" data-a="x3-lost-show">${I('eye')}Mostra la schermata</button>`, 'x3-lost');
  }

  /* ---------- 8. luce rossa ---------- */
  let rl = 0;
  function redLight() {
    closeSheet(); rl = 0;
    showOv('x3-red', `<p class="col-name">Luce rossa · tocca per cambiare intensità</p><button class="btn ghost sm col-x" data-a="tool-close">${I('x')}Chiudi</button>`, () => { ov.onclick = null; ov.style.background = ''; keepAwake(false); });
    keepAwake(true); const L = ['#ff1a1a', '#b30000', '#5c0000']; ov.style.background = L[0];
    ov.onclick = e => { if (e.target.closest('[data-a]')) return; rl = (rl + 1) % L.length; ov.style.background = L[rl]; };
  }

  /* ---------- 9. batteria critica ---------- */
  function saver() {
    closeSheet();
    showOv('x3-saver', `<div class="x3-saver"><p>${I('alert')}Batteria critica</p><button class="x3-sv-sos" data-a="x3-saver-sos">SOS</button><a class="btn ghost" href="tel:112">${I('phone')}112</a>
      <ul><li>Abbassa la luminosità al minimo</li><li>Chiudi le altre app</li><li>Manda subito la tua posizione</li></ul><button class="btn ghost sm" data-a="x3-saver-pos">${I('pin')}Manda la posizione alla cerchia</button><button class="btn ghost sm" data-a="tool-close">Esci</button></div>`, () => {});
  }

  /* ---------- 10. altitudine ---------- */
  async function altitude() {
    closeSheet();
    openSheet(`<h2>Altitudine e posizione</h2><p class="sub">In montagna: da leggere al 112 (che ti passa il Soccorso Alpino).</p><div id="x3-alt"><div class="where-load">${I('pin')}Cerco il GPS…</div></div>`, 'x3-alt');
    const p = await native.getPos({ precise: true }).catch(() => null), el = $('#x3-alt'); if (!el) return;
    if (!p) { el.innerHTML = '<p class="note">Posizione non disponibile: esci all\'aperto, lontano da rocce e alberi fitti.</p>'; return; }
    el.innerHTML = `<div class="where-ll"><div><small>Altitudine</small><b>${p.alt != null ? Math.round(p.alt) + ' m' : 'n.d.'}</b></div><div><small>Precisione</small><b>±${Math.max(5, Math.round(p.acc || 0))} m</b></div></div>
      <div class="where-ll"><div><small>Latitudine</small><b>${p.lat.toFixed(5)}</b></div><div><small>Longitudine</small><b>${p.lng.toFixed(5)}</b></div></div>
      ${steps(['Chiama il <b>112</b> e di\' che sei in montagna: ti passano il Soccorso Alpino.', 'Leggi le coordinate qui sopra, poi descrivi il sentiero, il colore dei vestiti, quante persone siete.', 'Resta dove sei, risparmia batteria e tieni il telefono acceso.'])}
      ${c112()}`;
  }

  /* ---------- 11. quanto manca al buio ---------- */
  function sunTimes(lat, lng, d = new Date()) {
    const rad = Math.PI / 180, J = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 + 2440587.5, n = Math.round(J - 2451545 - 0.0009 + lng / 360);
    const Js = 2451545 + 0.0009 - lng / 360 + n, M = (357.5291 + 0.98560028 * (Js - 2451545)) % 360;
    const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad), L = (M + 102.9372 + C + 180) % 360;
    const Jt = Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad), dec = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
    const cosH = (Math.sin(-0.83 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
    if (cosH < -1 || cosH > 1) return null;
    const H = Math.acos(cosH) / rad, toMs = j => (j - 2440587.5) * 864e5;
    return { rise: toMs(Jt - H / 360), set: toMs(Jt + H / 360) };
  }
  async function sunset() {
    closeSheet();
    openSheet(`<h2>Quanto manca al buio</h2><div id="x3-sun"><div class="where-load">${I('clock')}Calcolo…</div></div>`, 'x3-sun');
    const p = await native.getPos().catch(() => null) || { lat: 41.9, lng: 12.5 }, s = sunTimes(p.lat, p.lng), el = $('#x3-sun'); if (!el) return;
    if (!s) { el.innerHTML = '<p class="note">Oggi qui il sole non tramonta o non sorge.</p>'; return; }
    const left = Math.round((s.set - Date.now()) / 60000);
    el.innerHTML = `<div class="where-ll"><div><small>Alba</small><b>${hhmm(s.rise)}</b></div><div><small>Tramonto</small><b>${hhmm(s.set)}</b></div></div>
      <p class="x3-big">${left > 0 ? `Mancano <b>${left >= 60 ? Math.floor(left / 60) + ' h ' : ''}${left % 60} min</b> al tramonto` : 'Il sole è già tramontato'}</p>
      <p class="note">Dopo il tramonto la luce dura ancora circa 30 minuti. In escursione calcola il ritorno prima del buio; in città scegli strade illuminate.</p>
      <div class="em-tools"><button class="btn ghost sm" data-a="home">Portami a casa</button><button class="btn ghost sm" data-a="walk">Accompagnami</button></div>`;
  }

  /* ---------- 12. ritrova il punto ---------- */
  let bpT = null, bpH = null, bpHead = null, bpLast = null;
  async function backPoint() {
    closeSheet(); const pt = load('point', null);
    openSheet(`<h2>Ritrova il punto</h2><p class="sub">Salva dove sei (l'auto, l'ingresso del sentiero, il punto d'incontro) e poi una freccia ti riporta lì, anche senza internet.</p>
      ${pt ? `<div class="card"><div class="row"><i class="ic-dot blue">${I('pin')}</i><div class="fl"><b>${esc(pt.label || 'Punto salvato')}</b><span>Salvato alle ${hhmm(pt.at)}</span></div></div></div><button class="btn red" data-a="x3-point-go">${I('send')}Portami lì</button>` : ''}
      <label class="field"><span>Nome (facoltativo)</span><input id="bp-l" maxlength="30" placeholder="Es. auto, ingresso sentiero"></label>
      <button class="btn ${pt ? 'ghost' : ''}" data-a="x3-point-save">${I('pin')}${pt ? 'Salva qui un nuovo punto' : 'Salva questo punto'}</button>`, 'x3-point');
  }
  const bearing = (a, b) => { const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r), x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r); return (Math.atan2(y, x) / r + 360) % 360; };
  async function pointGo() {
    const pt = load('point', null); if (!pt) return;
    closeSheet();
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { try { await DeviceOrientationEvent.requestPermission(); } catch {} }
    showOv('x3-point', `<div class="cpr-in"><p class="cpr-eye">${I('pin')}${esc(pt.label || 'Punto salvato')}</p><div class="x3-arrow" id="bp-arrow">${I('send')}</div><b class="cpr-n" id="bp-d">…</b><span class="cpr-s" id="bp-s">Cerco la tua posizione</span></div>
      <div class="cd-foot"><button class="btn white" data-a="x3-point-maps">${I('pin')}Apri nelle Mappe</button><button class="btn ghost" data-a="tool-close">${I('x')}Chiudi</button></div>`,
      () => { clearInterval(bpT); window.removeEventListener('deviceorientationabsolute', bpH); window.removeEventListener('deviceorientation', bpH); keepAwake(false); });
    keepAwake(true);
    const draw = () => { if (!bpLast) return; const b = bearing(bpLast, pt), a = $('#bp-arrow'); if (a) a.style.transform = `rotate(${b - (bpHead ?? 0) - 45}deg)`; };
    bpH = e => { const h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null ? 360 - e.alpha : null; if (h != null) { bpHead = h; draw(); } };
    window.addEventListener('deviceorientationabsolute', bpH); window.addEventListener('deviceorientation', bpH);
    const tick = async () => {
      const p = await native.getPos({ maxAge: 4000 }).catch(() => null); if (!p || !$('#bp-d')) return;
      bpLast = p; const d = km(p, pt);
      $('#bp-d').textContent = dist(d); $('#bp-s').textContent = d < 0.02 ? 'Sei arrivat' + sx() + '!' : bpHead == null ? 'Tieni il telefono in piano (la freccia indica la direzione se c\'è la bussola)' : 'Segui la freccia';
      draw();
    };
    tick(); clearInterval(bpT); bpT = setInterval(tick, 4000);
  }

  /* ---------- 13. morse luminoso ---------- */
  const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
  let msT = null;
  function morseSheet() {
    closeSheet();
    openSheet(`<h2>Morse luminoso</h2><p class="sub">Lo schermo lampeggia il tuo messaggio in codice Morse: per farti vedere da lontano, di notte.</p>
      <label class="field"><span>Messaggio</span><input id="ms-t" maxlength="30" value="SOS" autocapitalize="characters"></label>
      <button class="btn" data-a="x3-morse-go">${I('spark')}Inizia</button>`, 'x3-morse');
  }
  function morseGo(text) {
    const seq = []; const U = 1;   // in unità da 250 ms
    String(text).toLowerCase().split('').forEach((ch, i, arr) => {
      if (ch === ' ') { seq.push([0, 7 * U]); return; }
      const m = MORSE[ch]; if (!m) return;
      m.split('').forEach((s, j) => { seq.push([1, s === '.' ? U : 3 * U]); if (j < m.length - 1) seq.push([0, U]); });
      if (i < arr.length - 1 && arr[i + 1] !== ' ') seq.push([0, 3 * U]);
    });
    seq.push([0, 7 * U]);
    if (!seq.length) return toast('Scrivi lettere o numeri');
    closeSheet();
    showOv('x3-morse', `<p class="col-name">${esc(text.toUpperCase())} · in Morse</p><button class="btn ghost sm col-x" data-a="tool-close">${I('x')}Chiudi</button>`, () => { clearTimeout(msT); ov.style.background = ''; keepAwake(false); });
    keepAwake(true);
    let i = 0; const step = () => { const [on, u] = seq[i]; ov.style.background = on ? '#fff' : '#000'; i = (i + 1) % seq.length; msT = setTimeout(step, u * 250); };
    step();
  }

  /* ---------- 14. appello del gruppo ---------- */
  function headcount() {
    closeSheet(); const l = load('heads', []);
    openSheet(`<h2>Appello del gruppo</h2><p class="sub">Gita, concerto, evacuazione: spunta chi c'è e vedi subito chi manca.</p>
      <label class="field"><span>Aggiungi nomi (separati da virgola)</span><input id="hc-in" maxlength="200" placeholder="Anna, Luca, Sara"></label>
      <button class="btn ghost sm" data-a="x3-heads-add">${I('plus')}Aggiungi</button>
      ${l.length ? `<p class="x3-big"><b>${l.filter(x => x.on).length}</b> su ${l.length} presenti${l.some(x => !x.on) ? ' · manca: ' + esc(l.filter(x => !x.on).map(x => x.n).join(', ')) : ''}</p>
      <div class="card">${l.map((x, i) => `<label class="row"><div class="fl"><b>${esc(x.n)}</b></div><input type="checkbox" class="switch" data-x3head="${i}" ${x.on ? 'checked' : ''}></label>`).join('')}</div>
      <div class="row2"><button class="btn ghost sm" data-a="x3-heads-reset">Azzera le spunte</button><button class="btn ghost sm" data-a="x3-heads-clear">Svuota la lista</button></div>` : ''}`, 'x3-heads');
  }

  /* ---------- 15. messaggio programmato ---------- */
  let dmT = null;
  function delayed() {
    closeSheet(); const cur = load('delayed', null);
    openSheet(`<h2>Messaggio programmato</h2><p class="sub">Se non lo annulli in tempo, Vicina manda un messaggio alla tua cerchia. Più leggero di un SOS: «Non mi sono fatt${sx()} sentire, chiamami».</p>
      ${cur && cur.at > Date.now() ? `<div class="card"><div class="row"><i class="ic-dot amber">${I('clock')}</i><div class="fl"><b>Parte alle ${hhmm(cur.at)}</b><span>${esc(cur.text)}</span></div></div></div><button class="btn white" data-a="x3-delay-cancel">${I('check')}Annulla, sto bene</button>` : ''}
      <label class="field"><span>Messaggio</span><input id="dm-t" maxlength="200" value="Non mi sono fatt${sx()} sentire come previsto: chiamami."></label>
      <div class="big-acts">${[30, 60, 120].map(m => `<button class="big-act" data-a="x3-delay-go" data-m="${m}">${I('clock')}<b>Tra ${m < 60 ? m + ' min' : m / 60 + (m === 60 ? ' ora' : ' ore')}</b><span>alle ${hhmm(Date.now() + m * 60000)}</span></button>`).join('')}</div>
      <p class="note">Tieni Vicina aperta o in background: se il telefono la chiude, il messaggio parte alla riapertura.</p>`, 'x3-delay');
  }
  function delayedArm() {
    clearTimeout(dmT); const cur = load('delayed', null); if (!cur) return;
    const fire = async () => { save('delayed', null); const n = await send('⏰ ' + cur.text); toast(n ? 'Messaggio programmato inviato alla cerchia' : 'Messaggio programmato non inviato: nessuna chat'); };
    if (cur.at <= Date.now()) fire(); else dmT = setTimeout(fire, Math.min(cur.at - Date.now(), 2 ** 31 - 1));
  }

  /* ---------- 16. identikit ---------- */
  function identikit() {
    closeSheet();
    openSheet(`<h2>Identikit</h2><p class="sub">Descrivi subito chi ti ha aggredit${sx()} o molestat${sx()}: dopo pochi minuti i dettagli si dimenticano. Va nel Diario.</p>
      <div class="field2"><label class="field"><span>Altezza</span><input id="ik-h" maxlength="20" placeholder="Es. 1,80"></label><label class="field"><span>Età</span><input id="ik-a" maxlength="20" placeholder="Es. 30-35"></label></div>
      <label class="field"><span>Capelli, barba, occhiali</span><input id="ik-c" maxlength="80"></label>
      <label class="field"><span>Vestiti e scarpe</span><input id="ik-v" maxlength="120"></label>
      <label class="field"><span>Segni particolari (tatuaggi, voce, accento)</span><input id="ik-s" maxlength="120"></label>
      <label class="field"><span>Auto o mezzo, targa, direzione di fuga</span><input id="ik-m" maxlength="120"></label>
      <button class="btn" data-a="x3-ik-save">${I('book')}Salva nel diario</button>`, 'x3-ik');
  }

  /* ---------- azioni ---------- */
  async function handle(a, t) {
    switch (a) {
      case 'x3-duress': duressSetup(); return true;
      case 'x3-duress-save': {
        const ok = ($('#dr-ok')?.value || '').trim(), sos = ($('#dr-sos')?.value || '').trim();
        if (!/^\d{4}$/.test(ok) || !/^\d{4}$/.test(sos)) return toast('Servono due codici di 4 cifre'), true;
        if (ok === sos) return toast('I due codici devono essere diversi'), true;
        save('duress', { ok, sos }); toast('Codici salvati'); duressSetup(); return true;
      }
      case 'x3-duress-lock': duressLock(); return true;
      case 'x3-pin': duressKey(t.dataset.n); return true;
      case 'x3-qt': closeSheet(); openSheet(`<h2>SOS a tempo</h2><p class="sub">Per pochi minuti a rischio: un vicolo buio, l'ascensore, il portone. Se non tocchi «Sto bene» in tempo, parte l'SOS.</p>
        <div class="big-acts">${[1, 2, 3, 5].map(m => `<button class="big-act" data-a="x3-qt-go" data-m="${m}">${I('clock')}<b>${m} ${m === 1 ? 'minuto' : 'minuti'}</b><span>fino alle ${hhmm(Date.now() + m * 60000)}</span></button>`).join('')}</div>`, 'x3-qt'); return true;
      case 'x3-qt-go': quickTimer(Number(t.dataset.m)); return true;
      case 'x3-qt-more': quickTimer.add?.(60); toast('+1 minuto'); return true;
      case 'x3-burst': burst(); return true;
      case 'x3-burst-share': if (burstImgs.length && !(await native.shareImages(burstImgs, 'Foto del ' + new Date().toLocaleString('it-IT')))) toast('Condivisione non disponibile'); return true;
      case 'x3-fakevideo': fakeVideo(); return true;
      case 'x3-word': safeWord(); return true;
      case 'x3-word-send': {
        const w = ($('#sw-w')?.value || '').trim(); if (!w) return toast('Scrivi la parola'), true;
        save('word', w); closeSheet();
        const n = await send(`🔐 La mia parola d'ordine è «${w}». Se te la scrivo o te la dico al telefono significa che sono in pericolo e non posso parlare: chiamami e, se non rispondo, chiama il 112.`);
        toast(n ? 'Parola salvata e spiegata alla cerchia' : 'Parola salvata (nessuna chat a cui spiegarla)'); return true;
      }
      case 'x3-askok': askOk(); return true;
      case 'x3-askok-go': {
        const m = Number(t.dataset.m); closeSheet();
        const n = await send('💬 Tutto ok? Rispondimi quando puoi.');
        if (!n) return toast('Nessuna chat a cui scrivere'), true;
        setTimeout(() => { native.vibrate([300, 150, 300]); toast('Promemoria: hai ricevuto risposta? Se no, prova a chiamare'); }, m * 60000);
        toast(`Inviato. Te lo ricordo alle ${hhmm(Date.now() + m * 60000)}`); return true;
      }
      case 'x3-lost': lostPhone(); return true;
      case 'x3-lost-show': {
        const name = ($('#lp-n')?.value || '').trim(), phone = ($('#lp-p')?.value || '').trim();
        save('lost', { name, phone }); closeSheet();
        showOv('x3-lost', `<div class="x3-lostcard"><p>${I('heart')}Hai trovato questo telefono?</p><h1>${esc(name || 'Il proprietario')}</h1>${phone ? `<span>Per favore chiama</span><a class="x3-lostnum" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a>` : ''}<span>In emergenza chiama il 112</span></div>
          <button class="btn ghost sm col-x" data-a="tool-close">${I('x')}Chiudi</button>`, () => keepAwake(false));
        keepAwake(true); return true;
      }
      case 'x3-red': redLight(); return true;
      case 'x3-saver': saver(); return true;
      case 'x3-saver-sos': closeOv(); countdown({ secs: 5, title: 'SOS tra 5 secondi', text: 'Batteria critica: avviso la tua cerchia con la tua posizione.' }); return true;
      case 'x3-saver-pos': { const p = await native.getPos().catch(() => null); const n = await send(`🔋 Batteria quasi scarica, potrei spegnermi a breve.${p ? '\nSono qui: ' + mapsLink(p) : ''}`, { sms: true }); toast(n ? 'Posizione inviata' : 'Nessuna chat a cui inviarla'); return true; }
      case 'x3-alt': altitude(); return true;
      case 'x3-sun': sunset(); return true;
      case 'x3-point': backPoint(); return true;
      case 'x3-point-save': {
        const p = await native.getPos({ precise: true }).catch(() => null); if (!p) return toast('Posizione non disponibile: attiva il GPS'), true;
        save('point', { lat: p.lat, lng: p.lng, at: Date.now(), label: ($('#bp-l')?.value || '').trim() }); toast('Punto salvato'); backPoint(); return true;
      }
      case 'x3-point-go': pointGo(); return true;
      case 'x3-point-maps': { const pt = load('point', null); if (pt) native.openMaps(pt.lat, pt.lng, pt.label || 'Punto salvato', true); return true; }
      case 'x3-morse': morseSheet(); return true;
      case 'x3-morse-go': morseGo(($('#ms-t')?.value || 'SOS').trim() || 'SOS'); return true;
      case 'x3-heads': headcount(); return true;
      case 'x3-heads-add': {
        const v = ($('#hc-in')?.value || '').split(',').map(x => x.trim()).filter(Boolean); if (!v.length) return toast('Scrivi almeno un nome'), true;
        const l = load('heads', []); v.forEach(n => l.push({ n: n.slice(0, 30), on: false })); save('heads', l.slice(0, 60)); headcount(); return true;
      }
      case 'x3-heads-reset': save('heads', load('heads', []).map(x => ({ ...x, on: false }))); headcount(); return true;
      case 'x3-heads-clear': save('heads', []); headcount(); return true;
      case 'x3-delay': delayed(); return true;
      case 'x3-delay-go': {
        const m = Number(t.dataset.m), text = ($('#dm-t')?.value || '').trim() || 'Non mi sono fatt' + sx() + ' sentire: chiamami.';
        save('delayed', { at: Date.now() + m * 60000, text }); delayedArm(); closeSheet(); toast(`Il messaggio parte alle ${hhmm(Date.now() + m * 60000)} se non lo annulli`); return true;
      }
      case 'x3-delay-cancel': save('delayed', null); clearTimeout(dmT); closeSheet(); toast('Annullato. Bene così'); return true;
      case 'x3-ik': identikit(); return true;
      case 'x3-ik-save': {
        const f = [['Altezza', 'ik-h'], ['Età', 'ik-a'], ['Capelli', 'ik-c'], ['Vestiti', 'ik-v'], ['Segni', 'ik-s'], ['Mezzo/targa', 'ik-m']].map(([k, id]) => [k, ($('#' + id)?.value || '').trim()]).filter(([, v]) => v);
        if (!f.length) return toast('Compila almeno un campo'), true;
        const p = await native.getPos().catch(() => null);
        diaryAdd('Identikit: ' + f.map(([k, v]) => `${k}: ${v}`).join('; '), p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : ''); closeSheet(); toast('Salvato nel diario'); return true;
      }

      /* ---------- guide ---------- */
      case 'x3-g-weapon': guide('Persona armata o attacco', 'Se qualcuno minaccia con un\'arma o attacca più persone.', [
        '<b>Scappa</b> se c\'è una via sicura: lascia borse e oggetti, aiuta gli altri a scappare ma non fermarti.', 'Se non puoi scappare <b>nasconditi</b>: chiudi a chiave, barrica la porta, spegni le luci, telefono <b>in silenzioso</b>.',
        '<b>Avvisa</b> il 112 appena puoi farlo senza farti sentire: se non puoi parlare, lascia la linea aperta o usa l\'SOS di Vicina.', 'Durante una rapina dai quello che chiedono: la tua vita vale più delle cose.', 'Quando arrivano le forze dell\'ordine tieni le mani bene in vista.'], c112()); return true;
      case 'x3-g-robbery': guide('Scippo e rapina', '', [
        'Non opporre resistenza: lascia andare borsa o telefono.', 'Allontanati verso altre persone e grida per attirare l\'attenzione.', 'Memorizza aspetto, direzione di fuga, mezzo e targa: usa l\'<b>Identikit</b>.',
        'Chiama il <b>112</b>. Se hanno preso il telefono, chiamalo da un altro: Vicina sul tuo telefono non si spegne da sola.', 'Blocca carte e SIM e fai denuncia (serve per il duplicato dei documenti).'],
        `${tools([['x3-ik', 'Identikit'], ['stolen', 'Telefono rubato']])}${c112()}`); return true;
      case 'x3-g-taxi': guide('Taxi abusivo o auto sconosciuta', '', [
        'Prendi solo taxi con licenza (insegna, numero, tassametro) o prenotati dall\'app o dal radiotaxi.', 'Prima di salire controlla targa, modello e nome dell\'autista dell\'app: devono coincidere.',
        'Siediti dietro, dal lato opposto all\'autista, e manda la targa alla cerchia (<b>Salgo in un\'auto</b>).', 'Se il percorso è strano o ti senti a disagio chiedi di fermarti in un posto affollato. Se non si ferma: <b>112</b>.'],
        tools([['car', 'Salgo in un\'auto'], ['walk', 'Accompagnami']])); return true;
      case 'x3-g-night': guide('Mezzi pubblici di notte', '', [
        'Aspetta in zone illuminate e vicino ad altre persone, possibilmente vicino a telecamere.', 'In metro e treno scegli la carrozza vicina al conducente o con più gente.', 'Siediti vicino alle porte o al corridoio, non in fondo a uno scompartimento vuoto.',
        'Se qualcuno ti infastidisce, cambia posto e dillo ad alta voce: altre persone ti aiuteranno più facilmente.', 'Avvisa la cerchia quando parti e quando arrivi (<b>Salgo su un mezzo</b>).'],
        tools([['ride', 'Salgo su un mezzo'], ['eta', 'Arrivo tra…']])); return true;
      case 'x3-g-crowd': guide('Concerti e folla', 'Festival, stadi, piazze piene.', [
        'Appena arrivi individua le <b>uscite</b> e scegli un <b>punto d\'incontro</b> con chi è con te.', 'Resta ai bordi, lontano dalle transenne e dai punti dove la folla si stringe.', 'Se la folla spinge, non opporti: muoviti in <b>diagonale</b> verso i lati, braccia davanti al petto per respirare.',
        'Se cadi, alzati subito; se non riesci, rannicchiati sul fianco proteggendo testa e collo.', 'Tieni il telefono carico: usa <b>Segnale colorato</b> per farti trovare.'],
        tools([['meet', 'Punto d\'incontro'], ['color', 'Segnale colorato'], ['x3-heads', 'Appello del gruppo']])); return true;
      case 'x3-g-sea': guide('Mare e correnti', 'La corrente di risacca porta al largo anche chi nuota bene.', [
        'Fai il bagno dove c\'è il bagnino e rispetta le bandiere (rossa = vietato).', 'Se una corrente ti porta al largo <b>non nuotare contro</b>: nuota parallel' + sx() + ' alla riva finché sei fuori, poi rientra.',
        'Se sei stanc' + sx() + ', galleggia sul dorso e alza un braccio per chiedere aiuto.', 'Per chi è in difficoltà: avvisa il bagnino e chiama il <b>112</b> o il <b>1530</b> (Guardia costiera). Lancia qualcosa che galleggia.'],
        `${call(1530, 'Guardia costiera 1530')}${c112()}`); return true;
      case 'x3-g-mountain': guide('Montagna ed escursioni', '', [
        'Prima di partire: meteo, orario del tramonto, percorso adatto, batteria carica e una power bank.', 'Di\' a qualcuno dove vai e quando torni (<b>Messaggio programmato</b>).', 'Se ti perdi: fermati, torna all\'ultimo punto conosciuto, non scendere nei canaloni.',
        'In emergenza chiama il <b>112</b> e leggi le coordinate (<b>Altitudine e posizione</b>).', 'Segnale internazionale di soccorso: 6 fischi o lampi al minuto, poi un minuto di pausa.'],
        tools([['x3-alt', 'Altitudine'], ['x3-sun', 'Quanto manca al buio'], ['whistle', 'Fischietto']])); return true;
      case 'x3-g-storm': guide('Temporale e fulmini', '', [
        'Se senti tuoni sei abbastanza vicin' + sx() + ' da essere colpit' + sx() + ': cerca subito riparo in un edificio o in auto (chiusa).', 'Evita alberi isolati, pali, creste, acqua e spazi aperti.',
        'Se sei all\'aperto senza riparo: piedi uniti, accovacciat' + sx() + ', non sdraiarti.', 'Stai lontan' + sx() + ' da sottopassi e torrenti: si allagano in pochi minuti.', 'Aspetta 30 minuti dall\'ultimo tuono prima di uscire.']); return true;
      case 'x3-g-blackout': guide('Black-out', '', [
        'Usa torce, non candele. Stacca gli apparecchi elettrici per evitare sbalzi al ritorno della corrente.', 'Apri il frigo il meno possibile: il cibo resta freddo per alcune ore.', 'Risparmia la batteria del telefono: luminosità al minimo, modalità risparmio.',
        'Se dipendi da apparecchi medici elettrici, chiama subito il 112.', 'Controlla vicini anziani o soli.'], tools([['torch', 'Torcia'], ['x3-saver', 'Batteria critica']])); return true;
      case 'x3-g-lift': guide('Ascensore bloccato', '', [
        'Stai calm' + sx() + ': l\'ascensore non precipita, ha freni di sicurezza.', 'Premi il pulsante d\'allarme o il citofono e di\' dove sei.', 'Non forzare le porte e non uscire da sol' + sx() + ' se la cabina è tra due piani.',
        'Se nessuno risponde o ti senti male, chiama il <b>112</b>.', 'Respira lentamente: lo strumento <b>Respira</b> aiuta.'], `${tools([['breathe', 'Respira']])}${c112()}`); return true;
      case 'x3-g-phishing': guide('SMS e link truffa', 'Finta banca, finto corriere, finto pacco in giacenza.', [
        'Banche e Poste <b>non chiedono mai</b> codici, PIN o password via SMS, email o telefono.', 'Non toccare link in messaggi inattesi: apri tu l\'app o il sito ufficiale.', 'Se hai inserito dati: chiama subito la banca (numero sul retro della carta) e blocca la carta.',
        'Cambia le password e attiva la verifica in due passaggi.', 'Segnala alla Polizia Postale (commissariatodips.it).'],
        `<button class="btn ghost" data-a="x-url" data-u="https://www.commissariatodips.it/">Commissariato online</button>`); return true;
      case 'x3-g-tracker': guide('Un tracker nascosto (AirTag e simili)', 'Se temi che qualcuno sappia sempre dove sei.', [
        '<b>iPhone</b> avvisa da solo «AirTag trovato con te»: tocca l\'avviso per farlo suonare e vedere da quanto ti segue.', '<b>Android</b>: Impostazioni › Sicurezza ed emergenza › <b>Avvisi tracker sconosciuti</b> › Scansione manuale.',
        'Cerca in borsa, giacca, auto (sotto i sedili, nel bagagliaio, nei paraurti).', 'Se lo trovi <b>non buttarlo</b>: è una prova. Fotografalo, annota nel Diario e portalo ai Carabinieri o alla Polizia.',
        'Se sei in pericolo, non andare a casa: vai in un posto sicuro e chiama il 112.'], tools([['diary', 'Diario'], ['spy', 'Il telefono ti spia?']])); return true;
      case 'x3-g-work': guide('Molestie sul lavoro', '', [
        'Non è colpa tua e non devi sopportarle.', 'Annota ogni episodio nel <b>Diario</b>: data, ora, parole, testimoni. Salva messaggi ed email.', 'Parlane con una persona di fiducia, con il rappresentante dei lavoratori o con l\'ufficio del personale.',
        'Puoi rivolgerti a un sindacato, alla consigliera di parità o al <b>1522</b>.', 'Se c\'è violenza o minaccia: <b>112</b> e denuncia.'],
        `${tools([['diary', 'Diario']])}<a class="btn ghost" href="tel:1522">${I('phone')}Chiama 1522</a>`); return true;
      case 'x3-g-street': guide('Molestie per strada', 'Commenti, fischi, persone che si avvicinano troppo.', [
        'Non devi rispondere: allontanati verso persone e negozi aperti.', 'Se insiste, di\' ad alta voce e con calma «Lasciami stare»: attiri l\'attenzione di chi è intorno.', 'Chiedi aiuto a qualcuno in particolare («Lei con la giacca blu, mi aiuti?»): funziona più di un appello generico.',
        'Se ti segue, entra in un locale e usa <b>Finta chiamata</b> o <b>Accompagnami</b>.', 'Se tocca o minaccia: <b>112</b>.'], tools([['fake', 'Finta chiamata'], ['walk', 'Accompagnami'], ['siren', 'Sirena']])); return true;
      case 'x3-g-abroad': guide('Viaggiare da sol' + sx() + ' all\'estero', '', [
        'Il <b>112</b> funziona in tutta l\'Unione Europea. Fuori dall\'UE salva il numero di emergenza del Paese.', 'Registra il viaggio su <b>Dove siamo nel mondo</b> (Farnesina) e controlla <b>Viaggiare sicuri</b>.',
        'Salva l\'indirizzo dell\'alloggio e dell\'ambasciata italiana; foto di passaporto e documenti nel telefono.', 'Usa il <b>Cartello</b> per comunicare in inglese, spagnolo, francese o tedesco.', 'Condividi l\'itinerario con la cerchia e usa <b>Dove dormo</b>.'],
        `<button class="btn ghost" data-a="x-url" data-u="https://www.viaggiaresicuri.it/">Viaggiare sicuri</button><button class="btn ghost" data-a="x-url" data-u="https://www.dovesiamonelmondo.it/">Dove siamo nel mondo</button>${tools([['sign', 'Cartello'], ['stay', 'Dove dormo']])}`); return true;
      case 'x3-g-hotel': guide('Hotel e B&B', '', [
        'Chiedi una camera non al piano terra e lontana dalle scale di servizio.', 'Chiudi sempre a chiave e usa il catenaccio; non aprire a chi non aspetti: chiama la reception.',
        'Non dire il numero della camera ad alta voce.', 'Guarda dove sono le uscite di emergenza.', 'Manda alla cerchia nome, indirizzo e numero della camera.'], tools([['stay', 'Dove dormo']])); return true;
      case 'x3-g-panic': guide('Attacco di panico', 'Fa paura ma passa: di solito in 10-20 minuti.', [
        'Ricordati che è panico: il corpo è in allarme, ma non sei in pericolo di vita.', 'Respira lentamente con la pancia: inspira 4 secondi, espira 6. Usa <b>Respira</b>.', 'Esercizio 5-4-3-2-1: 5 cose che vedi, 4 che tocchi, 3 che senti, 2 che annusi, 1 che gusti.',
        'Siediti, appoggia i piedi a terra, bevi acqua a piccoli sorsi.', 'Se è la prima volta, hai dolore al petto o non passa: <b>chiama il 112</b>.'], `${tools([['breathe', 'Respira']])}${c112()}`); return true;
      case 'x3-g-drunk': guide('Un\'amica o un amico ha bevuto troppo', '', [
        '<b>Non lasciarl' + 'o/a da sol' + 'o/a</b> e non farl' + 'o/a dormire a pancia in su: se vomita può soffocare. Mettil' + 'o/a in <b>posizione laterale di sicurezza</b>.',
        'Niente caffè o docce fredde: non aiutano. Tienil' + 'o/a al caldo.', '<b>Chiama il 112</b> se non risponde, respira lentamente o in modo irregolare, è pallid' + 'o/a o fredd' + 'o/a, ha convulsioni o vomita senza svegliarsi.',
        'Se pensi che abbia preso anche altre sostanze, dillo ai soccorsi: servono a curarl' + 'o/a, non a denunciarl' + 'o/a.'], `<div class="em-tools"><button class="btn ghost sm" data-a="fa" data-k="pls">Posizione laterale</button></div>${c112()}`); return true;
      case 'x3-g-poison': guide('Avvelenamento', 'Farmaci, detersivi, funghi, monossido.', [
        'Se non respira, non risponde o ha convulsioni: <b>112</b>.', 'Non farla vomitare e non darle latte o altro da bere se non lo dice un medico.', 'Tieni la confezione del prodotto o il farmaco: serve sapere cosa e quanto ha preso.',
        'Chiama un <b>Centro antiveleni</b>: rispondono 24 ore su 24.'],
        `<a class="btn ghost" href="tel:0266101029">${I('phone')}Centro antiveleni Milano · 02 6610 1029</a><a class="btn ghost" href="tel:063054343">${I('phone')}Centro antiveleni Roma · 06 305 4343</a>${c112()}`); return true;
      case 'x3-g-dog': guide('Cane aggressivo', '', [
        'Non correre e non guardarlo fisso negli occhi: stai ferm' + sx() + ', di lato, braccia lungo il corpo.', 'Allontanati lentamente all\'indietro, senza voltargli le spalle.', 'Metti tra te e lui una borsa, uno zaino o una giacca.',
        'Se ti butta a terra, rannicchiati e proteggi viso e collo con le braccia.', 'Dopo un morso: lava a lungo con acqua e sapone e vai al pronto soccorso.']); return true;
      case 'x3-g-wildfire': guide('Incendio nel bosco o vicino casa', '', [
        'Chiama il <b>112</b> (o il 115) e di\' dove vedi il fumo.', 'Allontanati in direzione opposta al vento, mai verso l\'alto o nei canaloni: il fuoco sale.', 'Non fermarti a guardare e non intralciare le strade dei mezzi di soccorso.',
        'In auto: finestrini chiusi, aria di ricircolo; se il fuoco ti circonda resta in auto, in uno spazio senza vegetazione.', 'Se sei in casa e non puoi uscire: chiudi porte e finestre, bagna tende e stracci, stai nelle stanze lontane dal fuoco.'], c112()); return true;
      case 'x3-g-snow': guide('Neve e ghiaccio in auto', '', [
        'Prima di partire: catene o gomme invernali, serbatoio pieno, coperta e acqua.', 'Se resti bloccat' + sx() + ': resta in auto, accendi le quattro frecce.', 'Accendi il motore solo 10 minuti ogni ora e tieni <b>libero il tubo di scarico</b>: il monossido uccide.',
        'Muovi braccia e gambe per stare al caldo, apri appena un finestrino.', 'Chiama il <b>112</b> o il soccorso stradale e di\' il chilometro (usa <b>Dove sono</b>).'], tools([['where', 'Dove sono']])); return true;
      case 'x3-g-bike': guide('Caduta in bici o monopattino', '', [
        'Mettiti in sicurezza fuori dalla strada se puoi muoverti.', 'Se hai battuto la testa, anche con il casco, controlla i segnali di <b>Colpo alla testa</b>.', 'Non togliere il casco a chi è a terra e non risponde.',
        'Fotografa il luogo, i mezzi e le ferite (<b>Foto con data</b>); prendi i dati dei testimoni.', 'Se c\'è un\'auto coinvolta chiama il 112 e non spostare i mezzi.'], tools([['g-head', 'Colpo alla testa'], ['photo', 'Foto con data'], ['witness', 'Testimoni']])); return true;
      case 'x3-g-report': guide('Come si fa una denuncia', '', [
        'Vai da Carabinieri o Polizia (qualsiasi caserma o commissariato): è gratuita e puoi farti accompagnare.', 'Porta un documento e tutto quello che hai: Diario, foto, messaggi, referti medici, nomi dei testimoni.',
        'Racconta i fatti in ordine: cosa, quando, dove, chi. Chiedi una <b>copia</b> della denuncia.', 'Per violenza domestica e stalking esiste una procedura veloce («Codice rosso»): il 1522 e i centri antiviolenza ti accompagnano.',
        'Per i reati online puoi partire dal commissariato online della Polizia Postale.'],
        `${tools([['diary', 'Diario'], ['diary-export', 'Esporta il diario']])}<a class="btn ghost" href="tel:1522">${I('phone')}Chiama 1522</a>`); return true;
      case 'x3-g-avalanche': guide('Valanga', '', [
        'Prima di andare fuori pista: bollettino valanghe, ARTVA, pala e sonda, mai da sol' + sx() + '.', 'Se vieni travolt' + sx() + ': cerca di uscire lateralmente, liberati dei bastoncini, «nuota» per restare in superficie.',
        'Quando rallenta, metti un braccio davanti alla bocca per creare uno spazio d\'aria e spingi l\'altro verso l\'alto.', 'Se vedi qualcuno travolto: guarda il punto in cui sparisce, chiama il <b>112</b> e inizia subito la ricerca.'], c112()); return true;
      case 'x3-g-kids': guide('Insegnare ai bambini il 112', '', [
        'Spiega che il 112 si chiama solo in emergenza: qualcuno sta male, c\'è un incendio, un pericolo.', 'Fai imparare a memoria il proprio nome, cognome, indirizzo e il numero di un genitore.',
        'Prova insieme cosa dire: «Mi chiamo…, sono a…, la mamma non si sveglia».', 'Spiega che se si perde deve chiedere a un negoziante, a una mamma con bambini o a un poliziotto.', 'Mettete nello zaino una <b>Tessera portafoglio</b> con i numeri utili.'], tools([['icecard', 'Tessera portafoglio']])); return true;
      case 'x3-g-elderly': guide('Truffe agli anziani', 'Finto tecnico, finto carabiniere, finto nipote.', [
        'Nessun ente manda persone a casa a controllare soldi o gioielli o a chiedere pagamenti.', 'Non aprire a chi non aspetti: chiedi il nome e chiama tu l\'ente al numero ufficiale.', 'Se al telefono un «parente» o un «avvocato» chiede soldi urgenti, <b>riattacca</b> e chiama il parente al suo numero.',
        'Nel dubbio chiama il <b>112</b>: i Carabinieri preferiscono un controllo in più.', 'Condividi queste regole con nonni e genitori.'], `<button class="btn ghost" data-a="x3-share-elderly">${I('share')}Manda queste regole</button>${c112()}`); return true;
      case 'x3-share-elderly': await native.share({ title: 'Truffe agli anziani', text: 'Regole contro le truffe:\n1. Nessun ente viene a casa a controllare soldi o gioielli.\n2. Non aprire a chi non aspetti: chiama tu l\'ente al numero ufficiale.\n3. Se al telefono un parente o un avvocato chiede soldi urgenti, riattacca e richiama il parente.\n4. Nel dubbio chiama il 112.' }); return true;
      case 'x3-g-italert': guide('IT-alert: il messaggio sul telefono', 'Il sistema pubblico di allarme che manda avvisi a tutti i telefoni di una zona.', [
        'Arriva con un suono forte anche in silenzioso: non serve nessuna app.', 'Leggi con attenzione cosa dice e segui le indicazioni (allontanarsi, restare in casa, salire ai piani alti…).',
        'Non chiamare il 112 solo per chiedere informazioni: tieni le linee libere per le emergenze.', 'Controlla gli aggiornamenti sui canali ufficiali della Protezione civile e del tuo comune.'],
        `<button class="btn ghost" data-a="x-url" data-u="https://www.it-alert.gov.it/">Sito IT-alert</button>`); return true;
      case 'x3-g-co': guide('Monossido di carbonio', 'Gas invisibile e senza odore: stufe, caldaie, camini, bracieri, auto in garage.', [
        'Segnali: mal di testa, nausea, vertigini, sonnolenza, più persone che stanno male nella stessa stanza.', '<b>Apri subito</b> porte e finestre, spegni stufe e caldaie ed esci all\'aria aperta.', 'Chiama il <b>112</b> (o il 115): anche se ti senti meglio, serve un controllo.',
        'Prevenzione: caldaia e canna fumaria controllate, mai bracieri o generatori in casa, un rilevatore di monossido costa poco.'], c112()); return true;
      case 'x3-g-assault': guide('Dopo una violenza sessuale', 'Non è colpa tua. Non devi decidere tutto adesso.', [
        'Vai in un posto sicuro e chiama una persona di cui ti fidi. In pericolo: <b>112</b>.', 'Al <b>pronto soccorso</b> puoi ricevere cure, la profilassi e, se vuoi, la raccolta delle prove: meglio prima di lavarti o cambiarti.',
        'Puoi decidere in seguito se denunciare: il <b>1522</b> e i centri antiviolenza ti accompagnano, gratis e in modo riservato.', 'Conserva vestiti in un sacchetto di carta e annota quello che ricordi nel Diario, quando te la senti.'],
        `<a class="btn ghost" href="tel:1522">${I('phone')}Chiama 1522</a>${c112()}`); return true;
      case 'x3-g-nonconsent': guide('Foto intime diffuse senza consenso', 'Diffonderle è un reato (revenge porn).', [
        'Non sei tu ad aver sbagliato. Salva le prove: screenshot con profilo, data e link.', 'Segnala i contenuti alla piattaforma e chiedi la rimozione.',
        'Puoi chiedere al <b>Garante della privacy</b> di bloccare la diffusione, anche prima che succeda, se temi che qualcuno le pubblichi.', 'Denuncia alla Polizia Postale. Il 1522 ti aiuta anche in questo.'],
        `<button class="btn ghost" data-a="x-url" data-u="https://www.garanteprivacy.it/temi/revengeporn">Garante privacy</button><button class="btn ghost" data-a="x-url" data-u="https://www.commissariatodips.it/">Polizia Postale</button>`); return true;
      case 'x3-g-friendrisk': guide('Un amico parla di farsi del male', '', [
        'Prendilo sul serio e ascolta senza giudicare. Chiedere apertamente se pensa di farsi del male non gli mette in testa l\'idea.', 'Non lasciarlo solo se il pericolo è immediato e allontana mezzi pericolosi se puoi farlo senza rischi.',
        'Aiutalo a contattare il medico, un professionista o <b>Telefono Amico</b> (02 2327 2327).', 'Se c\'è un pericolo adesso: <b>112</b>.', 'Anche tu hai bisogno di supporto: parlane con qualcuno di cui ti fidi.'],
        `<a class="btn ghost" href="tel:0223272327">${I('phone')}Telefono Amico</a>${c112()}`); return true;
      case 'x3-g-lostwood': guide('Ti sei pers' + sx() + ' in un bosco', '', [
        '<b>Fermati</b>: camminare a caso ti allontana. Bevi, mangia qualcosa, respira.', 'Chiama il <b>112</b> se hai campo; se non c\'è, prova da un punto più alto o aperto. Manda la posizione alla cerchia appena puoi.',
        'Resta in un posto visibile, metti qualcosa di colorato in vista, usa il fischietto (3 fischi) o la luce.', 'Risparmia batteria: chiudi le app, luminosità al minimo.', 'Se si fa buio, non muoverti: riparati dal vento e dall\'umidità.'],
        `${tools([['x3-alt', 'Posizione per i soccorsi'], ['whistle', 'Fischietto'], ['x3-morse', 'Morse luminoso']])}${c112()}`); return true;
      case 'x3-g-garage': guide('Parcheggi e garage di notte', '', [
        'Parcheggia vicino a ingressi, luci e telecamere; ricorda il piano e la fila (<b>Ritrova il punto</b>).', 'Prepara le chiavi prima di arrivare all\'auto e guarda intorno e dentro prima di salire.',
        'Appena sei dentro <b>chiudi le portiere</b> e parti.', 'Se qualcuno ti avvicina, suona il clacson a lungo o usa la <b>Sirena</b>.', 'Se puoi, fatti accompagnare o resta in videochiamata con qualcuno.'], tools([['x3-point', 'Ritrova il punto'], ['siren', 'Sirena']])); return true;
    }
    return false;
  }

  // scelta delle spunte dell'appello
  document.addEventListener('change', e => {
    const i = e.target?.dataset?.x3head; if (i == null) return;
    const l = load('heads', []); if (l[i]) { l[i].on = e.target.checked; save('heads', l); headcount(); }
  });
  setTimeout(delayedArm, 3000);   // un messaggio programmato rimasto in sospeso riparte (o parte subito se è scaduto)

  const groups = [
    ['Adesso', [
      ['x3-duress', 'lock', 'red', 'Codice anti-costrizione', 'Sembra annullato, ma avvisa'],
      ['x3-qt', 'clock', 'red', 'SOS a tempo', 'Pochi minuti a rischio'],
      ['x3-burst', 'camera', 'blue', 'Raffica di foto', '3 scatti in un attimo'],
      ['x3-fakevideo', 'camera', 'green', 'Finta videochiamata', 'Fai vedere che non sei sol' + 'a/o'],
      ['x3-red', 'spark', 'red', 'Luce rossa', 'Vedi al buio senza abbagliare'],
      ['x3-morse', 'spark', 'amber', 'Morse luminoso', 'SOS o un messaggio, da lontano'],
      ['x3-saver', 'alert', 'amber', 'Batteria critica', 'Solo SOS, 112 e posizione'],
      ['x3-lost', 'heart', 'violet', 'Se trovi questo telefono', 'Chi chiamare, a schermo intero']]],
    ['In giro', [
      ['x3-word', 'key', 'violet', 'Parola d\'ordine', 'Una parola che vuol dire «aiuto»'],
      ['x3-askok', 'chat', 'green', 'Tutto ok?', 'Chiedi alla cerchia e ricordatelo'],
      ['x3-delay', 'clock', 'amber', 'Messaggio programmato', 'Parte se non lo annulli'],
      ['x3-point', 'pin', 'blue', 'Ritrova il punto', 'Una freccia ti riporta lì'],
      ['x3-heads', 'people', 'green', 'Appello del gruppo', 'Chi c\'è, chi manca'],
      ['x3-alt', 'pin', 'green', 'Altitudine', 'Per il Soccorso Alpino'],
      ['x3-sun', 'clock', 'amber', 'Quanto manca al buio', 'Alba e tramonto qui'],
      ['x3-g-night', 'send', 'violet', 'Mezzi di notte', 'Dove aspettare, dove sedersi'],
      ['x3-g-taxi', 'send', 'amber', 'Taxi abusivo', 'Controlla prima di salire'],
      ['x3-g-garage', 'lock', 'gray', 'Parcheggi di notte', 'Arrivare all\'auto sicur' + 'a/o'],
      ['x3-g-street', 'eye', 'red', 'Molestie per strada', 'Cosa dire, a chi chiedere'],
      ['x3-g-crowd', 'people', 'blue', 'Concerti e folla', 'Uscite, ressa, punto d\'incontro'],
      ['x3-g-abroad', 'send', 'blue', 'Viaggi all\'estero', '112 in Europa, Farnesina'],
      ['x3-g-hotel', 'lock', 'violet', 'Hotel e B&B', 'Camera, porta, uscite']]],
    ['Prove', [
      ['x3-ik', 'user', 'red', 'Identikit', 'Descrivi chi è stato, subito'],
      ['x3-g-report', 'book', 'blue', 'Come si fa una denuncia', 'Cosa portare, cosa chiedere']]],
    ['Situazioni', [
      ['x3-g-weapon', 'alert', 'red', 'Persona armata', 'Scappa, nasconditi, avvisa'],
      ['x3-g-robbery', 'alert', 'amber', 'Scippo e rapina', 'Lascia andare, poi agisci'],
      ['x3-g-assault', 'heart', 'red', 'Dopo una violenza sessuale', 'Cure, prove, 1522'],
      ['x3-g-nonconsent', 'lock', 'violet', 'Foto intime diffuse', 'Garante e Polizia Postale'],
      ['x3-g-work', 'people', 'violet', 'Molestie sul lavoro', 'Prove e a chi rivolgersi'],
      ['x3-g-tracker', 'pin', 'red', 'Tracker nascosto', 'AirTag e simili: come trovarli'],
      ['x3-g-phishing', 'sms', 'amber', 'SMS e link truffa', 'Banca, corriere, pacchi'],
      ['x3-g-elderly', 'user', 'amber', 'Truffe agli anziani', 'Finto tecnico, finto nipote'],
      ['x3-g-friendrisk', 'heart', 'green', 'Un amico sta male', 'Se parla di farsi del male'],
      ['x3-g-drunk', 'alert', 'violet', 'Ha bevuto troppo', 'Quando chiamare il 112'],
      ['x3-g-kids', 'user', 'blue', 'Bambini e 112', 'Cosa insegnare'],
      ['x3-g-dog', 'alert', 'gray', 'Cane aggressivo', 'Cosa fare e non fare']]],
    ['Salute e guide', [
      ['x3-g-panic', 'heart', 'violet', 'Attacco di panico', 'Respiro e 5-4-3-2-1'],
      ['x3-g-poison', 'alert', 'red', 'Avvelenamento', 'Centri antiveleni'],
      ['x3-g-co', 'alert', 'amber', 'Monossido di carbonio', 'Il gas invisibile'],
      ['x3-g-sea', 'live', 'blue', 'Mare e correnti', 'Risacca: nuota parallela/o'],
      ['x3-g-mountain', 'pin', 'green', 'Montagna', 'Prima, durante, se ti perdi'],
      ['x3-g-lostwood', 'pin', 'green', 'Persa/o nel bosco', 'Fermati e fatti trovare'],
      ['x3-g-avalanche', 'alert', 'blue', 'Valanga', 'Se vieni travolta/o'],
      ['x3-g-storm', 'spark', 'amber', 'Temporale e fulmini', 'Dove ripararsi'],
      ['x3-g-wildfire', 'spark', 'red', 'Incendio nel bosco', 'Mai verso l\'alto'],
      ['x3-g-snow', 'live', 'blue', 'Bloccata/o nella neve', 'Il tubo di scarico libero'],
      ['x3-g-bike', 'user', 'gray', 'Caduta in bici', 'Bici e monopattino'],
      ['x3-g-blackout', 'spark', 'gray', 'Black-out', 'Luce, frigo, batteria'],
      ['x3-g-lift', 'lock', 'gray', 'Ascensore bloccato', 'Niente panico, ecco cosa fare'],
      ['x3-g-italert', 'bell', 'red', 'IT-alert', 'Il messaggio di allarme pubblico']]]
  ];
  return { handle, groups };
}
