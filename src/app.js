// Vicina – interfaccia. Non importa nulla da npm: riceve "api" (server) e "native" (telefono) da main.js / demo.js.
export function boot(api, native) {
  /* ================= utilità ================= */
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const I = (n, c = '') => `<svg class="i ${c}"><use href="#i-${n}"/></svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COL = ['#FF7A59', '#9C8CFF', '#4DA3FF', '#2FD27A', '#FF5C8A', '#FFB547', '#3DD6D0'];
  const col = n => COL[[...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) % COL.length];
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const AV = (n, k, cls = '') => k === 'g'
    ? `<div class="av ${cls}" style="background:linear-gradient(145deg,#9C8CFF,#5B4BD6)">${I('group')}</div>`
    : `<div class="av ${cls}" style="background:${col(n)}">${esc(initials(n))}</div>`;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const hhmm = ms => ms ? new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
  const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'adesso' : m < 60 ? `${m} min fa` : `${Math.floor(m / 60)} h fa`; };
  const when = ms => { if (!ms) return ''; const d = new Date(ms), n = new Date(); return d.toDateString() === n.toDateString() ? hhmm(ms) : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }); };

  let tt; const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('on'), 2800); };
  const errMsg = e => {
    const c = e?.code || '';
    if (/unavailable|network/.test(c)) return 'Sei offline. Controlla la connessione.';
    if (/failed-precondition|unauthenticated|permission|not-found|invalid-argument|resource-exhausted/.test(c) && e.message) return e.message;
    return e?.message && !/internal/i.test(e.message) ? e.message : 'Qualcosa non ha funzionato. Riprova.';
  };
  const AE = { 'auth/invalid-credential': 'Email o password non corrette', 'auth/wrong-password': 'Email o password non corrette', 'auth/user-not-found': 'Email o password non corrette', 'auth/email-already-in-use': 'Esiste già un account con questa email: accedi', 'auth/weak-password': 'Password troppo debole (minimo 8 caratteri)', 'auth/invalid-email': 'Email non valida', 'auth/network-request-failed': 'Sei offline. Controlla la connessione.', 'auth/too-many-requests': 'Troppi tentativi, riprova tra qualche minuto', 'auth/email-not-confirmed': 'Conferma prima la tua email: controlla la posta (anche lo spam)', 'auth/otp-expired': 'Codice non valido o scaduto', 'auth/same-password': 'Scegli una password diversa da quella vecchia', 'auth/signup-disabled': 'Le registrazioni sono disattivate sul server (Supabase → Authentication → abilita "Allow new users to sign up")', 'auth/email-provider-disabled': 'Accesso con email disattivato sul server (Supabase → Authentication → Providers → Email)', 'auth/bad-key': 'Chiave Supabase non valida: controlla i secrets VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY su GitHub', 'auth/db-error': 'Errore del database durante la registrazione: riesegui installa.sql su Supabase' };
  async function busy(btn, fn) { if (btn) btn.classList.add('busy'); try { return await fn(); } finally { if (btn) btn.classList.remove('busy'); } }

  /* ================= stato ================= */
  const st = {
    uid: null, email: '', p: null, links: [], groups: [], muted: [], threads: {}, sosIn: [], sosMine: null,
    tab: 'home', open: null, setup: 1, authMode: 'up', dismissed: new Set(), shownIn: null
  };
  let unwatch = null, chatUn = {}, curSheet = null, linksLoaded = false;
  const seen = JSON.parse(ls.get('seenChats') || '{}');
  const prefs = Object.assign({ live: true, voice: true }, (() => { try { return JSON.parse(ls.get('prefs') || '{}'); } catch { return {}; } })());
  const savePrefs = () => ls.set('prefs', JSON.stringify(prefs));
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const GG = { f: { sola: 'sola', prot: 'protetta', amico: "un'amica", amicoS: 'Amica', pronta: 'pronta' }, m: { sola: 'solo', prot: 'protetto', amico: 'un amico', amicoS: 'Amico', pronta: 'pronto' } };
  const G = () => GG[st.p?.gender] || GG.f;

  const partner = () => { const l = st.links.find(l => l.kind === 'partner'); return l && { id: l.id, uid: l.other, name: l.otherName, k: 'p', sub: 'Partner' }; };
  const friends = () => st.links.filter(l => l.kind !== 'partner').map(l => ({ id: l.id, uid: l.other, name: l.otherName, k: 'f', sub: G().amicoS }));
  const groups = () => st.groups.map(g => ({ ...g, k: 'g', on: !st.muted.includes(g.id), sub: `${g.members.length}/8 persone` }));
  const convs = () => [...(partner() ? [partner()] : []), ...friends(), ...groups()];
  const recipients = () => {
    const s = new Set(); st.links.forEach(l => s.add(l.other));
    groups().forEach(g => g.on && g.members.forEach(m => m.uid !== st.uid && s.add(m.uid)));
    return s;
  };
  const unread = id => (st.threads[id] || []).filter(m => m.from !== st.uid && m.at > (seen[id] || 0)).length;

  /* ================= intro animata a ogni avvio ================= */
  // Verticale (9:16) su telefono, orizzontale (16:9) su tablet/PC. Muta per discrezione.
  // Si salta toccando lo schermo, e da sola se arriva o è attivo un SOS: in emergenza non deve far perdere tempo.
  const intro = (() => {
    const box = $('#intro'), v = $('#intro-video');
    let finished = false;
    const done = fast => {
      if (finished || !box) return; finished = true;
      native.hideSplash();
      try { v.pause(); } catch {}
      box.classList.add(fast ? 'out-fast' : 'out');
      document.body.classList.add('entering');
      setTimeout(() => { box.remove(); document.body.classList.remove('entering'); }, 1300);
    };
    if (!box) { native.hideSplash(); return { done() {} }; }
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { box.remove(); native.hideSplash(); return { done() {} }; }
    const base = 'intro/' + (window.innerHeight >= window.innerWidth ? 'intro-9x16' : 'intro-16x9');
    v.innerHTML = `<source src="${base}.mp4" type="video/mp4"><source src="${base}.webm" type="video/webm">`;
    v.lastElementChild.addEventListener('error', () => done(true));
    v.addEventListener('error', () => done(true));
    v.addEventListener('playing', () => native.hideSplash(), { once: true });
    v.addEventListener('ended', () => done(false));
    box.addEventListener('click', () => done(true));
    v.load();
    const pl = v.play(); if (pl && pl.catch) pl.catch(() => done(true));
    setTimeout(() => { if (v.readyState < 2) done(true); }, 2500);   // non parte: si entra subito
    setTimeout(() => done(false), 8000);                              // limite massimo
    return { done };
  })();

  /* ================= navigazione ================= */
  const TABS = { home: 's-home', map: 's-map', chat: 's-chat', circle: 's-circle', me: 's-me' };
  // Transizioni: le schede scorrono di lato nell'ordine della barra, le schermate interne entrano da destra ed escono a sinistra.
  const ORDER = ['s-home', 's-map', 's-chat', 's-circle', 's-me'];
  let curScreen = 's-load';
  function show(id, how) {
    const prev = curScreen; curScreen = id;
    $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
    $('#nav').hidden = !$('#' + id).classList.contains('tabbed') && id !== 's-active';
    $$('#nav button').forEach(b => b.classList.toggle('on', TABS[b.dataset.tab] === id || (id === 's-active' && b.dataset.tab === 'home')));
    if (reduceMotion || prev === id) return;
    const pa = ORDER.indexOf(prev === 's-active' ? 's-home' : prev), pb = ORDER.indexOf(id === 's-active' ? 's-home' : id);
    const cls = how || (pa >= 0 && pb >= 0 ? (pb > pa ? 'in-r' : pb < pa ? 'in-l' : 'in-f') : 'in-f');
    const el = $('#' + id); el.classList.remove('in-r', 'in-l', 'in-f', 'in-push', 'in-pop', 'in-up');
    void el.offsetWidth; el.classList.add(cls);
  }
  function tab(t, how) {
    st.tab = t; st.open = null;
    if (t === 'home' && st.sosMine) { rActive(); return show('s-active', how); }
    show(TABS[t], how); render();
    if (t === 'map') openMapTab(); else closeMapTab();
  }
  const render = () => { rHome(); rChats(); rCircle(); rMe(); rBadge(); if (st.sosMine) rActive(); };

  /* ================= benvenuto & accesso ================= */
  function authMode(m) {
    st.authMode = m; const up = m === 'up';
    $$('#auth-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('#auth-title').textContent = up ? 'Crea il tuo account' : 'Accedi a Vicina';
    $('#auth-sub').textContent = up ? 'Serve per collegarti alle persone della tua cerchia.' : 'Accedi con la tua email.';
    $('#auth-go').textContent = up ? 'Crea account' : 'Accedi';
    $('#auth-reset').hidden = up;
    $('#pwd').autocomplete = up ? 'new-password' : 'current-password';
    $('#pwd').placeholder = up ? 'Almeno 8 caratteri' : 'Password';
  }
  $$('#auth-seg button').forEach(b => b.onclick = () => authMode(b.dataset.mode));
  $('#pwd').onkeydown = e => { if (e.key === 'Enter') $('#auth-go').click(); };

  async function doAuth(btn) {
    const em = $('#email').value.trim(), pw = $('#pwd').value;
    if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Inserisci un\'email valida');
    if (st.authMode === 'up' && pw.length < 8) return toast('La password deve avere almeno 8 caratteri');
    if (!pw) return toast('Inserisci la password');
    await busy(btn, async () => {
      try {
        if (st.authMode === 'up') {
          const r = await api.signUp(em, pw);
          if (r?.needsConfirm) { authMode('in'); toast('Ti abbiamo inviato un\'email: conferma l\'indirizzo e poi accedi'); }
        } else await api.signIn(em, pw);
      }
      catch (e) { console.warn('auth', e); toast(AE[e.code] || ('Accesso non riuscito: ' + (e.message || e.code || 'errore sconosciuto'))); }
    });
  }

  /* ================= configurazione guidata ================= */
  let draft = { gender: null };
  function setup(n) {
    st.setup = n; show('s-setup');
    $('#setup-bar').style.width = (n / 3 * 100) + '%'; $('#setup-n').textContent = n + '/3';
    const B = $('#setup-body'), F = $('#setup-foot');
    if (n === 1) {
      B.innerHTML = `<h1 class="title">Come ti chiami?</h1><p class="sub">Le persone della tua cerchia ti riconosceranno così.</p>
        <div class="field2"><label class="field"><span>Nome</span><input id="pn" autocomplete="given-name" maxlength="40" value="${esc(draft.name)}"></label>
        <label class="field"><span>Cognome</span><input id="ps" autocomplete="family-name" maxlength="40" value="${esc(draft.surname)}"></label></div>
        <label class="field"><span>Data di nascita</span><input id="pd" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${esc(draft.dob)}"></label>
        <div class="field"><span>Sesso</span><div class="choice" id="pg"><button data-g="f" class="${draft.gender === 'f' ? 'on' : ''}">Donna</button><button data-g="m" class="${draft.gender === 'm' ? 'on' : ''}">Uomo</button></div></div>
        <label class="field"><span>Telefono (facoltativo)</span><input id="pp" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="+39 333 123 4567" value="${esc(draft.phone)}"></label>
        <p class="note">Il numero lo vede solo chi riceve un tuo SOS, per poterti chiamare subito.</p>`;
      F.innerHTML = `<button class="btn" id="p-next" data-a="setup-profile" disabled>Continua</button>`;
      const chk = () => $('#p-next').disabled = !($('#pn').value.trim() && $('#ps').value.trim() && $('#pd').value && draft.gender);
      $$('#pg button').forEach(b => b.onclick = () => { draft.gender = b.dataset.g; $$('#pg button').forEach(x => x.classList.toggle('on', x === b)); chk(); });
      ['#pn', '#ps', '#pd'].forEach(s => $(s).addEventListener('input', chk)); chk();
    } else if (n === 2) {
      B.innerHTML = `<h1 class="title">Permessi, una volta sola</h1><p class="sub">Così durante un SOS non compare nessuna richiesta e parte tutto subito.</p>
        <div class="card" style="margin-top:24px">${permRows()}</div>
        <p class="note">Puoi cambiarli quando vuoi dalle impostazioni del telefono.</p>`;
      F.innerHTML = `<button class="btn" data-a="setup-perms">Consenti</button><button class="btn link" data-a="setup-skip-perms">Più tardi</button>`;
    } else {
      B.innerHTML = `<h1 class="title">Chi vuoi avvisare?</h1><p class="sub">Aggiungi almeno una persona: è a lei che arriverà il tuo SOS.</p>
        ${addOptions()}`;
      F.innerHTML = `<button class="btn ${recipients().size ? '' : 'ghost'}" data-a="setup-done">${recipients().size ? 'Tutto pronto' : 'Lo faccio dopo'}</button>`;
    }
  }
  let perm = { loc: 'prompt', cam: 'prompt', push: 'prompt', mic: 'prompt' };
  const permIcon = s => s === 'granted' ? `<span class="tag green">Attivo</span>` : s === 'denied' ? `<span class="tag red">Negato</span>` : `<span class="tag">Da attivare</span>`;
  const permRows = () => `
    <div class="row"><i class="ic-dot blue">${I('pin')}</i><div class="fl wrap"><b>Posizione</b><span>Solo mentre usi l'app</span></div>${permIcon(perm.loc)}</div>
    <div class="row"><i class="ic-dot violet">${I('camera')}</i><div class="fl wrap"><b>Fotocamera</b><span>Due foto durante l'SOS</span></div>${permIcon(perm.cam)}</div>
    <div class="row"><i class="ic-dot red">${I('bell')}</i><div class="fl wrap"><b>Notifiche</b><span>Per ricevere gli SOS degli altri</span></div>${permIcon(perm.push)}</div>
    <div class="row"><i class="ic-dot amber">${I('mic')}</i><div class="fl wrap"><b>Microfono</b><span>Facoltativo: messaggio vocale nell'SOS</span></div>${permIcon(perm.mic)}</div>`;
  async function refreshPerms() { try { perm = await native.permState(); } catch {} }

  /* ================= home ================= */
  function rHome() {
    if (!st.p) return;
    const d = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#h-date').textContent = d; $('#h-name').textContent = 'Ciao, ' + st.p.name;
    $('#h-av').innerHTML = AV(st.p.name + ' ' + st.p.surname);
    const r = recipients(), n = r.size, people = convs().filter(c => c.k !== 'g' || c.on);
    const s = $('#h-status');
    s.classList.toggle('warn', !n);
    s.innerHTML = n
      ? `<div class="stack">${people.slice(0, 3).map(p => AV(p.name, p.k)).join('')}</div><div class="fl"><b>Sei ${G().prot}</b><span>L'SOS arriva a ${n} ${n === 1 ? 'persona' : 'persone'}</span></div>${I('chev', 'chev')}`
      : `<i class="ic-dot amber">${I('alert')}</i><div class="fl"><b>Nessuno da avvisare</b><span>Aggiungi ${G().amico}, il partner o un gruppo</span></div>${I('chev', 'chev')}`;
    $('#sos-wrap').classList.toggle('off', !n);
    $('#sos-hint').textContent = n ? 'tieni premuto' : 'nessun contatto';
    $('#h-hint').textContent = n ? 'Posizione e due foto arrivano a tutta la tua cerchia.' : 'Prima aggiungi almeno una persona di cui ti fidi.';
  }

  /* ================= SOS: pressione prolungata ================= */
  const C = 766.5, HOLD = 1500; let raf, t0 = 0, holding = false, sending = false;
  const sos = $('#sos'), prog = $('#prog');
  const resetHold = () => { holding = false; cancelAnimationFrame(raf); sos.classList.remove('hold'); prog.style.transition = 'stroke-dashoffset .25s'; prog.style.strokeDashoffset = C; };
  function holdLoop() {
    const p = Math.min((performance.now() - t0) / HOLD, 1); prog.style.strokeDashoffset = C * (1 - p);
    if (p >= 1) { resetHold(); native.haptic('heavy'); trigger(); } else raf = requestAnimationFrame(holdLoop);
  }
  sos.addEventListener('pointerdown', e => {
    if (sending) return; e.preventDefault();
    if (!recipients().size) { toast('Prima aggiungi qualcuno da avvisare'); return sheetAdd(); }
    holding = true; native.haptic('light'); sos.classList.add('hold'); prog.style.transition = 'none'; t0 = performance.now(); raf = requestAnimationFrame(holdLoop);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(v => sos.addEventListener(v, () => holding && resetHold()));
  sos.addEventListener('contextmenu', e => e.preventDefault());
  sos.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && recipients().size) { e.preventDefault(); trigger(); } });

  const stp = (n, c) => $('#st' + n).className = 'step ' + c;
  const rid = () => (crypto.randomUUID?.() || Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')).replace(/-/g, '');
  async function trigger() {
    if (sending) return;
    sending = true; let cancelled = false;
    const cancel = $('#send-cancel'); cancel.hidden = false; cancel.onclick = () => { cancelled = true; };
    [1, 2, 3, 4].forEach(n => stp(n, '')); $('#ov-send').classList.add('on');
    const sosId = rid(), end = () => { sending = false; $('#ov-send').classList.remove('on'); };
    try {
      stp(1, 'run'); const pos = await native.getPos(); if (cancelled) { end(); return toast('SOS annullato'); }
      stp(1, pos ? 'done' : 'fail');
      stp(2, 'run'); cancel.hidden = true;
      const res = await api.call('sendSos', { sosId, lat: pos?.lat ?? null, lng: pos?.lng ?? null, acc: pos?.acc ?? null, live: true });
      if (res.liveUntil) startLive(sosId, res.liveUntil);
      stp(2, 'done'); native.vibrate([80, 60, 80]);
      for (const [n, facing, file] of [[3, 'environment', 'back'], [4, 'user', 'front']]) {
        stp(n, 'run'); const img = await native.snap(facing);
        if (img) {
          $('#flash').classList.add('go');
          const path = `sos/${st.uid}/${sosId}/${file}.jpg`;
          try { await api.uploadPhoto(path, img); await api.call('attachSosPhotos', { sosId, paths: [path] }); stp(n, 'done'); }
          catch (e) { console.warn('foto', e); stp(n, 'fail'); }
          await wait(300); $('#flash').classList.remove('go');
        } else stp(n, 'fail');
      }
      await wait(400); end();
      toast(`SOS inviato a ${res.recipients} ${res.recipients === 1 ? 'persona' : 'persone'}`);
      tab('home');
    } catch (e) {
      end(); console.warn(e);
      dialog({ title: 'Invio non riuscito', text: errMsg(e) + ' Se sei in pericolo chiama subito il 112.', ok: 'Chiama 112', cancel: 'Chiudi' }).then(ok => ok && (location.href = 'tel:112'));
    }
  }

  /* ================= SOS attivo (mio) ================= */
  let activeTimer;
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  function rActive() {
    const s = st.sosMine; if (!s) return;
    const n = s.recipients.length, acks = Object.values(s.acks || {});
    const liveOn = live.sosId === s.id && live.until > Date.now();
    $('#a-since').textContent = `Inviato ${ago(s.at)} a ${n} ${n === 1 ? 'persona' : 'persone'}`;
    $('#a-info').innerHTML = `
      <div class="chip-st ${acks.length ? 'ok' : ''}">${I(acks.length ? 'check' : 'clock')}<span>${acks.length ? 'Visto da ' + esc(acks.map(x => x.split(' ')[0]).join(', ')) : 'In attesa di risposta'}</span></div>
      ${liveOn ? `<div class="chip-st live"><i class="dot"></i><span>Posizione live attiva · <b id="a-live-left">${liveAge(s)}</b><small>Resta attiva finché non tocchi «Sono al sicuro»</small></span></div>`
        : `<div class="chip-st">${I('pin')}<span>${s.lat != null ? 'Posizione inviata · attivo la posizione live…' : 'Posizione non disponibile: controlla il GPS'}</span></div>`}
      <div class="chip-st">${I('camera')}<span>${s.photos.length}/2 foto</span></div>`;
    rVoice(s);
    clearInterval(activeTimer); activeTimer = setInterval(() => {
      if (!st.sosMine) return clearInterval(activeTimer);
      const l = $('#a-live-left'); if (l) l.textContent = liveAge(st.sosMine);
      $('#a-since').textContent = `Inviato ${ago(st.sosMine.at)} a ${st.sosMine.recipients.length} ${st.sosMine.recipients.length === 1 ? 'persona' : 'persone'}`;
    }, 1000);
  }
  async function markSafe(btn) {
    if (!(await dialog({ title: 'Sei al sicuro?', text: 'Avviseremo la tua cerchia che stai bene e chiuderemo l\'SOS.', ok: 'Sì, sto bene', cancel: 'Non ancora' }))) return;
    await busy(btn, async () => {
      try { await api.call('resolveSos', { sosId: st.sosMine.id }); if (voice.rec) { try { voice.rec.cancel(); } catch {} voice.rec = null; clearInterval(voice.timer); } stopLive(false); st.sosMine = null; native.haptic('medium'); toast('Bene così. Abbiamo avvisato tutti.'); tab('home', 'in-f'); }
      catch (e) { toast(errMsg(e)); }
    });
  }

  /* ----- posizione live: resta attiva finché non tocchi "Sono al sicuro" ----- */
  const liveAge = s => { const t = live.lastOk || s?.locAt; if (!t) return 'in attesa del GPS'; const a = Math.max(0, Math.round((Date.now() - t) / 1000)); return 'aggiornata ' + (a < 60 ? a + ' s fa' : Math.round(a / 60) + ' min fa'); };
  const live = { sosId: null, until: 0, stop: null, last: 0, lastOk: 0, timer: null };
  async function startLive(sosId, until) {
    if (live.sosId === sosId && live.stop) return;
    stopLive(false);
    Object.assign(live, { sosId, until, last: 0 });
    try {
      live.stop = await native.watchLive(async pos => {
        if (live.sosId !== sosId) return;
        if (Date.now() - live.last < 10000) return;       // al massimo un aggiornamento ogni 10 secondi
        live.last = Date.now(); live.pending = pos;
        try {
          const r = await api.call('updateSosLocation', { sosId, lat: pos.lat, lng: pos.lng, acc: pos.acc });
          if (r && r.live === false) return stopLive(false);   // l'SOS è stato chiuso
          live.lastOk = Date.now(); live.pending = null;
        } catch (e) { console.warn('live (riprovo al prossimo punto)', e); live.last = 0; }
      });
    } catch (e) { console.warn('watchLive', e); }
    // se il GPS resta fermo (persona immobile) rimanda comunque la posizione ogni minuto: la cerchia vede che è ancora attiva
    clearInterval(live.timer); live.timer = setInterval(async () => {
      if (live.sosId !== sosId || Date.now() - live.lastOk < 55000) return;
      const pos = live.pending || await native.getPos(); if (!pos || live.sosId !== sosId) return;
      try { const r = await api.call('updateSosLocation', { sosId, lat: pos.lat, lng: pos.lng, acc: pos.acc }); if (r && r.live === false) return stopLive(false); live.lastOk = Date.now(); live.pending = null; } catch {}
    }, 30000);
    rActive();
  }
  function stopLive(tellServer) {
    const id = live.sosId;
    try { live.stop?.(); } catch {}
    clearInterval(live.timer);
    Object.assign(live, { sosId: null, until: 0, stop: null, timer: null, lastOk: 0, pending: null });
    if (tellServer && id) api.call('stopSosLive', { sosId: id }).catch(() => {});
    if (st.sosMine) rActive();
  }

  /* ----- messaggio vocale facoltativo dopo l'SOS: Registra → Invia (o Annulla). Lo sente tutta la cerchia. ----- */
  const voice = { rec: null, t0: 0, timer: null, sentFor: null, busy: false, up: false };
  function rVoice(s = st.sosMine) {
    const v = $('#a-voice'); if (!v || !s) return;
    const sent = s.audio || voice.sentFor === s.id;
    v.hidden = !prefs.voice && !sent;
    if (v.hidden) return;
    const state = sent ? 'sent' : voice.up ? 'up' : voice.rec ? 'rec' : 'idle';
    if (v.dataset.state === state && state !== 'sent') return;
    if (state === 'sent' && v.dataset.state === 'sent' && v.dataset.p === (s.audio || '')) return;
    v.dataset.state = state; v.dataset.p = s.audio || '';
    v.className = 'vcard ' + state;
    v.innerHTML = state === 'idle'
      ? `<i class="ic-dot amber">${I('mic')}</i><div class="fl"><b>Vuoi lasciare un vocale?</b><span>Facoltativo · lo sente tutta la tua cerchia</span></div><div class="vacts"><button class="vbtn" data-a="voice-start">${I('mic')}Registra un vocale</button></div>`
      : state === 'rec'
      ? `<i class="rec-dot"></i><div class="fl"><b>Sto registrando…</b><span id="v-time">0:00 · massimo 1:00</span></div><div class="vacts"><button class="vbtn ghost" data-a="voice-cancel">Annulla</button><button class="vbtn" data-a="voice-send">${I('send')}Invia a tutti</button></div>`
      : state === 'up'
      ? `<i class="ic-dot amber">${I('mic')}</i><div class="fl"><b>Invio del vocale…</b><span>Non chiudere l'app</span></div>`
      : `<i class="ic-dot green">${I('check')}</i><div class="fl"><b>Vocale inviato a tutta la cerchia</b>${s.audio ? `<audio controls preload="none" data-p="${esc(s.audio)}"></audio>` : '<span>In caricamento…</span>'}</div>`;
    if (state === 'sent') hydrate(v);
  }
  async function voiceStart() {
    if (voice.rec || voice.busy || !st.sosMine) return;
    if (st.sosMine.audio || voice.sentFor === st.sosMine.id) return toast('Il messaggio vocale è già stato inviato');
    voice.busy = true;
    try { voice.rec = await native.startRecording(); }
    catch (e) { voice.busy = false; return toast('Microfono non disponibile: attivalo nelle impostazioni del telefono'); }
    voice.busy = false; voice.t0 = Date.now(); native.haptic('medium'); rVoice();
    clearInterval(voice.timer); voice.timer = setInterval(() => {
      const ms = Date.now() - voice.t0, el = $('#v-time');
      if (el) el.textContent = mmss(ms) + ' · massimo 1:00';
      if (ms >= 60000) voiceSend();
    }, 250);
  }
  function voiceCancel() {
    if (!voice.rec) return;
    try { voice.rec.cancel ? voice.rec.cancel() : voice.rec.stop(); } catch {}
    voice.rec = null; clearInterval(voice.timer); rVoice(); toast('Vocale annullato');
  }
  async function voiceSend() {
    if (!voice.rec) return;
    const rec = voice.rec, sosId = st.sosMine?.id; voice.rec = null; clearInterval(voice.timer);
    const out = await rec.stop();
    if (!out || out.ms < 900 || !out.blob.size) { rVoice(); return toast('Vocale troppo corto: riprova parlando un po\' di più'); }
    voice.up = true; rVoice();
    const path = `sos/${st.uid}/${sosId}/voice.${out.ext}`;
    try {
      await api.uploadAudio(path, out.blob, out.mime);
      await api.call('attachSosAudio', { sosId, path });
      voice.sentFor = sosId; native.haptic('light'); toast('Messaggio vocale inviato a tutta la cerchia');
    } catch (e) { console.warn('vocale', e); toast('Vocale non inviato: ' + errMsg(e)); }
    voice.up = false; rVoice();
  }

  /* ================= SOS in arrivo ================= */
  const photoCache = {};
  async function hydrate(root) {
    for (const au of root.querySelectorAll('audio[data-p]')) {
      const p = au.dataset.p;
      try { photoCache[p] = photoCache[p] || await api.photoUrl(p); au.src = photoCache[p]; au.removeAttribute('data-p'); } catch { au.replaceWith(Object.assign(document.createElement('p'), { className: 'note', textContent: 'Vocale non disponibile' })); }
    }
    for (const im of root.querySelectorAll('img[data-p]')) {
      const p = im.dataset.p;
      try { photoCache[p] = photoCache[p] || await api.photoUrl(p); im.src = photoCache[p]; im.removeAttribute('data-p'); }
      catch { im.parentElement.innerHTML = I('camera') + 'Non disponibile'; }
    }
  }
  const photoGrid = photos => `<div class="photos">${['back', 'front'].map(k => {
    const p = (photos || []).find(x => x.endsWith('/' + k + '.jpg'));
    return `<div class="ph">${p ? `<img alt="Foto ${k === 'back' ? 'posteriore' : 'frontale'}" data-p="${esc(p)}">` : I('camera') + (k === 'back' ? 'Posteriore…' : 'Frontale…')}</div>`;
  }).join('')}</div>`;
  function checkIncoming() {
    const s = st.sosIn.filter(x => !st.dismissed.has(x.id) && !(x.acks || {})[st.uid]).sort((a, b) => b.at - a.at)[0];
    if (!s) { if (st.shownIn && !st.sosIn.some(x => x.id === st.shownIn)) closeIncoming(); return; }
    showIncoming(s);
  }
  let inTimer;
  const liveInfo = s => {
    const on = s.liveUntil && s.liveUntil > Date.now() && s.active !== false;
    const age = s.locAt ? Math.max(0, Math.round((Date.now() - s.locAt) / 1000)) : null;
    return on ? `<span class="live-badge"><i class="dot"></i>LIVE</span> aggiornata ${age == null ? '' : age < 60 ? age + ' s fa' : Math.round(age / 60) + ' min fa'}`
      : s.acc ? 'Precisione ± ' + Math.round(s.acc) + ' m' : 'Ultima posizione inviata';
  };
  function showIncoming(s) {
    intro.done(true);
    const first = st.shownIn !== s.id; st.shownIn = s.id;
    const ov = $('#ov-in');
    if (first || !ov.classList.contains('on')) {
      ov.innerHTML = `<div class="topbar" style="justify-content:flex-end"><button class="iconbtn" data-a="in-close" aria-label="Chiudi">${I('x')}</button></div>
      <div class="sc">
        <div class="in-head"><div class="beacon"><i></i><i></i>${I('alert')}</div><h1>${esc(s.fromName)}<br>ha bisogno di aiuto</h1><p id="in-when"></p></div>
        <div class="in-body">
          <div id="in-map"></div>
          <div id="in-audio"></div>
          <div id="in-photos"></div>
        </div>
      </div>
      <div class="foot">
        ${s.fromPhone ? `<a class="btn red" href="tel:${esc(s.fromPhone.replace(/[^\d+]/g, ''))}">${I('phone')}Chiama ${esc(s.fromName.split(' ')[0])}</a>` : ''}
        <button class="btn" data-a="in-ack" data-id="${s.id}">Ho visto, me ne occupo</button>
        <div class="row2"><a class="btn ghost" href="tel:112">${I('phone')}112</a><button class="btn ghost" data-a="in-chat" data-id="${s.id}">${I('chat')}Chat</button></div>
      </div>`;
      ov.classList.add('on');
      if (first) native.vibrate([400, 200, 400, 200, 400]);
    }
    updIncoming(s);
    clearInterval(inTimer); inTimer = setInterval(() => { const x = st.sosIn.find(y => y.id === st.shownIn); if (x && $('#ov-in').classList.contains('on')) updIncoming(x); else clearInterval(inTimer); }, 5000);
  }
  function updIncoming(s) {
    $('#in-when') && ($('#in-when').textContent = `SOS inviato ${ago(s.at)} · ${hhmm(s.at)}`);
    const map = $('#in-map'); if (!map) return;
    map.innerHTML = s.lat != null
      ? `<button class="maplink" data-a="map-focus" data-id="${s.id}">${I('pin')}<div class="fl"><b>Vedi sulla mappa</b><span>${liveInfo(s)}</span></div>${I('chev', 'chev')}</button>
         <button class="btn ghost navbtn" data-a="map-nav" data-id="${s.id}">${I('send')}Raggiungi con ${native.platform === 'ios' ? 'Apple Mappe' : 'Google Maps'}</button>`
      : `<div class="maplink off">${I('pin')}<div class="fl"><b>Posizione non disponibile</b><span>Prova a chiamare</span></div></div>`;
    const au = $('#in-audio');
    if (s.audio && au.dataset.p !== s.audio) {
      au.dataset.p = s.audio;
      au.innerHTML = `<div class="voice-in">${I('mic')}<div class="fl"><b>Messaggio vocale</b><audio controls preload="auto" data-p="${esc(s.audio)}"></audio></div></div>`;
      native.vibrate(200);
    }
    const ph = $('#in-photos'), key = (s.photos || []).join('|');
    if (ph.dataset.k !== key) { ph.dataset.k = key; ph.innerHTML = photoGrid(s.photos); }
    hydrate($('#ov-in'));
  }
  function closeIncoming() { $('#ov-in').classList.remove('on'); st.shownIn = null; clearInterval(inTimer); }

  /* ================= mappa (posizione live di chi chiede aiuto) ================= */
  let mapApi = null, mapLoading = null, mapFailed = false, mapTimer = null, myPosAt = 0;
  const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const dist = k => k < 1 ? Math.round(k * 1000 / 10) * 10 + ' m' : k.toFixed(k < 10 ? 1 : 0).replace('.', ',') + ' km';
  const ageTxt = t => { if (!t) return ''; const a = Math.max(0, Math.round((Date.now() - t) / 1000)); return a < 60 ? a + ' s fa' : a < 3600 ? Math.round(a / 60) + ' min fa' : Math.floor(a / 3600) + ' h fa'; };
  function mapPeople() {
    const out = st.sosIn.filter(s => s.lat != null && s.lng != null).map(s => ({
      id: s.id, name: s.fromName, ini: initials(s.fromName), lat: s.lat, lng: s.lng, acc: s.acc, track: s.track || [], audio: s.audio, phone: s.fromPhone,
      locAt: s.locAt || s.at, at: s.at, live: s.active !== false, stale: Date.now() - (s.locAt || s.at) > 3 * 60e3, label: s.fromName.split(' ')[0], chats: s.chats, src: s
    }));
    const m = st.sosMine;
    if (m && m.lat != null) out.push({ id: m.id, name: 'Tu', ini: 'TU', lat: m.lat, lng: m.lng, acc: m.acc, track: m.track || [], audio: m.audio, locAt: m.locAt || m.at, at: m.at, live: true, mine: true, label: 'Il tuo SOS' });
    return out;
  }
  async function refreshMyPos(force) {
    if (!force && Date.now() - myPosAt < 30000) return st.myPos;
    myPosAt = Date.now();
    const p = await native.getPos().catch(() => null);
    if (p) { st.myPos = p; rMap(); }
    return p;
  }
  async function openMapTab() {
    rMap();
    refreshMyPos();
    clearInterval(mapTimer); mapTimer = setInterval(() => { if (curScreen !== 's-map') return clearInterval(mapTimer); rMapList(); refreshMyPos(); }, 10000);
    if (mapApi) { setTimeout(() => mapApi.resize(), 60); return; }
    if (mapLoading || mapFailed) return;
    const msg = $('#map-msg'); msg.hidden = false; msg.innerHTML = '<span class="typing"><i></i><i></i><i></i></span> Carico la mappa…';
    mapLoading = import('./map.js').then(m => m.createMap($('#map'), { onPick: id => { const c = document.querySelector(`.map-card[data-id="${id}"]`); c?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); c?.classList.add('hl'); setTimeout(() => c?.classList.remove('hl'), 1200); } }))
      .then(api_ => { mapApi = api_; msg.hidden = true; rMap(); if (pendingFocus) { mapApi.focus(...pendingFocus); pendingFocus = null; } })
      .catch(e => { console.warn('mappa', e); mapFailed = true; msg.hidden = false; msg.innerHTML = `${esc(e?.message || 'Mappa non disponibile.')} Puoi comunque usare «Raggiungi» qui sotto. <button class="chip" data-a="map-retry">Riprova</button>`; })
      .finally(() => { mapLoading = null; });
  }
  function closeMapTab() { clearInterval(mapTimer); }
  let pendingFocus = null;
  function mapFocus(id, lat, lng) {
    const p = mapPeople().find(x => x.id === id);
    const la = p ? p.lat : lat, lo = p ? p.lng : lng;
    if (la == null || isNaN(la)) return;
    if (mapApi) mapApi.focus(p ? id : null, la, lo); else pendingFocus = [p ? id : null, la, lo];
  }
  function rMap() {
    const n = st.sosIn.filter(s => s.lat != null).length, b = $('#map-badge');
    if (b) { b.hidden = !n; b.textContent = n; }
    if (curScreen !== 's-map') return;
    if (mapApi) mapApi.setData({ me: st.myPos || null, people: mapPeople() });
    rMapList();
  }
  function rMapList() {
    const people = mapPeople(), el = $('#map-list'); if (!el) return;
    const navName = native.platform === 'ios' ? 'Apple Mappe' : 'Google Maps';
    if (!people.length) {
      el.dataset.k = '';
      el.innerHTML = `<div class="map-empty">${I('shield')}<div><b>Nessun SOS in corso</b><span>Quando qualcuno della tua cerchia chiede aiuto, qui vedi la sua posizione live e il percorso, fino a quando non dice di essere al sicuro.</span></div></div>`;
      return;
    }
    const status = p => {
      const d = st.myPos && !p.mine ? ' · a ' + dist(km(st.myPos, p)) : '';
      return p.mine ? `<span class="live-badge"><i class="dot"></i>LIVE</span> la tua cerchia vede questa posizione`
        : p.stale ? `Ultima posizione ${ageTxt(p.locAt)}${d}` : `<span class="live-badge"><i class="dot"></i>LIVE</span> aggiornata ${ageTxt(p.locAt)}${d}`;
    };
    // se le persone non cambiano aggiorna solo i testi (non interrompe un vocale in ascolto)
    const key = people.map(p => [p.id, p.audio, p.phone, p.mine].join('|')).join(';');
    if (el.dataset.k === key) { people.forEach(p => { const x = el.querySelector(`.map-card[data-id="${p.id}"] .st`); if (x) x.innerHTML = status(p); }); return; }
    el.dataset.k = key;
    el.innerHTML = people.map(p => {
      return `<div class="map-card${p.mine ? ' mine' : ''}" data-id="${p.id}">
        <button class="map-card-h" data-a="map-focus" data-id="${p.id}">${p.mine ? `<div class="av" style="background:var(--red)">TU</div>` : AV(p.name)}<div class="fl"><b>${p.mine ? 'Il tuo SOS' : esc(p.name)}</b><span class="st">${status(p)}</span></div>${I('chev', 'chev')}</button>
        ${p.audio ? `<div class="voice-in sm">${I('mic')}<audio controls preload="none" data-p="${esc(p.audio)}"></audio></div>` : ''}
        ${p.mine ? '' : `<div class="map-acts"><button class="btn red sm" data-a="map-nav" data-id="${p.id}">${I('send')}Raggiungi</button>
          ${p.phone ? `<a class="btn ghost sm" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${I('phone')}Chiama</a>` : ''}
          <button class="btn ghost sm" data-a="in-chat" data-id="${p.id}">${I('chat')}Chat</button></div>
          <p class="map-note">«Raggiungi» apre le indicazioni in ${navName}</p>`}
      </div>`;
    }).join('');
    hydrate(el);
  }

  /* ================= chat ================= */
  function rBadge() {
    const n = convs().reduce((a, c) => a + unread(c.id), 0) + st.sosIn.filter(s => !(s.acks || {})[st.uid]).length;
    const b = $('#badge'); b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
  }
  const preview = m => !m ? '' : m.type === 'sos' ? `<span class="tag red">SOS</span> ${m.from === st.uid ? 'Inviato da te' : esc(m.fromName)}` : m.type === 'safe' ? `<span class="tag green">OK</span> ${esc(m.fromName)} è al sicuro` : esc(m.text);
  function rChats() {
    const cs = convs().map(c => ({ ...c, last: (st.threads[c.id] || []).slice(-1)[0] })).sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0));
    const live = st.sosIn.filter(s => Date.now() - s.at < 12 * 36e5);
    $('#c-list').innerHTML =
      (live.length ? `<div class="label">SOS in corso</div><div class="card">${live.map(s => `<button class="row" data-a="in-open" data-id="${s.id}">${AV(s.fromName)}<div class="fl"><b>${esc(s.fromName)}</b><span>Ha chiesto aiuto ${ago(s.at)}</span></div><span class="tag red">Attivo</span></button>`).join('')}</div>` : '')
      + (cs.length ? `<div class="label">Conversazioni</div><div class="card">${cs.map(c => { const u = unread(c.id);
        return `<button class="row" data-a="open" data-id="${c.id}">${AV(c.name, c.k)}<div class="fl"><b>${esc(c.name)}</b><span>${c.last ? preview(c.last) : esc(c.sub)}</span></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${c.last ? `<span class="meta" style="margin:0">${when(c.last.at)}</span>` : ''}${u ? `<b class="badge" style="position:static">${u}</b>` : ''}</div></button>`; }).join('')}</div>`
        : `<div class="empty"><i class="ic-dot violet">${I('chat')}</i><b>Nessuna conversazione</b>Quando aggiungi qualcuno alla tua cerchia, la chat compare qui.<button class="btn" data-a="add">Aggiungi persona</button></div>`);
  }
  const nameIn = (cid, uid) => st.groups.find(g => g.id === cid)?.members.find(m => m.uid === uid)?.name || '';
  function msgHtml(cid, m) {
    const mine = m.from === st.uid, t = `<div class="t">${hhmm(m.at)}</div>`;
    if (m.type === 'sos') {
      const sosLive = st.sosIn.find(s => s.id === m.sosId) || (st.sosMine?.id === m.sosId ? st.sosMine : null);
      const photos = sosLive?.photos || m.photos, audio = sosLive?.audio || m.audio;
      return `<div class="msg sos ${mine ? 'mine' : ''}"><div class="sosh">${I('alert')}SOS ${mine ? 'inviato da te' : 'da ' + esc(m.fromName)}</div>Ho bisogno di aiuto e non riesco a scrivere. Ecco dove sono e cosa ho intorno. Chiamami o raggiungimi.${audio ? `<div class="voice-in sm">${I('mic')}<audio controls preload="none" data-p="${esc(audio)}"></audio></div>` : ''}${photoGrid(photos)}${m.lat != null ? `<button class="maplink" data-a="map-focus" data-id="${m.sosId}" data-lat="${m.lat}" data-lng="${m.lng}">${I('pin')}<div class="fl"><b>Vedi sulla mappa</b></div></button>` : `<p class="note">Posizione non disponibile</p>`}${t}</div>`;
    }
    if (m.type === 'safe') return `<div class="msg safe">${I('check')} <b>${mine ? 'Hai' : esc(m.fromName) + ' ha'}</b> chiuso l'SOS: ${mine ? 'sei' : 'è'} al sicuro. ${hhmm(m.at)}</div>`;
    const who = !mine && cid && st.groups.some(g => g.id === cid) ? `<span class="who">${esc(nameIn(cid, m.from) || 'Ex membro')}</span>` : '';
    return `<div class="msg ${mine ? '' : 'in'}">${who}${esc(m.text)}${t}</div>`;
  }
  function openThread(id) {
    const c = convs().find(x => x.id === id); if (!c) return;
    st.open = id; show('s-thread', 'in-push');
    $('#t-name').textContent = c.name; $('#t-sub').textContent = c.k === 'g' ? c.members.map(m => m.name.split(' ')[0]).join(', ') : c.sub;
    $('#t-av').innerHTML = AV(c.name, c.k, 'sm'); rThread();
  }
  function rThread() {
    const id = st.open; if (!id) return;
    const l = st.threads[id] || [], box = $('#msgs');
    box.innerHTML = l.length ? l.map(m => msgHtml(id, m)).join('') : `<div class="empty"><b>Ancora nessun messaggio</b>Qui arriveranno anche gli SOS.</div>`;
    box.scrollTop = 1e9; hydrate(box);
    if (l.length) { seen[id] = l[l.length - 1].at; ls.set('seenChats', JSON.stringify(seen)); rBadge(); }
  }
  async function sendText() {
    const v = $('#txt').value.trim(); if (!v || !st.open) return; $('#txt').value = '';
    try { await api.sendText(st.open, st.uid, v); } catch (e) { $('#txt').value = v; toast(errMsg(e)); }
  }
  $('#txt').onkeydown = e => { if (e.key === 'Enter') sendText(); };
  function syncChats() {
    const ids = new Set(convs().map(c => c.id));
    for (const id of ids) if (!chatUn[id]) chatUn[id] = api.watchChat(id, msgs => {
      st.threads[id] = msgs; if (st.open === id) rThread(); rChats(); rBadge();
    });
    for (const id in chatUn) if (!ids.has(id)) { chatUn[id](); delete chatUn[id]; delete st.threads[id]; }
  }

  /* ================= cerchia ================= */
  function rCircle() {
    const p = partner(), f = friends(), g = groups();
    const person = x => `<button class="row" data-a="person" data-id="${x.id}">${AV(x.name)}<div class="fl"><b>${esc(x.name)}</b><span>${esc(x.sub)}</span></div>${I('chev', 'chev')}</button>`;
    if (!p && !f.length && !g.length) {
      $('#p-list').innerHTML = `<div class="empty"><i class="ic-dot violet">${I('people')}</i><b>La tua cerchia è vuota</b>Aggiungi il partner, ${G().amico} o crea un gruppo. Nessuno entra senza il consenso di entrambi.<button class="btn" data-a="add">Aggiungi persona</button></div>`;
      return;
    }
    $('#p-list').innerHTML =
      `<div class="label">Persone · ${(p ? 1 : 0) + f.length}</div><div class="card">${p ? person(p) : ''}${f.map(person).join('')}${p ? '' : `<button class="row add" data-a="invite" data-k="partner"><i class="ic-dot red">${I('heart')}</i><span>Aggiungi il partner</span></button>`}<button class="row add" data-a="invite" data-k="friend"><i class="ic-dot violet">${I('plus')}</i><span>Invita ${G().amico}</span></button></div>`
      + `<div class="label">Gruppi · ${g.length}</div><div class="card">${g.map(x => `<button class="row" data-a="grp" data-id="${x.id}">${AV(x.name, 'g')}<div class="fl"><b>${esc(x.name)}</b><span>${x.sub}${x.on ? '' : ' · SOS disattivati'}${x.admin && x.req.length ? ` · <b style="color:var(--amber)">${x.req.length} richieste</b>` : ''}</span></div>${I('chev', 'chev')}</button>`).join('')}
        <button class="row add" data-a="newgroup"><i class="ic-dot violet">${I('plus')}</i><span>Crea un gruppo</span></button>
        <button class="row add" data-a="code"><i class="ic-dot gray">${I('key')}</i><span>Ho un codice</span></button></div>
        <p class="note">L'SOS arriva a tutte le persone qui sopra (gruppi fino a 8).</p>`;
  }
  const addOptions = () => `
    <button class="opt" data-a="invite" data-k="partner"><i class="ic-dot red">${I('heart')}</i><div class="fl"><b>Invita il partner</b><span>Genera un codice da condividere</span></div>${I('chev', 'chev')}</button>
    <button class="opt" data-a="invite" data-k="friend"><i class="ic-dot violet">${I('user')}</i><div class="fl"><b>Invita ${G().amico}</b><span>Genera un codice da condividere</span></div>${I('chev', 'chev')}</button>
    <button class="opt" data-a="newgroup"><i class="ic-dot blue">${I('group')}</i><div class="fl"><b>Crea un gruppo</b><span>Fino a 8 persone, approvi tu chi entra</span></div>${I('chev', 'chev')}</button>
    <button class="opt" data-a="code"><i class="ic-dot gray">${I('key')}</i><div class="fl"><b>Ho ricevuto un codice</b><span>Collegati a una persona o a un gruppo</span></div>${I('chev', 'chev')}</button>`;

  /* ================= impostazioni ================= */
  const permCount = () => ['loc', 'cam', 'push', 'mic'].filter(k => perm[k] === 'granted').length;
  const toggleRow = (key, icon, color, title, sub) => `<label class="row"><i class="ic-dot ${color}">${I(icon)}</i><div class="fl wrap"><b>${title}</b><span>${sub}</span></div><input type="checkbox" class="switch" data-pref="${key}" ${prefs[key] ? 'checked' : ''}></label>`;
  function rMe() {
    if (!st.p) return;
    const p = st.p, full = p.name + ' ' + p.surname, pc = permCount();
    $('#m-body').innerHTML = `
      <div class="card me-card"><div class="row">${AV(full)}<div class="fl"><b>${esc(full)}</b><span>${esc(st.email)}</span></div></div>
        <button class="row" data-a="phone"><i class="ic-dot green">${I('phone')}</i><div class="fl"><b>Telefono</b><span>${p.phone ? esc(p.phone) : 'Aggiungi: chi ti aiuta potrà chiamarti'}</span></div>${I('chev', 'chev')}</button></div>
      <div class="label">SOS</div><div class="card">
        <div class="row"><i class="ic-dot blue">${I('live')}</i><div class="fl wrap"><b>Posizione live</b><span>Sempre attiva dopo l'SOS, finché non tocchi «Sono al sicuro»</span></div></div>
        ${toggleRow('voice', 'mic', 'amber', 'Messaggio vocale', 'Dopo l\'SOS puoi registrarne uno (facoltativo)')}
      </div>
      <div class="label">Aiuto</div><div class="card">
        <button class="row" data-a="guide"><i class="ic-dot violet">${I('book')}</i><div class="fl"><b>Guida rapida</b><span>5 passi interattivi, 1 minuto</span></div>${I('chev', 'chev')}</button>
        <button class="row" data-a="ai"><i class="ic-dot amber">${I('spark')}</i><div class="fl"><b>Assistente</b><span>Domande sull'app e sulla sicurezza</span></div>${I('chev', 'chev')}</button>
      </div>
      <div class="label">Telefono</div><div class="card">
        <button class="row" data-a="perm-sheet"><i class="ic-dot ${pc >= 3 ? 'green' : 'red'}">${I('lock')}</i><div class="fl"><b>Permessi</b><span>${pc} di 4 attivi</span></div>${I('chev', 'chev')}</button>
      </div>
      <div class="label">Account</div><div class="card">
        <button class="row" data-a="logout"><i class="ic-dot gray">${I('out')}</i><div class="fl"><b>Esci</b></div></button>
        <button class="row danger" data-a="delete"><i class="ic-dot red">${I('trash')}</i><div class="fl"><b style="color:var(--red)">Elimina account</b></div></button>
      </div>
      <p class="note" style="text-align:center;margin-top:22px">Vicina ${api.version || ''} · Non sostituisce il 112</p>`;
  }
  $('#m-body').addEventListener('change', e => {
    const k = e.target.dataset.pref; if (!k) return;
    prefs[k] = e.target.checked; savePrefs(); native.haptic('light');
    toast(prefs.voice ? 'Messaggio vocale attivo' : 'Messaggio vocale disattivato');
  });
  const sheetPerms = () => openSheet(`<h2>Permessi</h2><p class="sub">Servono perché l'SOS parta subito, senza richieste.</p><div class="card" style="margin-top:14px">${permRows()}</div>
    <button class="btn" data-a="perms">Attiva quelli mancanti</button>`, 'perms');

  /* ================= guida rapida interattiva ================= */
  const GUIDE = [
    { t: 'Tieni premuto per 1,5 secondi', d: 'Provalo qui: è solo una prova, non parte nessun allarme.', demo: 'hold' },
    { t: 'Cosa ricevono', d: 'La tua cerchia vede subito chi sei, dove sei (anche in tempo reale) e le due foto.', demo: 'recv' },
    { t: 'Posizione live e vocale', d: 'Dopo l\'SOS la tua posizione si aggiorna da sola finché non tocchi «Sono al sicuro». Se vuoi, registri un vocale che sente tutta la cerchia.', demo: 'opts' },
    { t: 'La tua cerchia', d: 'Partner, amici e gruppi. Ci si collega con un codice di 6 caratteri, solo se siete d\'accordo entrambi.', demo: 'circle' },
    { t: 'Quando è finita', d: 'Tocca "Sono al sicuro": tutti ricevono la notizia e l\'SOS si chiude.', demo: 'safe' }
  ];
  let gi = 0;
  function openGuide() {
    gi = 0; show('s-guide', 'in-up');
    $('#g-track').innerHTML = GUIDE.map((g, i) => `<div class="g-card"><div class="g-demo" data-demo="${g.demo}">${guideDemo(g.demo)}</div><p class="g-n">${i + 1} di ${GUIDE.length}</p><h2>${g.t}</h2><p class="sub">${g.d}</p></div>`).join('');
    guideGo(0);
  }
  function guideDemo(k) {
    if (k === 'hold') return `<div class="g-hold"><svg class="ring" viewBox="0 0 260 260"><circle cx="130" cy="130" r="122" class="ring-bg"/><circle id="g-prog" cx="130" cy="130" r="122" class="ring-fg"/></svg><button id="g-sos" aria-label="Prova il pulsante SOS"><span>SOS</span><small id="g-sos-t">prova</small></button></div>`;
    if (k === 'recv') return `<div class="g-recv"><div class="g-alert"><div class="g-alert-h">${I('alert')}<b>Giulia ha bisogno di aiuto</b></div><div class="g-li"><span class="live-badge"><i class="dot"></i>LIVE</span>Via Roma 12 · aggiornata 5 s fa</div><div class="g-li">${I('mic')}Messaggio vocale · 0:08</div><div class="g-ph"><i></i><i></i></div></div></div>`;
    if (k === 'opts') return `<div class="card g-opts"><div class="row"><i class="ic-dot blue">${I('live')}</i><div class="fl wrap"><b>Posizione live</b><span>Fino a «Sono al sicuro»</span></div></div>${toggleRow('voice', 'mic', 'amber', 'Messaggio vocale', 'Facoltativo')}</div>`;
    if (k === 'circle') return `<div class="g-circle"><div class="code"><b>K7P2QX</b><span>Codice di esempio · vale 10 minuti</span></div><button class="btn" data-a="add">${I('plus')}Aggiungi qualcuno ora</button></div>`;
    return `<div class="g-safe"><button class="btn green" id="g-safe-btn">${I('check')}Sono al sicuro</button><p class="sub" id="g-safe-t">Prova a toccarlo</p></div>`;
  }
  function guideGo(i) {
    gi = Math.max(0, Math.min(GUIDE.length - 1, i));
    $('#g-track').style.transform = `translateX(-${gi * 100}%)`;
    $('#g-bar').style.width = ((gi + 1) / GUIDE.length * 100) + '%';
    $('#g-prev').style.visibility = gi ? 'visible' : 'hidden';
    $('#g-next').textContent = gi === GUIDE.length - 1 ? 'Ho capito' : 'Avanti';
    $$('#g-track .g-card').forEach((c, k) => c.classList.toggle('cur', k === gi));
  }
  function closeGuide() { ls.set('guideSeen', '1'); tab(st.tab || 'home', 'in-f'); }
  // demo "tieni premuto"
  let gRaf, gT0 = 0;
  $('#g-track').addEventListener('pointerdown', e => {
    const b = e.target.closest('#g-sos'); if (!b) return; e.preventDefault();
    const pr = $('#g-prog'); b.classList.add('hold'); pr.style.transition = 'none'; gT0 = performance.now(); native.haptic('light');
    const loop = () => { const k = Math.min((performance.now() - gT0) / HOLD, 1); pr.style.strokeDashoffset = C * (1 - k);
      if (k >= 1) { b.classList.remove('hold'); b.classList.add('ok'); $('#g-sos-t').textContent = 'perfetto!'; native.haptic('heavy'); toast('Esatto! In un vero SOS ora partirebbe l\'allarme.'); }
      else gRaf = requestAnimationFrame(loop); };
    gRaf = requestAnimationFrame(loop);
  });
  const gUp = () => { const b = $('#g-sos'); if (!b || !b.classList.contains('hold')) return; cancelAnimationFrame(gRaf); b.classList.remove('hold'); const pr = $('#g-prog'); pr.style.transition = 'stroke-dashoffset .25s'; pr.style.strokeDashoffset = C; $('#g-sos-t').textContent = 'tieni di più'; };
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(v => $('#g-track').addEventListener(v, gUp, true));
  $('#g-track').addEventListener('click', e => { if (e.target.closest('#g-safe-btn')) { native.haptic('medium'); $('#g-safe-t').textContent = 'Fatto: la tua cerchia sa che stai bene.'; e.target.closest('#g-safe-btn').classList.add('done'); } });
  $('#g-track').addEventListener('change', e => { const k = e.target.dataset.pref; if (k) { prefs[k] = e.target.checked; savePrefs(); native.haptic('light'); } });
  // scorrimento con il dito
  let gx = null;
  $('#g-view').addEventListener('touchstart', e => { if (!e.target.closest('#g-sos')) gx = e.touches[0].clientX; }, { passive: true });
  $('#g-view').addEventListener('touchend', e => { if (gx == null) return; const d = e.changedTouches[0].clientX - gx; gx = null; if (Math.abs(d) > 50) guideGo(gi + (d < 0 ? 1 : -1)); });

  /* ================= sheet e dialoghi ================= */
  const openSheet = (h, key) => { curSheet = key || null; $('#sheet').innerHTML = '<div class="grab"></div>' + h; $('#scrim').classList.add('on'); };
  const closeSheet = () => { $('#scrim').classList.remove('on'); curSheet = null; clearInterval(inviteTimer); };
  $('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeSheet(); });
  let dlgResolve;
  function dialog({ title, text, ok = 'OK', cancel = 'Annulla', danger = false }) {
    $('#dlg').innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row2"><button class="btn ghost" data-dlg="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : ''}" data-dlg="1">${esc(ok)}</button></div>`;
    $('#dlg-scrim').classList.add('on');
    return new Promise(r => { dlgResolve = r; });
  }
  $('#dlg-scrim').addEventListener('click', e => {
    const b = e.target.closest('[data-dlg]'); if (!b && e.target.id !== 'dlg-scrim') return;
    $('#dlg-scrim').classList.remove('on'); dlgResolve?.(b?.dataset.dlg === '1'); dlgResolve = null;
  });

  const sheetAdd = () => openSheet(`<h2>Aggiungi alla cerchia</h2><p class="sub">Ogni collegamento richiede il consenso di entrambi.</p>${addOptions()}`, 'add');
  let inviteTimer;
  async function sheetInvite(kind) {
    if (kind === 'partner' && partner()) return toast('Hai già un partner collegato');
    openSheet(`<h2>${kind === 'partner' ? 'Invita il partner' : 'Invita ' + G().amico}</h2><p class="sub">Condividi questo codice. Quando la persona lo inserisce nella sua app, siete collegati.</p>
      <div class="code"><b id="inv-code">······</b><span id="inv-exp">Genero il codice…</span></div>
      <div class="row2"><button class="btn ghost" data-a="inv-copy">${I('copy')}Copia</button><button class="btn" data-a="inv-share">${I('share')}Condividi</button></div>
      <div class="or">oppure inserisci il suo</div>
      <label class="field"><input id="code-in" class="codein" maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off"></label>
      <button class="btn ghost" data-a="redeem">Collega</button>`, 'invite');
    try {
      const r = await api.call('createInvite', { kind });
      if (curSheet !== 'invite') return;
      $('#inv-code').textContent = r.code; const exp = r.expiresAt || Date.now() + 6e5;
      const tick = () => { const s = Math.max(0, Math.round((exp - Date.now()) / 1000)); const e = $('#inv-exp'); if (!e) return clearInterval(inviteTimer);
        e.textContent = s ? `Valido ancora ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Scaduto: chiudi e riapri per un nuovo codice'; if (!s) clearInterval(inviteTimer); };
      clearInterval(inviteTimer); tick(); inviteTimer = setInterval(tick, 1000);
    } catch (e) { $('#inv-exp') && ($('#inv-exp').textContent = errMsg(e)); }
  }
  const sheetCode = () => openSheet(`<h2>Inserisci un codice</h2><p class="sub">Funziona sia per le persone sia per i gruppi. Per i gruppi l'admin dovrà approvarti.</p>
    <label class="field"><input id="code-in" class="codein" maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off"></label>
    <button class="btn" data-a="redeem">Collega</button>`, 'code');
  const sheetNewGroup = () => openSheet(`<h2>Nuovo gruppo</h2><p class="sub">Famiglia, coinquilini, amiche del calcetto… Fino a 8 persone. Entrano solo se le approvi tu.</p>
    <label class="field"><span>Nome del gruppo</span><input id="g-name" maxlength="30" placeholder="Es. Famiglia"></label>
    <button class="btn" data-a="mkgroup">Crea gruppo</button>`, 'newgroup');
  function sheetPerson(id) {
    const x = [partner(), ...friends()].find(p => p && p.id === id); if (!x) return;
    openSheet(`<div style="display:flex;align-items:center;gap:14px">${AV(x.name)}<div class="fl"><h2>${esc(x.name)}</h2><span class="sub" style="margin:0">${esc(x.sub)} · riceve i tuoi SOS</span></div></div>
      <button class="btn" data-a="open" data-id="${id}" style="margin-top:22px">${I('chat')}Apri la chat</button>
      <button class="btn danger" data-a="unlink" data-id="${id}">Rimuovi dalla cerchia</button>`, 'person:' + id);
  }
  function sheetGroup(id) {
    const g = groups().find(x => x.id === id); if (!g) return closeSheet();
    openSheet(`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><h2>${esc(g.name)}</h2><span class="tag">${g.members.length}/8</span></div>
      ${g.admin ? `<div class="code sm"><b>${esc(g.code)}</b><span>Codice del gruppo · chi lo usa entra solo se approvi</span></div>
        <button class="btn ghost" data-a="grp-share" data-id="${id}">${I('share')}Condividi codice</button>` : ''}
      ${g.admin && g.req.length ? `<div class="label">Richieste di ingresso</div><div class="card">${g.req.map(m => `<div class="row">${AV(m.name)}<div class="fl"><b>${esc(m.name)}</b></div><button class="pill" data-a="decide" data-ok="0" data-id="${id}" data-uid="${m.uid}">Rifiuta</button><button class="pill ok" data-a="decide" data-ok="1" data-id="${id}" data-uid="${m.uid}">Accetta</button></div>`).join('')}</div>` : ''}
      <div class="label">Membri</div><div class="card">${g.members.map(m => `<div class="row">${AV(m.name)}<div class="fl"><b>${esc(m.name)}${m.uid === st.uid ? ' (tu)' : ''}</b></div>${m.uid === g.adminUid ? '<span class="tag">Admin</span>' : g.admin ? `<button class="iconbtn sm" data-a="kick" data-id="${id}" data-uid="${m.uid}" aria-label="Rimuovi">${I('x')}</button>` : ''}</div>`).join('')}</div>
      <div class="card" style="margin-top:14px"><label class="row"><div class="fl"><b>Includi negli SOS</b><span>${g.on ? 'Il gruppo riceve i tuoi SOS' : 'Il gruppo non riceve i tuoi SOS'}</span></div><input type="checkbox" class="switch" data-mute="${id}" ${g.on ? 'checked' : ''}></label></div>
      <button class="btn ghost" data-a="open" data-id="${id}">${I('chat')}Chat del gruppo</button>
      ${g.admin ? `<button class="btn danger" data-a="delgroup" data-id="${id}">Elimina gruppo</button>` : `<button class="btn danger" data-a="leave" data-id="${id}">Esci dal gruppo</button>`}`, 'group:' + id);
  }
  $('#sheet').addEventListener('change', async e => {
    const id = e.target.dataset.mute; if (!id) return;
    try { await api.setMuted(st.uid, id, !e.target.checked); } catch (x) { toast(errMsg(x)); e.target.checked = !e.target.checked; }
  });
  const sheetReset = em => openSheet(`<h2>Nuova password</h2><p class="sub">Ti abbiamo inviato un codice a <b>${esc(em)}</b>. Inseriscilo qui insieme alla nuova password.</p>
    <label class="field"><span>Codice ricevuto</span><input id="rs-code" class="codein" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"></label>
    <label class="field"><span>Nuova password</span><input id="rs-pwd" type="password" autocomplete="new-password" placeholder="Almeno 8 caratteri"></label>
    <button class="btn" data-a="reset-confirm" data-email="${esc(em)}">Salva password</button>`, 'reset');
  const sheetPhone = () => openSheet(`<h2>Il tuo telefono</h2><p class="sub">Compare solo a chi riceve un tuo SOS, per chiamarti subito.</p>
    <label class="field"><input id="ph-in" type="tel" inputmode="tel" maxlength="20" placeholder="+39 333 123 4567" value="${esc(st.p.phone || '')}"></label>
    <button class="btn" data-a="phone-save">Salva</button>`, 'phone');
  const inviteText = c => `Ti aggiungo alla mia cerchia su Vicina, l'app SOS. Inserisci questo codice nell'app: ${c}`;

  /* ================= assistente (IA gratuita con riserve) ================= */
  // La conversazione resta solo su questo telefono. L'assistente non vede posizione, foto o chat.
  const AI_KEY = () => 'ai:' + (st.uid || 'anon');
  let aiMsgs = [], aiBusy = false, aiLeft = null;
  const DANGER = /(aiuto|pericolo|mi segu|seguit|pedin|aggredi|aggression|minacc|picchi|violen|ferit|sangue|svenut|non respira|stupr|molest|rapin|ho paura|mi stanno|mi vuole|mi ha toccat)/i;
  const AI_CHIPS = ['Come aggiungo una persona alla cerchia?', 'Mi sento seguita/o: cosa faccio?', 'Perché non mi arrivano le notifiche?', "Cosa succede quando premo SOS?"];
  const aiLoad = () => { try { aiMsgs = JSON.parse(ls.get(AI_KEY()) || '[]'); } catch { aiMsgs = []; } };
  const aiSave = () => ls.set(AI_KEY(), JSON.stringify(aiMsgs.filter(m => m.role === 'user' || m.role === 'model').slice(-30)));
  const mdLite = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\n)- (.+)/g, '$1• $2').replace(/\n/g, '<br>');
  function openAI() { aiLoad(); show('s-ai', 'in-push'); rAI(); setTimeout(() => $('#ai-txt').focus(), 250); }
  function rAI() {
    const box = $('#ai-msgs');
    if (!aiMsgs.length && !aiBusy) {
      box.innerHTML = `<div class="ai-hello"><i class="ic-dot amber">${I('spark')}</i><b>Ciao${st.p ? ', ' + esc(st.p.name) : ''}!</b><p>Chiedimi come usare Vicina o un consiglio di sicurezza. Non vedo la tua posizione né le tue chat.</p>
        <div class="chips">${AI_CHIPS.map(c => `<button class="chip" data-a="ai-chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>`;
      return;
    }
    box.innerHTML = aiMsgs.map(m => m.role === 'user' ? `<div class="msg me">${esc(m.text)}</div>`
      : m.role === 'danger' ? `<div class="msg danger"><b>Se sei in pericolo adesso, non aspettare la risposta:</b> tieni premuto SOS o chiama il 112. Per violenza o stalking c'è anche il 1522, gratis e attivo 24 ore su 24.<div class="row2"><button class="btn red" data-a="ai-sos">${I('alert')}Vai all'SOS</button><a class="btn ghost" href="tel:112">${I('phone')}112</a></div></div>`
      : m.role === 'err' ? `<div class="msg err">${mdLite(m.text)}<button class="chip" data-a="ai-diag">Verifica collegamento</button></div>`
      : m.role === 'local' ? `<div class="msg bot"><span class="ai-tag">Guida integrata</span>${mdLite(m.text)}</div>`
      : `<div class="msg bot">${mdLite(m.text)}</div>`).join('')
      + (aiBusy ? `<div class="msg bot"><span class="typing"><i></i><i></i><i></i></span></div>` : '')
      + (aiLeft != null && aiLeft <= 5 ? `<div class="ai-left">Messaggi rimasti oggi: ${aiLeft}</div>` : '');
    box.scrollTop = 1e9;
  }
  // Risposte di riserva, già dentro l'app: se il server dell'IA non risponde l'utente riceve comunque un aiuto utile.
  const AI_LOCAL = [
    [/(segu|pedin|paura|pericol|minacc|aggredi|aggression|violen|molest|stalk)/i, "**Se sei in pericolo adesso: tieni premuto SOS o chiama il 112.**\n- Vai verso un posto affollato e illuminato: un bar, un negozio, una farmacia.\n- Chiama qualcuno e resta al telefono mentre cammini.\n- Non andare a casa se pensi di essere seguita/o: aspetta in un luogo sicuro.\n- Per violenza o stalking c'è il **1522**, gratis e attivo 24 ore su 24."],
    [/(malore|svenut|non respira|ferit|sangue|infarto|incident)/i, "**Chiama subito il 112** e segui le indicazioni dell'operatore.\n- Se puoi, tieni premuto SOS: la tua cerchia riceve la posizione.\n- Non spostare la persona ferita se non è in pericolo immediato."],
    [/(aggiung|invit|codice|cerchia|amic|partner|grupp)/i, "Vai nella scheda **Cerchia** e tocca **+**:\n- **Invita** crea un codice di 6 caratteri valido 10 minuti: mandalo con **Condividi**;\n- se hai ricevuto un codice scegli **Ho un codice**.\nNei gruppi (fino a 8 persone) l'admin deve approvare chi entra."],
    [/(notific|non arriv|push|suon)/i, "Controlla questi punti:\n- **Impostazioni → Permessi**: le notifiche devono essere attive;\n- su Android togli Vicina dal **risparmio batteria** e attiva il canale **SOS**;\n- su iPhone, con la versione beta, gli SOS arrivano quando l'app è aperta."],
    [/(mappa|posizion|dove|live|gps|raggiung)/i, "Nella scheda **Mappa** vedi la posizione live di chi ha chiesto aiuto e il percorso fatto.\n- **Raggiungi** apre le indicazioni in **Apple Mappe** su iPhone e in **Google Maps** su Android.\n- La posizione si aggiorna finché la persona tocca **Sono al sicuro**."],
    [/(vocal|audio|microfon|registr)/i, "Dopo aver mandato l'SOS, nella schermata **SOS attivo** tocca **Registra un vocale**, parla e premi **Invia** (massimo 60 secondi).\nÈ facoltativo: tutta la tua cerchia lo può ascoltare."],
    [/(sicur|sto bene|chiud|annull|ferm)/i, "Quando sei al sicuro tocca **Sono al sicuro** nella schermata SOS attivo: tutti vengono avvisati e la posizione live si ferma.\nPrima che l'allarme parta puoi toccare **Annulla**."],
    [/(foto|fotocamer)/i, "Durante l'SOS l'app scatta in automatico una foto con la fotocamera posteriore e una con quella frontale. Le foto si cancellano da sole dopo 7 giorni."],
    [/(\bsos\b|allarme|premo|pulsante|cosa succede)/i, "Tieni premuto il pulsante **SOS** per 1,5 secondi:\n- parte subito l'allarme con la tua posizione a tutta la cerchia;\n- l'app scatta due foto (davanti e dietro);\n- la posizione resta **live** finché non tocchi **Sono al sicuro**;\n- se vuoi, puoi registrare un **messaggio vocale** che sentono tutti."],
    [/(account|password|elimin|esci|telefono|numero)/i, "In **Impostazioni** trovi il tuo telefono (lo vede solo chi riceve un tuo SOS), i permessi, **Esci** ed **Elimina account**. Se hai dimenticato la password, nella schermata di accesso tocca **Password dimenticata**."]
  ];
  const aiLocal = t => (AI_LOCAL.find(([re]) => re.test(t)) || [null, "Posso aiutarti con l'uso di Vicina e con la tua sicurezza. Prova a chiedermi ad esempio: \"come funziona l'SOS?\", \"come aggiungo una persona?\" o \"cosa faccio se mi sento seguita?\".\nIn emergenza tieni premuto **SOS** o chiama il **112**."])[1];

  async function sendAI(text) {
    text = (text || '').trim(); if (!text || aiBusy) return;
    $('#ai-txt').value = '';
    aiMsgs.push({ role: 'user', text });
    if (DANGER.test(text)) { aiMsgs.push({ role: 'danger' }); native.vibrate(200); }
    aiBusy = true; rAI();
    try {
      const history = aiMsgs.filter(m => m.role === 'user' || m.role === 'model').slice(-12).map(m => ({ role: m.role, text: m.text }));
      const r = await api.askAI(history);
      aiMsgs.push({ role: 'model', text: r.reply }); aiLeft = r.left ?? null;
    } catch (e) {
      console.warn('assistente', e);
      // risposta di riserva + spiegazione dell'errore (non salvata: al prossimo invio si riprova il server)
      aiMsgs.push({ role: 'local', text: aiLocal(text) });
      aiMsgs.push({ role: 'err', text: (e?.message || "L'assistente online non risponde.") + ' Ti ho risposto con la guida integrata.' });
    }
    aiBusy = false; aiSave(); rAI();
  }
  async function diagAI(btn) {
    await busy(btn, async () => {
      let r; try { r = await api.diagAI(); } catch (e) { r = { ok: false, errore: e?.message || 'nessuna risposta' }; }
      const righe = r.errore ? [r.errore]
        : [r.ok ? 'Collegamento riuscito: l\'assistente risponde.' : 'Il server risponde ma nessuna IA funziona.',
           'Configurati: ' + ((r.configurati || []).join(', ') || 'nessuno'),
           ...Object.entries(r.prove || {}).map(([k, v]) => k + ': ' + v),
           ...(r.contatore && r.contatore !== 'ok' ? ['Contatore: ' + r.contatore] : []),
           ...(r.consiglio ? [r.consiglio] : [])];
      aiMsgs.push({ role: r.ok ? 'local' : 'err', text: righe.join('\n') });
      rAI();
    });
  }
  $('#ai-txt').onkeydown = e => { if (e.key === 'Enter') sendAI($('#ai-txt').value); };

  /* ================= azioni (delegazione) ================= */
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-a]'); if (!t) return;
    const a = t.dataset.a, id = t.dataset.id;
    try {
      switch (a) {
        case 'wel-start': ls.set('seen', '1'); authMode('up'); show('s-auth'); break;
        case 'wel-login': ls.set('seen', '1'); authMode('in'); show('s-auth'); break;
        case 'auth-back': show('s-wel'); break;
        case 'pw-toggle': $('#pwd').type = $('#pwd').type === 'password' ? 'text' : 'password'; break;
        case 'auth-go': await doAuth(t); break;
        case 'auth-reset': {
          const em = $('#email').value.trim(); if (!em) return toast('Scrivi prima la tua email');
          await busy(t, async () => {
            try { await api.resetPassword(em); sheetReset(em); } catch (x) { toast(AE[x.code] || ('Invio non riuscito: ' + (x.message || x.code))); }
          });
          break;
        }
        case 'reset-confirm': {
          const code = $('#rs-code').value.trim(), pw = $('#rs-pwd').value;
          if (!/^\d{6,10}$/.test(code)) return toast('Inserisci il codice ricevuto via email');
          if (pw.length < 8) return toast('La nuova password deve avere almeno 8 caratteri');
          await busy(t, async () => {
            try { await api.confirmReset(t.dataset.email, code, pw); closeSheet(); toast('Password aggiornata'); }
            catch (x) { toast(AE[x.code] || errMsg(x)); }
          });
          break;
        }
        case 'setup-back':
          if (st.setup > 1) setup(st.setup - 1);
          else if (await dialog({ title: 'Uscire?', text: 'Potrai completare il profilo al prossimo accesso.', ok: 'Esci' })) await api.signOut();
          break;
        case 'setup-profile': {
          const dob = $('#pd').value, d = new Date(dob), n = new Date();
          let age = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) age--;
          if (isNaN(age) || age < 14) return toast('Per usare Vicina servono almeno 14 anni');
          const phone = $('#pp').value.trim();
          if (phone && !/^\+?[\d\s.-]{6,20}$/.test(phone)) return toast('Numero di telefono non valido');
          draft = { ...draft, name: $('#pn').value.trim(), surname: $('#ps').value.trim(), dob, phone };
          await busy(t, async () => {
            const data = { name: draft.name, surname: draft.surname, dob, gender: draft.gender, phone: phone || '' };
            if (!st.p) await api.createProfile(st.uid, data); else await api.updateProfile(st.uid, { phone: data.phone });
            st.p = { ...data }; startData(); await refreshPerms(); setup(2);
          });
          break;
        }
        case 'setup-perms': await busy(t, async () => { await native.requestPerms(); await refreshPerms(); await registerPush(); }); ls.set('permAsked', '1'); setup(3); break;
        case 'setup-skip-perms': setup(3); break;
        case 'setup-done': ls.set('setup:' + st.uid, '1'); if (!ls.get('guideSeen')) openGuide(); else tab('home'); break;
        case 'tab': closeSheet(); tab(t.dataset.tab); break;
        case 'add': sheetAdd(); break;
        case 'invite': sheetInvite(t.dataset.k); break;
        case 'code': sheetCode(); setTimeout(() => $('#code-in')?.focus(), 300); break;
        case 'newgroup': sheetNewGroup(); break;
        case 'inv-copy': { const c = $('#inv-code').textContent; if (/^[A-Z0-9]{6}$/.test(c)) { await native.copy(c); toast('Codice copiato'); } break; }
        case 'inv-share': { const c = $('#inv-code').textContent; if (/^[A-Z0-9]{6}$/.test(c)) await native.share({ title: 'Vicina', text: inviteText(c) }); break; }
        case 'grp-share': { const g = groups().find(x => x.id === id); if (g) await native.share({ title: 'Vicina', text: `Entra nel gruppo "${g.name}" su Vicina con il codice: ${g.code}` }); break; }
        case 'redeem': {
          const c = ($('#code-in').value || '').trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(c)) return toast('Il codice ha 6 caratteri');
          await busy(t, async () => {
            const r = await api.call('redeemInvite', { code: c }); closeSheet(); native.haptic('medium');
            toast(r.kind === 'group' ? `Richiesta inviata a "${r.name}": attendi l'approvazione` : `Ora sei collegat${st.p.gender === 'm' ? 'o' : 'a'} con ${r.name}`);
            if (st.setup === 3 && $('#s-setup').classList.contains('on')) setup(3);
          });
          break;
        }
        case 'mkgroup': {
          const n = $('#g-name').value.trim(); if (!n) return toast('Dai un nome al gruppo');
          await busy(t, async () => {
            const r = await api.call('createGroup', { name: n });
            if (groups().some(g => g.id === r.groupId)) sheetGroup(r.groupId);
            else openSheet(`<h2>${esc(n)}</h2><p class="sub">Gruppo creato. Preparo il codice di invito…</p>`, 'group:' + r.groupId);
          });
          break;
        }
        case 'person': sheetPerson(id); break;
        case 'grp': sheetGroup(id); break;
        case 'unlink':
          if (await dialog({ title: 'Rimuovere dalla cerchia?', text: 'Non riceverete più gli SOS l\'uno dell\'altro e la chat sarà cancellata.', ok: 'Rimuovi', danger: true })) { await api.call('removeLink', { linkId: id }); closeSheet(); toast('Rimosso dalla cerchia'); }
          break;
        case 'decide': await api.call('decideJoin', { groupId: id, uid: t.dataset.uid, accept: t.dataset.ok === '1' }); break;
        case 'kick': if (await dialog({ title: 'Rimuovere dal gruppo?', text: 'La persona non riceverà più gli SOS del gruppo.', ok: 'Rimuovi', danger: true })) await api.call('removeMember', { groupId: id, uid: t.dataset.uid }); break;
        case 'leave': if (await dialog({ title: 'Uscire dal gruppo?', text: 'Per rientrare servirà di nuovo l\'approvazione dell\'admin.', ok: 'Esci', danger: true })) { await api.call('removeMember', { groupId: id, uid: st.uid }); closeSheet(); } break;
        case 'delgroup': if (await dialog({ title: 'Eliminare il gruppo?', text: 'Il gruppo e la sua chat verranno cancellati per tutti.', ok: 'Elimina', danger: true })) { await api.call('deleteGroup', { groupId: id }); closeSheet(); } break;
        case 'open': closeSheet(); closeIncoming(); openThread(id); break;
        case 'thread-back': st.open = null; tab(st.tab === 'home' ? 'chat' : st.tab, 'in-pop'); break;
        case 'send': sendText(); break;
        case 'send-cancel': break;
        case 'safe': await markSafe(t); break;
        case 'voice-start': await voiceStart(); break;
        case 'map-focus': { if ($('#ov-in').classList.contains('on')) { st.dismissed.add(st.shownIn); closeIncoming(); } closeSheet(); tab('map'); mapFocus(id, +t.dataset.lat, +t.dataset.lng); break; }
        case 'map-nav': case 'map-open': { const p = mapPeople().find(x => x.id === id) || (() => { const x = st.sosIn.find(y => y.id === id); return x && { lat: x.lat, lng: x.lng, name: x.fromName }; })(); if (p && p.lat != null) native.openMaps(p.lat, p.lng, p.name, a === 'map-nav'); else toast('Posizione non disponibile'); break; }
        case 'map-me': { const me = await refreshMyPos(true); if (me && mapApi) mapApi.center(me.lat, me.lng); else if (!me) toast('Posizione non disponibile: attiva il GPS'); break; }
        case 'map-all': if (mapApi) mapApi.showAll(mapPeople(), st.myPos); break;
        case 'map-retry': mapFailed = false; openMapTab(); break;
        case 'voice-send': await voiceSend(); break;
        case 'voice-cancel': voiceCancel(); break;
        case 'active-chat': { const c = st.sosMine?.chats?.[0]; if (c) openThread(c); break; }
        case 'in-close': st.dismissed.add(st.shownIn); closeIncoming(); rChats(); break;
        case 'in-open': { const s = st.sosIn.find(x => x.id === id); if (s) { st.dismissed.delete(id); showIncoming(s); } break; }
        case 'in-ack': await busy(t, async () => { await api.call('ackSos', { sosId: id }); st.dismissed.add(id); closeIncoming(); toast('Abbiamo avvisato che te ne occupi tu'); }); break;
        case 'in-chat': { const s = st.sosIn.find(x => x.id === id); st.dismissed.add(id); closeIncoming(); const c = s?.chats?.find(c => convs().some(x => x.id === c)); if (c) openThread(c); else tab('chat'); break; }
        case 'ai': closeSheet(); openAI(); break;
        case 'ai-back': tab(st.tab || 'home', 'in-pop'); break;
        case 'ai-send': sendAI($('#ai-txt').value); break;
        case 'ai-chip': sendAI(t.dataset.q); break;
        case 'ai-diag': await diagAI(t); break;
        case 'ai-sos': tab('home'); toast('Tieni premuto il pulsante SOS'); break;
        case 'ai-clear': if (await dialog({ title: 'Nuova conversazione?', text: 'La conversazione con l\'assistente verrà cancellata da questo telefono.', ok: 'Cancella', danger: true })) { aiMsgs = []; aiSave(); rAI(); } break;
        case 'phone': sheetPhone(); break;
        case 'perm-sheet': sheetPerms(); break;
        case 'guide': closeSheet(); openGuide(); break;
        case 'guide-next': if (gi === GUIDE.length - 1) closeGuide(); else guideGo(gi + 1); break;
        case 'guide-prev': guideGo(gi - 1); break;
        case 'guide-close': closeGuide(); break;
        case 'phone-save': {
          const v = $('#ph-in').value.trim(); if (v && !/^\+?[\d\s.-]{6,20}$/.test(v)) return toast('Numero non valido');
          await busy(t, async () => { await api.updateProfile(st.uid, { phone: v }); st.p.phone = v; closeSheet(); rMe(); toast('Salvato'); });
          break;
        }
        case 'perms': await busy(t, async () => { await native.requestPerms(); await refreshPerms(); await registerPush(); }); rMe(); if (curSheet === 'perms') sheetPerms(); break;
        case 'logout': if (await dialog({ title: 'Uscire da Vicina?', text: 'Finché non accedi di nuovo non riceverai gli SOS della tua cerchia.', ok: 'Esci', danger: true })) await api.signOut(); break;
        case 'delete':
          if (await dialog({ title: 'Eliminare l\'account?', text: 'Cancelleremo profilo, collegamenti, gruppi di cui sei admin, chat e foto. Non si può annullare.', ok: 'Elimina', danger: true })) {
            await busy(t, async () => { await api.call('deleteAccount'); await api.signOut().catch(() => {}); toast('Account eliminato'); });
          }
          break;
      }
    } catch (err) { console.warn(err); toast(errMsg(err)); }
  });

  /* ================= dati in tempo reale ================= */
  function startData() {
    if (unwatch) return;
    unwatch = api.watch(st.uid, {
      user: d => { st.muted = d?.mutedGroups || []; if (d) st.p = { ...st.p, ...pick(d) }; render(); },
      links: ls_ => {
        const before = new Set(st.links.map(l => l.id)), first = !linksLoaded; linksLoaded = true;
        st.links = ls_.map(l => { const o = l.uids.find(x => x !== st.uid); return { id: l.id, kind: l.kind, other: o, otherName: l.names?.[o] || 'Contatto' }; });
        const added = first ? null : st.links.find(l => !before.has(l.id));
        if (added && curSheet === 'invite') { closeSheet(); native.haptic('medium'); toast('Collegamento riuscito con ' + added.otherName); }
        syncChats(); render(); refreshSheet(); if ($('#s-setup').classList.contains('on') && st.setup === 3) setup(3);
      },
      groups: gs => {
        st.groups = gs.map(g => ({ id: g.id, name: g.name, code: g.code, adminUid: g.adminUid, admin: g.adminUid === st.uid,
          members: Object.entries(g.members || {}).map(([uid, name]) => ({ uid, name })).sort((a, b) => (b.uid === g.adminUid) - (a.uid === g.adminUid)),
          req: Object.entries(g.requests || {}).map(([uid, name]) => ({ uid, name })) }));
        syncChats(); render(); refreshSheet(); if ($('#s-setup').classList.contains('on') && st.setup === 3) setup(3);
      },
      sosIn: list => { st.sosIn = list.filter(s => Date.now() - s.at < 12 * 36e5); checkIncoming(); rChats(); rBadge(); rMap(); if (st.open) rThread(); },
      sosMine: list => {
        const was = !!st.sosMine; st.sosMine = list.filter(s => Date.now() - s.at < 12 * 36e5).sort((a, b) => b.at - a.at)[0] || null;
        if (st.sosMine) { intro.done(true); if (live.sosId !== st.sosMine.id) startLive(st.sosMine.id, st.sosMine.liveUntil || st.sosMine.at + 12 * 36e5); rActive(); if (!sending && ['s-home', 's-active'].some(s => $('#' + s).classList.contains('on'))) show('s-active'); }
        else { if (live.sosId) stopLive(false); if (was && $('#s-active').classList.contains('on')) tab('home'); }
        rMap();
      }
    });
  }
  const pick = d => ({ name: d.name, surname: d.surname, dob: d.dob, gender: d.gender, phone: d.phone || '' });
  function refreshSheet() {
    if (!curSheet) return;
    if (curSheet.startsWith('group:')) sheetGroup(curSheet.slice(6));
  }
  function stopData() {
    unwatch?.(); unwatch = null; linksLoaded = false; Object.values(chatUn).forEach(f => f()); chatUn = {};
    Object.assign(st, { uid: null, email: '', p: null, links: [], groups: [], muted: [], threads: {}, sosIn: [], sosMine: null, open: null, dismissed: new Set(), shownIn: null });
    closeSheet(); closeIncoming(); $('#ov-send').classList.remove('on');
  }

  /* ================= push ================= */
  let pushReady = false;
  async function registerPush() {
    if (!st.uid) return;
    try {
      await native.pushInit({
        onToken: tok => st.uid && api.saveToken(st.uid, tok).catch(() => {}),
        onTap: data => {
          intro.done(true);
          if (!data) return;
          if (data.type === 'sos' && data.sosId) { st.dismissed.delete(data.sosId); const s = st.sosIn.find(x => x.id === data.sosId); if (s) showIncoming(s); }
          else if (data.chatId) setTimeout(() => openThread(data.chatId), 300);
        }
      });
      pushReady = true;
    } catch (e) { console.warn('push', e); }
  }

  /* ================= tasto indietro Android ================= */
  native.onBack(() => {
    if ($('#dlg-scrim').classList.contains('on')) { $('#dlg-scrim').click(); return true; }
    if ($('#scrim').classList.contains('on')) { closeSheet(); return true; }
    if ($('#ov-in').classList.contains('on')) { st.dismissed.add(st.shownIn); closeIncoming(); return true; }
    if ($('#s-ai').classList.contains('on')) { tab(st.tab || 'home', 'in-pop'); return true; }
    if ($('#s-guide').classList.contains('on')) { if (gi > 0) guideGo(gi - 1); else closeGuide(); return true; }
    if ($('#s-thread').classList.contains('on')) { $('[data-a="thread-back"]').click(); return true; }
    if ($('#s-auth').classList.contains('on')) { show('s-wel'); return true; }
    if ($('#s-setup').classList.contains('on') && st.setup > 1) { setup(st.setup - 1); return true; }
    if (st.uid && st.p && st.tab !== 'home') { tab('home'); return true; }
    return false;
  });

  /* ================= avvio ================= */
  if (api.demo) $('#demo-tag').hidden = false;
  api.onAuth(async u => {
    if (!u) { stopData(); show(ls.get('seen') ? 's-auth' : 's-wel'); authMode(ls.get('seen') ? 'in' : 'up'); return; }
    if (st.uid === u.uid && st.p) return;
    st.uid = u.uid; st.email = u.email || '';
    try {
      const p = await api.getProfile(u.uid);
      await refreshPerms();
      if (!p) { draft = { gender: null }; return setup(1); }
      st.p = pick(p); startData();
      if (ls.get('permAsked')) registerPush();
      if (!ls.get('setup:' + u.uid) && !ls.get('permAsked')) return setup(2);
      tab('home');
    } catch (e) { toast(errMsg(e)); show('s-auth'); }
  });
}
