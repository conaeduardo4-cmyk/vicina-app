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
    photos: x.photos || [], at: ms(x.created_at), active: x.active, locAt: x.loc_at ? Date.parse(x.loc_at) : null, liveUntil: x.live_until ? Date.parse(x.live_until) : null, track: x.track || [], audio: x.audio || null, acks: x.acks || {}, recipients: x.recipients || [], chats: x.chats || []
  });
  const msg = m => ({ id: m.id, type: m.type, from: m.from_uid, fromName: m.from_name, text: m.text, sosId: m.sos_id, lat: m.lat, lng: m.lng, photos: m.photos || [], audio: m.audio || null, at: ms(m.created_at) });
  const prof = p => p && ({ name: p.name, surname: p.surname, dob: p.dob, gender: p.gender, phone: p.phone || '', mutedGroups: p.muted_groups || [], termsVersion: p.terms_version || 0 });

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
    deleteAccount: () => ['delete_account', {}]
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
      const vis = () => document.visibilityState === 'visible' && all();
      document.addEventListener('visibilitychange', vis);
      const iv = setInterval(all, 60000); // rete di sicurezza se il tempo reale si interrompe
      all();
      return () => { sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis); clearInterval(iv); };
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

    // Assistente: timeout, un nuovo tentativo automatico sugli errori temporanei, messaggi d'errore chiari.
    async askAI(messages) {
      const once = async () => {
        await sb.auth.getSession();                      // rinnova il token se è scaduto
        const call = sb.functions.invoke('assistente', { body: { messages } });
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
    async uploadPhoto(p, dataUrl) {
      const blob = await (await fetch(dataUrl)).blob();
      const { error } = await sb.storage.from('sos').upload(p.replace(/^sos\//, ''), blob, { contentType: 'image/jpeg', upsert: false });
      if (error && !dup(error)) throw rerr(error);
    }
  };
}
