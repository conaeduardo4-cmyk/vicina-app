// Appello «State tutti bene?»
// Terremoto, alluvione, incendio, blackout o una serata finita male: tieni premuto il pulsante e tutta la cerchia
// (partner, amici e gruppi) riceve la domanda. Ognuno risponde «Sto bene» o «Ho bisogno di aiuto» con la posizione,
// e chi ha lanciato l'appello vede tutto dal vivo: chi sta bene, chi chiede aiuto (sulla mappa) e chi non ha ancora risposto.
export const REASONS = [
  ['terremoto', 'Terremoto'], ['alluvione', 'Alluvione'], ['incendio', 'Incendio'], ['maltempo', 'Maltempo'],
  ['blackout', 'Blackout'], ['attentato', 'Emergenza in città'], ['serata', 'Serata / evento'], ['altro', 'Altro']
];
const RN = Object.fromEntries(REASONS);

export function createAppello(ctx) {
  const { $, I, esc, toast, native, api, AV, hhmm, dialog, errMsg, wait } = ctx;
  const HOLD = 1600, DOTS = 6;
  let list = [], openId = null, mapApi = null, mapLoading = null, tick = null, sendingNow = false;
  const dismissed = new Set();
  const uid = () => ctx.uid();
  const first = n => String(n || '').trim().split(/\s+/)[0] || 'Qualcuno';
  const ago = ms => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'adesso' : m < 60 ? `${m} min fa` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min ' : ''}fa`; };
  const dist = (a, b) => {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const R = 6371e3, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmtD = m => m == null ? '' : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
  const rid = () => (crypto.randomUUID?.() || Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')).replace(/-/g, '');
  const pos = async () => { try { return await Promise.race([native.getPos(), wait(5000).then(() => null)]); } catch { return null; } };

  const mine = () => list.find(c => c.from === uid() && c.active) || null;
  const byId = id => list.find(c => c.id === id) || null;
  const pending = () => list.filter(c => c.active && c.from !== uid() && !c.answers?.[uid()] && !dismissed.has(c.id));

  // conteggi: chi ha lanciato l'appello vede ogni risposta, gli altri i totali del server
  function stats(c) {
    const tot = c.recipients.length;
    if (c.from === uid()) {
      const a = Object.entries(c.answers || {}).filter(([u]) => u !== c.from).map(([, x]) => x);
      const help = a.filter(x => x.status === 'help').length;
      return { tot, ok: a.length - help, help, wait: Math.max(0, tot - a.length) };
    }
    const senderHelp = c.answers?.[c.from]?.status === 'help' ? 1 : 0;
    const help = Math.max(0, (c.helps || 0) - senderHelp), ans = c.answered || 0;
    return { tot, ok: Math.max(0, ans - help), help, wait: Math.max(0, tot - ans) };
  }

  /* ================= pulsante in Home: tieni premuto ================= */
  const btn = $('#chk-btn');
  let raf = 0, t0 = 0, holding = false, lit = 0, waveT = 0;
  const hint = $('#chk-hint'), sub = $('#chk-sub');
  function idleText() {
    const c = mine();
    btn.classList.toggle('live', !!c);
    if (c) {
      const s = stats(c);
      hint.textContent = 'Appello in corso';
      sub.textContent = `${s.ok + s.help} su ${s.tot} hanno risposto${s.help ? ` · ${s.help} ${s.help === 1 ? 'chiede' : 'chiedono'} aiuto` : ''}`;
      btn.style.setProperty('--done', s.tot ? (s.ok + s.help) / s.tot : 0);
      btn.classList.toggle('alarm', !!s.help);
    } else {
      hint.textContent = 'Appello';
      sub.textContent = ctx.canCheck() ? 'State tutti bene? · Tieni premuto' : 'Aggiungi qualcuno alla cerchia';
      btn.style.removeProperty('--done'); btn.classList.remove('alarm');
    }
  }
  function lightDots(n) {
    const ds = btn.querySelectorAll('.chk-dot');
    ds.forEach((d, i) => d.classList.toggle('on', i < n));
    if (n > lit) native.haptic('light');
    lit = n;
  }
  function wave(strength) {   // un'onda che parte dal cerchio: più tieni premuto, più sono fitte e ampie
    const w = document.createElement('i'); w.className = 'chk-wave';
    w.style.setProperty('--s', (1.8 + strength * 2.2).toFixed(2));
    btn.querySelector('.chk-orb').appendChild(w);
    setTimeout(() => w.remove(), 1100);
  }
  function loop() {
    const p = Math.min((performance.now() - t0) / HOLD, 1);
    btn.style.setProperty('--p', p.toFixed(3));
    lightDots(Math.floor(p * DOTS + 0.0001));
    const n = ctx.recipientsCount();
    if (p > 0.04) { hint.textContent = 'Avviso la cerchia…'; sub.textContent = `${Math.max(1, Math.round(p * n))} di ${n} ${n === 1 ? 'persona' : 'persone'}`; }
    if (performance.now() > waveT) { wave(p); waveT = performance.now() + (360 - p * 220); }
    if (p >= 1) { done(); return; }
    raf = requestAnimationFrame(loop);
  }
  function reset(anim = true) {
    holding = false; cancelAnimationFrame(raf);
    btn.classList.remove('hold');
    if (anim) btn.classList.add('back');
    btn.style.setProperty('--p', 0); lightDots(0); lit = 0;
    setTimeout(() => btn.classList.remove('back'), 450);
    idleText();
  }
  function done() {
    holding = false; cancelAnimationFrame(raf);
    btn.classList.remove('hold'); btn.classList.add('burst');
    native.haptic('heavy'); if (!ctx.quiet()) native.vibrate([60, 40, 60, 40, 120]);
    setTimeout(() => { btn.classList.remove('burst'); btn.style.setProperty('--p', 0); lightDots(0); lit = 0; idleText(); }, 900);
    compose();
  }
  btn.addEventListener('pointerdown', e => {
    if (sendingNow) return;
    e.preventDefault();
    if (mine()) return;                                   // appello già in corso: il tocco lo apre (click)
    if (!ctx.canCheck()) { toast('Prima aggiungi qualcuno alla cerchia'); return ctx.addPeople(); }
    holding = true; lit = 0; btn.classList.remove('back'); btn.classList.add('hold');
    native.haptic('light'); t0 = performance.now(); waveT = 0; raf = requestAnimationFrame(loop);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(v => btn.addEventListener(v, () => holding && reset()));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.addEventListener('click', () => { const c = mine(); if (c) openLive(c.id); });
  btn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !mine() && ctx.canCheck()) { e.preventDefault(); compose(); } });

  /* ================= motivo + conto alla rovescia ================= */
  let cdT = null;
  function compose() {
    let left = 5;
    ctx.openSheet(`<div class="chk-new">
      <div class="chk-cd"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><circle class="cd-p" cx="32" cy="32" r="28" pathLength="100"/></svg><b id="chk-cd-n">5</b></div>
      <h2>State tutti bene?</h2>
      <p class="sub">L'appello parte da solo tra pochi secondi e arriva a <b>${ctx.recipientsCount()} ${ctx.recipientsCount() === 1 ? 'persona' : 'persone'}</b>. Se vuoi, tocca il motivo: parte subito.</p>
      <div class="chk-reasons">${REASONS.map(([k, t]) => `<button data-a="chk-go" data-r="${k}">${esc(t)}</button>`).join('')}</div>
      <button class="btn chk-now" data-a="chk-go" data-r="altro">${I('send')}Invia adesso</button>
      <button class="btn ghost" data-a="chk-cancel">Annulla</button>
    </div>`, 'chk-new');
    clearInterval(cdT);
    cdT = setInterval(() => {
      if (ctx.curSheet() !== 'chk-new') { clearInterval(cdT); return; }
      left--; const n = $('#chk-cd-n'); if (n) n.textContent = Math.max(0, left);
      if (left <= 0) { clearInterval(cdT); send('altro'); }
    }, 1000);
  }

  async function send(reason) {
    clearInterval(cdT);
    if (sendingNow) return; sendingNow = true;
    ctx.closeSheet();
    const id = 'chk' + rid().slice(0, 24);
    openId = id; renderLive(true);
    try {
      const p = await pos();
      const r = await api.call('sendCheck', { id, reason, lat: p?.lat ?? null, lng: p?.lng ?? null });
      toast(`Appello inviato a ${r.recipients} ${r.recipients === 1 ? 'persona' : 'persone'}`);
      if (!ctx.quiet()) native.vibrate([80, 60, 80]);
    } catch (e) {
      closeLive();
      dialog({ title: 'Appello non inviato', text: errMsg(e) + ' Se c\'è un pericolo chiama il 112.', ok: 'OK', cancel: 'Chiudi' });
    } finally { sendingNow = false; }
  }

  /* ================= schermata dal vivo ================= */
  const ov = document.createElement('div'); ov.className = 'chk-ov'; ov.id = 'ov-chk'; ($('#app') || document.body).appendChild(ov);
  const inOv = document.createElement('div'); inOv.className = 'chk-in'; inOv.id = 'ov-chkin'; ($('#app') || document.body).appendChild(inOv);

  function openLive(id) { openId = id; closeIncoming(); renderLive(true); }
  function closeLive() {
    openId = null; ov.classList.remove('on'); clearInterval(tick); tick = null;
    try { mapApi?.destroy(); } catch {} mapApi = null; mapLoading = null;
  }
  function donut(s) {
    const C = 2 * Math.PI * 52, tot = Math.max(1, s.tot);
    const okL = C * s.ok / tot, hL = C * s.help / tot;
    return `<svg class="chk-donut" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" class="d-bg"/>
      <circle cx="60" cy="60" r="52" class="d-ok" style="stroke-dasharray:${okL} ${C};stroke-dashoffset:0;opacity:${okL ? 1 : 0}"/>
      <circle cx="60" cy="60" r="52" class="d-help" style="stroke-dasharray:${hL} ${C};stroke-dashoffset:${-okL};opacity:${hL ? 1 : 0}"/>
    </svg>`;
  }
  function people(c) {
    const me = uid(), owner = c.from === me, out = [];
    const ans = c.answers || {};
    const ids = owner ? c.recipients : [c.from, ...Object.keys(ans).filter(u => u !== c.from)];
    for (const u of new Set(ids)) {
      const a = ans[u];
      out.push({ uid: u, name: a?.name || ctx.nameOf(u) || (u === c.from ? c.fromName : 'Contatto'), a, owner: u === c.from });
    }
    if (!owner && !out.some(x => x.uid === me)) out.push({ uid: me, name: ctx.myName(), a: ans[me], owner: false });
    const rank = x => x.a?.status === 'help' ? 0 : !x.a ? 1 : 2;
    return out.sort((a, b) => rank(a) - rank(b) || (b.a?.at || 0) - (a.a?.at || 0));
  }
  function row(c, x, myPos) {
    const st = x.a?.status, d = x.a?.lat != null && x.uid !== uid() ? fmtD(dist(myPos, x.a)) : '';
    const tag = st === 'help' ? `<span class="chk-tag help">${I('alert')}Chiede aiuto</span>` : st === 'ok' ? `<span class="chk-tag ok">${I('check')}Sta bene</span>` : `<span class="chk-tag wait"><i></i>In attesa</span>`;
    const meta = [x.uid === uid() ? 'Tu' : x.owner ? 'Ha lanciato l\'appello' : '', x.a ? hhmm(x.a.at) : '', d ? d + ' da te' : ''].filter(Boolean).join(' · ');
    const chat = ctx.chatWith(x.uid);
    return `<div class="ap-row ${st || 'wait'}" style="--i:${x.i}">
      ${AV(x.name, null, 'sm', x.uid)}
      <div class="fl"><b>${esc(x.name)}</b><span>${esc(meta)}</span>${x.a?.note ? `<span class="chk-note" translate="no">«${esc(x.a.note)}»</span>` : ''}</div>
      <div class="chk-acts">${tag}
        <div class="chk-mini">${x.a?.lat != null && x.uid !== uid() ? `<button class="iconbtn sm" data-a="chk-nav" data-u="${x.uid}" aria-label="Indicazioni per ${esc(x.name)}">${I('send')}</button>` : ''}${chat && x.uid !== uid() ? `<button class="iconbtn sm" data-a="chk-chat" data-c="${chat}" aria-label="Scrivi a ${esc(x.name)}">${I('chat')}</button>` : ''}</div>
      </div></div>`;
  }
  function renderLive(open) {
    const c = byId(openId);
    if (open) { ov.classList.add('on'); clearInterval(tick); tick = setInterval(() => openId && renderLive(), 30000); }
    if (!ov.classList.contains('on')) return;
    if (!c) {   // appena lanciato: aspetto che arrivi dal server
      ov.innerHTML = `<div class="chk-top"><button class="iconbtn" data-a="chk-back" aria-label="Chiudi">${I('back')}</button></div>
        <div class="chk-sending"><div class="chk-orb big"><span class="chk-halo"></span>${Array.from({ length: DOTS }, (_, i) => `<i class="chk-dot on" style="--k:${i}"></i>`).join('')}${I('people')}</div><h2>Invio l'appello…</h2><p>Sto avvisando tutta la tua cerchia</p></div>`;
      return;
    }
    const s = stats(c), owner = c.from === uid(), my = c.answers?.[uid()]?.status, myPos = ctx.myPos();
    const ps = people(c).map((x, i) => ({ ...x, i }));
    const helps = ps.filter(x => x.a?.status === 'help' && x.uid !== uid());
    const hidden = owner ? 0 : Math.max(0, s.tot - ps.filter(x => x.uid !== c.from).length);
    const firstRender = !ov.querySelector('.chk-live') || ov.dataset.id !== c.id;
    ov.dataset.id = c.id;
    const body = `
      <div class="chk-top"><button class="iconbtn" data-a="chk-back" aria-label="Chiudi">${I('back')}</button>
        <div class="fl"><span class="chk-k">${c.active ? '<i class="dot"></i>' : ''}Appello · ${esc(RN[c.reason] || 'Altro')}</span><b>${owner ? 'State tutti bene?' : `${esc(first(c.fromName))} chiede: state bene?`}</b></div>
        <span class="chk-time">${esc(ago(c.at))}</span></div>
      <div class="chk-hero">
        <div class="chk-donut-w">${donut(s)}<div class="chk-dc"><b>${s.ok + s.help}<small>/${s.tot}</small></b><span>risposte</span></div></div>
        <div class="chk-stats">
          <div class="cs ok"><b>${s.ok}</b><span>${s.ok === 1 ? 'sta bene' : 'stanno bene'}</span></div>
          <div class="cs help"><b>${s.help}</b><span>${s.help === 1 ? 'chiede aiuto' : 'chiedono aiuto'}</span></div>
          <div class="cs wait"><b>${s.wait}</b><span>in attesa</span></div>
        </div>
      </div>
      ${c.note ? `<p class="chk-quote"><span translate="no">«${esc(c.note)}»</span><span>— ${esc(first(c.fromName))}</span></p>` : ''}
      ${helps.length ? `<div class="chk-alert">${I('alert')}<div class="fl"><b>${helps.map(x => esc(first(x.name))).join(', ')} ${helps.length === 1 ? 'ha' : 'hanno'} bisogno di aiuto</b><span>Chiama, scrivi o raggiungi: la posizione è sulla mappa.</span></div></div>` : ''}
      <div class="chk-map" id="chk-map"><span class="chk-map-e">${I('pin')}Le posizioni compaiono quando le persone rispondono</span></div>
      <div class="chk-my">
        <span class="chk-lbl">${owner ? 'Come stai tu' : 'La tua risposta'}</span>
        <div class="chk-ans">
          <button class="ans ok${my === 'ok' ? ' on' : ''}" data-a="chk-ans" data-s="ok">${I('check')}Sto bene</button>
          <button class="ans help${my === 'help' ? ' on' : ''}" data-a="chk-ans" data-s="help">${I('alert')}Ho bisogno</button>
        </div>
      </div>
      <div class="chk-list-h"><b>Persone</b><span>${owner ? `${s.tot} nella cerchia` : 'Vedi solo chi conosci'}</span></div>
      <div class="chk-list">${ps.map(x => row(c, x, myPos)).join('')}
        ${hidden ? `<div class="ap-row more"><div class="av sm more-av">+${hidden}</div><div class="fl"><b>Altre ${hidden} ${hidden === 1 ? 'persona' : 'persone'}</b><span>Della cerchia di ${esc(first(c.fromName))}: le vede solo ${esc(first(c.fromName))}</span></div></div>` : ''}
      </div>
      ${owner && c.active ? `<div class="chk-own">
        <button class="btn" data-a="chk-remind" ${s.wait ? '' : 'disabled'}>${I('bell')}${s.wait ? `Sollecita chi non ha risposto (${s.wait})` : 'Hanno risposto tutti'}</button>
        <button class="btn ghost" data-a="chk-end">Chiudi l'appello</button></div>` : ''}
      ${!c.active ? '<p class="chk-closed">Appello chiuso</p>' : ''}`;
    const scrollTop = ov.querySelector('.chk-live')?.scrollTop || 0;
    ov.innerHTML = `<div class="chk-live${firstRender ? ' enter' : ''}">${body}</div>`;
    ov.querySelector('.chk-live').scrollTop = scrollTop;
    drawMap(c, ps);
  }
  async function drawMap(c, ps) {
    const pts = ps.filter(x => x.a?.lat != null).map(x => ({
      id: x.uid, name: x.name, ini: String(x.name).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(),
      lat: x.a.lat, lng: x.a.lng, label: x.uid === uid() ? 'Tu' : first(x.name), cls: x.a.status === 'help' ? 'help' : 'ok', img: ctx.avatar(x.uid)
    }));
    const el = $('#chk-map'); if (!el) return;
    if (!pts.length) { try { mapApi?.destroy(); } catch {} mapApi = null; mapLoading = null; return; }
    const set = () => { try { mapApi.setData({ me: ctx.myPos(), people: pts }); } catch {} };
    if (mapApi && mapApi._el === el) return set();
    try { mapApi?.destroy(); } catch {} mapApi = null;
    const go = (mapLoading = import('./map.js').then(m => m.createMap(el, { onPick: u => document.querySelector(`.ap-row [data-u="${u}"]`)?.closest('.ap-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) })));
    try { const m = await go; if (mapLoading !== go || !el.isConnected) { m.destroy(); return; } mapApi = m; mapApi._el = el; el.classList.add('ready'); set(); }
    catch { el.classList.add('off'); }
  }

  /* ================= appello ricevuto ================= */
  function showIncoming(c) {
    ctx.wake();
    inOv.dataset.id = c.id;
    inOv.innerHTML = `<div class="chkin-bg"><i></i><i></i><i></i></div>
      <div class="chkin-top"><button class="iconbtn" data-a="chk-later" aria-label="Rispondi dopo">${I('x')}</button></div>
      <div class="chkin-head">
        <div class="chk-orb big">${Array.from({ length: DOTS }, (_, i) => `<i class="chk-dot on" style="--k:${i}"></i>`).join('')}${AV(c.fromName, null, 'chkin-av', c.from)}</div>
        <span class="chk-k">Appello · ${esc(RN[c.reason] || 'Altro')}</span>
        <h1>${esc(first(c.fromName))} chiede:<br>state tutti bene?</h1>
        ${c.note ? `<p class="chkin-note" translate="no">«${esc(c.note)}»</p>` : ''}
        <p class="chkin-when">${esc(ago(c.at))} · ${esc(hhmm(c.at))}</p>
      </div>
      <div class="chkin-acts">
        <button class="chkin-b ok" data-a="chk-ans" data-s="ok" data-id="${c.id}">${I('check')}<span><b>Sto bene</b><small>Lo sapranno ${esc(first(c.fromName))} e chi ti conosce</small></span></button>
        <button class="chkin-b help" data-a="chk-ans" data-s="help" data-id="${c.id}">${I('alert')}<span><b>Ho bisogno di aiuto</b><small>Invii la tua posizione a chi ti conosce</small></span></button>
        <button class="btn ghost" data-a="chk-later">Rispondi dopo</button>
      </div>`;
    inOv.classList.remove('on'); void inOv.offsetWidth; inOv.classList.add('on');
    if (!ctx.quiet()) native.vibrate([300, 150, 300, 150, 600]);
  }
  function closeIncoming() { inOv.classList.remove('on'); }
  function checkIncoming() {
    if (inOv.classList.contains('on')) {
      const c = byId(inOv.dataset.id);
      if (!c || !c.active || c.answers?.[uid()]) closeIncoming();
      return;
    }
    if (ctx.busy()) return;
    const c = pending().sort((a, b) => b.at - a.at)[0];
    if (c) showIncoming(c);
  }

  async function answer(id, status, el) {
    const c = byId(id); if (!c) return;
    if (status === 'help' && c.answers?.[uid()]?.status !== 'help') {
      const ok = await dialog({ title: 'Chiedi aiuto?', text: `${c.from === uid() ? 'La tua cerchia' : first(c.fromName) + ' e chi ti conosce'} riceverà la notifica «ha bisogno di aiuto» con la tua posizione.`, ok: 'Chiedi aiuto', cancel: 'Annulla', danger: true });
      if (!ok) return;
    }
    el?.classList.add('busy');
    const fromIn = inOv.classList.contains('on');
    try {
      const p = await pos();
      await api.call('answerCheck', { id, status, lat: p?.lat ?? null, lng: p?.lng ?? null, acc: p?.acc ?? null });
      native.haptic(status === 'ok' ? 'medium' : 'heavy');
      if (fromIn) { closeIncoming(); openLive(id); }
      toast(status === 'ok' ? 'Risposta inviata: stai bene' : 'Richiesta di aiuto inviata con la tua posizione');
      if (status === 'help') {
        const sos = await dialog({ title: 'Vuoi mandare anche l\'SOS?', text: 'L\'SOS avvisa subito tutta la tua cerchia con posizione live, foto e audio.', ok: 'Manda l\'SOS', cancel: 'Non ora', danger: true });
        if (sos) ctx.sos();
      }
    } catch (e) { toast(errMsg(e)); }
    finally { el?.classList.remove('busy'); }
  }

  /* ================= azioni ================= */
  async function handle(a, t) {
    switch (a) {
      case 'chk-go': send(t.dataset.r || 'altro'); return true;
      case 'chk-cancel': clearInterval(cdT); ctx.closeSheet(); toast('Appello annullato'); return true;
      case 'chk-back': closeLive(); return true;
      case 'chk-open': openLive(t.dataset.id); return true;
      case 'chk-ans': answer(t.dataset.id || openId, t.dataset.s, t); return true;
      case 'chk-later': { const id = inOv.dataset.id; dismissed.add(id); closeIncoming(); toast('Puoi rispondere dalla Home quando vuoi'); ctx.refresh(); return true; }
      case 'chk-reply': { const c = byId(t.dataset.id); if (c) { dismissed.delete(c.id); showIncoming(c); } return true; }
      case 'chk-nav': { const c = byId(openId), x = c?.answers?.[t.dataset.u]; if (x?.lat != null) native.openMaps(x.lat, x.lng, x.name, true); return true; }
      case 'chk-chat': closeLive(); ctx.openChat(t.dataset.c); return true;
      case 'chk-remind': {
        t.classList.add('busy');
        try { const r = await api.call('remindCheck', { id: openId }); toast(r.waiting ? `Sollecito inviato a ${r.waiting} ${r.waiting === 1 ? 'persona' : 'persone'}` : 'Hanno già risposto tutti'); }
        catch (e) { toast(errMsg(e)); } finally { t.classList.remove('busy'); }
        return true;
      }
      case 'chk-end': {
        const ok = await dialog({ title: 'Chiudere l\'appello?', text: 'Nessuno potrà più rispondere. Le risposte arrivate restano visibili per qualche ora.', ok: 'Chiudi appello', cancel: 'Annulla' });
        if (!ok) return true;
        try { await api.call('closeCheck', { id: openId }); toast('Appello chiuso'); closeLive(); } catch (e) { toast(errMsg(e)); }
        return true;
      }
    }
    return false;
  }

  // striscia in Home: appelli ricevuti (da rispondere o in corso)
  function renderBar() {
    const el = $('#chk-bar'); if (!el) return;
    const items = list.filter(c => c.active && c.from !== uid()).sort((a, b) => b.at - a.at);
    el.hidden = !items.length;
    el.innerHTML = items.map(c => {
      const s = stats(c), answered = !!c.answers?.[uid()];
      return answered
        ? `<button class="chk-strip" data-a="chk-open" data-id="${c.id}">${AV(c.fromName, null, 'sm', c.from)}<div class="fl"><b>Appello di ${esc(first(c.fromName))}</b><span>${s.ok + s.help} su ${s.tot} hanno risposto${s.help ? ` · ${s.help} chiede aiuto` : ''}</span></div>${I('chev', 'chev')}</button>`
        : `<button class="chk-strip ask" data-a="chk-reply" data-id="${c.id}">${AV(c.fromName, null, 'sm', c.from)}<div class="fl"><b>${esc(first(c.fromName))} chiede se stai bene</b><span>Appello · ${esc(RN[c.reason] || 'Altro')} · ${esc(ago(c.at))}</span></div><span class="pill">Rispondi</span></button>`;
    }).join('');
  }

  return {
    set(l) {
      const was = new Set(list.map(c => c.id));
      list = (l || []).filter(c => Date.now() - c.at < 24 * 36e5);
      idleText(); renderBar();
      if (openId) { if (byId(openId) || sendingNow || !was.has(openId)) renderLive(); else closeLive(); }
      checkIncoming();
    },
    refresh() { idleText(); renderBar(); },
    checkIncoming,
    handle,
    open(id) { const c = byId(id); if (!c) return false; if (c.from !== uid() && !c.answers?.[uid()]) { dismissed.delete(id); showIncoming(c); } else openLive(id); return true; },
    back() {
      if (inOv.classList.contains('on')) { dismissed.add(inOv.dataset.id); closeIncoming(); return true; }
      if (ov.classList.contains('on')) { closeLive(); return true; }
      return false;
    },
    reset() { list = []; dismissed.clear(); closeLive(); closeIncoming(); idleText(); renderBar(); }
  };
}
