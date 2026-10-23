// Collegamento al server (Supabase, piano gratuito). Le azioni sensibili sono funzioni SQL (RPC) protette.
import { createClient } from '@supabase/supabase-js';

export function createApi(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  /* ---------- errori nel formato atteso dall'interfaccia ---------- */
  const AUTH = {
    invalid_credentials: 'auth/invalid-credential', user_already_exists: 'auth/email-already-in-use', email_exists: 'auth/email-already-in-use',
    weak_password: 'auth/weak-password', email_address_invalid: 'auth/invalid-email', validation_failed: 'auth/invalid-email',
    over_email_send_rate_limit: 'auth/too-many-requests', over_request_rate_limit: 'auth/too-many-requests',
    email_not_confirmed: 'auth/email-not-confirmed', otp_expired: 'auth/otp-expired', same_password: 'auth/same-password',
    signup_disabled: 'auth/signup-disabled', email_provider_disabled: 'auth/email-provider-disabled', unexpected_failure: 'auth/db-error'
  };
  const offline = m => /fetch|network|Load failed/i.test(m || '');
  const aerr = e => Object.assign(new Error(e.message), {
    code: AUTH[e.code] || (offline(e.message) ? 'auth/network-request-failed' : /Invalid login/i.test(e.message) ? 'auth/invalid-credential' : /api key|apikey|No API key/i.test(e.message) ? 'auth/bad-key' : /Database error/i.test(e.message) ? 'auth/db-error' : 'auth/' + (e.code || 'unknown'))
  });
  const rerr = e => Object.assign(new Error(e.message || 'Errore'), {
    code: e.code === 'P0001' ? 'failed-precondition' : offline(e.message) ? 'unavailable' : e.code === '42501' ? 'permission-denied' : 'internal'
  });
  const dup = e => /already exists|duplicate|409/i.test((e?.message || '') + ' ' + (e?.statusCode || e?.status || ''));
  const ok = ({ data, error }) => { if (error) throw rerr(error); return data; };

  /* ---------- conversioni ---------- */
  const ms = t => (t ? Date.parse(t) : Date.now());
  const sos = x => ({
    id: x.id, from: x.from_uid, fromName: x.from_name, fromPhone: x.from_phone || '', lat: x.lat, lng: x.lng, acc: x.acc,
    photos: x.photos || [], at: ms(x.created_at), active: x.active, locAt: x.loc_at ? Date.parse(x.loc_at) : null, liveUntil: x.live_until ? Date.parse(x.live_until) : null, track: x.track || [], audio: x.audio || null, acks: x.acks || {}, helpers: x.helpers || {}, recipients: x.recipients || [], chats: x.chats || []
  });
  const chk = (c, ans) => ({
    id: c.id, from: c.from_uid, fromName: c.from_name, reason: c.reason, note: c.note || '', recipients: c.recipients || [], lat: c.lat, lng: c.lng,
    answered: c.answered || 0, helps: c.helps || 0, active: c.active, at: ms(c.created_at), remindedAt: c.reminded_at ? Date.parse(c.reminded_at) : 0,
    answers: Object.fromEntries(ans.map(a => [a.uid, { status: a.status, name: a.name, note: a.note || '', lat: a.lat, lng: a.lng, acc: a.acc, at: ms(a.at) }]))
  });
  const msg = m => ({ id: m.id, type: m.type, from: m.from_uid, fromName: m.from_name, text: m.text, sosId: m.sos_id, lat: m.lat, lng: m.lng, photos: m.photos || [], audio: m.audio || null, file: m.file || null, fileName: m.file_name || '', fileSize: m.file_size || 0, mime: m.mime || '', dur: m.dur || 0, at: ms(m.created_at) });
  const prof = p => p && ({ name: p.name, surname: p.surname, dob: p.dob, gender: p.gender, phone: p.phone || '', mutedGroups: p.muted_groups || [], termsVersion: p.terms_version || 0, avatar: p.avatar ? avatarUrl(p.id, p.avatar) : '', banner: p.banner ? avatarUrl(p.id, p.banner) : '', bio: p.bio || '', city: p.city || '', showBday: !!p.show_bday });
  // foto profilo: bucket pubblico «avatars», il nome del file è un codice casuale (lo conosce solo chi è nella tua cerchia)
  const avatarUrl = (uid, tok) => `${String(env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/storage/v1/object/public/avatars/${uid}/${tok}.jpg`;
  const token = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

  // nomi usati dall'interfaccia → funzioni SQL
  const RPC = {
    createInvite: d => ['create_invite', { p_kind: d.kind }],
    redeemInvite: d => ['redeem_invite', { p_code: d.code }],
    removeLink: d => ['remove_link', { p_link_id: d.linkId }],
    createGroup: d => ['create_group', { p_name: d.name }],
    decideJoin: d => ['decide_join', { p_group_id: d.groupId, p_uid: d.uid, p_accept: !!d.accept }],
    removeMember: d => ['remove_member', { p_group_id: d.groupId, p_uid: d.uid }],
    deleteGroup: d => ['delete_group', { p_group_id: d.groupId }],
    sendSos: d => ['send_sos', { p_sos_id: d.sosId, p_lat: d.lat, p_lng: d.lng, p_acc: d.acc, p_live: !!d.live }],
    updateSosLocation: d => ['update_sos_location', { p_sos_id: d.sosId, p_lat: d.lat, p_lng: d.lng, p_acc: d.acc }],
    stopSosLive: d => ['stop_sos_live', { p_sos_id: d.sosId }],
    attachSosAudio: d => ['attach_sos_audio', { p_sos_id: d.sosId, p_path: d.path }],
    acceptTerms: d => ['accept_terms', { p_version: d.version }],
    attachSosPhotos: d => ['attach_sos_photos', { p_sos_id: d.sosId, p_paths: d.paths }],
    ackSos: d => ['ack_sos', { p_sos_id: d.sosId }],
    resolveSos: d => ['resolve_sos', { p_sos_id: d.sosId }],
    deleteAccount: () => ['delete_account', {}],
    // Appello «State tutti bene?»
    sendCheck: d => ['send_check', { p_id: d.id, p_reason: d.reason || 'altro', p_note: d.note || null, p_lat: d.lat ?? null, p_lng: d.lng ?? null }],
    answerCheck: d => ['answer_check', { p_id: d.id, p_status: d.status, p_note: d.note || null, p_lat: d.lat ?? null, p_lng: d.lng ?? null, p_acc: d.acc ?? null }],
    remindCheck: d => ['remind_check', { p_id: d.id }],
    closeCheck: d => ['close_check', { p_id: d.id }],
    // Centrale di soccorso
    sosHelp: d => ['sos_help', { p_sos_id: d.sosId, p_role: d.role, p_lat: d.lat ?? null, p_lng: d.lng ?? null, p_eta: d.eta ?? null }],
    addEvidence: d => ['add_evidence', { p_sos_id: d.sosId, p_kind: d.kind, p_path: d.path || null, p_sha: d.sha || null, p_note: d.note || null, p_lat: d.lat ?? null, p_lng: d.lng ?? null }],
    verifyEvidence: d => ['verify_evidence', { p_sos_id: d.sosId }]
  };

  // aggiornamenti in tempo reale: a ogni modifica si ricarica la lista (le regole RLS filtrano cosa vedi)
  const debounce = (fn, ms = 150) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
  let chN = 0;

  return {
    demo: false,
    version: env.VITE_APP_VERSION || '',

    onAuth(cb) {
      let last;
      const { data } = sb.auth.onAuthStateChange((_ev, session) => {
        const u = session?.user ? { uid: session.user.id, email: session.user.email } : null;
        if ((u?.uid || null) === last) return; last = u?.uid || null;
        setTimeout(() => cb(u), 0); // mai chiamare Supabase dentro il callback
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw aerr(error); },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw aerr(error);
      return { needsConfirm: !data.session };
    },
    async signOut() { const { error } = await sb.auth.signOut(); if (error) await sb.auth.signOut({ scope: 'local' }); },
    async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email); if (error) throw aerr(error); },
    async confirmReset(email, code, password) {
      let r = await sb.auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (r.error) throw aerr(r.error);
      r = await sb.auth.updateUser({ password });
      if (r.error) throw aerr(r.error);
    },

    async getProfile(uid) { return prof(ok(await sb.from('profiles').select('*').eq('id', uid).maybeSingle())); },
    async createProfile(uid, p) { ok(await sb.from('profiles').insert({ id: uid, name: p.name, surname: p.surname, dob: p.dob, gender: p.gender, phone: p.phone || '' })); },
    async updateProfile(uid, patch) { ok(await sb.from('profiles').update({ phone: patch.phone ?? '' }).eq('id', uid)); },
    // profilo esteso (3.1): nome, bio, città, compleanno visibile
    async setProfile(d) {
      const r = await sb.rpc('set_profile', { p_name: d.name, p_surname: d.surname, p_bio: d.bio || '', p_city: d.city || '', p_show_bday: !!d.showBday });
      if (r.error) throw Object.assign(rerr(r.error), /set_profile|function/i.test(r.error.message || '') && !/Scrivi/.test(r.error.message || '') ? { code: 'v31-setup' } : {});
    },
    async circleProfile(uid) {
      const { data, error } = await sb.rpc('circle_profile', { p_uid: uid });
      if (error) throw Object.assign(rerr(error), /circle_profile|function/i.test(error.message || '') && !/non disponibile/.test(error.message || '') ? { code: 'v31-setup' } : {});
      return { ...data, avatar: data.avatar ? avatarUrl(data.uid, data.avatar) : '', banner: data.banner ? avatarUrl(data.uid, data.banner) : '', since: data.since ? Date.parse(data.since) : 0 };
    },
    async setMuted(uid, gid, muted) { ok(await sb.rpc('set_muted', { p_group_id: gid, p_muted: muted })); },
    async saveToken(uid, token) { ok(await sb.rpc('save_token', { p_token: token })); },

    watch(uid, h) {
      const load = {
        user: async () => { const { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle(); h.user(prof(data)); },
        links: async () => { const { data, error } = await sb.from('links').select('id, kind, uids, names'); if (!error) h.links(data); },
        groups: async () => {
          const { data, error } = await sb.from('groups').select('*');
          if (!error) h.groups(data.map(g => ({ id: g.id, name: g.name, code: g.code, adminUid: g.admin_uid, memberUids: g.member_uids, members: g.members, requests: g.requests })));
        },
        checks: async () => {
          if (!h.checks) return;
          const { data, error } = await sb.from('checks').select('*').eq('active', true);
          if (error) return;   // tabella non ancora creata (SQL dell'appello non lanciato): niente appelli
          const ids = data.map(c => c.id);
          const ans = ids.length ? ((await sb.from('check_answers').select('*').in('check_id', ids)).data || []) : [];
          h.checks(data.map(c => chk(c, ans.filter(a => a.check_id === c.id))));
        },
        sos: async () => {
          const { data, error } = await sb.from('sos').select('*').eq('active', true);
          if (error) return; const l = data.map(sos);
          h.sosIn(l.filter(s => s.from !== uid)); h.sosMine(l.filter(s => s.from === uid));
        }
      };
      const r = Object.fromEntries(Object.entries(load).map(([k, f]) => [k, debounce(f)]));
      const all = () => Object.values(r).forEach(f => f());
      const ch = sb.channel('vicina-' + uid + '-' + (++chN))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, r.user)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, r.links)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, r.groups)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sos' }, r.sos)
        .subscribe(status => { if (status === 'SUBSCRIBED') all(); });
      // appelli su un canale a parte: se l'SQL dell'appello non è ancora stato lanciato, gli SOS funzionano lo stesso
      const chC = sb.channel('vicina-chk-' + uid + '-' + (++chN))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'checks' }, r.checks)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'check_answers' }, r.checks)
        .subscribe(status => { if (status === 'SUBSCRIBED') r.checks(); });
      const vis = () => document.visibilityState === 'visible' && all();
      document.addEventListener('visibilitychange', vis);
      const iv = setInterval(all, 60000); // rete di sicurezza se il tempo reale si interrompe
      all();
      return () => { sb.removeChannel(ch); sb.removeChannel(chC); document.removeEventListener('visibilitychange', vis); clearInterval(iv); };
    },

    watchChat(id, cb) {
      const load = debounce(async () => {
        const { data, error } = await sb.from('messages').select('*').eq('chat_id', id).order('created_at', { ascending: false }).limit(100);
        if (!error) cb(data.map(msg).reverse());
      }, 80);
      const ch = sb.channel('chat-' + id + '-' + (++chN))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` }, load)
        .subscribe(status => { if (status === 'SUBSCRIBED') load(); });
      load();
      return () => sb.removeChannel(ch);
    },
    async sendText(id, uid, text) { ok(await sb.from('messages').insert({ chat_id: id, type: 'text', from_uid: uid, text })); },
    // allegati (3.1): foto, file, vocali → bucket privato «chat», cartella = id della chat
    async sendFile(id, uid, f) {
      const ext = (String(f.name || '').match(/\.([a-z0-9]{1,5})$/i)?.[1] || (f.type === 'voice' ? 'm4a' : f.type === 'image' ? 'jpg' : 'bin')).toLowerCase();
      const path = `${id}/${token()}.${ext}`;
      const up = await sb.storage.from('chat').upload(path, f.blob, { contentType: f.mime || 'application/octet-stream', upsert: false });
      if (up.error) throw Object.assign(rerr(up.error), /bucket|not found|row-level/i.test(up.error.message || '') ? { code: 'v31-setup' } : {});
      const r = await sb.from('messages').insert({ chat_id: id, type: f.type, from_uid: uid, file: path, file_name: f.name || null, file_size: f.size ?? f.blob.size, mime: f.mime || null, dur: f.dur ?? null, text: f.text || null });
      if (r.error) throw Object.assign(rerr(r.error), /type_chk|check constraint|column/i.test(r.error.message || '') ? { code: 'v31-setup' } : {});
    },
    async sendLoc(id, uid, lat, lng) {
      const r = await sb.from('messages').insert({ chat_id: id, type: 'loc', from_uid: uid, lat, lng });
      if (r.error) throw Object.assign(rerr(r.error), /type_chk|check constraint|column/i.test(r.error.message || '') ? { code: 'v31-setup' } : {});
    },
    async fileUrl(p, secs = 3600) {
      const { data, error } = await sb.storage.from('chat').createSignedUrl(p, secs);
      if (error) throw rerr(error); return data.signedUrl;
    },
    // ---------- assistente: conversazioni salvate sull'account (3.1) ----------
    async aiChats() {
      const { data, error } = await sb.from('ai_chats').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(100);
      if (error) throw Object.assign(rerr(error), { code: 'v31-setup' });
      return data.map(c => ({ id: c.id, title: c.title, at: ms(c.updated_at) }));
    },
    async aiMessages(id) {
      const { data, error } = await sb.from('ai_messages').select('role, text, created_at').eq('chat_id', id).order('id').limit(400);
      if (error) throw rerr(error); return data.map(m => ({ role: m.role, text: m.text, at: ms(m.created_at) }));
    },
    async aiNew(title) {
      const { data, error } = await sb.from('ai_chats').insert({ title: String(title || '').slice(0, 80) }).select('id').single();
      if (error) throw Object.assign(rerr(error), { code: 'v31-setup' }); return data.id;
    },
    async aiAdd(id, role, text) { ok(await sb.from('ai_messages').insert({ chat_id: id, role, text: String(text).slice(0, 8000) })); },
    async aiRename(id, title) { ok(await sb.from('ai_chats').update({ title: String(title || '').slice(0, 80) }).eq('id', id)); },
    async aiDelete(id) { ok(await sb.from('ai_chats').delete().eq('id', id)); },

    // «Sta scrivendo…» con anteprima del testo, chi è online e letture in tempo reale (canale broadcast, niente database)
    chatLive(id, me, h) {
      const ch = sb.channel('live-' + id, { config: { broadcast: { self: false }, presence: { key: me.uid } } });
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => payload?.uid !== me.uid && h.typing?.(payload))
        .on('broadcast', { event: 'read' }, ({ payload }) => payload?.uid !== me.uid && h.read?.(payload))
        .on('presence', { event: 'sync' }, () => { try { h.presence?.(Object.keys(ch.presenceState()).filter(k => k !== me.uid)); } catch {} })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads', filter: `chat_id=eq.${id}` }, ({ new: r }) => r?.uid && r.uid !== me.uid && h.read?.({ uid: r.uid, at: Date.parse(r.read_at) }))
        .subscribe(async s => { if (s === 'SUBSCRIBED') { try { await ch.track({ at: Date.now() }); } catch {} } });
      const send = (event, payload) => ch.send({ type: 'broadcast', event, payload: { uid: me.uid, name: me.name, ...payload } }).catch(() => {});
      return { typing: text => send('typing', { text: String(text || '').slice(0, 160), at: Date.now() }), read: at => send('read', { at }), close: () => sb.removeChannel(ch) };
    },
    async setLang(code) { try { await sb.rpc('set_lang', { p_lang: code }); } catch {} },
    async setDiscreet(on) { try { await sb.rpc('set_discreet', { p_on: !!on }); } catch {} },
    async markRead(id) { try { await sb.rpc('mark_read', { p_chat_id: id }); } catch {} },
    async getReads(id) {
      const { data, error } = await sb.from('chat_reads').select('uid, read_at').eq('chat_id', id);
      return error ? {} : Object.fromEntries(data.map(r => [r.uid, Date.parse(r.read_at)]));
    },

    // Assistente: timeout, un nuovo tentativo automatico sugli errori temporanei, messaggi d'errore chiari.
    async askAI(messages) {
      const once = async () => {
        await sb.auth.getSession();                      // rinnova il token se è scaduto
        const call = sb.functions.invoke('assistente', { body: { messages, lang: globalThis.vLang || 'it' } });
        const tmo = new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), 50000));
        const { data, error } = await Promise.race([call, tmo]);
        if (error) {
          let b = {};
          try { b = await error.context.json(); } catch {}
          const status = error.context?.status || 0;
          const m = b.error || (status === 404 ? "L'assistente non è pubblicato sul server: pubblica la funzione \"assistente\" su Supabase."
            : offline(error.message) ? 'Sei offline. Controlla la connessione.' : "L'assistente non risponde. Riprova tra poco.");
          throw Object.assign(new Error(m), { code: b.code || (offline(error.message) ? 'offline' : status === 404 ? 'missing' : 'unavailable'), status });
        }
        if (!data || typeof data.reply !== 'string') throw Object.assign(new Error("Risposta non valida dall'assistente."), { code: 'unavailable' });
        return data;
      };
      try { return await once(); }
      catch (e) {
        if (['quota', 'config', 'missing', 'empty', 'auth'].includes(e.code)) throw e;   // inutile ritentare
        await new Promise(r => setTimeout(r, 1200));
        return once();
      }
    },
    async diagAI() {
      const { data, error } = await sb.functions.invoke('assistente', { body: { diag: true } });
      if (error) {
        let b = {}; try { b = await error.context.json(); } catch {}
        const status = error.context?.status || 0;
        return { ok: false, errore: b.error || (status === 404 ? 'funzione "assistente" non pubblicata su Supabase' : error.message) };
      }
      return data;
    },
    async call(name, data = {}) {
      const m = RPC[name]; if (!m) throw new Error('Funzione sconosciuta: ' + name);
      const [fn, args] = m(data);
      return ok(await sb.rpc(fn, args));
    },
    async photoUrl(p, secs = 3600) {
      const { data, error } = await sb.storage.from('sos').createSignedUrl(p.replace(/^sos\//, ''), secs);
      if (error) throw rerr(error); return data.signedUrl;
    },
    async uploadAudio(p, blob, mime) {
      const { error } = await sb.storage.from('sos').upload(p.replace(/^sos\//, ''), blob, { contentType: mime, upsert: false });
      if (error && !dup(error)) throw rerr(error);   // già caricato da un tentativo precedente: va bene così
    },
    // ---------- luoghi sicuri dal server (Edge Function «luoghi»: Overpass + Photon + cache per zona) ----------
    async places(lat, lng) {
      await sb.auth.getSession();
      const call = sb.functions.invoke('luoghi', { body: { lat, lng } });
      const tmo = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 26000));
      const { data, error } = await Promise.race([call, tmo]);
      if (error || !data || !Array.isArray(data.elements)) throw new Error(data?.error || error?.message || 'luoghi non disponibili');
      return data;
    },
    // ---------- foto profilo ----------
    async setAvatar(uid, dataUrl) {
      const blob = await (await fetch(dataUrl)).blob(), tok = token();
      const up = await sb.storage.from('avatars').upload(`${uid}/${tok}.jpg`, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (up.error) throw Object.assign(rerr(up.error), /bucket|not found/i.test(up.error.message || '') ? { code: 'avatar-setup' } : {});
      const r = await sb.rpc('set_avatar', { p_avatar: tok });
      if (r.error) throw Object.assign(rerr(r.error), /set_avatar|function/i.test(r.error.message || '') ? { code: 'avatar-setup' } : {});
      this.cleanAvatars(uid, tok);
      return avatarUrl(uid, tok);
    },
    // banner del profilo: stessa cartella delle foto profilo, nome «bn_<codice>.jpg»
    async setBanner(uid, dataUrl) {
      const blob = await (await fetch(dataUrl)).blob(), tok = 'bn_' + token();
      const up = await sb.storage.from('avatars').upload(`${uid}/${tok}.jpg`, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (up.error) throw rerr(up.error);
      const r = await sb.rpc('set_banner', { p_banner: tok });
      if (r.error) throw Object.assign(rerr(r.error), /set_banner|function/i.test(r.error.message || '') ? { code: 'v31-setup' } : {});
      this.cleanBanners(uid, tok);
      return avatarUrl(uid, tok);
    },
    async removeBanner(uid) { ok(await sb.rpc('set_banner', { p_banner: null })); this.cleanBanners(uid, null); },
    async cleanBanners(uid, keep) {
      try { const { data } = await sb.storage.from('avatars').list(uid, { limit: 50 }); const old = (data || []).filter(f => f.name.startsWith('bn_') && f.name !== keep + '.jpg').map(f => `${uid}/${f.name}`); if (old.length) await sb.storage.from('avatars').remove(old); } catch {}
    },
    async removeAvatar(uid) { ok(await sb.rpc('set_avatar', { p_avatar: null })); this.cleanAvatars(uid, null); },
    async cleanAvatars(uid, keep) {   // via le foto vecchie (in sottofondo)
      try { const { data } = await sb.storage.from('avatars').list(uid, { limit: 50 }); const old = (data || []).filter(f => !f.name.startsWith('bn_') && f.name !== keep + '.jpg').map(f => `${uid}/${f.name}`); if (old.length) await sb.storage.from('avatars').remove(old); } catch {}
    },
    async circleAvatars() {
      const { data, error } = await sb.rpc('circle_avatars');
      if (error) return {};            // server non ancora aggiornato (aggiornamento-foto-profilo.sql): nessuna foto, nessun errore
      return Object.fromEntries((data || []).map(r => [r.uid, avatarUrl(r.uid, r.avatar)]));
    },
    // i miei SOS degli ultimi 7 giorni (anche chiusi): per le prove e il PDF
    async mySos() {
      const { data: { user } } = await sb.auth.getUser();
      const { data, error } = await sb.from('sos').select('*').eq('from_uid', user?.id).order('created_at', { ascending: false }).limit(15);
      if (error) throw rerr(error); return data.map(sos);
    },
    // prove certificate dell'SOS (in ordine)
    async evidence(sosId) {
      const { data, error } = await sb.from('sos_evidence').select('*').eq('sos_id', sosId).order('seq');
      if (error) throw rerr(error);
      return data.map(e => ({ seq: e.seq, kind: e.kind, path: e.path, sha: e.sha, note: e.note, lat: e.lat, lng: e.lng, at: Date.parse(e.at), chain: e.chain }));
    },
    async uploadBlob(p, blob, mime) {
      const { error } = await sb.storage.from('sos').upload(p.replace(/^sos\//, ''), blob, { contentType: mime, upsert: false });
      if (error && !dup(error)) throw rerr(error);
    },
    // Diretta SOS: canale in tempo reale (niente database) per audio, fotogrammi, walkie-talkie e posizione di chi arriva
    liveChannel(sosId, me, h) {
      const ch = sb.channel('diretta-' + sosId, { config: { broadcast: { self: false, ack: false }, presence: { key: me.uid } } });
      for (const ev of ['audio', 'frame', 'talk', 'text', 'pos', 'state']) ch.on('broadcast', { event: ev }, ({ payload }) => payload?.uid !== me.uid && h[ev]?.(payload));
      ch.on('presence', { event: 'sync' }, () => { try { h.presence?.(Object.entries(ch.presenceState()).filter(([k]) => k !== me.uid).map(([k, v]) => ({ uid: k, ...(v?.[0] || {}) }))); } catch {} })
        .subscribe(async st => { if (st === 'SUBSCRIBED') { try { await ch.track({ name: me.name, role: me.role || 'watch', at: Date.now() }); } catch {} h.ready?.(); } });
      return {
        send: (event, payload) => ch.send({ type: 'broadcast', event, payload: { uid: me.uid, name: me.name, at: Date.now(), ...payload } }).catch(() => {}),
        role: r => ch.track({ name: me.name, role: r, at: Date.now() }).catch(() => {}),
        close: () => sb.removeChannel(ch)
      };
    },
    async uploadPhoto(p, dataUrl) {
      const blob = await (await fetch(dataUrl)).blob();
      const { error } = await sb.storage.from('sos').upload(p.replace(/^sos\//, ''), blob, { contentType: 'image/jpeg', upsert: false });
      if (error && !dup(error)) throw rerr(error);
    }
  };
}
