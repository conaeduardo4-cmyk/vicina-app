// Server finto, in memoria: si attiva quando l'app è compilata senza le chiavi Firebase (o nell'anteprima).
// Serve per provare tutto il flusso dell'interfaccia. Nulla viene inviato davvero.
export function createDemoApi() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const err = (code, message) => Object.assign(new Error(message), { code });
  const rnd = () => Math.random().toString(36).slice(2, 10);
  const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  const PEOPLE = [['u_giulia', 'Giulia Rossi', '+39 333 111 2222'], ['u_marco', 'Marco Bianchi', '+39 347 555 0101'], ['u_sara', 'Sara Neri', ''], ['u_luca', 'Luca Verdi', '+39 320 987 6543']];
  let pi = 0; const nextPerson = () => PEOPLE[pi++ % PEOPLE.length];

  const db = { user: null, links: [], groups: [], sos: [], chats: {}, email: '' };
  let authCb = null, h = null; const chatCbs = {};
  const me = () => db.user && `${db.user.name} ${db.user.surname}`;
  const emit = () => {
    if (!h) return;
    h.user(db.user && { ...db.user });
    h.links(db.links.map(l => ({ ...l })));
    h.groups(db.groups.map(g => ({ ...g, members: { ...g.members }, requests: { ...g.requests } })));
    h.sosIn(db.sos.filter(s => s.active && s.recipients.includes('me')).map(s => ({ ...s })));
    h.sosMine(db.sos.filter(s => s.active && s.from === 'me').map(s => ({ ...s })));
  };
  const emitChat = id => chatCbs[id]?.((db.chats[id] || []).slice());
  const push = (cid, m) => { (db.chats[cid] ||= []).push({ id: rnd(), at: Date.now(), ...m }); emitChat(cid); };

  function addLink(kind, [uid, name]) {
    const id = 'l_' + uid; if (db.links.some(l => l.id === id)) return null;
    db.links.push({ id, kind, uids: ['me', uid], names: { me: me(), [uid]: name } }); db.chats[id] = [];
    setTimeout(() => { push(id, { type: 'text', from: uid, text: kind === 'partner' ? 'Eccomi ❤️ ci sono sempre' : 'Ciao! Ora siamo collegati su Vicina 🙂' }); }, 1500);
    emit(); scheduleIncoming(); return name;
  }
  let incomingDone = false;
  function scheduleIncoming() { // dopo un po' simula un SOS in arrivo da un contatto, per vedere la schermata
    if (incomingDone) return; incomingDone = true;
    setTimeout(() => {
      const l = db.links[0]; if (!l) return;
      const uid = l.uids.find(x => x !== 'me'), p = PEOPLE.find(x => x[0] === uid);
      const s = { id: 's_' + rnd(), from: uid, fromName: p[1], fromPhone: p[2], lat: 45.4642, lng: 9.19, acc: 18, photos: [], at: Date.now(), locAt: Date.now(), liveUntil: Date.now() + 12 * 36e5, track: [], audio: null, active: true, acks: {}, recipients: ['me'], chats: [l.id] };
      db.sos.push(s); push(l.id, { type: 'sos', from: uid, fromName: p[1], sosId: s.id, lat: s.lat, lng: s.lng, photos: [] }); emit();
      setTimeout(() => { s.photos = ['demo/back.jpg', 'demo/front.jpg']; emit(); }, 2500);
      setTimeout(() => { s.audio = 'demo/voice.webm'; emit(); }, 6000);
      const mv = setInterval(() => { if (!s.active || Date.now() > s.liveUntil) return clearInterval(mv); s.lat += 0.0004; s.lng += 0.0003; s.locAt = Date.now(); s.track = [...s.track, { lat: s.lat, lng: s.lng, t: s.locAt }].slice(-300); emit(); }, 8000);
    }, 25000);
  }
  const fakeVoice = () => { // breve audio di prova (tre toni) in WAV
    const sr = 8000, n = sr * 2, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const f = [440, 554, 659][Math.floor(i / (n / 3))]; v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * f * i / sr) * 6000 * Math.min(1, (n - i) / 800), true); }
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  };
  const fakePhoto = (k) => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 400; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 300, 400); g.addColorStop(0, k === 'back' ? '#2b3a55' : '#4a2b55'); g.addColorStop(1, '#111');
    x.fillStyle = g; x.fillRect(0, 0, 300, 400); x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '600 22px system-ui'; x.textAlign = 'center';
    x.fillText(k === 'back' ? 'Foto posteriore' : 'Foto frontale', 150, 200); x.font = '14px system-ui'; x.fillText('(demo)', 150, 228);
    return c.toDataURL('image/jpeg', .8);
  };
  const photos = {};

  const fns = {
    async createInvite({ kind }) {
      const code = code6();
      setTimeout(() => addLink(kind, nextPerson()), 6000); // simula che l'altra persona inserisca il codice
      return { code, expiresAt: Date.now() + 6e5 };
    },
    async redeemInvite({ code }) {
      if (code.startsWith('G')) { return { kind: 'group', name: 'Coinquiline' }; }
      const p = nextPerson(); const n = addLink('friend', p); if (!n) throw err('failed-precondition', 'Siete già collegati');
      return { kind: 'friend', name: n };
    },
    async removeLink({ linkId }) { db.links = db.links.filter(l => l.id !== linkId); delete db.chats[linkId]; emit(); return { ok: true }; },
    async createGroup({ name }) {
      const id = 'g_' + rnd(), code = code6();
      db.groups.push({ id, name, adminUid: 'me', code, memberUids: ['me'], members: { me: me() }, requests: {} }); db.chats[id] = []; emit();
      setTimeout(() => { const g = db.groups.find(x => x.id === id); if (!g) return; const p = nextPerson(); g.requests[p[0]] = p[1]; emit(); }, 5000);
      return { groupId: id, code };
    },
    async decideJoin({ groupId, uid, accept }) {
      const g = db.groups.find(x => x.id === groupId); const n = g.requests[uid]; delete g.requests[uid];
      if (accept) { if (g.memberUids.length >= 8) throw err('failed-precondition', 'Gruppo pieno: massimo 8 persone'); g.members[uid] = n; g.memberUids.push(uid); scheduleIncoming(); }
      emit(); return { ok: true };
    },
    async removeMember({ groupId, uid }) {
      const g = db.groups.find(x => x.id === groupId); delete g.members[uid]; g.memberUids = g.memberUids.filter(x => x !== uid);
      if (uid === 'me') db.groups = db.groups.filter(x => x.id !== groupId); emit(); return { ok: true };
    },
    async deleteGroup({ groupId }) { db.groups = db.groups.filter(x => x.id !== groupId); delete db.chats[groupId]; emit(); return { ok: true }; },
    async sendSos({ sosId, lat, lng, acc, live }) {
      await wait(700);
      const rec = new Set(); const chats = [];
      db.links.forEach(l => { chats.push(l.id); l.uids.forEach(u => u !== 'me' && rec.add(u)); });
      db.groups.filter(g => !db.user.mutedGroups.includes(g.id)).forEach(g => { chats.push(g.id); g.memberUids.forEach(u => u !== 'me' && rec.add(u)); });
      if (!rec.size) throw err('failed-precondition', 'Aggiungi prima qualcuno da avvisare');
      const liveUntil = Date.now() + 12 * 36e5;
      const s = { id: sosId, from: 'me', fromName: me(), fromPhone: db.user.phone, lat, lng, acc, photos: [], at: Date.now(), locAt: Date.now(), liveUntil, track: [], audio: null, active: true, acks: {}, recipients: [...rec], chats };
      db.sos.push(s); chats.forEach(c => push(c, { type: 'sos', from: 'me', fromName: me(), sosId, lat, lng, photos: [] })); emit();
      setTimeout(() => { const first = [...rec][0]; const n = PEOPLE.find(p => p[0] === first)?.[1] || 'Contatto'; s.acks[first] = n; emit(); push(chats[0], { type: 'text', from: first, text: 'Ho visto! Ti chiamo subito, sto arrivando.' }); }, 5000);
      return { recipients: rec.size, liveUntil };
    },
    async updateSosLocation({ sosId, lat, lng, acc }) {
      const s = db.sos.find(x => x.id === sosId); if (!s || !s.active || !s.liveUntil || s.liveUntil < Date.now()) return { live: false };
      Object.assign(s, { lat, lng, acc, locAt: Date.now() }); s.track = [...(s.track || []), { lat, lng, t: Date.now() }].slice(-300); emit(); return { live: true };
    },
    async stopSosLive() { return { ok: true }; },
    async acceptTerms({ version }) { if (db.user) db.user.termsVersion = version; return { ok: true }; },
    async attachSosAudio({ sosId, path }) {
      const s = db.sos.find(x => x.id === sosId); s.audio = path;
      s.chats.forEach(c => (db.chats[c] || []).forEach(m => m.sosId === sosId && (m.audio = path)));
      emit(); s.chats.forEach(emitChat); return { ok: true };
    },
    async attachSosPhotos({ sosId, paths }) {
      const s = db.sos.find(x => x.id === sosId); s.photos.push(...paths);
      s.chats.forEach(c => (db.chats[c] || []).forEach(m => m.sosId === sosId && (m.photos = s.photos.slice())));
      emit(); s.chats.forEach(emitChat); return { ok: true };
    },
    async resolveSos({ sosId }) {
      const s = db.sos.find(x => x.id === sosId); s.active = false; s.liveUntil = Math.min(s.liveUntil || 0, Date.now()); s.chats.forEach(c => push(c, { type: 'safe', from: 'me', fromName: me(), sosId })); emit(); return { ok: true };
    },
    async ackSos({ sosId }) { const s = db.sos.find(x => x.id === sosId); s.acks.me = me(); emit(); return { ok: true }; },
    async deleteAccount() { Object.assign(db, { user: null, links: [], groups: [], sos: [], chats: {} }); return { ok: true }; }
  };

  return {
    demo: true, version: 'demo',
    onAuth(cb) { authCb = cb; setTimeout(() => cb(null), 400); return () => {}; },
    async signIn(email, pw) { await wait(500); if (pw.length < 6) throw err('auth/invalid-credential'); db.email = email; if (!db.user) db.user = { name: 'Alex', surname: 'Demo', dob: '1995-05-12', gender: 'f', phone: '', mutedGroups: [], fcmTokens: [] }; authCb({ uid: 'me', email }); },
    async signUp(email, pw) { await wait(500); db.email = email; db.user = null; authCb({ uid: 'me', email }); },
    async signOut() { h = null; authCb(null); },
    async resetPassword() { await wait(300); },
    async confirmReset(email, code, pw) { await wait(400); if (code !== '123456') throw err('auth/otp-expired', 'x'); db.email = email; if (!db.user) db.user = { name: 'Alex', surname: 'Demo', dob: '1995-05-12', gender: 'f', phone: '', mutedGroups: [], fcmTokens: [] }; authCb({ uid: 'me', email }); },
    async getProfile() { await wait(200); return db.user && { ...db.user }; },
    async createProfile(uid, p) { await wait(300); db.user = { ...p, mutedGroups: [], fcmTokens: [] }; },
    async updateProfile(uid, patch) { Object.assign(db.user, patch); emit(); },
    async setMuted(uid, gid, muted) { const m = db.user.mutedGroups; db.user.mutedGroups = muted ? [...new Set([...m, gid])] : m.filter(x => x !== gid); emit(); },
    async saveToken() {},
    watch(uid, handlers) { h = handlers; setTimeout(emit, 50); return () => { h = null; }; },
    watchChat(id, cb) { chatCbs[id] = cb; setTimeout(() => emitChat(id), 20); return () => delete chatCbs[id]; },
    async sendText(id, uid, text) {
      push(id, { type: 'text', from: 'me', text });
      const l = db.links.find(x => x.id === id), g = db.groups.find(x => x.id === id);
      const other = l ? l.uids.find(x => x !== 'me') : g?.memberUids.find(x => x !== 'me');
      if (other) setTimeout(() => push(id, { type: 'text', from: other, text: ['Ok 👍', 'Tutto bene?', 'Ricevuto!', 'Ci sentiamo dopo'][Math.floor(Math.random() * 4)] }), 1800);
    },
    async askAI(messages) {
      await wait(1100);
      const q = messages[messages.length - 1].text.toLowerCase();
      const reply = /segu|paura|pericol/.test(q)
        ? "**Prima di tutto:** se ti senti in pericolo adesso tieni premuto il pulsante SOS o chiama il 112.\n- Vai verso un luogo affollato e illuminato, come un bar o un negozio.\n- Chiama qualcuno e resta al telefono mentre cammini.\n- Non tornare a casa se pensi di essere seguita/o: aspetta in un posto sicuro."
        : /notific/.test(q)
        ? "Controlla questi punti:\n- **Profilo → Controlla i permessi**: le notifiche devono risultare attive.\n- Su Android togli l'app dal risparmio batteria.\n- Verifica che le notifiche del canale **SOS** siano attive nelle impostazioni dell'app."
        : /aggiung|cerchia|amic/.test(q)
        ? "Vai nella scheda **Cerchia** e tocca **+**:\n- **Invita** genera un codice di 6 caratteri valido 10 minuti: condividilo con il pulsante Condividi.\n- Se invece hai ricevuto un codice, scegli **Ho un codice**.\nPer i gruppi, l'admin deve approvare la richiesta."
        : "Tieni premuto il pulsante SOS per 1,5 secondi: parte subito l'allarme con la tua posizione a tutta la cerchia, poi arrivano due foto. Quando sei al sicuro tocca **Sono al sicuro**. (Risposta di prova: questa è la modalità demo.)";
      return { reply, left: 27 };
    },
    async diagAI() { await wait(600); return { ok: true, configurati: ['demo'], prove: { demo: 'ok' } }; },
    async call(name, data = {}) { await wait(250); if (!fns[name]) throw err('not-found', 'Funzione inesistente'); return fns[name](data); },
    async uploadAudio(p, blob) { await wait(300); photos[p] = URL.createObjectURL(blob); },
    async photoUrl(p) { if (p === 'demo/voice.webm') return fakeVoice(); if (p.startsWith('demo/')) return fakePhoto(p.includes('back') ? 'back' : 'front'); if (photos[p]) return photos[p]; throw err('not-found', 'x'); },
    async uploadPhoto(p, dataUrl) { await wait(300); photos[p] = dataUrl; }
  };
}
