// Altri strumenti di Vicina, quasi tutti collegati alle app del telefono:
// Mappe (casa, luoghi sicuri, punto d'incontro), taxi, WhatsApp/Telegram/Email, Calendario, torcia vera, voce,
// video, schermo nero, schermata di copertura, batteria, controllo sicurezza, scorciatoie e app ufficiali.
export function createExtra(ctx, base) {
  const { $, I, esc, toast, openSheet, closeSheet, native, ls, prefs, savePrefs, mapsLink, hhmm, uid, profile } = ctx;
  const { showOv, closeOv, keepAwake, buzz, startWalk, sheetWhere, sx } = base.h;
  const ov = base.h.ov;
  const P = native.platform || 'web';
  const enc = encodeURIComponent;
  const open = url => native.openUrl(url);
  const km = (a, b) => { const R = 6371, r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r; const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const dist = d => (d < 1 ? Math.round(d * 1000 / 10) * 10 + ' m' : d.toFixed(1).replace('.', ',') + ' km');
  const pos = async () => { const p = await native.getPos().catch(() => null); if (!p) toast('Posizione non disponibile: controlla il GPS'); return p; };

  /* ---------- link alle app ---------- */
  const dirUrl = (p, mode) => P === 'ios'
    ? `maps://?daddr=${p.lat},${p.lng}&dirflg=${{ walk: 'w', transit: 'r', drive: 'd' }[mode]}`
    : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=${{ walk: 'walking', transit: 'transit', drive: 'driving' }[mode]}`;
  const searchUrl = (q, p) => P === 'ios' ? `maps://?q=${enc(q)}&sll=${p.lat},${p.lng}`
    : P === 'android' ? `geo:${p.lat},${p.lng}?q=${enc(q)}` : `https://www.google.com/maps/search/${enc(q)}/@${p.lat},${p.lng},15z`;
  const wa = (num, text) => `https://wa.me/${(num || '').replace(/[^\d]/g, '')}?text=${enc(text)}`;
  const tg = (text, link) => `https://t.me/share/url?url=${enc(link || '')}&text=${enc(text)}`;
  const mail = (subject, body) => `mailto:?subject=${enc(subject)}&body=${enc(body)}`;
  const store = (q) => P === 'ios' ? `itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=${enc(q)}` : `https://play.google.com/store/search?q=${enc(q)}&c=apps`;
  // barra «manda con…» riutilizzata da più strumenti
  const sendBar = (key) => `<div class="send-with"><button class="sw wa" data-a="x-send" data-via="wa" data-k="${key}">WhatsApp</button><button class="sw tg" data-a="x-send" data-via="tg" data-k="${key}">Telegram</button><button class="sw sm" data-a="x-send" data-via="sms" data-k="${key}">SMS</button><button class="sw ml" data-a="x-send" data-via="mail" data-k="${key}">Email</button><button class="sw ot" data-a="x-send" data-via="share" data-k="${key}">Altro…</button></div>`;
  const outbox = {};   // testi pronti da inviare (chiave → { text, link, num })
  async function sendVia(via, k) {
    const o = outbox[k]; if (!o) return;
    if (via === 'wa') return open(wa(o.num, o.text));
    if (via === 'tg') return open(tg(o.text, o.link));
    if (via === 'sms') return native.composeSms(o.num ? [o.num] : [], o.text);
    if (via === 'mail') return open(mail(o.subject || 'Vicina', o.text));
    return native.share({ title: 'Vicina', text: o.text });
  }

  /* ---------- Portami a casa ---------- */
  const HK = () => 'home:' + uid();
  const home = () => { try { return JSON.parse(ls.get(HK()) || 'null'); } catch { return null; } };
  async function sheetHome() {
    const h = home();
    if (!h) return sheetHomeSet();
    const p = await native.getPos().catch(() => null);
    const d = p ? km(p, h) : null;
    const walkMin = d != null ? Math.max(5, Math.round(d * 1.3 / 4.5 * 60)) : 20;
    openSheet(`<h2>Portami a casa</h2><p class="sub">${esc(h.label || 'Casa')}${d != null ? ' · a ' + dist(d) + ' in linea d\'aria' : ''}</p>
      <div class="big-acts">
        <button class="big-act" data-a="home-go" data-m="walk">${I('user')}<b>A piedi</b><span>${d != null ? 'circa ' + walkMin + ' min' : ''}</span></button>
        <button class="big-act" data-a="home-go" data-m="transit">${I('send')}<b>Con i mezzi</b><span>bus, metro, treno</span></button>
        <button class="big-act" data-a="home-go" data-m="drive">${I('pin')}<b>In auto</b><span>o in taxi</span></button>
      </div>
      <label class="row toggle-row"><i class="ic-dot red">${I('shield')}</i><div class="fl wrap"><b>Accompagnami fino a casa</b><span>Se non arrivi entro ${walkMin + 10} minuti ti chiedo se va tutto bene</span></div><input type="checkbox" class="switch" id="hm-walk" checked></label>
      <label class="row toggle-row"><i class="ic-dot green">${I('send')}</i><div class="fl wrap"><b>Avvisa la cerchia che parto</b><span>«Sto tornando a casa, arrivo verso le ${hhmm(Date.now() + walkMin * 60000)}»</span></div><input type="checkbox" class="switch" id="hm-tell"></label>
      <input type="hidden" id="hm-min" value="${walkMin}">
      <button class="btn ghost sm" data-a="home-set">Cambia indirizzo di casa</button>`, 'home');
  }
  function sheetHomeSet() {
    openSheet(`<h2>Dov'è casa?</h2><p class="sub">Lo salvo solo su questo telefono, per portarti a casa con un tocco.</p>
      <button class="btn" data-a="home-here">${I('pin')}Sono a casa adesso: usa questa posizione</button>
      <div class="or">oppure scrivi l'indirizzo</div>
      <label class="field"><input id="hm-addr" maxlength="120" placeholder="Via Roma 10, Milano"></label>
      <button class="btn ghost" data-a="home-find">Cerca indirizzo</button>`, 'home-set');
  }
  async function geocode(q) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&accept-language=it&q=${enc(q)}`, { headers: { Accept: 'application/json' } });
    const j = await r.json(); if (!j[0]) throw new Error('Indirizzo non trovato');
    return { lat: Number(j[0].lat), lng: Number(j[0].lon), label: q };
  }

  /* ---------- Luoghi sicuri vicini (OpenStreetMap) ---------- */
  const CATS = [
    ['police', 'Polizia e carabinieri', 'shield', e => e.amenity === 'police'],
    ['hospital', 'Pronto soccorso', 'heart', e => e.amenity === 'hospital' || e.amenity === 'clinic'],
    ['pharmacy', 'Farmacie', 'plus', e => e.amenity === 'pharmacy'],
    ['defib', 'Defibrillatori', 'heart', e => e.emergency === 'defibrillator'],
    ['open', 'Aperti 24 ore', 'clock', e => /24\/7/.test(e.opening_hours || '')]
  ];
  let safeCache = null;
  async function sheetSafe(cat = 'police') {
    openSheet(`<h2>Luoghi sicuri vicini</h2><p class="sub">Posti dove entrare e chiedere aiuto, con la strada a piedi.</p>
      <div class="tabs" id="sf-tabs">${CATS.map(([k, t]) => `<button data-a="safe-cat" data-k="${k}" class="${k === cat ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div id="sf-list"><div class="where-load">${I('pin')}Cerco intorno a te…</div></div>`, 'safe');
    const p = await native.getPos().catch(() => null);
    if (!p) { $('#sf-list').innerHTML = `<p class="note">Posizione non disponibile.</p>`; return; }
    try {
      if (!safeCache || Date.now() - safeCache.at > 600000 || km(safeCache.p, p) > 0.4 || (safeCache.only && safeCache.only !== cat)) {
        const q = `[out:json][timeout:25];(nwr(around:3000,${p.lat},${p.lng})[amenity~"^(police|hospital|clinic|pharmacy|fuel)$"];nwr(around:3000,${p.lat},${p.lng})[emergency=defibrillator];nwr(around:3000,${p.lat},${p.lng})[shop~"^(supermarket|convenience)$"][opening_hours="24/7"];);out center tags 200;`;
        const term = { police: 'carabinieri', hospital: 'ospedale', pharmacy: 'farmacia', defib: 'defibrillatore' }[cat];
        const j = await native.osm(q, { term, p, r: 3000 });
        safeCache = { at: Date.now(), p, only: j.elements.length && !j.elements.some(e => e.type) ? cat : null, items: j.elements.map(e => ({ ...e.tags, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon })).filter(e => e.lat != null) };
        if (safeCache.only && cat === 'police') safeCache.items.forEach(e => { e.amenity = 'police'; });
        if (safeCache.only && cat === 'defib') safeCache.items.forEach(e => { e.emergency = 'defibrillator'; });
      }
      rSafe(cat, p);
    } catch (e) {
      console.warn('overpass', e);
      $('#sf-list').innerHTML = `<p class="note">Non riesco a caricare i luoghi (serve internet). Cercali direttamente nelle mappe:</p>${fallbackSafe(p)}`;
    }
  }
  const fallbackSafe = p => `<div class="em-tools">${[['Carabinieri', 'carabinieri'], ['Polizia', 'polizia'], ['Pronto soccorso', 'pronto soccorso'], ['Farmacia', 'farmacia']].map(([t, q]) => `<button class="btn ghost sm" data-a="x-url" data-u="${esc(searchUrl(q, p))}">${t}</button>`).join('')}</div>`;
  function rSafe(cat, p) {
    const f = CATS.find(c => c[0] === cat)[3];
    const l = safeCache.items.filter(f).map(e => ({ ...e, d: km(p, e) })).sort((a, b) => a.d - b.d).slice(0, 12);
    const name = e => e.name || (e.emergency === 'defibrillator' ? 'Defibrillatore (DAE)' : e.amenity === 'police' ? (/carabin/i.test(e.operator || '') ? 'Carabinieri' : 'Polizia') : e.amenity === 'pharmacy' ? 'Farmacia' : e.amenity === 'fuel' ? 'Distributore' : e.amenity === 'hospital' ? 'Ospedale' : e.shop ? 'Negozio' : 'Luogo');
    const hrs = e => e.opening_hours === '24/7' ? '<span class="tag green">Aperto 24 ore</span>' : e.opening_hours ? esc(e.opening_hours.slice(0, 40)) : '';
    $('#sf-list').innerHTML = l.length ? `<div class="card safe-list">${l.map(e => {
      const tel = e.phone || e['contact:phone'];
      const addr = [e['addr:street'], e['addr:housenumber']].filter(Boolean).join(' ');
      return `<div class="row safe-row"><div class="fl wrap"><b>${esc(name(e))}</b><span>${dist(e.d)}${addr ? ' · ' + esc(addr) : ''}${e.emergency === 'yes' ? ' · <b>pronto soccorso</b>' : ''}</span><span>${hrs(e)}</span></div>
        <div class="safe-acts"><button class="btn red sm" data-a="x-url" data-u="${esc(dirUrl(e, 'walk'))}">${I('send')}Vai</button>${tel ? `<a class="btn ghost sm" href="tel:${esc(tel.replace(/[^\d+]/g, ''))}">${I('phone')}</a>` : ''}</div></div>`;
    }).join('')}</div><p class="note">Dati di OpenStreetMap: orari e numeri possono non essere aggiornati.</p>` : `<p class="note">Niente trovato entro 3 km.</p>${fallbackSafe(p)}`;
  }

  /* ---------- Taxi e passaggi ---------- */
  async function sheetTaxi() {
    const p = await native.getPos().catch(() => null);
    openSheet(`<h2>Taxi e passaggi</h2><p class="sub">Per tornare senza camminare da sol${sx()}.</p>
      <div class="card">
        <button class="row" data-a="x-url" data-u="https://m.uber.com/ul/?action=setPickup&pickup=my_location"><i class="ic-dot gray">${I('send')}</i><div class="fl"><b>Uber</b><span>Apre l'app con la tua posizione</span></div>${I('chev', 'chev')}</button>
        <button class="row" data-a="x-url" data-u="https://free-now.com/it/"><i class="ic-dot gray">${I('send')}</i><div class="fl"><b>FreeNow</b><span>Taxi nelle grandi città</span></div>${I('chev', 'chev')}</button>
        <button class="row" data-a="x-url" data-u="https://www.ittaxi.it/"><i class="ic-dot gray">${I('send')}</i><div class="fl"><b>itTaxi</b><span>Radiotaxi in tutta Italia</span></div>${I('chev', 'chev')}</button>
        ${p ? `<button class="row" data-a="x-url" data-u="${esc(searchUrl('taxi', p))}"><i class="ic-dot amber">${I('pin')}</i><div class="fl"><b>Taxi vicino a me</b><span>Posteggi e numeri nelle Mappe</span></div>${I('chev', 'chev')}</button>` : ''}
        <button class="row" data-a="ride-ask"><i class="ic-dot green">${I('people')}</i><div class="fl"><b>Chiedi un passaggio alla cerchia</b><span>Messaggio con la tua posizione</span></div>${I('chev', 'chev')}</button>
      </div>
      <button class="btn ghost" data-a="car">${I('shield')}Sali su un'auto? Annota la targa</button>`, 'taxi');
  }

  /* ---------- Salgo in un'auto ---------- */
  let carPhoto = null;
  function sheetCar() {
    carPhoto = null;
    openSheet(`<h2>Salgo in un'auto</h2><p class="sub">Taxi, Uber, BlaBlaCar o un passaggio: chi ti vuole bene sa su che auto sei.</p>
      <div class="choice wrap" id="car-kind">${['Taxi', 'Uber', 'BlaBlaCar', 'Passaggio'].map((k, i) => `<button data-c="${k}" class="${i ? '' : 'on'}">${k}</button>`).join('')}</div>
      <div class="field2"><label class="field"><span>Targa</span><input id="car-plate" maxlength="10" autocapitalize="characters" placeholder="AB123CD"></label>
      <label class="field"><span>Auto</span><input id="car-model" maxlength="40" placeholder="Fiat Panda bianca"></label></div>
      <label class="field"><span>Autista / note</span><input id="car-note" maxlength="80" placeholder="Nome, numero del taxi…"></label>
      <button class="btn ghost sm" data-a="car-photo">${I('camera')}<span id="car-ph">Foto della targa</span></button>
      <div class="field"><span>Quanto dura il viaggio</span><div class="choice wrap" id="car-min">${[10, 20, 30, 45, 60].map(m => `<button data-m="${m}" class="${m === 20 ? 'on' : ''}">${m} min</button>`).join('')}</div></div>
      <button class="btn red" data-a="car-go">${I('send')}Avvisa la cerchia e accompagnami</button>`, 'car');
  }

  /* ---------- Appuntamento sicuro ---------- */
  function sheetDate() {
    const t = new Date(Date.now() + 3600e3 - new Date().getTimezoneOffset() * 60000); t.setMinutes(0);
    openSheet(`<h2>Appuntamento sicuro</h2><p class="sub">Incontri qualcuno che conosci poco (app di incontri, compravendita, lavoro)? Lascia i dettagli a chi ti vuole bene.</p>
      <label class="field"><span>Chi incontri</span><input id="dt-who" maxlength="60" placeholder="Nome, profilo, numero"></label>
      <label class="field"><span>Dove</span><input id="dt-where" maxlength="80" placeholder="Bar Centrale, piazza Duomo"></label>
      <label class="field"><span>Quando</span><input id="dt-at" type="datetime-local" value="${t.toISOString().slice(0, 16)}"></label>
      <button class="btn" data-a="date-tell">${I('send')}Manda i dettagli alla cerchia</button>
      <div id="dt-send"></div>
      <div class="row2"><button class="btn ghost sm" data-a="date-cal">${I('clock')}Calendario</button><button class="btn ghost sm" data-a="date-check">${I('shield')}Check-in ogni 30 min</button></div>
      <p class="note">Il promemoria del calendario suona un'ora dopo l'inizio: «Fai sapere che stai bene».</p>`, 'date');
  }
  const dateInfo = () => {
    const who = ($('#dt-who')?.value || '').trim(), where = ($('#dt-where')?.value || '').trim(), at = Date.parse($('#dt-at')?.value || '') || Date.now();
    const when = new Date(at).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return { who, where, at, when, text: `📅 Ho un appuntamento ${when}${where ? ' a ' + where : ''}${who ? ' con ' + who : ''}. Se non mi senti entro un paio d'ore, chiamami.` };
  };
  function ics({ who, where, at }) {
    const z = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vicina//IT', 'BEGIN:VEVENT', `UID:${Date.now()}@vicina`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(at)}`, `DTEND:${z(at + 2 * 3600e3)}`,
      `SUMMARY:Appuntamento${who ? ' con ' + who : ''}`, `LOCATION:${where}`, 'DESCRIPTION:Ricordati di far sapere alla tua cerchia che stai bene.',
      'BEGIN:VALARM', 'TRIGGER:PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Fai sapere che stai bene', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  /* ---------- Serata fuori (check-in periodici) ---------- */
  function sheetNight() {
    openSheet(`<h2>Serata fuori</h2><p class="sub">Ogni tanto ti chiedo «Tutto bene?». Se per 60 secondi non rispondi, avviso la tua cerchia.</p>
      <label class="field"><span>Dove sei (facoltativo)</span><input id="nt-where" maxlength="40" placeholder="Es. concerto, discoteca"></label>
      <div class="field"><span>Ogni quanto</span><div class="choice wrap" id="nt-every">${[20, 30, 45, 60].map(m => `<button data-m="${m}" class="${m === 30 ? 'on' : ''}">${m} min</button>`).join('')}</div></div>
      <div class="field"><span>Per quanto</span><div class="choice wrap" id="nt-for">${[2, 3, 4, 6, 8].map(h => `<button data-h="${h}" class="${h === 4 ? 'on' : ''}">${h} ore</button>`).join('')}</div></div>
      <button class="btn red" data-a="night-go">${I('shield')}Inizia</button>`, 'night');
  }

  /* ---------- Avvisa su WhatsApp / Telegram ---------- */
  function sheetWa() {
    const cs = ctx.smsList();
    openSheet(`<h2>Manda un messaggio</h2><p class="sub">Con WhatsApp, Telegram, SMS o email, anche a chi non ha Vicina.</p>
      ${cs.length ? `<div class="chips" id="wa-to">${cs.map(c => `<button data-n="${esc(c.phone)}">${esc(c.name)}</button>`).join('')}</div>` : ''}
      <label class="field"><span>Numero (facoltativo per WhatsApp)</span><input id="wa-num" type="tel" maxlength="20" placeholder="+39 333 123 4567"></label>
      <div class="quick-list">${['Mi chiami adesso? Non sono tranquill' + sx(), 'Puoi venirmi a prendere?', 'Sto tornando a casa, ti scrivo quando arrivo', 'Se non ti rispondo entro mezz\'ora chiamami'].map(q => `<button class="quick-opt" data-a="wa-pick" data-t="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <label class="field"><span>Messaggio</span><input id="wa-txt" maxlength="300"></label>
      <label class="row toggle-row"><i class="ic-dot blue">${I('pin')}</i><div class="fl wrap"><b>Aggiungi la mia posizione</b></div><input type="checkbox" class="switch" id="wa-pos" checked></label>
      <button class="btn green" data-a="wa-prep">${I('send')}Prepara</button><div id="wa-send"></div>`, 'wa');
  }

  /* ---------- Parla per me ---------- */
  const SAY = {
    it: ['Ho bisogno di aiuto. Chiamate il 112, per favore.', 'Allontanati da me. Sto chiamando la polizia.', 'Non riesco a parlare. Leggete lo schermo del mio telefono.', "Mi sento male. Chiamate un'ambulanza."],
    en: ['I need help. Please call 112.', 'Stay away from me. I am calling the police.', 'I cannot speak. Please read my phone screen.', 'I feel sick. Please call an ambulance.'],
    es: ['Necesito ayuda. Llamen al 112, por favor.', 'Aléjate de mí. Estoy llamando a la policía.', 'No puedo hablar. Lean la pantalla de mi teléfono.', 'Me siento mal. Llamen a una ambulancia.'],
    fr: ["J'ai besoin d'aide. Appelez le 112, s'il vous plaît.", "Éloignez-vous de moi. J'appelle la police.", "Je ne peux pas parler. Lisez l'écran de mon téléphone.", 'Je me sens mal. Appelez une ambulance.'],
    de: ['Ich brauche Hilfe. Bitte rufen Sie 112 an.', 'Bleiben Sie weg von mir. Ich rufe die Polizei.', 'Ich kann nicht sprechen. Bitte lesen Sie meinen Bildschirm.', 'Mir geht es schlecht. Bitte rufen Sie einen Krankenwagen.']
  };
  const LANG = { it: 'it-IT', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' };
  let sayLoop = null;
  function sheetSpeak() {
    const l = ls.get('speakLang') || 'it';
    openSheet(`<h2>Parla per me</h2><p class="sub">Il telefono dice la frase ad alta voce: se non riesci a parlare, in chiamata con il 112 in vivavoce o per farti sentire da chi hai intorno.</p>
      <div class="choice wrap" id="sp-lang">${Object.keys(SAY).map(k => `<button data-l="${k}" class="${k === l ? 'on' : ''}">${k.toUpperCase()}</button>`).join('')}</div>
      <button class="btn red" data-a="speak-where">${I('pin')}Leggi dove mi trovo</button>
      <div class="quick-list">${SAY[l].map(q => `<button class="quick-opt" data-a="speak-say" data-t="${esc(q)}">${I('mic')} ${esc(q)}</button>`).join('')}</div>
      <label class="field"><span>Oppure scrivi tu</span><input id="sp-own" maxlength="200"></label>
      <div class="row2"><button class="btn ghost sm" data-a="speak-own">Leggi</button><button class="btn ghost sm" data-a="speak-loop">Ripeti di continuo</button><button class="btn ghost sm" data-a="speak-stop">Stop</button></div>
      <p class="note">Alza il volume. Per il 112: chiama, metti il vivavoce e tocca «Leggi dove mi trovo».</p>`, 'speak');
  }
  const say = t => { clearInterval(sayLoop); return native.vx.speak(t, LANG[ls.get('speakLang') || 'it']); };

  /* ---------- Torcia vera (LED) ---------- */
  let torchOn = false, torchMorse = null;
  async function torch(mode, { silent = false } = {}) {
    clearInterval(torchMorse); torchMorse = null;
    try {
      if (mode === 'off') { await native.vx.torch(false); torchOn = false; }
      else if (mode === 'sos') {
        const PAT = '1010100011101110111000101010000000'; let i = 0; torchOn = true;
        await native.vx.torch(true);
        torchMorse = setInterval(() => { native.vx.torch(PAT[i] === '1').catch(() => {}); i = (i + 1) % PAT.length; }, 240);
      } else { await native.vx.torch(!torchOn); torchOn = !torchOn; }
      rTorch();
    } catch (e) { torchOn = false; if (silent) return; toast('Torcia non disponibile su questo telefono: uso lo schermo'); closeSheet(); base.h.light('fix'); }
  }
  const rTorch = () => { const b = $('#tr-state'); if (b) b.textContent = torchMorse ? 'SOS luminoso in corso' : torchOn ? 'Accesa' : 'Spenta'; $('#tr-big')?.classList.toggle('on', torchOn || !!torchMorse); };
  const sheetTorch = () => openSheet(`<h2>Torcia</h2><p class="sub">Il flash del telefono: per vedere al buio o per farti notare da lontano.</p>
    <button class="torch-big ${torchOn || torchMorse ? 'on' : ''}" id="tr-big" data-a="torch" data-m="toggle">${I('spark')}<b id="tr-state">${torchMorse ? 'SOS luminoso in corso' : torchOn ? 'Accesa' : 'Spenta'}</b></button>
    <div class="row2"><button class="btn ghost sm" data-a="torch" data-m="sos">SOS luminoso</button><button class="btn ghost sm" data-a="torch" data-m="off">Spegni</button></div>`, 'torch');

  /* ---------- Video, schermo nero, copertura ---------- */
  function video() {
    closeSheet();
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/*'; inp.setAttribute('capture', 'environment');
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return;
      lastVideo = f;
      openSheet(`<h2>Video registrato</h2><p class="sub">${Math.round(f.size / 1048576 * 10) / 10} MB · ${new Date().toLocaleString('it-IT')}. Salvalo o mandalo subito: è una prova.</p>
        <video class="proof-img" src="${URL.createObjectURL(f)}" controls playsinline></video>
        <button class="btn" data-a="video-share">${I('share')}Salva o condividi</button>`, 'video');
    };
    inp.click();
  }
  let lastVideo = null, blackRec = null, blackHold = null;
  async function blackScreen(rec) {
    closeSheet();
    if (rec) { try { blackRec = await native.startRecording(); } catch { toast('Microfono non disponibile: solo schermo nero'); } }
    const t0 = Date.now();
    showOv('black', `<p class="blk-hint" id="blk-hint">${rec && blackRec ? 'Registrazione in corso. ' : ''}Tieni premuto lo schermo 2 secondi per uscire</p>`, async () => { clearTimeout(blackHold); keepAwake(false); });
    keepAwake(true);
    setTimeout(() => $('#blk-hint')?.classList.add('gone'), 2500);
    ov.onpointerdown = () => { clearTimeout(blackHold); blackHold = setTimeout(endBlack, 2000); };
    ov.onpointerup = ov.onpointercancel = () => clearTimeout(blackHold);
    async function endBlack() {
      ov.onpointerdown = ov.onpointerup = ov.onpointercancel = null;
      const r = blackRec; blackRec = null; closeOv();
      if (!r) return;
      const res = await r.stop().catch(() => null);
      if (!res?.blob?.size) return;
      const name = `vicina-audio-${new Date(t0).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${res.ext}`;
      lastBlack = { blob: res.blob, name };
      openSheet(`<h2>Registrazione salvata</h2><p class="sub">${Math.round(res.ms / 1000)} secondi registrati a schermo nero.</p><audio controls src="${URL.createObjectURL(res.blob)}" class="proof-audio"></audio>
        <button class="btn" data-a="black-share">${I('share')}Salva o condividi</button>`, 'black-done');
    }
  }
  let lastBlack = null, coverTaps = [];
  function cover() {
    closeSheet();
    const notes = [['Lista spesa', 'latte, pane, mele, caffè, detersivo'], ['Idee regali', 'libro di cucina, sciarpa blu'], ['Da fare', 'chiamare il dentista, pagare bolletta'], ['Ricetta torta', '3 uova, 200 g farina, 150 g zucchero…'], ['Film da vedere', '']];
    showOv('cover', `<div class="cv-top"><b id="cv-title">Note</b><span>${notes.length} note</span></div>
      <div class="cv-list">${notes.map(([t, s]) => `<div class="cv-note"><b>${t}</b><span>${new Date(Date.now() - Math.random() * 6e8).toLocaleDateString('it-IT')} · ${s || 'Nessun testo aggiuntivo'}</span></div>`).join('')}</div>
      <p class="cv-hint" id="cv-hint">Per tornare a Vicina tocca 3 volte «Note»</p>`, () => {});
    setTimeout(() => $('#cv-hint')?.classList.add('gone'), 3000);
    $('#cv-title').onclick = () => { const n = Date.now(); coverTaps = coverTaps.filter(x => n - x < 1200); coverTaps.push(n); if (coverTaps.length >= 3) { coverTaps = []; closeOv(); } };
  }

  /* ---------- Batteria ---------- */
  let lastBattery = null;
  async function readBattery() { const b = await native.vx.battery().catch(() => null); if (b && b.level >= 0) lastBattery = b; return lastBattery; }
  async function sheetBattery() {
    const b = await readBattery();
    openSheet(`<h2>Batteria</h2><p class="sub">${b ? `Ora: <b>${b.level}%</b>${b.charging ? ' · in carica' : ''}` : 'Livello non disponibile su questo telefono.'}</p>
      <label class="row toggle-row"><i class="ic-dot amber">${I('alert')}</i><div class="fl wrap"><b>Avvisa la cerchia sotto il 15%</b><span>Se il telefono si sta scaricando mando l'ultima posizione: così sanno perché non rispondi</span></div><input type="checkbox" class="switch" data-pref="lowBattery" ${prefs.lowBattery !== false ? 'checked' : ''}></label>
      <button class="btn ghost" data-a="battery-now">${I('send')}Manda adesso batteria e posizione</button>
      <p class="note">Consigli: attiva il risparmio energetico, abbassa la luminosità, chiudi le app che non usi. Il 112 si chiama anche con il telefono quasi scarico.</p>`, 'battery');
  }
  async function batteryMsg() {
    const b = await readBattery(), p = await native.getPos().catch(() => null);
    return `🔋 Ho la batteria ${b ? 'al ' + b.level + '%' : 'quasi scarica'}: se non rispondo è per questo.${p ? '\nUltima posizione: ' + mapsLink(p) : ''}`;
  }
  async function batteryWatch() {
    if (!uid()) return;
    const b = await readBattery(); if (!b) return;
    const key = 'lowSent:' + uid();
    if (b.charging || b.level > 30) { if (ls.get(key)) ls.set(key, ''); return; }
    if (prefs.lowBattery !== false && b.level <= 15 && ls.get(key) !== '1') {
      ls.set(key, '1');
      const n = await ctx.quickSend(await batteryMsg()); if (n) toast('Batteria scarica: ho avvisato la tua cerchia');
    }
  }

  /* ---------- Controllo sicurezza ---------- */
  async function sheetCheck() {
    const s = await ctx.status(), m = base.h.med(), b = await readBattery();
    const hasMed = !!(m.blood && m.blood !== 'Non so' || m.allergies || m.meds || m.conditions);
    const items = [
      [s.circle > 0, `Cerchia: ${s.circle} ${s.circle === 1 ? 'persona' : 'persone'}`, 'Senza nessuno il tasto SOS non avvisa nessuno', 'add', 'Aggiungi'],
      [s.perm.loc === 'granted', 'Posizione consentita', 'Serve per mandare dove sei', 'x-settings', 'Apri impostazioni'],
      [s.perm.cam === 'granted', 'Fotocamera consentita', 'Per le 2 foto dell\'SOS', 'x-settings', 'Apri impostazioni'],
      [s.perm.push === 'granted', 'Notifiche attive', 'Per ricevere gli avvisi della cerchia', 'x-settings', 'Apri impostazioni'],
      [!!s.phone, 'Il tuo numero nel profilo', 'Chi ti aiuta può chiamarti', 'phone', 'Aggiungi'],
      [s.sms > 0, `Contatti SMS: ${s.sms}`, 'Avvisa anche chi non ha l\'app', 'sms-add', 'Aggiungi'],
      [hasMed, 'Scheda medica', 'Allergie e farmaci per i soccorritori', 'med', 'Compila'],
      [ls.get('testDone:' + uid()) === '1', 'Prova della cerchia', 'Verifica che i messaggi arrivino', 'test', 'Fai la prova'],
      [ls.get('shortcutsSeen') === '1', 'Scorciatoie impostate', 'SOS dall\'icona, dal widget o con «Tocca il retro»', 'shortcuts', 'Guarda come'],
      [!b || b.level > 20 || b.charging, `Batteria ${b ? b.level + '%' : ''}`, 'Sotto il 20% mettila in carica', 'battery', 'Dettagli']
    ];
    const ok = items.filter(x => x[0]).length;
    openSheet(`<h2>Controllo sicurezza</h2><p class="sub">Un minuto per essere sicur${sx()} che tutto funzioni quando serve.</p>
      <div class="chk-score"><div class="chk-ring" style="--p:${ok / items.length}"><b>${ok}/${items.length}</b></div><span>${ok === items.length ? 'Tutto pronto 👍' : 'Sistema i punti qui sotto'}</span></div>
      <div class="card">${items.map(([v, t, sub, a, l]) => `<div class="row chk-row ${v ? 'ok' : ''}"><i class="chk-ic">${I(v ? 'check' : 'alert')}</i><div class="fl wrap"><b>${t}</b><span>${sub}</span></div>${v ? '' : `<button class="btn ghost sm" data-a="${a}">${l}</button>`}</div>`).join('')}</div>`, 'check');
  }

  /* ---------- Chiamate rapide, app ufficiali, scorciatoie, funzioni del telefono ---------- */
  function sheetCalls() {
    const cs = ctx.smsList();
    openSheet(`<h2>Chiamate rapide</h2><p class="sub">Un tocco per chiamare o scrivere.</p>
      <div class="card">${[['112', 'Emergenza', 'red'], ['1522', 'Antiviolenza e stalking', 'violet']].map(([n, t, c]) => `<a class="row" href="tel:${n}"><i class="ic-dot ${c}">${I('phone')}</i><div class="fl"><b>${t}</b><span>${n}</span></div>${I('chev', 'chev')}</a>`).join('')}
      ${cs.map(c => `<div class="row"><i class="ic-dot green">${I('user')}</i><div class="fl"><b>${esc(c.name)}</b><span>${esc(c.phone)}</span></div><div class="safe-acts"><a class="btn ghost sm" href="tel:${esc(c.phone)}">${I('phone')}</a><button class="btn ghost sm" data-a="x-url" data-u="${esc(wa(c.phone, ''))}">WA</button></div></div>`).join('')}</div>
      ${cs.length ? '' : `<p class="note">Aggiungi i tuoi contatti in Cerchia → Senza app, e li trovi qui.</p><button class="btn ghost" data-a="sms-add">${I('plus')}Aggiungi contatto</button>`}`, 'calls');
  }
  const sheetOfficial = () => openSheet(`<h2>App e servizi ufficiali</h2><p class="sub">Servizi pubblici gratuiti, utili da avere già installati.</p>
    <div class="card">
      <button class="row" data-a="x-url" data-u="${esc(store('Where ARE U'))}"><i class="ic-dot red">${I('phone')}</i><div class="fl wrap"><b>Where ARE U</b><span>L'app ufficiale del 112: manda la tua posizione all'operatore e permette di chiamare anche in silenzio, via chat</span></div>${I('chev', 'chev')}</button>
      <button class="row" data-a="x-url" data-u="${esc(store('YouPol'))}"><i class="ic-dot blue">${I('shield')}</i><div class="fl wrap"><b>YouPol</b><span>Polizia di Stato: segnalazioni di violenza, bullismo e spaccio, anche anonime, con foto</span></div>${I('chev', 'chev')}</button>
      <button class="row" data-a="x-url" data-u="https://www.1522.eu/"><i class="ic-dot violet">${I('chat')}</i><div class="fl wrap"><b>1522 · chat</b><span>Antiviolenza e stalking: chat e telefono gratuiti, 24 ore su 24</span></div>${I('chev', 'chev')}</button>
      <button class="row" data-a="x-url" data-u="https://www.commissariatodips.it/"><i class="ic-dot gray">${I('lock')}</i><div class="fl wrap"><b>Commissariato online</b><span>Truffe online, ricatti e furti d'identità</span></div>${I('chev', 'chev')}</button>
    </div>`, 'official');
  function sheetShortcuts() {
    ls.set('shortcutsSeen', '1');
    const ios = P === 'ios';
    openSheet(`<h2>Scorciatoie e widget</h2><p class="sub">Per far partire l'SOS senza cercare l'app.</p>
      ${ios ? `<div class="label">Tieni premuta l'icona</div><p class="note-b">Dall'icona di Vicina escono SOS, Sirena, Accompagnami e Finta chiamata.</p>
      <div class="label">Widget (Home e schermata di blocco)</div><ol class="steps-list"><li>Tieni premuto sulla schermata Home → <b>+</b> in alto → cerca <b>Vicina</b>.</li><li>Scegli tra i 10 widget (SOS, Chiama 112, Panico, Sirena, Finta chiamata, Accompagnami, Portami a casa, Sto bene, Torcia, Pannello rapido) e aggiungilo.</li><li>Puoi metterli anche sulla <b>schermata di blocco</b> (tieni premuto il lock screen → Personalizza → aggiungi widget).</li></ol>
      <div class="label">«Tocca il retro» (2 o 3 tocchi sul retro dell'iPhone)</div>
      <ol class="steps-list"><li>Apri <b>Comandi</b> → <b>+</b> → «Aggiungi azione» → cerca <b>Apri URL</b>.</li><li>Incolla <b>vicina://sos</b> (copialo qui sotto) e chiama il comando «Vicina SOS».</li><li><b>Impostazioni → Accessibilità → Tocco → Tocca il retro</b> → Tocco triplo → scegli «Vicina SOS».</li><li>Puoi anche dire <b>«Ehi Siri, Vicina SOS»</b>.</li></ol>`
      : `<div class="label">Tieni premuta l'icona</div><p class="note-b">Dall'icona di Vicina escono SOS, Sirena, Accompagnami e Finta chiamata. Puoi trascinarli sulla schermata Home.</p>
      <div class="label">Widget sulla Home</div><ol class="steps-list"><li>Tieni premuto su uno spazio vuoto della schermata Home → <b>Widget</b>.</li><li>Cerca <b>Vicina</b>: ci sono 10 widget (SOS, Chiama 112, Panico, Sirena, Finta chiamata, Accompagnami, Portami a casa, Sto bene, Torcia e il Pannello rapido con 4 tasti).</li><li>Il widget <b>SOS</b> fa partire il conto alla rovescia di 3 secondi; <b>Chiama 112</b> apre subito la chiamata; gli altri fanno subito la loro azione.</li></ol>`}
      <p class="note">Ogni scorciatoia apre il conto alla rovescia di 5 secondi: se l'hai toccata per sbaglio, annulli.</p>
      <div class="row2"><button class="btn ghost sm" data-a="x-copy" data-t="vicina://sos">${I('copy')}Copia vicina://sos</button><button class="btn ghost sm" data-a="x-test-url">Prova</button></div>`, 'shortcuts');
  }
  const sheetPhoneSos = () => openSheet(`<h2>Le funzioni del tuo telefono</h2><p class="sub">Il telefono ha già alcune funzioni di emergenza: attivale, funzionano anche se Vicina è chiusa.</p>
    ${P === 'android' ? `<ol class="steps-list"><li><b>Emergency SOS</b>: Impostazioni → Sicurezza ed emergenza → Emergency SOS. Premendo 5 volte il tasto di accensione chiama il 112.</li><li><b>Informazioni di emergenza</b>: nella stessa schermata aggiungi gruppo sanguigno, allergie e contatti: si vedono anche a telefono bloccato.</li><li><b>Condivisione posizione</b> di Google Maps con una persona fidata: Maps → foto profilo → Condivisione posizione.</li></ol>`
      : `<ol class="steps-list"><li><b>Chiamata d'emergenza</b>: tieni premuti il tasto laterale e un tasto del volume finché compare il cursore e continua a tenere: chiama il 112.</li><li><b>Cartella clinica</b>: app Salute → foto profilo → Cartella clinica → «Mostra se bloccato». I soccorritori la vedono a telefono bloccato.</li><li><b>Dov'è</b>: condividi la posizione con una persona fidata.</li><li><b>Controllo sicurezza</b> (Impostazioni → Privacy e sicurezza): se ti senti controllat${sx()}, rivedi chi ha accesso alla tua posizione.</li></ol>
      <button class="btn ghost" data-a="x-url" data-u="x-apple-health://">${I('heart')}Apri Salute</button>`}`, 'phone-sos');

  /* ---------- Punto d'incontro ---------- */
  async function sheetMeet() {
    const p = await pos(); if (!p) return;
    outbox.meet = { text: `📍 Ci vediamo qui: ${mapsLink(p)}`, link: mapsLink(p) };
    openSheet(`<h2>Punto d'incontro</h2><p class="sub">Manda il punto esatto in cui sei a chi ti deve raggiungere.</p>
      <div class="where-ll"><div><small>Latitudine</small><b>${p.lat.toFixed(5)}</b></div><div><small>Longitudine</small><b>${p.lng.toFixed(5)}</b></div></div>
      <button class="btn" data-a="meet-circle">${I('send')}Manda alla cerchia</button>${sendBar('meet')}`, 'meet');
  }

  /* ---------- prova della cerchia ---------- */
  async function testCircle() {
    const n = await ctx.quickSend('🔔 Prova di Vicina: se leggi questo messaggio ricevi i miei avvisi. Rispondimi con un 👍');
    if (n) { ls.set('testDone:' + uid(), '1'); toast(`Prova inviata a ${n} chat: chiedi se è arrivata`); } else toast('Prima aggiungi qualcuno alla cerchia');
  }

  /* ---------- Panico: tutto insieme con un tocco (sirena + flash + avviso + registra) ---------- */
  async function panic() {
    base.h.siren();                                   // sirena a schermo intero
    torch('sos', { silent: true }).catch(() => {});   // flash lampeggiante (se il telefono ce l'ha)
    buzz([600, 200, 600, 200, 600]);
    const p = await native.getPos().catch(() => null);
    const n = await ctx.quickSend(`🆘 Ho bisogno di aiuto SUBITO.${p ? '\nSono qui: ' + mapsLink(p) : ''}`, { sms: true }).catch(() => 0);
    if (n) toast('Sirena attiva · cerchia avvisata'); else toast('Sirena attiva');
  }

  /* ---------- link vicina://… (scorciatoie, widget, Comandi) ---------- */
  function handleUrl(url) {
    const k = String(url || '').replace(/^vicina:\/\/?/, '').replace(/[/?#].*$/, '');
    switch (k) {
      case 'sos': return base.h.countdown({ secs: 5, title: 'SOS tra 5 secondi', text: 'Aperto da una scorciatoia. Se è stato un errore tocca «Sto bene, annulla».' });
      case 'sos-widget': return base.h.countdown({ secs: 3, title: 'SOS tra 3 secondi', text: 'Hai toccato il widget. Se è stato per sbaglio tocca «Sto bene, annulla».' });
      case 'call112': { location.href = 'tel:112'; return; }
      case 'panic': return panic();
      case 'ok': return ctx.quickSend('Sto bene 👍').then(n => toast(n ? 'Hai detto alla cerchia che stai bene' : 'Nessuna chat a cui inviarlo'));
      case 'safe-places': return sheetSafe();
      case 'siren': return base.h.siren();
      case 'walk': return base.h.sheetWalk();
      case 'fake': return base.h.fakeRing(ls.get('fakeName') || 'Mamma');
      case 'torch': return torch('toggle');
      case 'home': return sheetHome();
      case 'where': return sheetWhere();
      default: return null;
    }
  }

  /* ---------- azioni ---------- */
  async function handle(a, t) {
    if (a === 'tool-close' && (torchOn || torchMorse)) torch('off');   // Panico: spegni anche il flash
    switch (a) {
      case 'home': closeSheet(); sheetHome(); return true;
      case 'home-set': sheetHomeSet(); return true;
      case 'home-here': { const p = await pos(); if (!p) return true; ls.set(HK(), JSON.stringify({ lat: p.lat, lng: p.lng, label: 'Casa' })); toast('Casa salvata'); sheetHome(); return true; }
      case 'home-find': {
        const q = ($('#hm-addr')?.value || '').trim(); if (!q) return toast('Scrivi l\'indirizzo'), true;
        try { const h = await geocode(q); ls.set(HK(), JSON.stringify(h)); toast('Casa salvata'); sheetHome(); } catch (e) { toast(e.message === 'Indirizzo non trovato' ? 'Indirizzo non trovato: prova ad aggiungere la città' : 'Serve internet per cercare l\'indirizzo'); }
        return true;
      }
      case 'home-go': {
        const h = home(); if (!h) return true;
        const min = Number($('#hm-min')?.value || 20), m = t.dataset.m, eta = m === 'walk' ? min + 10 : m === 'transit' ? Math.round(min / 2) + 20 : Math.round(min / 4) + 15;
        if ($('#hm-tell')?.checked) { const p = await native.getPos().catch(() => null); ctx.quickSend(`🏠 Sto tornando a casa, arrivo verso le ${hhmm(Date.now() + eta * 60000)}.${p ? '\nSono qui: ' + mapsLink(p) : ''}`); }
        if ($('#hm-walk')?.checked) startWalk(eta, 'verso casa', { quiet: true });
        closeSheet(); open(dirUrl(h, m)); return true;
      }
      case 'safe-places': closeSheet(); sheetSafe(); return true;
      case 'safe-cat': { document.querySelectorAll('#sf-tabs button').forEach(b => b.classList.toggle('on', b === t)); if (safeCache) rSafe(t.dataset.k, safeCache.p); else sheetSafe(t.dataset.k); return true; }
      case 'taxi': closeSheet(); sheetTaxi(); return true;
      case 'ride-ask': { const p = await pos(); const n = await ctx.quickSend(`🚗 Mi serve un passaggio, qualcuno può venirmi a prendere?${p ? '\nSono qui: ' + mapsLink(p) : ''}`); toast(n ? 'Richiesta inviata alla cerchia' : 'Nessuna chat a cui inviarla'); return true; }
      case 'car': closeSheet(); sheetCar(); return true;
      case 'car-photo': {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
        inp.onchange = () => { const f = inp.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { carPhoto = r.result; const e = $('#car-ph'); if (e) e.textContent = 'Foto della targa ✓'; }; r.readAsDataURL(f); };
        inp.click(); return true;
      }
      case 'car-go': {
        const kind = $('#car-kind .on')?.dataset.c || 'Auto', plate = ($('#car-plate')?.value || '').trim().toUpperCase(), model = ($('#car-model')?.value || '').trim(), note = ($('#car-note')?.value || '').trim(), min = Number($('#car-min .on')?.dataset.m || 20);
        const p = await native.getPos().catch(() => null);
        const txt = `🚗 Salgo su: ${kind}${plate ? ', targa ' + plate : ''}${model ? ', ' + model : ''}${note ? ' (' + note + ')' : ''}. Viaggio di circa ${min} minuti, ti scrivo all'arrivo.${p ? '\nParto da qui: ' + mapsLink(p) : ''}`;
        const n = await ctx.quickSend(txt);
        startWalk(min + 5, kind.toLowerCase() + (plate ? ' ' + plate : ''), { quiet: true });
        toast(n ? 'Cerchia avvisata, ti accompagno' : 'Ti accompagno (nessuna chat da avvisare)');
        if (carPhoto && await ctx.confirm('Mandare anche la foto della targa?', 'Si apre la condivisione: scegli WhatsApp o un\'altra app.', 'Manda la foto')) native.shareImages([carPhoto], txt);
        return true;
      }
      case 'date': closeSheet(); sheetDate(); return true;
      case 'date-tell': {
        const d = dateInfo(); const n = await ctx.quickSend(d.text);
        outbox.date = { text: d.text, subject: 'Il mio appuntamento' };
        const s = $('#dt-send'); if (s) s.innerHTML = `<p class="note">${n ? 'Inviato alla cerchia. ' : ''}Mandalo anche a qualcun altro:</p>${sendBar('date')}`;
        if (n) toast('Dettagli inviati alla cerchia'); return true;
      }
      case 'date-cal': {
        const d = dateInfo(), file = new Blob([ics(d)], { type: 'text/calendar' });
        if (!(await native.shareBlob(file, 'appuntamento.ics', 'Appuntamento'))) open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc('Appuntamento' + (d.who ? ' con ' + d.who : ''))}&location=${enc(d.where)}&details=${enc('Fai sapere che stai bene')}&dates=${new Date(d.at).toISOString().replace(/[-:]|\.\d{3}/g, '')}/${new Date(d.at + 7200e3).toISOString().replace(/[-:]|\.\d{3}/g, '')}`);
        return true;
      }
      case 'date-check': { const d = dateInfo(); startWalk(30, d.where || 'appuntamento', { repeat: 30, endAt: Date.now() + 4 * 3600e3 }); return true; }
      case 'night': closeSheet(); sheetNight(); return true;
      case 'night-go': { const ev = Number($('#nt-every .on')?.dataset.m || 30), hrs = Number($('#nt-for .on')?.dataset.h || 4); startWalk(ev, ($('#nt-where')?.value || '').trim(), { repeat: ev, endAt: Date.now() + hrs * 3600e3 }); return true; }
      case 'wa': closeSheet(); sheetWa(); return true;
      case 'wa-pick': { const i = $('#wa-txt'); if (i) i.value = t.dataset.t; document.querySelectorAll('.quick-opt').forEach(x => x.classList.toggle('on', x === t)); return true; }
      case 'wa-prep': {
        let txt = ($('#wa-txt')?.value || '').trim(); if (!txt) return toast('Scegli o scrivi un messaggio'), true;
        if ($('#wa-pos')?.checked) { const p = await native.getPos().catch(() => null); if (p) txt += '\n📍 ' + mapsLink(p); }
        outbox.wa = { text: txt, num: ($('#wa-num')?.value || '').trim() };
        const s = $('#wa-send'); if (s) s.innerHTML = sendBar('wa');
        return true;
      }
      case 'speak': closeSheet(); sheetSpeak(); return true;
      case 'speak-say': if (!(await say(t.dataset.t))) toast('Voce non disponibile'); return true;
      case 'speak-own': { const v = ($('#sp-own')?.value || '').trim(); if (v) say(v); return true; }
      case 'speak-loop': { const v = ($('#sp-own')?.value || '').trim() || SAY[ls.get('speakLang') || 'it'][1]; say(v); sayLoop = setInterval(() => native.vx.speak(v, LANG[ls.get('speakLang') || 'it']), Math.max(4000, v.length * 90)); return true; }
      case 'speak-stop': clearInterval(sayLoop); native.vx.stopSpeaking(); return true;
      case 'speak-where': {
        const p = await pos(); if (!p) return true;
        let addr = '';
        try { const c = new AbortController(); setTimeout(() => c.abort(), 5000); const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=18&accept-language=it`, { signal: c.signal })).json(); const a = j.address || {}; addr = [[a.road, a.house_number].filter(Boolean).join(' '), a.village || a.town || a.city].filter(Boolean).join(', '); } catch {}
        const me = profile() || {};
        say(`Mi chiamo ${me.name || ''} ${me.surname || ''}. ${addr ? 'Mi trovo in ' + addr + '. ' : ''}Le mie coordinate sono: latitudine ${p.lat.toFixed(5).replace('.', ' virgola ')}, longitudine ${p.lng.toFixed(5).replace('.', ' virgola ')}. Ho bisogno di aiuto.`);
        return true;
      }
      case 'panic': closeSheet(); panic(); return true;
      case 'torch': if (!t.dataset.m) { closeSheet(); sheetTorch(); } else torch(t.dataset.m); return true;
      case 'video': video(); return true;
      case 'video-share': if (lastVideo && !(await native.shareBlob(lastVideo, lastVideo.name || 'video.mp4', 'Video Vicina'))) toast('Condivisione non disponibile'); return true;
      case 'black': closeSheet(); openSheet(`<h2>Schermo nero</h2><p class="sub">Lo schermo sembra spento. Puoi registrare l'audio di nascosto, come prova.</p>
          <button class="btn" data-a="black-go" data-r="1">${I('mic')}Schermo nero e registra</button><button class="btn ghost" data-a="black-go">Solo schermo nero</button>
          <p class="note">Per uscire tieni premuto lo schermo per 2 secondi.</p>`, 'black'); return true;
      case 'black-go': blackScreen(!!t.dataset.r); return true;
      case 'black-share': if (lastBlack && !(await native.shareBlob(lastBlack.blob, lastBlack.name, 'Registrazione Vicina'))) toast('Condivisione non disponibile'); return true;
      case 'cover': cover(); return true;
      case 'battery': closeSheet(); sheetBattery(); return true;
      case 'battery-now': { const n = await ctx.quickSend(await batteryMsg()); toast(n ? 'Inviato alla cerchia' : 'Nessuna chat a cui inviarlo'); return true; }
      case 'check': closeSheet(); sheetCheck(); return true;
      case 'test': closeSheet(); testCircle(); return true;
      case 'calls': closeSheet(); sheetCalls(); return true;
      case 'official': closeSheet(); sheetOfficial(); return true;
      case 'shortcuts': closeSheet(); sheetShortcuts(); return true;
      case 'phone-sos': closeSheet(); sheetPhoneSos(); return true;
      case 'meet': closeSheet(); sheetMeet(); return true;
      case 'meet-circle': { const n = await ctx.quickSend(outbox.meet?.text || ''); toast(n ? 'Inviato alla cerchia' : 'Nessuna chat a cui inviarlo'); return true; }
      case 'x-url': open(t.dataset.u); return true;
      case 'x-send': sendVia(t.dataset.via, t.dataset.k); return true;
      case 'x-copy': await native.copy(t.dataset.t); toast('Copiato'); return true;
      case 'x-test-url': closeSheet(); handleUrl('vicina://sos'); return true;
      case 'x-settings': native.vx.openSettings(); return true;
    }
    return false;
  }
  // scelte nei fogli
  document.addEventListener('click', e => {
    const b = e.target.closest('#car-kind button, #car-min button, #nt-every button, #nt-for button, #sp-lang button, #wa-to button'); if (!b) return;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.l) { ls.set('speakLang', b.dataset.l); sheetSpeak(); }
    if (b.dataset.n) { const i = $('#wa-num'); if (i) i.value = b.dataset.n; }
  });

  const groups = [
    ['Adesso', [
      ['panic', 'alert', 'red', 'Panico', 'Sirena, flash e avviso alla cerchia insieme'],
      ['torch', 'spark', 'amber', 'Torcia', 'Il flash vero, anche SOS luminoso'],
      ['speak', 'mic', 'red', 'Parla per me', 'Il telefono parla al posto tuo'],
      ['black', 'eye', 'gray', 'Schermo nero', 'Sembra spento, registra di nascosto'],
      ['cover', 'book', 'gray', 'Schermata finta', 'Copre l\'app con delle note']]],
    ['In giro', [
      ['home', 'pin', 'green', 'Portami a casa', 'Mappe + Accompagnami in un tocco'],
      ['safe-places', 'shield', 'blue', 'Luoghi sicuri', 'Polizia, pronto soccorso, farmacie'],
      ['taxi', 'send', 'amber', 'Taxi e passaggi', 'Uber, FreeNow, itTaxi, cerchia'],
      ['car', 'lock', 'red', 'Salgo in un\'auto', 'Targa e viaggio alla cerchia'],
      ['date', 'heart', 'violet', 'Appuntamento sicuro', 'Dettagli, calendario e check-in'],
      ['night', 'clock', 'violet', 'Serata fuori', '«Tutto bene?» ogni mezz\'ora'],
      ['meet', 'pin', 'blue', 'Punto d\'incontro', 'Manda dove sei, al metro']]],
    ['Prove', [
      ['video', 'camera', 'red', 'Registra video', 'Con la fotocamera del telefono']]],
    ['App e telefono', [
      ['wa', 'chat', 'green', 'WhatsApp e altre app', 'Messaggio con posizione a chiunque'],
      ['calls', 'phone', 'green', 'Chiamate rapide', 'I tuoi contatti a un tocco'],
      ['shortcuts', 'spark', 'violet', 'Scorciatoie e widget', 'SOS dall\'icona o dal retro'],
      ['phone-sos', 'shield', 'red', 'Funzioni del telefono', 'Tasto laterale, cartella clinica'],
      ['official', 'book', 'blue', 'App ufficiali', 'Where ARE U, YouPol, 1522'],
      ['battery', 'alert', 'amber', 'Batteria', 'Avvisa la cerchia se si scarica'],
      ['check', 'check', 'green', 'Controllo sicurezza', 'È tutto pronto?'],
      ['test', 'send', 'blue', 'Prova la cerchia', 'Verifica che gli avvisi arrivino']], 3]
  ];

  let restored = false;
  function restore() {
    if (restored) return; restored = true;
    setInterval(batteryWatch, 180000); setTimeout(batteryWatch, 8000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && batteryWatch());
  }
  const nav = { dirUrl, searchUrl, open, wa, store, km, dist, sendBar, outbox, geocode };
  return { nav, handle, groups, handleUrl, restore, batteryLine: () => (lastBattery && lastBattery.level >= 0 ? `Batteria: ${lastBattery.level}%` : ''), readBattery };
}
