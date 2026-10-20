// Generatore PDF minimale (nessuna libreria): testo Helvetica + foto JPEG. Usato per il rapporto SOS da consegnare
// a Polizia o Carabinieri. Il rapporto è sempre in italiano.
const W = 595.28, H = 841.89, M = 46;
const AVG = { F1: 0.5, F2: 0.55, F3: 0.6 };   // larghezza media dei caratteri (in em), per andare a capo

// testo → byte WinAnsi (latino). I caratteri non rappresentabili diventano «?»
const WIN = { '€': 128, '‚': 130, '„': 132, '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '™': 153 };
function enc(s) {
  let o = '';
  for (const ch of String(s ?? '')) {
    let c = WIN[ch] ?? ch.charCodeAt(0);
    if (c > 255) c = 63;
    const x = String.fromCharCode(c);
    o += x === '(' || x === ')' || x === '\\' ? '\\' + x : c < 32 ? ' ' : x;
  }
  return o;
}
function wrap(text, size, width, font = 'F1') {
  const max = Math.max(8, Math.floor(width / (size * AVG[font])));
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      if (!w) continue;
      let word = w;
      while (word.length > max) { if (line) { out.push(line); line = ''; } out.push(word.slice(0, max)); word = word.slice(max); }
      if (!line) line = word; else if ((line + ' ' + word).length <= max) line += ' ' + word; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}
function jpegSize(b) {
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}
const pad = n => String(n).padStart(2, '0');
const dt = ms => { if (!ms) return '—'; const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const tm = ms => { if (!ms) return '—'; const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const tz = () => { const o = -new Date().getTimezoneOffset(); return `UTC${o >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`; };

export function buildPdf({ sos, me, evidence = [], verify = {}, images = [], links = {}, helpers = {} }) {
  const pages = []; let ops = [], y = H - M;
  const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = H - M; };
  const need = h => { if (y - h < M + 20) newPage(); };
  const text = (s, x, yy, size = 10, font = 'F1', rgb = '0.1 0.1 0.12') => ops.push(`BT ${rgb} rg /${font} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${enc(s)}) Tj ET`);
  const para = (s, size = 10, font = 'F1', rgb, indent = 0, gap = 3) => {
    for (const l of wrap(s, size, W - 2 * M - indent, font)) { need(size + gap); y -= size + gap; text(l, M + indent, y, size, font, rgb); }
  };
  const rule = (rgb = '0.85 0.85 0.88') => { need(10); y -= 6; ops.push(`${rgb} RG 0.6 w ${M} ${y.toFixed(1)} m ${W - M} ${y.toFixed(1)} l S`); y -= 4; };
  const h2 = s => { need(30); y -= 12; text(s, M, y - 12, 13, 'F2', '0.72 0.06 0.13'); y -= 16; rule(); };
  const kv = (k, v) => { need(14); y -= 14; text(k, M, y, 9, 'F2', '0.4 0.4 0.45'); const lines = wrap(v, 10, W - 2 * M - 130); text(lines[0] || '', M + 130, y, 10); for (const l of lines.slice(1)) { need(13); y -= 13; text(l, M + 130, y, 10); } };

  // intestazione
  ops.push(`0.91 0.1 0.17 rg ${M} ${(y - 30).toFixed(1)} 30 30 re f`);
  text('SOS', M + 4.5, y - 19, 10, 'F2', '1 1 1');
  text('Vicina - Rapporto SOS', M + 42, y - 12, 18, 'F2'); text(`Documento generato il ${dt(Date.now())} (${tz()})`, M + 42, y - 27, 9, 'F1', '0.45 0.45 0.5');
  y -= 44; rule();

  h2('Persona che ha chiesto aiuto');
  kv('Nome', me?.name || sos.fromName || '—');
  if (me?.phone || sos.fromPhone) kv('Telefono', me?.phone || sos.fromPhone);
  h2('Richiesta di aiuto');
  kv('Codice SOS', sos.id || '—');
  kv('Inviato il', `${dt(sos.at)} (${tz()})`);
  const ends = evidence.filter(e => e.kind === 'event').map(e => e.at);
  if (ends.length > 1) kv('Ultimo evento', dt(Math.max(...ends)));
  kv('Persone avvisate', String((sos.recipients || []).length || '—'));
  if (sos.lat != null) kv('Ultima posizione', `${sos.lat.toFixed(6)}, ${sos.lng.toFixed(6)}${sos.acc ? ` (precisione ${Math.round(sos.acc)} m)` : ''} - https://maps.google.com/?q=${sos.lat.toFixed(6)},${sos.lng.toFixed(6)}`);
  const tr = (sos.track || []);
  if (tr.length) kv('Percorso', `${tr.length} punti registrati dal ${tm(tr[0].t)} al ${tm(tr[tr.length - 1].t)}`);

  const hs = Object.values(helpers || {}).filter(h => h.role && h.role !== 'none');
  if (hs.length) {
    h2('Chi ha aiutato');
    const R = { coming: 'stava arrivando', calling: 'ha chiamato il 112', remote: 'ha seguito a distanza', arrived: 'è arrivato/a sul posto' };
    for (const h of hs) para(`- ${h.name}: ${R[h.role] || h.role} (alle ${tm(h.at)})`, 10);
  }

  h2('Verifica di integrità');
  para(verify.ok ? `Catena integra: ${verify.count} elementi verificati dal server.` : `ATTENZIONE: catena non integra a partire dall'elemento n. ${verify.firstBad}.`, 10, 'F2', verify.ok ? '0.07 0.5 0.25' : '0.75 0.05 0.1');
  para('Ogni file (audio, foto) è stato registrato con la sua impronta SHA-256 calcolata sul telefono. Il server ha aggiunto la propria data e ora e un anello di catena SHA-256 che lega ogni elemento al precedente: modificare, aggiungere o togliere un file rende la catena non verificabile. Impronta finale della catena:', 9, 'F1', '0.35 0.35 0.4');
  para(verify.last || '—', 9, 'F3');

  h2('Cronologia');
  const K = { audio: 'Audio', frame: 'Foto', photo: 'Foto', pos: 'Posizione', event: 'Evento' };
  for (const e of evidence) {
    need(26);
    y -= 13; text(`${String(e.seq).padStart(3, ' ')}  ${tm(e.at)}  ${K[e.kind] || e.kind}`, M, y, 9.5, 'F2');
    const info = [e.note, e.lat != null ? `${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}` : '', e.path ? e.path.split('/').pop() : ''].filter(Boolean).join(' - ');
    if (info) text(info, M + 150, y, 9.5);
    if (e.sha) { y -= 11; text(`SHA-256 ${e.sha}`, M + 18, y, 7.5, 'F3', '0.45 0.45 0.5'); }
  }
  if (!evidence.length) para('Nessun elemento registrato (diretta non attiva).', 10);

  const aud = evidence.filter(e => e.kind === 'audio' && links[e.seq]);
  if (aud.length) {
    h2('Registrazioni audio (link validi 7 giorni)');
    for (const e of aud) { para(`n. ${e.seq} - ${tm(e.at)}`, 9.5, 'F2'); para(links[e.seq], 7.5, 'F3', '0.15 0.3 0.75', 10, 2); }
  }

  // foto: due per riga
  const xo = []; let imgN = 0;
  images = images.filter(im => jpegSize(im.bytes));
  if (images.length) {
    h2('Foto e fotogrammi');
    const colW = (W - 2 * M - 16) / 2; let col = 0, rowH = 0, rowY = y;
    for (const im of images) {
      const sz = jpegSize(im.bytes); if (!sz) continue;
      const h = Math.min(colW * sz.h / sz.w, 230), w = h * sz.w / sz.h;
      if (col === 0) { need(h + 40); rowY = y; rowH = 0; }
      const x = M + col * (colW + 16), top = rowY - 6;
      const name = `Im${++imgN}`; xo.push({ name, bytes: im.bytes, w: sz.w, h: sz.h });
      ops.push(`q ${w.toFixed(1)} 0 0 ${h.toFixed(1)} ${x.toFixed(1)} ${(top - h).toFixed(1)} cm /${name} Do Q`);
      text(`${im.label} - ${tm(im.at)}`, x, top - h - 11, 8.5, 'F2');
      if (im.sha) text(im.sha.slice(0, 32) + '...', x, top - h - 21, 7, 'F3', '0.45 0.45 0.5');
      rowH = Math.max(rowH, h + 28);
      col++; if (col === 2) { col = 0; y = rowY - rowH - 8; }
    }
    if (col === 1) y = rowY - rowH - 8;
  }
  rule();
  para('Rapporto creato dall\'app Vicina sul telefono della persona che ha chiesto aiuto. Le foto e gli audio originali restano sul server per 7 giorni dall\'SOS.', 8.5, 'F1', '0.45 0.45 0.5');
  newPage();

  // ---- assemblaggio
  const enc8 = new TextEncoder();
  const chunks = []; let len = 0; const offs = [];
  const add = x => { const b = typeof x === 'string' ? latin1(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n`); if (Array.isArray(body)) body.forEach(add); else add(body); add('\nendobj\n'); };
  function latin1(s) { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  void enc8;
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const nP = pages.length, firstPage = 6 + xo.length;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${nP} /Kids [${pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ')}] >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  xo.forEach((im, i) => obj(6 + i, [`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`, im.bytes, '\nendstream']));
  const xres = xo.length ? `/XObject << ${xo.map((im, i) => `/${im.name} ${6 + i} 0 R`).join(' ')} >>` : '';
  pages.forEach((p, i) => {
    const content = p.join('\n') + `\nBT 0.55 0.55 0.6 rg /F1 8 Tf ${M} 24 Td (${enc(`Vicina - Rapporto SOS ${sos.id || ''} - pagina ${i + 1} di ${nP}`)}) Tj ET`;
    const c = latin1(content);
    obj(firstPage + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> ${xres} >> /Contents ${firstPage + i * 2 + 1} 0 R >>`);
    obj(firstPage + i * 2 + 1, [`<< /Length ${c.length} >>\nstream\n`, c, '\nendstream']);
  });
  const xref = len, total = firstPage + nP * 2;
  add(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) add(`${String(offs[i] || 0).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
