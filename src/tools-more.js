// Ancora più strumenti di Vicina (oltre 30): cose concrete da fare subito.
// Usa gli aiuti di tools.js (sovrapposizioni, suoni, timer) e di tools-extra.js (mappe, link alle app).
export function createMore(ctx, base, extra) {
  const { $, I, esc, toast, openSheet, closeSheet, native, ls, mapsLink, hhmm, uid, profile } = ctx;
  const { showOv, closeOv, keepAwake, buzz, startWalk, sx, med } = base.h;
  const ov = base.h.ov;
  const { dirUrl, searchUrl, open, store, km, dist, sendBar, outbox, geocode } = extra.nav;
  const P = native.platform || 'web';
  const pos = async () => { const p = await native.getPos().catch(() => null); if (!p) toast('Posizione non disponibile: controlla il GPS'); return p; };
  const steps = l => `<ol class="steps-list">${l.map(x => `<li>${x}</li>`).join('')}</ol>`;
  const guide = (title, sub, list, extraHtml = '') => openSheet(`<h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${steps(list)}${extraHtml}`, 'more-guide');
  const save = (k, v) => ls.set(k + ':' + uid(), JSON.stringify(v));
  const load = (k, d) => { try { return JSON.parse(ls.get(k + ':' + uid()) || 'null') ?? d; } catch { return d; } };
  const send = (t, o) => ctx.quickSend(t, o);

  /* ---------- strobo (schermo + flash) ---------- */
  let strobeT = null;
  function strobe() {
    closeSheet(); let on = false;
    showOv('strobe', `<button class="btn ghost sm strobe-stop" data-a="tool-close">${I('x')}Ferma</button>`, () => { clearInterval(strobeT); native.vx.torch(false).catch(() => {}); keepAwake(false); });
    keepAwake(true);
    strobeT = setInterval(() => { on = !on; ov.classList.toggle('flash-on', on); native.vx.torch(on).catch(() => {}); }, 90);
  }

  /* ---------- voce d'allarme ---------- */
  let yellT = null;
  function yell() {
    closeSheet();
    const L = ['Aiuto! Chiamate il centododici!', 'Allontanati da me! Sto chiamando la polizia!', 'Aiuto! Questa persona mi sta dando fastidio!'];
    let i = 0;
    const say = () => { native.vx.speak(L[i % L.length], 'it-IT'); i++; };
    showOv('yell', `<div class="sr-in"><b>${I('mic')}AIUTO</b><span>Il telefono grida per te. Alza il volume al massimo.</span></div>
      <div class="cd-foot"><a class="btn white" href="tel:112">${I('phone')}Chiama 112</a><button class="btn ghost" data-a="tool-close">${I('x')}Ferma</button></div>`, () => { clearInterval(yellT); native.vx.stopSpeaking(); keepAwake(false); });
    keepAwake(true); say(); yellT = setInterval(say, 3500); buzz([400, 200, 400]);
  }

  /* ---------- fotocamera dal vivo: guarda dietro / zoom ---------- */
  let camStream = null;
  async function camera(mode) {
    closeSheet();
    try { camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode === 'mirror' ? 'user' : 'environment', width: { ideal: 1920 } }, audio: false }); }
    catch { return toast('Fotocamera non disponibile: controlla i permessi'); }
    const zoom = mode === 'zoom';
    showOv('cam ' + mode, `<video id="cam-v" autoplay playsinline muted></video>
      <div class="cam-ui"><p class="cam-t">${zoom ? 'Zoom: leggi una targa o un dettaglio da lontano' : 'Specchietto: guarda chi hai dietro senza voltarti'}</p>
      ${zoom ? `<input type="range" id="cam-z" min="1" max="6" step="0.1" value="2" aria-label="Zoom">` : ''}
      <div class="row2"><button class="btn white sm" data-a="cam-shot">${I('camera')}Scatta</button><button class="btn ghost sm" data-a="tool-close">${I('x')}Chiudi</button></div></div>`,
      () => { camStream?.getTracks().forEach(t => t.stop()); camStream = null; keepAwake(false); });
    keepAwake(true);
    const v = $('#cam-v'); v.srcObject = camStream; v.play().catch(() => {});
    if (mode === 'mirror') v.style.transform = 'scaleX(-1)';
    const z = $('#cam-z');
    const tr = camStream.getVideoTracks()[0], caps = tr.getCapabilities?.() || {};
    const applyZ = () => {
      const val = Number(z.value);
      if (caps.zoom) tr.applyConstraints({ advanced: [{ zoom: Math.min(caps.zoom.max, Math.max(caps.zoom.min, val)) }] }).catch(() => {});
      else v.style.transform = `scale(${val})`;
    };
    if (z) { z.oninput = applyZ; applyZ(); }
  }
  function camShot() {
    const v = $('#cam-v'); if (!v?.videoWidth) return;
    const c = document.createElement('canvas'), z = Number($('#cam-z')?.value || 1), caps = camStream?.getVideoTracks()[0]?.getCapabilities?.() || {};
    const k = caps.zoom ? 1 : z, w = v.videoWidth / k, h = v.videoHeight / k;
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(v, (v.videoWidth - w) / 2, (v.videoHeight - h) / 2, w, h, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', 0.88);
    native.shareImages([url], 'Foto Vicina del ' + new Date().toLocaleString('it-IT')).then(ok => ok || toast('Condivisione non disponibile'));
  }

  /* ---------- codice rosso: avviso discreto ---------- */
  async function redCode() {
    const p = await native.getPos().catch(() => null);
    const n = await send(`🔴 CODICE ROSSO: chiamami subito, non posso parlare liberamente.${p ? '\nSono qui: ' + mapsLink(p) : ''}`, { sms: true });
    toast(n ? 'Codice rosso inviato alla cerchia' : 'Nessuno a cui inviarlo');
  }

  /* ---------- respira (ansia, panico) ---------- */
  let brT = null;
  function breathe() {
    closeSheet();
    const PH = [['Inspira', 4000, 'in'], ['Trattieni', 4000, 'hold'], ['Espira', 6000, 'out']];
    let i = 0, rounds = 0;
    showOv('breathe', `<div class="br-in"><div class="br-c" id="br-c"></div><b id="br-t">Inspira</b><span id="br-s">Segui il cerchio · 1 minuto basta già</span></div>
      <div class="cd-foot"><button class="btn ghost" data-a="tool-close">${I('x')}Ho finito</button></div>`, () => { clearTimeout(brT); keepAwake(false); });
    keepAwake(true);
    const step = () => {
      const [t, ms, cls] = PH[i % 3]; const c = $('#br-c'); if (!c) return;
      c.className = 'br-c ' + cls; c.style.transitionDuration = ms + 'ms';
      $('#br-t').textContent = t; native.haptic('light');
      if (i % 3 === 2) { rounds++; $('#br-s').textContent = `${rounds} ${rounds === 1 ? 'respiro' : 'respiri'} · continua finché ti serve`; }
      i++; brT = setTimeout(step, ms);
    };
    setTimeout(step, 300);
  }

  /* ---------- più vicino (OpenStreetMap) ---------- */
  const NEAR = {
    er: ['Pronto soccorso più vicino', r => `nwr(around:${r},LAT,LNG)[amenity=hospital][emergency=yes];nwr(around:${r},LAT,LNG)[amenity=hospital];`, 15000, 'drive', 'pronto soccorso'],
    police: ['Carabinieri e polizia più vicini', r => `nwr(around:${r},LAT,LNG)[amenity=police];`, 10000, 'walk', 'carabinieri'],
    pharmacy: ['Farmacia più vicina', r => `nwr(around:${r},LAT,LNG)[amenity=pharmacy];`, 5000, 'walk', 'farmacia'],
    aed: ['Defibrillatore più vicino', r => `nwr(around:${r},LAT,LNG)[emergency=defibrillator];`, 3000, 'walk', 'defibrillatore'],
    transit: ['Fermate e stazioni vicine', r => `nwr(around:${Math.min(r, 800)},LAT,LNG)[highway=bus_stop];nwr(around:${r},LAT,LNG)[railway~"^(station|halt)$"];nwr(around:${r},LAT,LNG)[station=subway];`, 3000, 'walk', 'fermata autobus']
  };
  async function nearest(k) {
    closeSheet();
    const [title, q, r, mode, fb] = NEAR[k];
    openSheet(`<h2>${title}</h2><div id="nr-list"><div class="where-load">${I('pin')}Cerco intorno a te…</div></div>`, 'near');
    const p = await native.getPos().catch(() => null);
    if (!p) { $('#nr-list').innerHTML = '<p class="note">Posizione non disponibile.</p>'; return; }
    try {
      const j = await native.osm(`[out:json][timeout:25];(${q(r).replace(/LAT/g, p.lat).replace(/LNG/g, p.lng)});out center tags 80;`, { term: fb, p, r });
      const seen = new Set();
      const l = j.elements.map(e => ({ ...e.tags, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, id: e.id })).filter(e => e.lat != null && !seen.has(e.id) && seen.add(e.id))
        .map(e => ({ ...e, d: km(p, e) })).sort((a, b) => (k === 'er' ? (b.emergency === 'yes') - (a.emergency === 'yes') || a.d - b.d : a.d - b.d)).slice(0, 5);
      if (!l.length) throw new Error('vuoto');
      const nm = e => e.name || (k === 'aed' ? 'Defibrillatore (DAE)' : k === 'pharmacy' ? 'Farmacia' : k === 'police' ? 'Presidio di polizia' : k === 'transit' ? (e.highway === 'bus_stop' ? 'Fermata autobus' : 'Stazione') : 'Ospedale');
      $('#nr-list').innerHTML = `<button class="near-best" data-a="x-url" data-u="${esc(dirUrl(l[0], mode))}"><small>IL PIÙ VICINO · ${dist(l[0].d)}</small><b>${esc(nm(l[0]))}</b><span>${l[0].emergency === 'yes' ? 'Con pronto soccorso · ' : ''}${l[0].opening_hours ? esc(l[0].opening_hours.slice(0, 40)) + ' · ' : ''}Tocca per andarci</span>${I('send')}</button>
        ${l.length > 1 ? `<div class="card">${l.slice(1).map(e => `<button class="row" data-a="x-url" data-u="${esc(dirUrl(e, mode))}"><div class="fl"><b>${esc(nm(e))}</b><span>${dist(e.d)}${e.route_ref ? ' · linee ' + esc(e.route_ref) : ''}</span></div>${I('chev', 'chev')}</button>`).join('')}</div>` : ''}
        ${k === 'aed' ? '<p class="note">Mentre qualcuno va a prendere il DAE, inizia il massaggio cardiaco: Strumenti → Primo soccorso → RCP.</p>' : ''}
        <p class="note">Dati di OpenStreetMap: possono non essere completi.</p>`;
    } catch {
      $('#nr-list').innerHTML = `<p class="note">Non trovo risultati qui (o manca internet). Cerca nelle Mappe:</p><button class="btn" data-a="x-url" data-u="${esc(searchUrl(fb, p))}">${I('pin')}Cerca «${fb}»</button>`;
    }
  }

  /* ---------- auto parcheggiata ---------- */
  function sheetCar() {
    const c = load('parked', null);
    openSheet(`<h2>Dov'è la mia auto</h2><p class="sub">${c ? `Salvata ${new Date(c.at).toLocaleString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}${c.note ? ' · ' + esc(c.note) : ''}` : 'Salva il punto dove hai parcheggiato: al ritorno ti ci porto, anche al buio in un parcheggio enorme.'}</p>
      ${c ? `<button class="btn red" data-a="x-url" data-u="${esc(dirUrl(c, 'walk'))}">${I('send')}Portami all'auto</button>` : ''}
      <label class="field"><span>Nota (piano, colonna, colore…)</span><input id="pk-note" maxlength="60" placeholder="Piano -2, colonna B7"></label>
      <button class="btn ${c ? 'ghost' : ''}" data-a="park-save">${I('pin')}${c ? 'Salva di nuovo qui' : 'Ho parcheggiato qui'}</button>`, 'park');
  }

  /* ---------- salgo su un mezzo pubblico ---------- */
  function sheetRide() {
    openSheet(`<h2>Salgo su un mezzo</h2><p class="sub">Autobus, tram, metro o treno: la cerchia sa che linea prendi.</p>
      <div class="choice wrap" id="rd-kind">${['Autobus', 'Tram', 'Metro', 'Treno'].map((k, i) => `<button data-c="${k}" class="${i ? '' : 'on'}">${k}</button>`).join('')}</div>
      <div class="field2"><label class="field"><span>Linea / numero</span><input id="rd-line" maxlength="20" placeholder="90, R2, 9541"></label>
      <label class="field"><span>Direzione</span><input id="rd-dir" maxlength="40" placeholder="Stazione Centrale"></label></div>
      <div class="field"><span>Quanto dura</span><div class="choice wrap" id="rd-min">${[10, 20, 30, 45, 60, 90].map(m => `<button data-m="${m}" class="${m === 20 ? 'on' : ''}">${m} min</button>`).join('')}</div></div>
      <button class="btn red" data-a="ride-go">${I('send')}Avvisa e accompagnami</button>`, 'ride');
  }

  /* ---------- corsa / camminata ---------- */
  function sheetRun() {
    openSheet(`<h2>Vado a correre</h2><p class="sub">Corsa, camminata o bici da sol${sx()}: se non torni in tempo ti chiedo se va tutto bene.</p>
      <label class="field"><span>Dove (facoltativo)</span><input id="rn-where" maxlength="50" placeholder="Parco, lungofiume…"></label>
      <div class="field"><span>Quanto</span><div class="choice wrap" id="rn-min">${[20, 30, 45, 60, 90, 120].map(m => `<button data-m="${m}" class="${m === 45 ? 'on' : ''}">${m < 60 ? m + ' min' : m / 60 + ' h'}</button>`).join('')}</div></div>
      <label class="row toggle-row"><i class="ic-dot green">${I('send')}</i><div class="fl wrap"><b>Avvisa la cerchia</b><span>Quando parti e dove vai</span></div><input type="checkbox" class="switch" id="rn-tell" checked></label>
      <button class="btn red" data-a="run-go">${I('shield')}Parto</button>`, 'run');
  }

  /* ---------- dove dormo ---------- */
  function sheetStay() {
    const s = load('stay', {});
    openSheet(`<h2>Dove dormo</h2><p class="sub">In viaggio, in hotel o da qualcuno: la cerchia sa dove trovarti.</p>
      <label class="field"><span>Posto</span><input id="st-name" maxlength="60" placeholder="Hotel Roma / da Marco" value="${esc(s.name || '')}"></label>
      <label class="field"><span>Indirizzo</span><input id="st-addr" maxlength="100" placeholder="Via…, città" value="${esc(s.addr || '')}"></label>
      <div class="field2"><label class="field"><span>Stanza</span><input id="st-room" maxlength="10" value="${esc(s.room || '')}"></label><label class="field"><span>Fino al</span><input id="st-until" type="date" value="${esc(s.until || '')}"></label></div>
      <button class="btn" data-a="stay-here">${I('pin')}Usa la mia posizione come indirizzo</button>
      <button class="btn red" data-a="stay-go">${I('send')}Manda alla cerchia</button>`, 'stay');
  }

  /* ---------- il mio percorso ---------- */
  function sheetRoute() {
    openSheet(`<h2>Il mio percorso</h2><p class="sub">Dici dove vai: la cerchia riceve il link con il percorso e tu parti con le Mappe.</p>
      <label class="field"><span>Destinazione</span><input id="rt-to" maxlength="120" placeholder="Via Roma 10, Milano"></label>
      <div class="choice wrap" id="rt-mode">${[['walk', 'A piedi'], ['transit', 'Mezzi'], ['drive', 'Auto']].map(([k, t], i) => `<button data-m="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>
      <button class="btn red" data-a="route-go">${I('send')}Invia e parti</button>`, 'route');
  }

  /* ---------- luoghi preferiti ---------- */
  const PLACES_DEF = [['Casa', 'home'], ['Lavoro', 'work'], ['Scuola / università', 'school'], ['Palestra', 'gym'], ['Genitori', 'family']];
  function sheetPlaces() {
    const pl = load('places', {});
    openSheet(`<h2>Luoghi preferiti</h2><p class="sub">Un tocco per andarci, un tocco per dire che sei arrivat${sx()}.</p>
      <div class="card">${PLACES_DEF.map(([t, k]) => { const p = pl[k]; return `<div class="row place-row"><i class="ic-dot ${p ? 'green' : 'gray'}">${I('pin')}</i><div class="fl"><b>${t}</b><span>${p ? esc(p.label || 'Salvato') : 'Non salvato'}</span></div>
        ${p ? `<div class="safe-acts"><button class="btn red sm" data-a="x-url" data-u="${esc(dirUrl(p, 'walk'))}">Vai</button><button class="btn ghost sm" data-a="place-arrived" data-k="${k}" data-t="${t}">Arrivat${sx()}</button></div>` : `<button class="btn ghost sm" data-a="place-set" data-k="${k}">Salva qui</button>`}</div>`; }).join('')}</div>
      <p class="note">«Salva qui» usa il punto in cui ti trovi adesso. Per cambiarlo, tienilo premuto.</p>`, 'places');
  }

  /* ---------- check-in ---------- */
  async function checkin() {
    closeSheet(); const p = await pos(); if (!p) return;
    let where = '';
    try { const c = new AbortController(); setTimeout(() => c.abort(), 5000); const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=18&accept-language=it`, { signal: c.signal })).json(); const a = j.address || {}; where = j.name || [[a.road, a.house_number].filter(Boolean).join(' '), a.village || a.town || a.city].filter(Boolean).join(', '); } catch {}
    const n = await send(`📍 Check-in: sono ${where ? 'a ' + where : 'qui'} (${hhmm(Date.now())}). Tutto ok.\n${mapsLink(p)}`);
    toast(n ? 'Check-in inviato alla cerchia' : 'Nessuna chat a cui inviarlo');
  }

  /* ---------- sfondo di emergenza e tessera ---------- */
  function iceData() {
    const p = profile() || {}, m = med() || {}, cs = ctx.smsList().slice(0, 3);
    let age = ''; if (p.dob) { const d = new Date(p.dob), n = new Date(); age = n.getFullYear() - d.getFullYear() - (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0); }
    return { name: `${p.name || ''} ${p.surname || ''}`.trim(), age, m, cs, phone: p.phone };
  }
  function wrap(g, text, x, y, maxW, lh) {
    const words = String(text).split(' '); let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t; }
    if (line) { g.fillText(line, x, y); y += lh; }
    return y;
  }
  function lockscreen() {
    const d = iceData();
    const W = 1170, H = Math.round(W * Math.max(1.9, (screen.height / screen.width) || 2.16));
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0B0B10'); gr.addColorStop(1, '#1A0A0E'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const top = Math.round(H * 0.42), pad = 80;
    g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.roundRect ? g.roundRect(pad - 30, top - 40, W - 2 * (pad - 30), H - top - 220, 56) : g.rect(pad - 30, top - 40, W - 2 * (pad - 30), H - top - 220); g.fill();
    g.fillStyle = '#FF4D5E'; g.font = '800 40px -apple-system, Roboto, sans-serif'; g.fillText('IN CASO DI EMERGENZA', pad, top + 30);
    g.fillStyle = '#fff'; g.font = '800 72px -apple-system, Roboto, sans-serif'; let y = wrap(g, d.name || 'Il tuo nome', pad, top + 120, W - 2 * pad, 80);
    g.font = '500 40px -apple-system, Roboto, sans-serif'; g.fillStyle = '#C9C9D1';
    if (d.age !== '' && !isNaN(d.age)) { g.fillText(`${d.age} anni`, pad, y); y += 60; }
    const rows = [['Gruppo sanguigno', d.m.blood && d.m.blood !== 'Non so' ? d.m.blood : ''], ['Allergie', d.m.allergies], ['Farmaci', d.m.meds], ['Patologie', d.m.conditions]].filter(r => r[1]);
    for (const [k, v] of rows) { y += 20; g.fillStyle = '#9E9EA8'; g.font = '600 32px -apple-system, Roboto, sans-serif'; g.fillText(k.toUpperCase(), pad, y); y += 50; g.fillStyle = '#fff'; g.font = '700 46px -apple-system, Roboto, sans-serif'; y = wrap(g, v, pad, y, W - 2 * pad, 56); }
    if (d.cs.length) { y += 30; g.fillStyle = '#9E9EA8'; g.font = '600 32px -apple-system, Roboto, sans-serif'; g.fillText('CHIAMA', pad, y); y += 54; g.fillStyle = '#fff'; g.font = '700 44px -apple-system, Roboto, sans-serif'; for (const x of d.cs) { g.fillText(`${x.name} · ${x.phone}`, pad, y); y += 60; } }
    g.fillStyle = '#9E9EA8'; g.font = '500 30px -apple-system, Roboto, sans-serif'; g.fillText('Emergenza: 112', pad, H - 260);
    return c.toDataURL('image/png');
  }
  function iceCard() {
    const d = iceData(), W = 1011, H = 638, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#E8192C'; g.fillRect(0, 0, W, 110);
    g.fillStyle = '#fff'; g.font = '800 46px Arial, sans-serif'; g.fillText('IN CASO DI EMERGENZA', 40, 72);
    g.fillStyle = '#111'; g.font = '800 52px Arial, sans-serif'; g.fillText(d.name || 'Nome Cognome', 40, 180);
    g.font = '600 30px Arial, sans-serif'; g.fillStyle = '#333'; let y = 236;
    const lines = [d.m.blood && d.m.blood !== 'Non so' ? 'Gruppo: ' + d.m.blood : '', d.m.allergies ? 'Allergie: ' + d.m.allergies : '', d.m.meds ? 'Farmaci: ' + d.m.meds : '', d.m.conditions ? 'Patologie: ' + d.m.conditions : ''].filter(Boolean);
    for (const l of lines.slice(0, 4)) y = wrap(g, l, 40, y, W - 80, 40);
    y = Math.max(y + 10, 420); g.fillStyle = '#E8192C'; g.font = '800 26px Arial, sans-serif'; g.fillText('CHIAMA', 40, y); y += 40; g.fillStyle = '#111'; g.font = '700 32px Arial, sans-serif';
    for (const x of d.cs.slice(0, 3)) { g.fillText(`${x.name}  ${x.phone}`, 40, y); y += 42; }
    g.strokeStyle = '#ddd'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
    return c.toDataURL('image/png');
  }

  /* ---------- kit di emergenza ---------- */
  const KIT = ['Acqua (almeno 2 litri a persona)', 'Torcia e pile di ricambio', 'Power bank carico', 'Farmaci che prendi + ricetta', 'Copia dei documenti', 'Un po\' di contanti', 'Fischietto', 'Coperta termica', 'Kit di primo soccorso', 'Caricabatterie e cavo', 'Radio a pile', 'Cibo a lunga conservazione', 'Mascherine e guanti', 'Coltellino multiuso', 'Elenco dei numeri utili su carta'];
  function sheetKit() {
    const k = load('kit', []);
    openSheet(`<h2>Kit di emergenza</h2><p class="sub">Uno zaino pronto per terremoti, alluvioni o blackout. ${k.length} su ${KIT.length} pronti.</p>
      <div class="kit-bar"><i style="width:${Math.round(k.length / KIT.length * 100)}%"></i></div>
      <div class="card">${KIT.map((t, i) => `<label class="row kit-row"><input type="checkbox" class="kit-ck" data-i="${i}" ${k.includes(i) ? 'checked' : ''}><span class="fl"><b>${t}</b></span></label>`).join('')}</div>`, 'kit');
    document.querySelectorAll('.kit-ck').forEach(c => c.onchange = () => { const l = load('kit', []).filter(x => x !== Number(c.dataset.i)); if (c.checked) l.push(Number(c.dataset.i)); save('kit', l); const b = document.querySelector('.kit-bar i'); if (b) b.style.width = Math.round(l.length / KIT.length * 100) + '%'; });
  }

  /* ---------- piano di famiglia ---------- */
  function sheetFamily() {
    const f = load('family', {});
    const F = [['near', 'Punto d\'incontro vicino a casa', 'Es. davanti alla farmacia all\'angolo'], ['far', 'Punto d\'incontro fuori quartiere', 'Es. parcheggio della chiesa di San Marco'], ['out', 'Contatto fuori città', 'Es. zia Anna 333 1234567'], ['school', 'Chi va a prendere i bambini', 'Es. nonna, poi papà'], ['pets', 'Animali e altro', 'Es. trasportino in cantina']];
    openSheet(`<h2>Piano di famiglia</h2><p class="sub">Da decidere prima, insieme: in un'emergenza grande i telefoni spesso non funzionano.</p>
      ${F.map(([k, t, ph]) => `<label class="field"><span>${t}</span><input id="fm-${k}" maxlength="100" placeholder="${ph}" value="${esc(f[k] || '')}"></label>`).join('')}
      <button class="btn" data-a="family-save">Salva</button><button class="btn ghost" data-a="family-share">${I('send')}Manda alla cerchia</button>`, 'family');
  }

  /* ---------- coordinate per i soccorsi ---------- */
  const dms = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d - m / 60) * 3600).toFixed(1); return `${d}° ${m}' ${s}" ${v >= 0 ? pos : neg}`; };
  async function sheetCoords() {
    closeSheet(); const p = await pos(); if (!p) return;
    const txt = `Lat ${p.lat.toFixed(5)}, Lon ${p.lng.toFixed(5)}`;
    openSheet(`<h2>Coordinate per i soccorsi</h2><p class="sub">In montagna, in mare o in campagna: da leggere al 112 così come sono.</p>
      <div class="coord-box"><small>Gradi decimali</small><b>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</b></div>
      <div class="coord-box"><small>Gradi, primi, secondi</small><b>${dms(p.lat, 'N', 'S')}<br>${dms(p.lng, 'E', 'O')}</b></div>
      <div class="where-ll"><div><small>Precisione</small><b>±${Math.max(5, Math.round(p.acc || 0))} m</b></div><div><small>Altitudine</small><b>${p.alt != null ? Math.round(p.alt) + ' m' : '—'}</b></div></div>
      <div class="row2"><button class="btn ghost sm" data-a="x-copy" data-t="${esc(txt)}">${I('copy')}Copia</button><button class="btn ghost sm" data-a="coords-say" data-t="${esc(txt)}">${I('mic')}Leggi ad alta voce</button></div>
      <a class="btn red" href="tel:112">${I('phone')}Chiama il 112</a>
      <button class="btn ghost" data-a="x-url" data-u="${esc(store('GeoResQ'))}">GeoResQ · app del Soccorso Alpino</button>`, 'coords');
  }

  /* ---------- prova l'SOS ---------- */
  function simulate() { closeSheet(); ctx.simulate(); }

  /* ---------- azioni ---------- */
  async function handle(a, t) {
    switch (a) {
      case 'strobe': strobe(); return true;
      case 'yell': yell(); return true;
      case 'watch5': closeSheet(); openSheet(`<h2>Tienimi d'occhio</h2><p class="sub">Per pochi minuti delicati: un parcheggio, un portone, un tratto buio. Se non tocchi «Sono arrivat${sx()}», ti chiedo se va tutto bene.</p>
        <div class="big-acts">${[2, 5, 10].map(m => `<button class="big-act" data-a="watch-go" data-m="${m}">${I('clock')}<b>${m} minuti</b><span>Parti subito</span></button>`).join('')}</div>`, 'watch'); return true;
      case 'watch-go': startWalk(Number(t.dataset.m), 'controllo rapido'); return true;
      case 'mirror': camera('mirror'); return true;
      case 'zoom': camera('zoom'); return true;
      case 'cam-shot': camShot(); return true;
      case 'redcode': closeSheet(); redCode(); return true;
      case 'breathe': breathe(); return true;
      case 'signal': closeSheet(); guide('Segnale d\'aiuto con la mano', 'Un gesto riconosciuto in molti paesi per chiedere aiuto senza parlare, anche in videochiamata.', [
        'Mostra il palmo della mano aperta verso chi ti guarda.', 'Piega il <b>pollice</b> dentro il palmo.', 'Chiudi le <b>altre dita</b> sopra il pollice, come a intrappolarlo.',
        'Se vedi qualcuno fare questo gesto: chiedi con discrezione se ha bisogno, e se non può parlare <b>chiama il 112</b>.'], `<div class="hand-anim"><span>✋</span><span>👈</span><span>✊</span></div>`); return true;
      case 'discreet': closeSheet(); guide('Chiedere aiuto senza farsi capire', 'Quando chi ti sta accanto non deve accorgersene.', [
        'Al bar o al ristorante: vai in bagno o al bancone e chiedi al personale di <b>chiamare il 112</b> o di farti uscire da un\'altra porta.',
        'Usa il <b>Cartello</b> di Vicina o scrivi sul telefono e mostralo a qualcuno.', 'Manda il <b>Codice rosso</b>: la cerchia capisce che deve chiamarti subito.',
        'Con l\'app <b>Where ARE U</b> puoi chiamare il 112 e anche scrivere in chat, senza parlare.', 'Fai il <b>segnale d\'aiuto con la mano</b>.'],
        `<div class="em-tools"><button class="btn ghost sm" data-a="sign">Cartello</button><button class="btn ghost sm" data-a="redcode">Codice rosso</button><button class="btn ghost sm" data-a="signal">Segnale mano</button></div>`); return true;
      case 'near-er': nearest('er'); return true;
      case 'near-police': nearest('police'); return true;
      case 'near-pharmacy': nearest('pharmacy'); return true;
      case 'near-aed': nearest('aed'); return true;
      case 'near-transit': nearest('transit'); return true;
      case 'park': closeSheet(); sheetCar(); return true;
      case 'park-save': { const p = await pos(); if (!p) return true; save('parked', { lat: p.lat, lng: p.lng, at: Date.now(), note: ($('#pk-note')?.value || '').trim() }); toast('Posizione dell\'auto salvata'); sheetCar(); return true; }
      case 'ride': closeSheet(); sheetRide(); return true;
      case 'ride-go': {
        const k = $('#rd-kind .on')?.dataset.c || 'Mezzo', line = ($('#rd-line')?.value || '').trim(), dir = ($('#rd-dir')?.value || '').trim(), min = Number($('#rd-min .on')?.dataset.m || 20);
        const p = await native.getPos().catch(() => null);
        const n = await send(`🚌 Salgo su: ${k}${line ? ' ' + line : ''}${dir ? ' direzione ' + dir : ''}. Circa ${min} minuti, ti scrivo all'arrivo.${p ? '\nParto da qui: ' + mapsLink(p) : ''}`);
        startWalk(min + 5, `${k.toLowerCase()} ${line}`.trim(), { quiet: true }); toast(n ? 'Cerchia avvisata, ti accompagno' : 'Ti accompagno'); return true;
      }
      case 'run': closeSheet(); sheetRun(); return true;
      case 'run-go': {
        const min = Number($('#rn-min .on')?.dataset.m || 45), where = ($('#rn-where')?.value || '').trim();
        if ($('#rn-tell')?.checked) { const p = await native.getPos().catch(() => null); send(`🏃 Esco a correre${where ? ' (' + where + ')' : ''}, torno verso le ${hhmm(Date.now() + min * 60000)}.${p ? '\nParto da qui: ' + mapsLink(p) : ''}`); }
        startWalk(min, where || 'corsa'); return true;
      }
      case 'stay': closeSheet(); sheetStay(); return true;
      case 'stay-here': { const p = await pos(); const i = $('#st-addr'); if (p && i) i.value = mapsLink(p); return true; }
      case 'stay-go': {
        const s = { name: $('#st-name').value.trim(), addr: $('#st-addr').value.trim(), room: $('#st-room').value.trim(), until: $('#st-until').value };
        if (!s.name && !s.addr) return toast('Scrivi almeno il posto o l\'indirizzo'), true;
        save('stay', s);
        const n = await send(`🏨 Dormo qui: ${[s.name, s.addr].filter(Boolean).join(', ')}${s.room ? ', stanza ' + s.room : ''}${s.until ? ', fino al ' + new Date(s.until).toLocaleDateString('it-IT') : ''}.`);
        closeSheet(); toast(n ? 'Inviato alla cerchia' : 'Salvato'); return true;
      }
      case 'route': closeSheet(); sheetRoute(); return true;
      case 'route-go': {
        const q = ($('#rt-to')?.value || '').trim(); if (!q) return toast('Scrivi la destinazione'), true;
        const m = $('#rt-mode .on')?.dataset.m || 'walk';
        let to; try { to = await geocode(q); } catch { return toast('Destinazione non trovata: aggiungi la città'), true; }
        const link = `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=${{ walk: 'walking', transit: 'transit', drive: 'driving' }[m]}`;
        const n = await send(`🧭 Sto andando a ${q}. Il mio percorso: ${link}`);
        closeSheet(); toast(n ? 'Percorso inviato alla cerchia' : 'Parti pure'); open(dirUrl(to, m)); return true;
      }
      case 'places': closeSheet(); sheetPlaces(); return true;
      case 'place-set': { const p = await pos(); if (!p) return true; const pl = load('places', {}); pl[t.dataset.k] = { lat: p.lat, lng: p.lng, label: 'Salvato ' + new Date().toLocaleDateString('it-IT') }; save('places', pl); toast('Luogo salvato'); sheetPlaces(); return true; }
      case 'place-arrived': { const n = await send(`✅ Sono arrivat${sx()}: ${t.dataset.t}.`); toast(n ? 'Avvisata la cerchia' : 'Nessuna chat'); return true; }
      case 'checkin': checkin(); return true;
      case 'redcode-send': redCode(); return true;
      case 'lockscreen': { closeSheet(); const url = lockscreen();
        openSheet(`<h2>Sfondo di emergenza</h2><p class="sub">Mettilo come sfondo della <b>schermata di blocco</b>: chi ti soccorre vede i tuoi dati anche se il telefono è bloccato.</p>
          <img class="proof-img lock-prev" src="${url}" alt="Anteprima sfondo">
          <button class="btn" data-a="img-share" data-k="lock">${I('share')}Salva l'immagine</button>
          ${steps(P === 'android' ? ['Salva l\'immagine nella Galleria.', 'Aprila → ⋮ → <b>Imposta come sfondo</b> → Schermata di blocco.'] : ['Salva l\'immagine in Foto.', 'Aprila → Condividi → <b>Usa come sfondo</b> → solo per la schermata di blocco.'])}
          <p class="note">I dati arrivano da Scheda medica e Contatti SMS: aggiornali lì e rifai lo sfondo.</p>`, 'lock');
        outbox.__img_lock = url; return true; }
      case 'icecard': { closeSheet(); const url = iceCard();
        openSheet(`<h2>Tessera da portafoglio</h2><p class="sub">Formato carta di credito: stampala e tienila nel portafoglio, accanto ai documenti.</p>
          <img class="proof-img" src="${url}" alt="Tessera di emergenza"><button class="btn" data-a="img-share" data-k="ice">${I('share')}Salva o stampa</button>`, 'ice');
        outbox.__img_ice = url; return true; }
      case 'img-share': { const u = outbox['__img_' + t.dataset.k]; if (u && !(await native.shareImages([u], 'Vicina'))) toast('Condivisione non disponibile'); return true; }
      case 'kit': closeSheet(); sheetKit(); return true;
      case 'family': closeSheet(); sheetFamily(); return true;
      case 'family-save': case 'family-share': {
        const f = {}; ['near', 'far', 'out', 'school', 'pets'].forEach(k => { f[k] = ($('#fm-' + k)?.value || '').trim(); }); save('family', f);
        if (a === 'family-share') { const n = await send(`🏠 Piano di famiglia per le emergenze:\n${f.near ? '• Punto vicino: ' + f.near + '\n' : ''}${f.far ? '• Punto lontano: ' + f.far + '\n' : ''}${f.out ? '• Contatto fuori città: ' + f.out + '\n' : ''}${f.school ? '• Bambini: ' + f.school + '\n' : ''}${f.pets ? '• Altro: ' + f.pets : ''}`); toast(n ? 'Piano inviato alla cerchia' : 'Salvato'); }
        else toast('Piano salvato'); return true;
      }
      case 'coords': sheetCoords(); return true;
      case 'coords-say': native.vx.speak(t.dataset.t.replace(/\./g, ' virgola '), 'it-IT'); return true;
      case 'simulate': simulate(); return true;
      case 'stolen': closeSheet(); guide('Telefono rubato o perso', 'Da un altro telefono o da un computer, subito.', [
        'Non inseguire il ladro: la tua sicurezza viene prima.',
        '<b>Localizza e blocca</b> il telefono: iPhone su icloud.com/find, Android su google.com/android/find. Puoi farlo suonare, bloccarlo o cancellarlo.',
        '<b>Blocca la SIM</b> chiamando il tuo operatore: TIM 119, Vodafone 190, WindTre 159, Iliad 177.',
        '<b>Blocca le carte</b> salvate sul telefono dall\'app della banca o con il numero dietro la carta.',
        'Cambia le password di email, social e banca.',
        'Fai <b>denuncia</b> a Carabinieri o Polizia: serve per la nuova SIM. Porta il codice IMEI (sulla scatola, o digita *#06# sul telefono quando lo hai).'],
        `<div class="em-tools"><button class="btn ghost sm" data-a="x-url" data-u="https://www.icloud.com/find">Dov'è (iCloud)</button><button class="btn ghost sm" data-a="x-url" data-u="https://www.google.com/android/find">Trova dispositivo</button></div>`); return true;
      case 'spy': closeSheet(); guide('Il telefono ti spia?', 'Se qualcuno sa sempre dove sei o cosa scrivi.', [
        'Segnali: batteria che si scarica in fretta, app che non riconosci, qualcuno conosce messaggi o spostamenti che non gli hai detto.',
        '<b>iPhone</b>: Impostazioni → Privacy e sicurezza → <b>Controllo di sicurezza</b>: vedi e togli chi ha accesso a posizione e dati. Controlla anche «Dov\'è».',
        '<b>Android</b>: Impostazioni → Sicurezza → app di amministrazione del dispositivo e Accessibilità: togli quello che non conosci. In Google Maps controlla la Condivisione della posizione.',
        'Cambia il codice di sblocco e non dirlo a nessuno.',
        'Attenzione: se togli un\'app spia, chi l\'ha messa può accorgersene. Se hai paura di reazioni, prima fai un piano con il <b>1522</b> o con le forze dell\'ordine e conserva le prove.'],
        `<a class="btn ghost" href="tel:1522">${I('phone')}Chiama il 1522</a>`); return true;
      case 'accounts': closeSheet(); guide('Account al sicuro', 'Per email, social e banca, meglio da un dispositivo che sai pulito.', [
        'Cambia le password: lunghe, diverse per ogni account.', 'Attiva la <b>verifica in due passaggi</b> ovunque possibile.',
        'Esci dagli altri dispositivi: Google → Sicurezza → I tuoi dispositivi; Apple → Impostazioni → il tuo nome → dispositivi; WhatsApp → Dispositivi collegati.',
        'Controlla email e numero di recupero: devono essere i tuoi.', 'Non condividere il codice di sblocco del telefono.'],
        `<div class="em-tools"><button class="btn ghost sm" data-a="x-url" data-u="https://myaccount.google.com/security">Sicurezza Google</button><button class="btn ghost sm" data-a="x-url" data-u="https://account.apple.com/">Account Apple</button></div>`); return true;
      case 'scam': closeSheet(); guide('Truffe al telefono e alla porta', 'Le più diffuse in Italia, soprattutto con le persone anziane.', [
        '<b>Finto carabiniere o avvocato</b>: «tuo figlio ha avuto un incidente, servono soldi». È una truffa: riattacca e chiama direttamente tuo figlio e il 112.',
        '<b>Finto operatore della banca</b>: la banca non chiede mai codici, PIN o di spostare soldi. Riattacca e chiama il numero sul retro della carta.',
        '<b>SMS con link</b> su pacchi, multe o conti bloccati: non toccare il link.',
        '<b>Finto tecnico</b> di gas, luce o acqua alla porta: non aprire, chiama l\'azienda al numero della bolletta.',
        'Nel dubbio: <b>non dare niente e chiama il 112</b>.'], `<a class="btn red" href="tel:112">${I('phone')}Chiama il 112</a>`); return true;
      case 'chat-proof': closeSheet(); guide('Salvare una chat come prova', 'Messaggi di minacce, ricatti o molestie.', [
        'Non cancellare niente, neanche se fa male rileggerlo.', 'Fai <b>screenshot</b> in cui si vedano nome o numero, data e ora.',
        'Ancora meglio, registra lo schermo mentre scorri la chat: iPhone dal Centro di Controllo (Registrazione schermo), Android dalle Impostazioni rapide.',
        'Su WhatsApp puoi anche <b>esportare la chat</b>: chat → nome → Esporta chat.', 'Annota tutto nel <b>Diario</b> di Vicina e porta le prove alla denuncia.'],
        `<div class="em-tools"><button class="btn ghost sm" data-a="diary">Apri il Diario</button></div>`); return true;
    }
    return false;
  }
  // scelte nei fogli di questo modulo
  document.addEventListener('click', e => {
    const b = e.target.closest('#rd-kind button, #rd-min button, #rn-min button, #rt-mode button'); if (!b) return;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });

  const groups = [
    ['Adesso', [
      ['redcode', 'alert', 'red', 'Codice rosso', 'La cerchia ti chiama subito'],
      ['strobe', 'spark', 'amber', 'Strobo', 'Luce che acceca e disorienta'],
      ['yell', 'mic', 'red', 'Voce d\'allarme', 'Il telefono grida «Aiuto!»'],
      ['watch5', 'clock', 'violet', 'Tienimi d\'occhio', '2, 5 o 10 minuti'],
      ['mirror', 'eye', 'blue', 'Guarda dietro', 'Specchietto con la fotocamera'],
      ['zoom', 'camera', 'blue', 'Zoom a distanza', 'Leggi una targa da lontano'],
      ['discreet', 'lock', 'violet', 'Aiuto senza farsi capire', 'Bar, chat, gesti'],
      ['signal', 'user', 'amber', 'Segnale con la mano', 'Il gesto per chiedere aiuto'],
      ['breathe', 'heart', 'green', 'Respira', 'Calma l\'ansia in un minuto']]],
    ['Vicino a te', [
      ['near-er', 'heart', 'red', 'Pronto soccorso', 'Il più vicino, un tocco'],
      ['near-police', 'shield', 'blue', 'Carabinieri e polizia', 'I più vicini, un tocco'],
      ['near-pharmacy', 'plus', 'green', 'Farmacia', 'La più vicina, un tocco'],
      ['near-aed', 'heart', 'amber', 'Defibrillatore', 'Il DAE più vicino'],
      ['near-transit', 'send', 'violet', 'Fermate e stazioni', 'Bus, tram, metro, treni']], 2],
    ['In giro', [
      ['checkin', 'pin', 'green', 'Check-in', '«Sono qui, tutto ok»'],
      ['route', 'send', 'blue', 'Il mio percorso', 'Alla cerchia il link del tragitto'],
      ['places', 'pin', 'violet', 'Luoghi preferiti', 'Casa, lavoro, scuola…'],
      ['ride', 'send', 'amber', 'Salgo su un mezzo', 'Linea e direzione alla cerchia'],
      ['run', 'user', 'green', 'Vado a correre', 'Corsa o bici in sicurezza'],
      ['park', 'lock', 'gray', 'Dov\'è la mia auto', 'Ritrovala anche al buio'],
      ['stay', 'book', 'blue', 'Dove dormo', 'Hotel o alloggio alla cerchia'],
      ['coords', 'pin', 'red', 'Coordinate soccorsi', 'Montagna, mare, campagna']]],
    ['Salute e guide', [
      ['lockscreen', 'eye', 'red', 'Sfondo di emergenza', 'I tuoi dati sul blocco schermo'],
      ['icecard', 'book', 'red', 'Tessera portafoglio', 'Da stampare'],
      ['kit', 'check', 'amber', 'Kit di emergenza', 'Lo zaino pronto'],
      ['family', 'people', 'violet', 'Piano di famiglia', 'Dove ritrovarsi'],
      ['simulate', 'send', 'gray', 'Prova l\'SOS', 'Senza inviare niente']]],
    ['Telefono e account', [
      ['stolen', 'phone', 'red', 'Telefono rubato', 'Blocca, localizza, denuncia'],
      ['spy', 'eye', 'violet', 'Il telefono ti spia?', 'Controlla chi ti segue'],
      ['accounts', 'lock', 'blue', 'Account al sicuro', 'Password e dispositivi'],
      ['scam', 'alert', 'amber', 'Truffe', 'Finti carabinieri, banche, tecnici'],
      ['chat-proof', 'chat', 'green', 'Chat come prova', 'Salva minacce e molestie']]]
  ];
  return { handle, groups };
}
