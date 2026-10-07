// Strumenti di Vicina, terza parte: si arriva a 100.
// Messaggi rapidi, segnali, luoghi vicini, prove, salute e guide per situazioni precise.
export function createMore2(ctx, base, extra) {
  const { $, I, esc, toast, openSheet, closeSheet, native, ls, mapsLink, hhmm, uid } = ctx;
  const { showOv, closeOv, keepAwake, sx } = base.h;
  const ov = base.h.ov;
  const { dirUrl, searchUrl, open, km, dist } = extra.nav;
  const steps = l => `<ol class="steps-list">${l.map(x => `<li>${x}</li>`).join('')}</ol>`;
  const call = (n, t) => `<a class="btn red" href="tel:${n}">${I('phone')}${t}</a>`;
  const guide = (title, sub, list, more = '') => { closeSheet(); openSheet(`<h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${steps(list)}${more}`, 'g2'); };
  const send = (t, o) => ctx.quickSend(t, o);
  const diaryAdd = (text, place = '') => { const k = 'diary:' + uid(); let l = []; try { l = JSON.parse(ls.get(k) || '[]'); } catch {} l.push({ id: Date.now().toString(36), at: Date.now(), place, text }); ls.set(k, JSON.stringify(l)); };

  /* ---------- SMS d'aiuto senza internet ---------- */
  async function smsNow() {
    closeSheet();
    const p = await native.getPos().catch(() => null), nums = ctx.smsList().filter(c => c.on && c.phone).map(c => c.phone);
    await native.composeSms(nums, `Ho bisogno di aiuto, chiamami subito.${p ? '\nSono qui: ' + mapsLink(p) : ''}`);
    if (!nums.length) toast('Scegli tu a chi mandarlo (aggiungi i contatti SMS in Cerchia)');
  }

  /* ---------- segnale colorato ---------- */
  const COLORS = [['#E8192C', 'Rosso'], ['#3DDC84', 'Verde'], ['#4DA3FF', 'Blu'], ['#FFD60A', 'Giallo'], ['#FFFFFF', 'Bianco'], ['#FF5CD6', 'Rosa']];
  function colorSignal(i = 0) {
    closeSheet();
    const [c, n] = COLORS[i % COLORS.length];
    showOv('color', `<p class="col-name">${n} · tocca per cambiare</p><button class="btn ghost sm col-x" data-a="tool-close">${I('x')}Chiudi</button>`, () => keepAwake(false));
    keepAwake(true); ov.style.background = c;
    ov.onclick = e => { if (e.target.closest('[data-a]')) return; i++; const [c2, n2] = COLORS[i % COLORS.length]; ov.style.background = c2; const t = ov.querySelector('.col-name'); if (t) t.textContent = n2 + ' · tocca per cambiare'; };
  }

  /* ---------- fonometro ---------- */
  let nm = null;
  async function noiseMeter() {
    closeSheet();
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); } catch { return toast('Serve il permesso del microfono'); }
    const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 2048; src.connect(an);
    const buf = new Float32Array(an.fftSize); let max = 0, t0 = Date.now();
    showOv('noise', `<div class="cpr-in"><p class="cpr-eye">${I('mic')}Rumore intorno a te</p><b class="cpr-n" id="nm-v">–</b><span class="cpr-s">decibel circa · massimo <b id="nm-max">–</b></span><div class="nm-bar"><i id="nm-bar"></i></div>
      <p class="note">Valore indicativo (il microfono del telefono non è uno strumento certificato). Utile per annotare rumori molesti o urla.</p></div>
      <div class="cd-foot"><button class="btn white" data-a="nm-save">${I('book')}Annota nel diario</button><button class="btn ghost" data-a="tool-close">${I('x')}Chiudi</button></div>`, () => { cancelAnimationFrame(nm?.raf); stream.getTracks().forEach(t => t.stop()); ac.close().catch(() => {}); nm = null; keepAwake(false); });
    keepAwake(true); nm = { raf: 0, max: 0, t0 };
    const loop = () => {
      an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x;
      const db = Math.max(30, Math.min(120, Math.round(20 * Math.log10(Math.sqrt(s / buf.length) + 1e-6) + 94)));
      if (db > max) max = db; nm.max = max;
      const v = $('#nm-v'); if (v) { v.textContent = db; $('#nm-max').textContent = max; $('#nm-bar').style.width = ((db - 30) / 90 * 100) + '%'; }
      nm.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /* ---------- luoghi vicini (OpenStreetMap) ---------- */
  const NEAR = {
    taxi: ['Posteggio taxi più vicino', 'amenity=taxi', 3000, 'taxi'],
    toilet: ['Bagni pubblici vicini', 'amenity=toilets', 2000, 'bagni pubblici'],
    water: ['Fontanelle d\'acqua', 'amenity=drinking_water', 1500, 'fontanella'],
    assembly: ['Aree di attesa per le emergenze', 'emergency=assembly_point', 5000, 'area di attesa protezione civile'],
    fire: ['Vigili del fuoco vicini', 'amenity=fire_station', 15000, 'vigili del fuoco']
  };
  async function near(k) {
    closeSheet();
    const [title, tag, r, fb] = NEAR[k];
    openSheet(`<h2>${title}</h2><div id="n2-list"><div class="where-load">${I('pin')}Cerco intorno a te…</div></div>`, 'near2');
    const p = await native.getPos().catch(() => null);
    if (!p) { $('#n2-list').innerHTML = '<p class="note">Posizione non disponibile.</p>'; return; }
    try {
      const [kk, vv] = tag.split('=');
      const q = `[out:json][timeout:25];(nwr(around:${r},${p.lat},${p.lng})[${kk}=${vv}];);out center tags 60;`;
      const j = await native.osm(q, { term: fb, p, r });
      const l = j.elements.map(e => ({ ...e.tags, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon })).filter(e => e.lat != null).map(e => ({ ...e, d: km(p, e) })).sort((a, b) => a.d - b.d).slice(0, 6);
      if (!l.length) throw 0;
      $('#n2-list').innerHTML = `<button class="near-best" data-a="x-url" data-u="${esc(dirUrl(l[0], 'walk'))}"><small>IL PIÙ VICINO · ${dist(l[0].d)}</small><b>${esc(l[0].name || title.replace(/ (più )?vicin[ie]$/, ''))}</b><span>${l[0].opening_hours ? esc(l[0].opening_hours.slice(0, 40)) + ' · ' : ''}${l[0].fee === 'yes' ? 'a pagamento · ' : ''}Tocca per andarci</span>${I('send')}</button>
        ${l.length > 1 ? `<div class="card">${l.slice(1).map(e => `<button class="row" data-a="x-url" data-u="${esc(dirUrl(e, 'walk'))}"><div class="fl"><b>${esc(e.name || 'Senza nome')}</b><span>${dist(e.d)}</span></div>${I('chev', 'chev')}</button>`).join('')}</div>` : ''}
        ${k === 'assembly' ? '<p class="note">Le aree di attesa sono i punti dove ritrovarsi dopo un terremoto o un\'evacuazione. Controlla anche il piano di protezione civile del tuo comune.</p>' : ''}`;
    } catch {
      $('#n2-list').innerHTML = `<p class="note">Nessun risultato qui (o manca internet). Cerca nelle Mappe:</p><button class="btn" data-a="x-url" data-u="${esc(searchUrl(fb, p))}">${I('pin')}Cerca «${fb}»</button>`;
    }
  }

  /* ---------- battito ---------- */
  let taps = [];
  function pulse() {
    closeSheet(); taps = [];
    showOv('pulse', `<div class="cpr-in"><p class="cpr-eye">${I('heart')}Battito cardiaco</p><button class="pulse-btn" data-a="pulse-tap">${I('heart')}</button><b class="cpr-n" id="pl-v">–</b><span class="cpr-s" id="pl-s">Trova il polso (sul polso o sul collo) e tocca il cuore a ogni battito</span></div>
      <div class="cd-foot"><button class="btn ghost" data-a="tool-close">${I('x')}Chiudi</button></div>`, () => {});
  }

  /* ---------- azioni ---------- */
  async function handle(a, t) {
    switch (a) {
      case 'sms-now': smsNow(); return true;
      case 'color': colorSignal(); return true;
      case 'noise': noiseMeter(); return true;
      case 'nm-save': { diaryAdd(`Rumore misurato: massimo circa ${nm?.max || '?'} dB (misura indicativa con il telefono).`); toast('Annotato nel diario'); return true; }
      case 'callme': closeSheet(); openSheet(`<h2>Chiamami tra…</h2><p class="sub">Chiedi alla cerchia di chiamarti: una scusa per andartene o un controllo che stai bene.</p>
        <div class="big-acts">${[5, 10, 15, 30].map(m => `<button class="big-act" data-a="callme-go" data-m="${m}">${I('phone')}<b>${m} minuti</b><span>verso le ${hhmm(Date.now() + m * 60000)}</span></button>`).join('')}</div>`, 'callme'); return true;
      case 'callme-go': { const m = Number(t.dataset.m), n = await send(`📞 Mi chiami tra ${m} minuti (verso le ${hhmm(Date.now() + m * 60000)})? Se non rispondo, riprova.`); closeSheet(); toast(n ? 'Richiesta inviata alla cerchia' : 'Nessuna chat a cui inviarla'); return true; }
      case 'eta': closeSheet(); openSheet(`<h2>Arrivo tra…</h2><p class="sub">Di' a chi ti aspetta quando arrivi.</p>
        <div class="big-acts">${[5, 10, 15, 20, 30, 45].map(m => `<button class="big-act" data-a="eta-go" data-m="${m}">${I('clock')}<b>${m} min</b><span>verso le ${hhmm(Date.now() + m * 60000)}</span></button>`).join('')}</div>`, 'eta'); return true;
      case 'eta-go': { const m = Number(t.dataset.m), p = await native.getPos().catch(() => null); const n = await send(`🕒 Arrivo tra ${m} minuti, verso le ${hhmm(Date.now() + m * 60000)}.${p ? '\nSono qui: ' + mapsLink(p) : ''}`); closeSheet(); toast(n ? 'Inviato alla cerchia' : 'Nessuna chat a cui inviarlo'); return true; }
      case 'near-open': { closeSheet(); const p = await native.getPos().catch(() => null); if (p) open(searchUrl('bar aperto', p)); else toast('Posizione non disponibile'); return true; }
      case 'near-taxi': near('taxi'); return true;
      case 'near-toilet': near('toilet'); return true;
      case 'near-water': near('water'); return true;
      case 'near-assembly': near('assembly'); return true;
      case 'near-fire': near('fire'); return true;
      case 'quicknote': closeSheet(); openSheet(`<h2>Nota veloce</h2><p class="sub">Va nel Diario con data, ora e posizione.</p><label class="field"><textarea id="qn-t" rows="5" maxlength="2000" placeholder="Cosa è successo, chi c'era…"></textarea></label><button class="btn" data-a="quicknote-save">Salva</button>`, 'qn'); setTimeout(() => $('#qn-t')?.focus(), 300); return true;
      case 'quicknote-save': { const v = ($('#qn-t')?.value || '').trim(); if (!v) return toast('Scrivi qualcosa'), true; const p = await native.getPos().catch(() => null); diaryAdd(v, p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : ''); closeSheet(); toast('Salvata nel diario'); return true; }
      case 'witness': closeSheet(); openSheet(`<h2>Testimoni</h2><p class="sub">Chi ha visto cosa: chiedi nome e numero subito, dopo è difficile ritrovarli.</p>
        <label class="field"><span>Nome</span><input id="wt-n" maxlength="60"></label><label class="field"><span>Telefono</span><input id="wt-p" type="tel" maxlength="20"></label>
        <label class="field"><span>Cosa ha visto</span><textarea id="wt-t" rows="3" maxlength="600"></textarea></label><button class="btn" data-a="witness-save">Salva nel diario</button>`, 'wt'); return true;
      case 'witness-save': { const n = ($('#wt-n')?.value || '').trim(), ph = ($('#wt-p')?.value || '').trim(), w = ($('#wt-t')?.value || '').trim(); if (!n && !ph) return toast('Scrivi almeno nome o telefono'), true; const p = await native.getPos().catch(() => null); diaryAdd(`Testimone: ${n || '—'}${ph ? ' · tel. ' + ph : ''}${w ? '\nHa visto: ' + w : ''}`, p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : ''); closeSheet(); toast('Testimone salvato nel diario'); return true; }
      case 'injury': guide('Ferite: come documentarle', 'Dopo un\'aggressione o un incidente, per i medici e per la denuncia.', [
        'Prima la salute: se serve chiama il 118/112 o vai al pronto soccorso e fatti refertare.', 'Fotografa le ferite subito e nei giorni dopo (i lividi cambiano): usa <b>Foto con data</b>, con un oggetto vicino per la misura.',
        'Conserva vestiti rovinati in un sacchetto di carta, senza lavarli.', 'Annota nel <b>Diario</b> cosa è successo, quando e chi c\'era.', 'Tieni i referti del pronto soccorso: servono alla denuncia.'],
        `<div class="em-tools"><button class="btn ghost sm" data-a="photo">Foto con data</button><button class="btn ghost sm" data-a="diary">Diario</button></div>`); return true;
      case 'pulse': pulse(); return true;
      case 'pulse-tap': {
        const now = Date.now(); taps = taps.filter(x => now - x < 10000); taps.push(now); native.haptic('light');
        const b = $('.pulse-btn'); if (b) { b.classList.remove('beat'); void b.offsetWidth; b.classList.add('beat'); }
        if (taps.length >= 5) { const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1), bpm = Math.round(60000 / iv); $('#pl-v').textContent = bpm; $('#pl-s').textContent = bpm < 50 ? 'Battito basso: se si sente male chiama il 112' : bpm > 120 ? 'Battito veloce: se a riposo e si sente male, chiama il 112' : 'battiti al minuto · continua a toccare per affinare'; }
        else $('#pl-s').textContent = `Ancora ${5 - taps.length} tocchi…`;
        return true;
      }
      case 'g-hypo': guide('Ipoglicemia (zucchero basso)', 'Spesso in chi ha il diabete.', [
        'Segnali: sudore, tremore, fame, pallore, confusione, comportamento strano.', 'Se è cosciente e riesce a deglutire: dagli <b>zucchero</b> (3 bustine o un bicchiere di succo o bibita zuccherata).',
        'Dopo 15 minuti, se non migliora, ripeti. Quando si riprende, uno spuntino.', 'Se non risponde o non riesce a deglutire: <b>niente in bocca</b>, posizione laterale di sicurezza e <b>chiama il 112</b>.'], call(112, 'Chiama il 112')); return true;
      case 'g-drown': guide('Annegamento', '', [
        'Non entrare in acqua se non sai nuotare bene o se è pericoloso: lancia qualcosa che galleggia, tendi un bastone o una corda.', 'Chiama il <b>112</b> (in mare anche il <b>1530</b>).',
        'Fuori dall\'acqua: se non respira normalmente inizia subito l\'<b>RCP</b>; se sai farlo, prima 5 insufflazioni.', 'Anche se si riprende deve andare in ospedale: i problemi possono comparire ore dopo.'],
        `${call(112, 'Chiama il 112')}<button class="btn ghost" data-a="fa" data-k="cpr">Guida RCP</button>`); return true;
      case 'g-snake': guide('Morso di vipera', '', [
        'Stai calm' + sx() + ' e fermati: muoversi fa circolare il veleno più in fretta.', 'Togli anelli, braccialetti e scarpe strette dalla parte morsa.',
        'Immobilizza l\'arto (come per una frattura) e tienilo all\'altezza del cuore o più in basso.', '<b>Non</b> incidere, non succhiare, niente lacci stretti, niente ghiaccio.', '<b>Chiama il 112</b>: serve il pronto soccorso.'], call(112, 'Chiama il 112')); return true;
      case 'g-fracture': guide('Fratture e distorsioni', '', [
        'Non muovere la parte e non cercare di raddrizzarla.', 'Immobilizzala così com\'è, con una stecca imbottita o una sciarpa.', 'Ghiaccio avvolto in un panno, non direttamente sulla pelle.',
        'Se l\'osso esce dalla pelle copri con una garza pulita, senza premere.', 'Se pensi che sia colpita la schiena o il collo <b>non spostare la persona</b> e chiama il 112.'], call(112, 'Chiama il 112')); return true;
      case 'g-head': guide('Colpo alla testa', '', [
        '<b>Chiama il 112</b> se: ha perso i sensi, vomita più volte, è confusa o sonnolenta, il mal di testa peggiora, esce sangue o liquido da naso o orecchie, ha convulsioni o le pupille diverse.',
        'Se pensi a un danno al collo, non muoverla.', 'Anche se sta bene, nelle 24 ore successive non lasciarla da sola e controlla che si svegli bene.'], call(112, 'Chiama il 112')); return true;
      case 'g-asthma': guide('Attacco d\'asma', '', [
        'Falla stare seduta dritta e tranquilla, non sdraiata.', 'Usa l\'<b>inalatore al bisogno</b> come le ha indicato il medico.', 'Allenta i vestiti stretti, aria fresca.',
        '<b>Chiama il 112</b> se non migliora con l\'inalatore, fa fatica a parlare, ha labbra o unghie bluastre o è molto stanca.'], call(112, 'Chiama il 112')); return true;
      case 'g-cold': guide('Freddo e ipotermia', '', [
        'Portala al riparo e togli i vestiti bagnati.', 'Coprila bene, anche la testa: coperta termica, coperte, vestiti asciutti.', 'Se è cosciente, bevande calde e zuccherate. <b>Niente alcol.</b>',
        'Non massaggiarla e non scaldarla in fretta (niente acqua bollente o stufe a contatto).', '<b>112</b> se è confusa, sonnolenta o smette di tremare pur avendo ancora freddo.'], call(112, 'Chiama il 112')); return true;
      case 'g-mind': guide('Supporto emotivo', 'Se hai appena vissuto qualcosa di brutto o ti senti in crisi.', [
        'Respira lentamente: usa lo strumento <b>Respira</b>.', 'Esercizio 5-4-3-2-1: nomina 5 cose che vedi, 4 che tocchi, 3 che senti, 2 che annusi, 1 che gusti.',
        'Chiama o scrivi a una persona di cui ti fidi: non devi affrontarlo da sol' + sx() + '.', '<b>Telefono Amico</b> ascolta chi si sente solo o in difficoltà: 02 2327 2327.',
        'Se pensi di farti del male o sei in pericolo, <b>chiama il 112</b>.'], `<div class="em-tools"><button class="btn ghost sm" data-a="breathe">Respira</button><a class="btn ghost sm" href="tel:0223272327">Telefono Amico</a></div>${call(112, 'Chiama il 112')}`); return true;
      case 'g-drink': guide('Drink alterato', 'Se ti senti strana/o all\'improvviso, più di quanto hai bevuto.', [
        'Dillo subito a un\'amica o al personale del locale: non restare da sol' + sx() + '.', 'Non andare via con persone che non conosci, neanche se si offrono di accompagnarti.',
        'Chiama il <b>112</b> o fatti portare al pronto soccorso.', 'Chiedi gli <b>esami</b> il prima possibile: alcune sostanze spariscono in poche ore.', 'Se puoi, conserva il bicchiere.'],
        `<div class="em-tools"><button class="btn ghost sm" data-a="redcode">Codice rosso</button><button class="btn ghost sm" data-a="discreet">Aiuto discreto</button></div>${call(112, 'Chiama il 112')}`); return true;
      case 'g-stalk': guide('Stalking', 'Se qualcuno ti segue, ti scrive o ti controlla in modo insistente.', [
        'Non rispondere e non cercare chiarimenti: ogni risposta lo incoraggia.', 'Conserva tutto: messaggi, chiamate, foto. Annota ogni episodio nel <b>Diario</b>.',
        'Avvisa persone fidate e cambia percorsi e orari quando puoi.', 'Chiama il <b>1522</b> (gratis, 24 ore su 24) o vai da Carabinieri o Polizia: puoi chiedere l\'<b>ammonimento del Questore</b>, anche senza denuncia.',
        'Se sei in pericolo adesso: <b>112</b>.'], `<div class="em-tools"><button class="btn ghost sm" data-a="diary">Diario</button><a class="btn ghost sm" href="tel:1522">Chiama 1522</a></div>`); return true;
      case 'g-home': guide('Violenza in casa: un piano per uscire', 'Informazioni per stare più al sicuro. Il 1522 ti aiuta gratis e in modo riservato, anche in chat.', [
        'Prepara una borsa e lasciala da una persona fidata: documenti, contanti, chiavi, farmaci, caricabatterie.', 'Concorda con qualcuno una <b>parola d\'ordine</b>: quando la senti o la leggi, chiama il 112.',
        'Durante una lite stai vicino a un\'uscita, lontano da cucina e bagno.', 'Se il telefono può essere controllato, usa la <b>Schermata finta</b> o la <b>modalità anonima</b> di Vicina.',
        'I centri antiviolenza aiutano con un posto sicuro e un avvocato: chiedi al <b>1522</b>.', 'In pericolo immediato: <b>112</b>.'],
        `<div class="em-tools"><a class="btn ghost sm" href="tel:1522">Chiama 1522</a><button class="btn ghost sm" data-a="x-url" data-u="https://www.1522.eu/">Chat 1522</button></div>${call(112, 'Chiama il 112')}`); return true;
      case 'g-child': guide('Bambino smarrito', '', [
        'Avvisa subito il personale o la sicurezza del posto: possono chiudere le uscite e fare un annuncio.', '<b>Chiama il 112</b> senza aspettare.',
        'Descrivi vestiti, altezza, età e mostra una <b>foto recente</b> (fanne una ogni volta che uscite).', 'Una persona resta nel punto in cui l\'hai visto l\'ultima volta, se torna lì.'], call(112, 'Chiama il 112')); return true;
      case 'g-sext': guide('Ricatto online', 'Qualcuno minaccia di diffondere foto o video intimi.', [
        '<b>Non pagare</b> e non mandare altro: di solito le richieste aumentano.', 'Non cancellare niente: fai screenshot di profilo, messaggi e richieste.',
        'Blocca e segnala il profilo sulla piattaforma.', 'Denuncia alla Polizia Postale (anche online) e chiedi la rimozione dei contenuti.', 'Se riguarda un minorenne, parlane subito con un adulto di fiducia.'],
        `<button class="btn ghost" data-a="x-url" data-u="https://www.commissariatodips.it/">Commissariato online</button>`); return true;
      case 'g-bully': guide('Cyberbullismo', '', [
        'Non rispondere alle provocazioni.', 'Salva le prove: screenshot con nomi, date e ore.', 'Blocca e segnala gli account sulla piattaforma.',
        'Parlane con un adulto di fiducia e con la scuola.', 'Puoi segnalare anche con l\'app <b>YouPol</b> o alla Polizia Postale. Per bambini e ragazzi c\'è <b>Telefono Azzurro</b>: 19696.'],
        `<a class="btn ghost" href="tel:19696">${I('phone')}Telefono Azzurro 19696</a>`); return true;
      case 'g-car': guide('Auto in panne in autostrada', '', [
        'Accendi le quattro frecce e accosta in corsia di emergenza o in piazzola.', 'Metti il <b>giubbotto catarifrangente</b> prima di scendere, ed esci dal lato opposto al traffico.',
        'Posiziona il triangolo (in autostrada a 100 metri) e aspetta <b>dietro il guardrail</b>, non in auto.', 'Chiama il soccorso stradale (ACI 803.116) o il 112 se c\'è pericolo.'],
        `<a class="btn ghost" href="tel:803116">${I('phone')}Soccorso stradale 803.116</a>${call(112, 'Chiama il 112')}`); return true;
    }
    return false;
  }

  const groups = [
    ['Adesso', [
      ['sms-now', 'sms', 'red', 'SMS d\'aiuto', 'Anche senza internet'],
      ['color', 'eye', 'violet', 'Segnale colorato', 'Fatti trovare tra la folla'],
      ['noise', 'mic', 'amber', 'Fonometro', 'Misura e annota i rumori'],
      ['callme', 'phone', 'green', 'Chiamami tra…', 'Una scusa o un controllo']]],
    ['Vicino a te', [
      ['near-taxi', 'send', 'amber', 'Taxi', 'Il posteggio più vicino'],
      ['near-open', 'clock', 'violet', 'Locali aperti', 'Un posto con gente, subito'],
      ['near-toilet', 'pin', 'gray', 'Bagni pubblici', 'I più vicini'],
      ['near-water', 'pin', 'blue', 'Fontanelle', 'Acqua quando fa caldo'],
      ['near-assembly', 'people', 'green', 'Aree di attesa', 'Dove ritrovarsi dopo un terremoto'],
      ['near-fire', 'alert', 'red', 'Vigili del fuoco', 'La caserma più vicina']]],
    ['In giro', [
      ['eta', 'clock', 'blue', 'Arrivo tra…', 'Di\' quando arrivi']]],
    ['Prove', [
      ['quicknote', 'book', 'violet', 'Nota veloce', 'Con ora e posizione'],
      ['witness', 'people', 'blue', 'Testimoni', 'Nome e numero di chi ha visto'],
      ['injury', 'camera', 'red', 'Ferite', 'Come documentarle']]],
    ['Salute e guide', [
      ['pulse', 'heart', 'red', 'Battito', 'Misuralo con un dito'],
      ['g-hypo', 'heart', 'amber', 'Ipoglicemia', 'Zucchero basso'],
      ['g-drown', 'live', 'blue', 'Annegamento', 'Cosa fare'],
      ['g-snake', 'alert', 'green', 'Morso di vipera', 'Cosa fare e non fare'],
      ['g-fracture', 'user', 'gray', 'Fratture', 'Immobilizzare'],
      ['g-head', 'user', 'red', 'Colpo alla testa', 'Quando chiamare il 112'],
      ['g-asthma', 'live', 'violet', 'Attacco d\'asma', 'Cosa fare'],
      ['g-cold', 'spark', 'blue', 'Freddo e ipotermia', 'Scaldare nel modo giusto'],
      ['g-mind', 'heart', 'green', 'Supporto emotivo', 'Dopo un brutto momento']]],
    ['Situazioni', [
      ['g-drink', 'alert', 'red', 'Drink alterato', 'Ti senti strana/o all\'improvviso'],
      ['g-stalk', 'eye', 'violet', 'Stalking', 'Prove, 1522, ammonimento'],
      ['g-home', 'lock', 'red', 'Violenza in casa', 'Un piano per uscire'],
      ['g-child', 'user', 'amber', 'Bambino smarrito', 'I primi minuti'],
      ['g-sext', 'lock', 'violet', 'Ricatto online', 'Non pagare, denuncia'],
      ['g-bully', 'chat', 'blue', 'Cyberbullismo', 'Per ragazzi e genitori'],
      ['g-car', 'alert', 'amber', 'Auto in panne', 'In autostrada']], 4]
  ];
  return { handle, groups };
}
