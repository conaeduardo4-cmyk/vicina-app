// Centrale di soccorso (Vicina 3.0)
// Quando parte un SOS il telefono di chi è in pericolo diventa una piccola centrale:
//  · DIRETTA: audio (spezzoni da 2 s) e fotogrammi della fotocamera arrivano dal vivo a chi aiuta (canale in tempo reale);
//  · WALKIE-TALKIE: chi aiuta parla (tieni premuto) o scrive; chi è in pericolo sente/legge e risponde con frasi rapide;
//  · SOCCORRITORI: «Sto arrivando» (posizione e tempo stimato), «Chiamo io il 112», «Seguo da qui», «Sono arrivato/a»;
//  · PROVE: audio e foto vengono salvati con impronta SHA-256 in una catena firmata dal server → PDF per la denuncia;
//  · SCHEDA 112: cosa dire all'operatore, con indirizzo vero e dati sanitari, letta ad alta voce in italiano se serve.
import { buildPdf } from './pdf.js';

const ROLES = {
  coming: { t: 'Sta arrivando', me: 'Sto arrivando', ic: 'send', c: 'blue' },
  calling: { t: 'Chiama il 112', me: 'Chiamo io il 112', ic: 'phone', c: 'red' },
  remote: { t: 'Segue da casa', me: 'Seguo da qui', ic: 'chat', c: 'violet' },
  arrived: { t: 'È arrivato/a', me: 'Sono arrivato/a', ic: 'check', c: 'green' },
  none: { t: 'Non può', me: 'Non posso', ic: 'x', c: 'gray' }
};
const SITUATIONS = [
  ['follow', 'Qualcuno mi segue', 'una persona mi sta seguendo e ho paura'],
  ['attack', 'Aggressione', 'sono stato/a aggredito/a o mi stanno aggredendo'],
  ['home', 'Violenza in casa', 'sono in pericolo in casa, c\'è una persona violenta'],
  ['ill', 'Malore', 'sto male, ho un malore'],
  ['crash', 'Incidente', 'c\'è stato un incidente'],
  ['fire', 'Incendio', 'c\'è un incendio'],
  ['lost', 'Mi sono perso/a', 'mi sono perso/a e non so tornare'],
  ['other', 'Altro', 'ho bisogno di aiuto']
];
const NUMBERS = [['112', 'Numero unico di emergenza'], ['113', 'Polizia'], ['118', 'Emergenza sanitaria'], ['115', 'Vigili del fuoco'], ['1522', 'Violenza e stalking (donne)'], ['114', 'Emergenza infanzia']];
const QUICK_VICTIM = ['Sto bene per ora', 'Fate presto', 'Non posso parlare', 'Chiamate il 112', 'Sono nascosto/a'];
const QUICK_HELPER = ['Sto arrivando, resta lì', 'Ho chiamato il 112', 'Resta in un posto illuminato', 'Se puoi nasconditi e stai in silenzio', 'Ti sento, sono qui'];

export function createCentrale(ctx) {
  const { $, I, esc, toast, native, api, AV, hhmm, wait, errMsg, dialog } = ctx;
  const uid = () => ctx.uid();
  const first = n => String(n || '').trim().split(/\s+/)[0] || 'Qualcuno';
  const b64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(blob); });
  const fromB64 = (s, type) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  const sha256 = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
  const dist = (a, b) => {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const R = 6371e3, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmtD = m => m == null ? '' : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
  const etaMin = (m, speed) => { if (m == null) return null; const v = Math.max(1, Math.round(m / (speed || (m < 1500 ? 1.35 : 8)) / 60)); return v > 180 ? null : v; };
  const AUDIO_TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  const audioMime = () => (window.MediaRecorder && AUDIO_TYPES.find(t => MediaRecorder.isTypeSupported?.(t))) || '';
  const extOf = type => /mp4|aac|m4a/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';

  /* ======================================================================
     PARTE 1 · chi è in pericolo: diretta + prove
     ====================================================================== */
  const tx = { sosId: null, ch: null, stream: null, video: null, viewers: [], stops: [], paused: false, facing: 'environment', aSeq: 0, fSeq: 0, evN: 0, msgs: [], helpersLive: {}, started: 0, err: '' };
  const EVIDENCE_MAX_MS = 15 * 60e3;

  async function startTx(sos, { silent = false } = {}) {
    if (tx.sosId === sos.id) return;
    stopTx();
    Object.assign(tx, { sosId: sos.id, viewers: [], stops: [], paused: false, aSeq: 0, fSeq: 0, evN: 0, msgs: [], helpersLive: {}, started: Date.now(), err: '', silent });
    tx.ch = api.liveChannel(sos.id, { uid: uid(), name: ctx.myName(), role: 'victim' }, {
      presence: list => { tx.viewers = list.filter(x => x.role !== 'victim'); renderActive(); },
      text: m => incomingMsg({ ...m, kind: 'text' }),
      talk: m => incomingMsg({ ...m, kind: 'talk' }),
      pos: p => { tx.helpersLive[p.uid] = p; renderActive(); ctx.mapRefresh(); },
      ready: () => renderActive()
    });
    evidence('event', { note: 'SOS inviato' });
    if (ctx.prefs().diretta === false) { tx.err = 'off'; renderActive(); return; }
    await openMedia();
    renderActive();
  }
  async function openMedia() {
    closeMedia();
    if (tx.paused || !tx.sosId) return;
    try {
      tx.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: { ideal: tx.facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 10, max: 15 } }
      });
    } catch {
      try { tx.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { tx.err = 'perm'; console.warn('diretta', e); return; }
    }
    tx.err = '';
    const vt = tx.stream.getVideoTracks()[0];
    if (vt) {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = tx.stream;
      v.className = 'cx-self'; tx.video = v; v.play().catch(() => {});
    }
    const aStream = new MediaStream(tx.stream.getAudioTracks());
    // audio dal vivo: spezzoni autonomi da 2 secondi (si possono riprodurre uno per uno)
    tx.stops.push(segments(aStream, 2000, async (blob, type) => {
      if (!tx.viewers.length || !tx.ch) return;
      tx.ch.send('audio', { b64: await b64(blob), type, seq: ++tx.aSeq });
    }));
    // audio per le prove: spezzoni da 20 secondi caricati e firmati (massimo 15 minuti)
    tx.stops.push(segments(aStream, 20000, async (blob, type) => {
      if (Date.now() - tx.started > EVIDENCE_MAX_MS || blob.size < 800) return;
      const n = ++tx.evN, path = `${uid()}/${tx.sosId}/a${String(n).padStart(4, '0')}.${extOf(type)}`;
      try {
        await api.uploadBlob('sos/' + path, blob, extOf(type) === 'm4a' ? 'audio/mp4' : type.split(';')[0]);
        await evidence('audio', { path, sha: await sha256(await blob.arrayBuffer()) });
        if (n === 1) ctx.firstAudio(tx.sosId, 'sos/' + path);      // il primo spezzone diventa anche il «vocale» dell'SOS
      } catch (e) { console.warn('prova audio', e); }
    }));
    // fotogrammi: piccoli e frequenti per la diretta, grandi ogni 10 s per le prove
    if (tx.video) {
      let k = 0;
      const t = setInterval(async () => {
        const v = tx.video; if (!v || !v.videoWidth) return;
        k++;
        if (tx.viewers.length && tx.ch) tx.ch.send('frame', { img: grab(v, 320, 0.55), facing: tx.facing });
        if (k % 7 === 0 && Date.now() - tx.started < EVIDENCE_MAX_MS) {
          const data = grab(v, 720, 0.72), n = ++tx.fSeq, path = `${uid()}/${tx.sosId}/f${String(n).padStart(4, '0')}.jpg`;
          try {
            const blob = fromB64(data, 'image/jpeg');
            await api.uploadBlob('sos/' + path, blob, 'image/jpeg');
            const p = ctx.myPos();
            await evidence('frame', { path, sha: await sha256(await blob.arrayBuffer()), lat: p?.lat, lng: p?.lng });
          } catch (e) { console.warn('prova foto', e); }
        }
      }, 1500);
      tx.stops.push(() => clearInterval(t));
    }
    // posizione nelle prove ogni minuto
    const tp = setInterval(() => { const s = ctx.sosMine(); if (s?.lat != null && Date.now() - tx.started < EVIDENCE_MAX_MS * 2) evidence('pos', { lat: s.lat, lng: s.lng, note: s.acc ? `± ${Math.round(s.acc)} m` : '' }); }, 60000);
    tx.stops.push(() => clearInterval(tp));
  }
  function grab(v, w, q) {
    const k = Math.min(1, w / v.videoWidth), c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q).split(',')[1];
  }
  function segments(stream, ms, onBlob) {
    let stopped = false, cur = null;
    const mime = audioMime();
    const one = () => {
      if (stopped) return;
      let r; try { r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined); } catch { return; }
      const parts = []; cur = r;
      r.ondataavailable = e => e.data?.size && parts.push(e.data);
      r.onstop = () => { const type = r.mimeType || mime || 'audio/webm'; if (parts.length) onBlob(new Blob(parts, { type: type.split(';')[0] }), type); };
      try { r.start(); } catch { return; }
      setTimeout(() => { try { if (r.state !== 'inactive') r.stop(); } catch {} one(); }, ms);
    };
    one();
    return () => { stopped = true; try { if (cur && cur.state !== 'inactive') cur.stop(); } catch {} };
  }
  function closeMedia() {
    tx.stops.forEach(f => { try { f(); } catch {} }); tx.stops = [];
    try { tx.stream?.getTracks().forEach(t => t.stop()); } catch {}
    tx.stream = null; tx.video = null;
  }
  function stopTx() {
    if (tx.sosId) evidence('event', { note: 'Diretta chiusa' });
    closeMedia();
    try { tx.ch?.close(); } catch {}
    tx.ch = null; tx.sosId = null; tx.viewers = [];
  }
  let evQueue = Promise.resolve();
  function evidence(kind, o = {}) {   // in fila: l'ordine della catena è quello degli eventi
    const sosId = tx.sosId; if (!sosId) return;
    evQueue = evQueue.then(() => api.call('addEvidence', { sosId, kind, ...o })).catch(e => console.warn('prova', kind, e));
    return evQueue;
  }
  // sospende la diretta mentre l'utente registra un vocale (iPhone permette un solo microfono alla volta)
  function suspend(on) { if (!tx.sosId) return; if (on) closeMedia(); else if (!tx.paused) openMedia().then(renderActive); }

  function incomingMsg(m) {
    const box = tx.sosId ? tx.msgs : rx.msgs;
    box.push(m); if (box.length > 30) box.shift();
    native.haptic('medium');
    if (tx.sosId) {
      if (m.kind === 'talk' && !ctx.quiet() && !tx.silent) playTalk(m);
      else if (m.kind === 'text' && !ctx.quiet()) native.vibrate([60, 40, 60]);
      renderActive();
    } else renderRx();
  }
  let talkAudio = null;
  function playTalk(m) {
    try { talkAudio?.pause(); } catch {}
    try { talkAudio = new Audio(URL.createObjectURL(fromB64(m.b64, m.type || 'audio/mp4'))); talkAudio.play().catch(() => {}); } catch {}
  }

  function renderActive() {
    const el = $('#a-centrale'); const s = ctx.sosMine();
    if (!el) return;
    if (!s || tx.sosId !== s.id || tx.silent) { el.innerHTML = ''; return; }
    const helpers = Object.entries(s.helpers || {}).filter(([, h]) => h.role !== 'none').map(([u, h]) => {
      const lv = tx.helpersLive[u], pos = lv || h, d = pos?.lat != null ? dist(pos, s) : null;
      return { uid: u, ...h, eta: lv?.eta ?? h.eta ?? etaMin(d), d };
    }).sort((a, b) => (a.role === 'arrived' ? -1 : 0) - (b.role === 'arrived' ? -1 : 0) || (a.eta ?? 99) - (b.eta ?? 99));
    const live = tx.stream && !tx.paused, cam = !!tx.video;
    const viewers = tx.viewers.length;
    el.innerHTML = `
      <div class="cx-card">
        <div class="cx-head"><span class="cx-live${live ? ' on' : ''}"><i></i>${live ? 'IN DIRETTA' : tx.err === 'perm' ? 'MICROFONO BLOCCATO' : 'DIRETTA IN PAUSA'}</span>
          <span class="cx-eyes">${I('people')}${viewers ? `${viewers} ${viewers === 1 ? 'ti segue' : 'ti seguono'}` : 'In attesa della cerchia'}</span></div>
        <div class="cx-self-w${cam && live ? '' : ' off'}" id="cx-self"></div>
        <p class="cx-note">${live ? 'Chi ti aiuta sente l\'audio e vede la fotocamera. Tutto viene salvato come prova.' : tx.err === 'perm' ? 'Consenti microfono e fotocamera a Vicina per la diretta.' : 'Nessuno ti sente adesso.'}</p>
        <div class="cx-btns">
          <button class="btn ghost sm" data-a="cx-pause">${I(live ? 'x' : 'mic')}${live ? 'Pausa' : 'Riprendi diretta'}</button>
          ${cam && live ? `<button class="btn ghost sm" data-a="cx-flip">${I('camera')}Cambia fotocamera</button>` : ''}
        </div>
      </div>
      ${helpers.length ? `<div class="cx-sec"><b>Chi ti aiuta</b></div><div class="card cx-helpers">${helpers.map(h => helperRow(h)).join('')}</div>` : ''}
      <div class="cx-sec"><b>Messaggi</b><span>${tx.msgs.length ? '' : 'Qui arrivano voce e testi di chi ti aiuta'}</span></div>
      ${tx.msgs.length ? `<div class="cx-feed">${tx.msgs.slice(-6).map(msgRow).join('')}</div>` : ''}
      <div class="cx-quick">${QUICK_VICTIM.map(q => `<button data-a="cx-say" data-t="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="row2 cx-tools"><button class="btn ghost" data-a="cx-112">${I('phone')}Scheda per il 112</button><button class="btn ghost" data-a="cx-proof">${I('shield')}Prove e PDF</button></div>`;
    if (tx.video && live && cam) { const w = $('#cx-self'); if (w && tx.video.parentElement !== w) w.appendChild(tx.video); tx.video.play().catch(() => {}); }
  }
  const helperRow = h => {
    const r = ROLES[h.role] || ROLES.remote;
    const sub = h.role === 'coming' ? [h.eta != null ? `circa ${h.eta} min` : '', h.d != null ? fmtD(h.d) : ''].filter(Boolean).join(' · ') : h.role === 'arrived' ? 'È lì con te' : h.role === 'calling' ? 'Sta parlando con il 112' : 'Ti segue dal telefono';
    return `<div class="row">${AV(h.name, null, '', h.uid)}<div class="fl"><b>${esc(h.name)}</b><span>${esc(sub)}</span></div><span class="tag ${r.c}">${I(r.ic)}${esc(r.t)}</span></div>`;
  };
  const msgRow = m => `<div class="cx-msg${m.uid === uid() ? ' me' : ''}"><b>${esc(first(m.name))}</b>${m.kind === 'talk'
    ? `<button class="cx-play" data-a="cx-play" data-at="${m.at}">${I('mic')}Messaggio vocale · ${Math.max(1, Math.round((m.ms || 2000) / 1000))} s</button>`
    : `<span>${esc(m.text)}</span>`}<i>${hhmm(m.at)}</i></div>`;

  /* ======================================================================
     PARTE 2 · chi aiuta: guarda, ascolta, parla, arriva
     ====================================================================== */
  const rx = { sosId: null, ch: null, victim: null, frame: null, frameAt: 0, listen: false, queue: [], playing: false, audio: null, msgs: [], role: null, others: {}, watchStop: null, lastPos: null, lastSave: 0, speed: null, present: [] };

  function openRx(s) {
    if (rx.sosId === s.id) { renderRx(); return; }
    closeRx(true);
    Object.assign(rx, { sosId: s.id, victim: s, frame: null, frameAt: 0, listen: false, queue: [], msgs: [], role: s.helpers?.[uid()]?.role || null, others: {}, present: [] });
    rx.ch = api.liveChannel(s.id, { uid: uid(), name: ctx.myName(), role: rx.role || 'watch' }, {
      frame: f => { rx.frame = f.img; rx.frameAt = f.at || Date.now(); const im = $('#cx-view-img'); if (im) { im.src = 'data:image/jpeg;base64,' + f.img; im.parentElement.classList.add('on'); } upLiveAge(); },
      audio: a => { if (!rx.listen) return; rx.queue.push(a); if (rx.queue.length > 3) rx.queue.splice(0, rx.queue.length - 2); pump(); },
      text: m => incomingMsg({ ...m, kind: 'text' }),
      talk: m => incomingMsg({ ...m, kind: 'talk' }),
      pos: p => { rx.others[p.uid] = p; renderRx(); ctx.mapRefresh(); },
      presence: l => { rx.present = l; renderRx(); }
    });
    if (rx.role === 'coming') startComing(false);
    renderRx();
  }
  function closeRx(force) {
    if (!force && rx.role === 'coming') return;          // chi sta arrivando continua a mandare la posizione
    stopComing(); stopListen();
    try { rx.ch?.close(); } catch {}
    Object.assign(rx, { sosId: null, ch: null, victim: null, msgs: [], role: null });
    const el = $('#in-centrale'); if (el) delete el.dataset.id;
  }
  function upLiveAge() { const e = $('#cx-view-age'); if (e) e.textContent = rx.frameAt ? `aggiornata ${Math.max(0, Math.round((Date.now() - rx.frameAt) / 1000))} s fa` : ''; }
  function pump() {
    if (rx.playing || !rx.queue.length) return;
    const a = rx.queue.shift(); rx.playing = true;
    try {
      const au = rx.audio || (rx.audio = new Audio()); au.src = URL.createObjectURL(fromB64(a.b64, (a.type || 'audio/mp4').split(';')[0]));
      au.onended = au.onerror = () => { rx.playing = false; pump(); };
      au.play().catch(() => { rx.playing = false; });
    } catch { rx.playing = false; }
  }
  function stopListen() { rx.listen = false; rx.queue = []; try { rx.audio?.pause(); } catch {} rx.playing = false; }

  async function setRole(role) {
    const s = rx.victim; if (!s) return;
    const prev = rx.role; rx.role = role; rx.ch?.role(role);
    if (role === 'coming') await startComing(true); else stopComing();
    try {
      const p = role === 'coming' ? rx.lastPos || await ctx.getPos() : null;
      const d = p ? dist(p, s) : null;
      await api.call('sosHelp', { sosId: s.id, role, lat: p?.lat, lng: p?.lng, eta: etaMin(d, rx.speed) });
      native.haptic('medium');
      toast(role === 'coming' ? `Bene: ${first(s.fromName)} vede che stai arrivando` : role === 'calling' ? 'Gli altri sanno che chiami tu il 112' : role === 'arrived' ? 'Segnato: sei arrivato/a' : role === 'none' ? 'Va bene: gli altri lo sanno' : 'Segui la diretta da qui');
      if (role === 'calling') sheet112({ helper: true });
      if (role === 'coming' && s.lat != null) native.openMaps(s.lat, s.lng, s.fromName, true);
    } catch (e) { rx.role = prev; toast(errMsg(e)); }
    renderRx();
  }
  async function startComing(fresh) {
    stopComing();
    try {
      rx.watchStop = await native.watchLive(p => {
        const s = rx.victim; if (!s || !p) return;
        if (rx.lastPos) { const dt = (Date.now() - rx.lastPos.at) / 1000, dd = dist(rx.lastPos, p); if (dt > 2 && dd != null) rx.speed = rx.speed ? rx.speed * 0.6 + (dd / dt) * 0.4 : dd / dt; }
        rx.lastPos = { ...p, at: Date.now() };
        const d = dist(p, s), eta = etaMin(d, rx.speed && rx.speed > 0.8 ? rx.speed : null);
        rx.ch?.send('pos', { lat: p.lat, lng: p.lng, eta });
        if (Date.now() - rx.lastSave > 20000) { rx.lastSave = Date.now(); api.call('sosHelp', { sosId: s.id, role: 'coming', lat: p.lat, lng: p.lng, eta }).catch(() => {}); }
        if (d != null && d < 40 && rx.role === 'coming') { rx.role = 'arrived'; api.call('sosHelp', { sosId: s.id, role: 'arrived', lat: p.lat, lng: p.lng, eta: 0 }).catch(() => {}); stopComing(); toast(`Sei arrivato/a da ${first(s.fromName)}`); renderRx(); }
      });
    } catch (e) { console.warn('posizione soccorritore', e); }
  }
  function stopComing() { try { rx.watchStop?.(); } catch {} rx.watchStop = null; }

  // walkie-talkie: tieni premuto per parlare (massimo 15 secondi)
  let talkRec = null, talkT0 = 0, talkTimer = null;
  async function talkStart(btn) {
    if (talkRec) return;
    try { talkRec = await native.startRecording(); } catch (e) { toast(e?.code === 'mic-blocked' ? 'Microfono bloccato: attivalo dalle impostazioni' : 'Microfono non disponibile'); return; }
    talkT0 = Date.now(); btn.classList.add('rec'); native.haptic('light');
    talkTimer = setTimeout(() => talkEnd(btn), 15000);
  }
  async function talkEnd(btn) {
    clearTimeout(talkTimer); btn?.classList.remove('rec');
    const r = talkRec; talkRec = null; if (!r) return;
    const out = await r.stop().catch(() => null);
    const ms = Date.now() - talkT0;
    if (!out?.blob?.size || ms < 500) return toast('Tieni premuto mentre parli');
    const m = { uid: uid(), name: ctx.myName(), b64: await b64(out.blob), type: out.mime, ms, at: Date.now() };
    rx.ch?.send('talk', m); rx.msgs.push({ ...m, kind: 'talk' }); renderRx(); native.haptic('light');
  }
  function sayText(text) {
    if (!text) return;
    const ch = tx.sosId ? tx.ch : rx.ch; if (!ch) return;
    ch.send('text', { text: String(text).slice(0, 300) });
    const m = { uid: uid(), name: ctx.myName(), text, at: Date.now(), kind: 'text' };
    (tx.sosId ? tx.msgs : rx.msgs).push(m);
    tx.sosId ? renderActive() : renderRx();
    native.haptic('light');
  }

  function renderRx() {
    const el = $('#in-centrale'); const s = rx.victim;
    if (!el || !s) return;
    const fresh = ctx.sosIn().find(x => x.id === s.id); if (fresh) rx.victim = fresh;
    const v = rx.victim, me = uid();
    // struttura fissa (immagine, campo di testo, walkie-talkie): si crea una volta sola, così non si perde quello che scrivi
    if (el.dataset.id !== v.id) {
      el.dataset.id = v.id;
      el.innerHTML = `
        <div class="cx-view${rx.frame ? ' on' : ''}" id="cx-view">
          <img id="cx-view-img" alt="Diretta di ${esc(first(v.fromName))}" ${rx.frame ? `src="data:image/jpeg;base64,${rx.frame}"` : ''}>
          <div class="cx-view-ph">${I('camera')}<span id="cx-view-ph"></span></div>
          <span class="cx-live on"><i></i>LIVE</span><span class="cx-view-age" id="cx-view-age"></span>
          <button class="cx-listen" id="cx-listen" data-a="cx-listen"></button>
        </div>
        <div id="cx-dyn"></div>
        <div class="cx-talk">
          <button class="cx-ptt" id="cx-ptt" aria-label="Tieni premuto per parlare">${I('mic')}<span>Tieni premuto e parla</span></button>
          <form class="cx-type" data-cx-form><input id="cx-text" maxlength="300" placeholder="Scrivi un messaggio…" autocomplete="off"><button class="iconbtn" aria-label="Invia">${I('send')}</button></form>
        </div>
        <div class="cx-quick">${QUICK_HELPER.map(q => `<button data-a="cx-say" data-t="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <button class="btn ghost" data-a="cx-112h">${I('phone')}Scheda per chiamare il 112 per ${esc(first(v.fromName))}</button>`;
      bindPtt();
    }
    const helpers = Object.entries(v.helpers || {}).filter(([u, h]) => u !== me && h.role !== 'none').map(([u, h]) => {
      const lv = rx.others[u], p = lv || h, d = p?.lat != null ? dist(p, v) : null;
      return { uid: u, ...h, eta: lv?.eta ?? h.eta ?? etaMin(d), d };
    });
    const myPos = ctx.myPos(), dMe = myPos ? dist(myPos, v) : null;
    const victimOn = rx.present.some(p => p.uid === v.from);
    const role = rx.role;
    const ph = $('#cx-view-ph'); if (ph) ph.textContent = victimOn ? 'In attesa della fotocamera…' : 'Diretta non ancora attiva';
    const li = $('#cx-listen'); if (li) { li.classList.toggle('on', rx.listen); li.innerHTML = `${I(rx.listen ? 'mic' : 'bell')}${rx.listen ? 'Stai ascoltando' : 'Ascolta dal vivo'}`; }
    const dyn = $('#cx-dyn'); if (!dyn) return;
    dyn.innerHTML = `
      <div class="cx-sec"><b>Cosa fai tu?</b><span>${dMe != null ? `Sei a ${fmtD(dMe)}${etaMin(dMe) ? ` · circa ${etaMin(dMe)} min` : ''}` : ''}</span></div>
      <div class="cx-roles">${['coming', 'calling', 'remote', 'arrived'].map(k => `<button class="cx-role ${ROLES[k].c}${role === k ? ' on' : ''}" data-a="cx-role" data-r="${k}">${I(ROLES[k].ic)}<span>${ROLES[k].me}</span></button>`).join('')}</div>
      ${helpers.length ? `<div class="card cx-helpers">${helpers.map(helperRow).join('')}</div>` : `<p class="cx-note">Nessun altro ha ancora detto cosa fa: organizzatevi qui.</p>`}
      <div class="cx-sec"><b>Parla con ${esc(first(v.fromName))}</b><span>${victimOn ? 'Collegato/a adesso' : 'Riceverà quando apre Vicina'}</span></div>
      ${rx.msgs.length ? `<div class="cx-feed">${rx.msgs.slice(-6).map(msgRow).join('')}</div>` : ''}`;
  }
  function bindPtt() {
    const b = $('#cx-ptt'); if (!b || b._b) return; b._b = 1;
    b.addEventListener('pointerdown', e => { e.preventDefault(); talkStart(b); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(v => b.addEventListener(v, () => talkRec && talkEnd(b)));
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  document.addEventListener('submit', e => {
    if (!e.target.matches?.('[data-cx-form]')) return;
    e.preventDefault(); const i = $('#cx-text'); const t = i?.value.trim(); if (t) { sayText(t); i.value = ''; }
  });
  setInterval(upLiveAge, 1000);

  /* ======================================================================
     PARTE 3 · scheda per il 112 (anche da leggere ad alta voce in italiano)
     ====================================================================== */
  let sit = 'other';
  async function address(p) {
    if (!p || p.lat == null) return '';
    try { return await ctx.reverse(p.lat, p.lng) || ''; } catch { return ''; }
  }
  async function sheet112({ helper = false } = {}) {
    const v = helper ? rx.victim : ctx.sosMine();
    const p = helper ? (v?.lat != null ? v : null) : (ctx.sosMine()?.lat != null ? ctx.sosMine() : ctx.myPos());
    ctx.openSheet(`<div class="cx-112"><h2>${helper ? `Chiama il 112 per ${esc(first(v?.fromName))}` : 'Cosa dire al 112'}</h2>
      <p class="sub">Leggi questo testo all'operatore. Se non riesci a parlare in italiano, tocca «Leggi in italiano» e avvicina il telefono.</p>
      ${helper ? '' : `<div class="cx-sits">${SITUATIONS.map(([k, t]) => `<button class="${k === sit ? 'on' : ''}" data-a="cx-sit" data-k="${k}">${esc(t)}</button>`).join('')}</div>`}
      <div class="cx-script" id="cx-script" lang="it" translate="no"><span class="cx-load">…</span></div>
      ${globalThis.vLang && globalThis.vLang !== 'it' ? '<p class="cx-tr-h">Traduzione per te</p><div class="cx-script-tr" id="cx-script-tr"></div>' : ''}
      <div class="row2"><a class="btn red" href="tel:112">${I('phone')}Chiama 112</a><button class="btn" data-a="cx-read">${I('mic')}Leggi in italiano</button></div>
      <div class="row2"><button class="btn ghost" data-a="cx-copy">${I('copy')}Copia il testo</button><button class="btn ghost" data-a="ip-open">${I('chat')}Frasi pronte</button></div>
      <div class="cx-nums">${NUMBERS.map(([n, t]) => `<a href="tel:${n}"><b>${n}</b><span>${esc(t)}</span></a>`).join('')}</div>
    </div>`, 'cx-112');
    const addr = await address(p);
    const el = $('#cx-script'); if (!el) return;
    el.dataset.helper = helper ? '1' : '';
    el.dataset.addr = addr;
    el.innerHTML = esc(script({ helper, v, p, addr })).replace(/\n/g, '<br>');
    const trEl = $('#cx-script-tr'); if (trEl) trEl.innerHTML = el.innerHTML;
  }
  function script({ helper, v, p, addr }) {
    const me = ctx.myName(), phone = ctx.myPhone(), med = helper ? '' : ctx.medical();
    const coords = p?.lat != null ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : '';
    const where = [addr ? `Mi trovo in ${addr}.` : '', coords ? `Le coordinate GPS sono ${coords.replace(', ', ' nord, ')} est${p.acc ? `, precisione ${Math.round(p.acc)} metri` : ''}.` : 'Non conosco la posizione esatta.'].filter(Boolean).join(' ');
    if (helper) {
      const wh = [addr ? `Si trova in ${addr}.` : '', coords ? `Le coordinate GPS sono ${coords.replace(', ', ' nord, ')} est.` : ''].filter(Boolean).join(' ');
      return [`Buongiorno, mi chiamo ${me}. Chiamo per ${v?.fromName || 'una persona'}, che ha chiesto aiuto con l'app Vicina alle ${hhmm(v?.at)}.`,
        wh || 'Non conosco la sua posizione esatta.',
        v?.fromPhone ? `Il suo numero è ${v.fromPhone}.` : '',
        phone ? `Il mio numero è ${phone}.` : ''].filter(Boolean).join('\n');
    }
    const s = SITUATIONS.find(x => x[0] === sit) || SITUATIONS[7];
    return [`Buongiorno, mi chiamo ${me}. ${s[2].charAt(0).toUpperCase() + s[2].slice(1)}.`, where, med, phone ? `Il mio numero è ${phone}.` : ''].filter(Boolean).join('\n');
  }

  /* ======================================================================
     PARTE 4 · prove e PDF
     ====================================================================== */
  async function sheetProof(sosId) {
    sosId = sosId || tx.sosId || ctx.sosMine()?.id;
    if (!sosId) return toast('Nessun SOS selezionato');
    ctx.openSheet(`<h2>Prove dell'SOS</h2><p class="sub">Audio, fotogrammi e posizioni salvati durante l'SOS, ognuno con la sua impronta digitale SHA-256 e l'ora del server. Se un file viene modificato o tolto, la verifica lo segnala.</p><div id="cx-proof" class="cx-proof"><span class="cx-load">Controllo la catena…</span></div>`, 'cx-proof');
    try {
      const [list, ver] = await Promise.all([api.evidence(sosId), api.call('verifyEvidence', { sosId })]);
      const el = $('#cx-proof'); if (!el) return;
      const n = k => list.filter(e => e.kind === k).length;
      el.innerHTML = `<div class="cx-ver ${ver.ok ? 'ok' : 'bad'}">${I(ver.ok ? 'check' : 'alert')}<div class="fl"><b>${ver.ok ? 'Catena integra' : 'Catena NON integra'}</b><span>${ver.count} elementi${ver.ok ? '' : ` · problema dal n. ${ver.firstBad}`}</span></div></div>
        <div class="cx-counts"><span><b>${n('audio')}</b>audio</span><span><b>${n('frame') + n('photo')}</b>foto</span><span><b>${n('pos')}</b>posizioni</span><span><b>${n('event')}</b>eventi</span></div>
        <p class="cx-hash">Impronta finale<br><code>${esc(ver.last || '')}</code></p>
        <button class="btn" data-a="cx-pdf" data-id="${esc(sosId)}">${I('copy')}Crea il PDF per la denuncia</button>
        <p class="cx-note">Il PDF è in italiano: contiene cronologia, posizioni, foto e impronte, ed è pronto da consegnare a Polizia o Carabinieri. I file restano sul server per 7 giorni: scarica il PDF prima.</p>`;
    } catch (e) { const el = $('#cx-proof'); if (el) el.innerHTML = `<p class="cx-note">${esc(errMsg(e))}</p>`; }
  }
  async function makePdf(sosId, btn) {
    btn?.classList.add('busy');
    try {
      const [list, ver] = await Promise.all([api.evidence(sosId), api.call('verifyEvidence', { sosId })]);
      const s = ctx.sosMine()?.id === sosId ? ctx.sosMine() : (await ctx.sosById(sosId)) || { id: sosId };
      const imgs = [];
      const photos = [...(s.photos || []).map(p => ({ path: p.replace(/^sos\//, ''), label: /back/.test(p) ? 'Foto fotocamera posteriore' : 'Foto fotocamera frontale', at: s.at })),
        ...list.filter(e => e.kind === 'frame' && e.path).map(e => ({ path: e.path, label: `Fotogramma n. ${e.seq}`, at: e.at, sha: e.sha }))].slice(0, 14);
      for (const ph of photos) {
        try { const u = await api.photoUrl('sos/' + ph.path); const r = await fetch(u); if (r.ok) imgs.push({ ...ph, bytes: new Uint8Array(await r.arrayBuffer()) }); } catch {}
      }
      const links = {};
      for (const e of list.filter(x => x.kind === 'audio' && x.path)) { try { links[e.seq] = await api.photoUrl('sos/' + e.path, 7 * 86400); } catch {} }
      const pdf = buildPdf({ sos: s, me: { name: ctx.myName(), phone: ctx.myPhone() }, evidence: list, verify: ver, images: imgs, links, helpers: s.helpers || {} });
      const name = `Vicina-SOS-${new Date(s.at || Date.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.pdf`;
      await native.shareBlob(new Blob([pdf], { type: 'application/pdf' }), name, 'Rapporto SOS di Vicina');
    } catch (e) { toast(errMsg(e)); }
    finally { btn?.classList.remove('busy'); }
  }

  /* ======================================================================
     azioni e collegamenti con l'app
     ====================================================================== */
  async function handle(a, t) {
    switch (a) {
      case 'cx-pause': tx.paused = !tx.paused; if (tx.paused) { closeMedia(); evidence('event', { note: 'Diretta in pausa' }); } else { await openMedia(); evidence('event', { note: 'Diretta ripresa' }); } renderActive(); return true;
      case 'cx-flip': tx.facing = tx.facing === 'environment' ? 'user' : 'environment'; await openMedia(); renderActive(); return true;
      case 'cx-say': sayText(t.dataset.t); return true;
      case 'cx-play': { const box = tx.sosId ? tx.msgs : rx.msgs, m = box.find(x => String(x.at) === t.dataset.at); if (m) playTalk(m); return true; }
      case 'cx-listen': rx.listen = !rx.listen; if (!rx.listen) stopListen(); else { native.haptic('light'); try { const au = rx.audio || (rx.audio = new Audio()); au.play().catch(() => {}); } catch {} } renderRx(); return true;
      case 'cx-role': setRole(t.dataset.r === rx.role ? 'remote' : t.dataset.r); return true;
      case 'cx-112': sheet112({ helper: false }); return true;
      case 'cx-112h': sheet112({ helper: true }); return true;
      case 'cx-sit': {
        sit = t.dataset.k; document.querySelectorAll('.cx-sits button').forEach(b => b.classList.toggle('on', b.dataset.k === sit));
        const el = $('#cx-script'); if (el) el.innerHTML = esc(script({ helper: false, p: ctx.sosMine()?.lat != null ? ctx.sosMine() : ctx.myPos(), addr: el.dataset.addr })).replace(/\n/g, '<br>');
        const trEl = $('#cx-script-tr'); if (trEl && el) trEl.innerHTML = el.innerHTML;
        return true;
      }
      case 'cx-read': { const el = $('#cx-script'); if (el) { native.vx?.speak?.(el.innerText.replace(/\n/g, ' '), 'it-IT-x'); toast('Lettura in italiano'); } return true; }
      case 'cx-copy': { const el = $('#cx-script'); if (el) { await native.copy?.(el.innerText); toast('Testo copiato'); } return true; }
      case 'cx-proof': sheetProof(t.dataset.id); return true;
      case 'cx-pdf': makePdf(t.dataset.id, t); return true;
    }
    return false;
  }

  return {
    handle,
    // chiamate dall'app
    onMine(s, opt) { if (s && s.active !== false) startTx(s, opt); else if (tx.sosId) stopTx(); },
    renderActive,
    openRx, closeRx, renderRx, suspend,
    sheetProof,
    rxId: () => rx.sosId,
    // per la mappa: chi sta arrivando (con la posizione più recente)
    helperPins() {
      const out = [], add = (s, live) => Object.entries(s?.helpers || {}).forEach(([u, h]) => {
        if (u === uid() || !['coming', 'arrived'].includes(h.role)) return;
        const p = live[u] || h; if (p?.lat == null) return;
        out.push({ id: 'h-' + u, name: h.name, ini: String(h.name).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(), lat: p.lat, lng: p.lng, label: `${first(h.name)}${(live[u]?.eta ?? h.eta) != null ? ` · ${live[u]?.eta ?? h.eta} min` : ''}`, cls: 'helper', img: ctx.avatar(u), track: [] });
      });
      add(ctx.sosMine(), tx.helpersLive);
      if (rx.victim) add(ctx.sosIn().find(x => x.id === rx.sosId) || rx.victim, rx.others);
      return out;
    },
    reset() { stopTx(); closeRx(true); }
  };
}
