// Edge Function "vicina" (Supabase, gratuita): invia le notifiche push via Firebase Cloud Messaging (gratis)
// e fa la pulizia delle foto. La chiama SOLO il database (header x-vicina-secret), mai l'app.
//
// Secrets richiesti (supabase secrets set ...):
//   VICINA_PUSH_SECRET   = lo stesso segreto usato in private.configure(...)
//   FCM_SERVICE_ACCOUNT  = contenuto del file JSON della chiave service account di Firebase (piano gratuito Spark)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già presenti in automatico.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SB = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SECRET = Deno.env.get('VICINA_PUSH_SECRET') || '';
let SA: { client_email: string; private_key: string; project_id: string } | null = null;
try { SA = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') || 'null'); } catch { SA = null; }

const PHOTO_DAYS = 7;
const first = (n?: string) => String(n || '').split(' ')[0];
const b64url = (u8: Uint8Array) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/* ---------- token OAuth per FCM HTTP v1 (firmato con la chiave del service account) ---------- */
let cached = { token: '', exp: 0 };
async function fcmToken(): Promise<string> {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  if (!SA) throw new Error('FCM_SERVICE_ACCOUNT mancante');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: SA.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  const pem = SA.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(sig) })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('OAuth FCM: ' + JSON.stringify(j));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

type Push = { title: string; body: string; data?: Record<string, string>; sos?: boolean };
async function push(uids: string[], p: Push) {
  uids = [...new Set(uids.filter(Boolean))];
  if (!uids.length || !SA) return 0;
  const { data: rows } = await SB.from('profiles').select('id, fcm_tokens').in('id', uids);
  const access = await fcmToken();
  let sent = 0;
  await Promise.all((rows || []).flatMap(row => (row.fcm_tokens || []).map(async (token: string) => {
    const message = {
      token,
      notification: { title: p.title, body: p.body },
      data: p.data || {},
      android: {
        priority: 'HIGH', ttl: p.sos ? '3600s' : '86400s',
        notification: { channel_id: p.sos ? 'sos' : 'messages', sound: 'default', ...(p.sos ? { visibility: 'PUBLIC', default_vibrate_timings: true, notification_priority: 'PRIORITY_MAX' } : {}) }
      },
      apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert' }, payload: { aps: { sound: 'default', ...(p.sos ? { 'interruption-level': 'time-sensitive' } : {}) } } }
    };
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${SA!.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' }, body: JSON.stringify({ message })
    });
    if (r.ok) { sent++; return; }
    const t = await r.text();
    if (r.status === 404 || /UNREGISTERED|registration token is not a valid/i.test(t)) {
      // token non più valido: lo togliamo
      const left = (row.fcm_tokens || []).filter((x: string) => x !== token);
      await SB.from('profiles').update({ fcm_tokens: left }).eq('id', row.id);
    } else console.warn('FCM', r.status, t.slice(0, 300));
  })));
  return sent;
}

/* ---------- storage ---------- */
async function removeFolder(prefix: string) {
  const { data } = await SB.storage.from('sos').list(prefix, { limit: 100 });
  const files = (data || []).filter(f => f.id).map(f => `${prefix}/${f.name}`);
  const dirs = (data || []).filter(f => !f.id).map(f => `${prefix}/${f.name}`);
  if (files.length) await SB.storage.from('sos').remove(files);
  for (const d of dirs) await removeFolder(d);
}

/* ---------- eventi ---------- */
async function handle(ev: { event: string; id: string; [k: string]: unknown }) {
  const one = async (table: string, id: string) => (await SB.from(table).select('*').eq('id', id).maybeSingle()).data;
  switch (ev.event) {
    case 'sos': {
      const s = await one('sos', ev.id); if (!s) return;
      return push(s.recipients, { title: `🆘 SOS da ${s.from_name}`, body: s.lat != null ? 'Ha bisogno di aiuto. Tocca per vedere posizione e foto.' : 'Ha bisogno di aiuto. Tocca per aprire.', data: { type: 'sos', sosId: s.id }, sos: true });
    }
    case 'ack': {
      const s = await one('sos', ev.id); if (!s) return;
      const n = s.acks?.[String(ev.uid)] || 'Qualcuno';
      return push([s.from_uid], { title: `${first(n)} ha visto il tuo SOS`, body: 'Sta intervenendo. Resta dove sei se puoi.', data: { type: 'ack', sosId: s.id } });
    }
    case 'voice': {
      const s = await one('sos', ev.id); if (!s) return;
      return push(s.recipients, { title: `🎙 Messaggio vocale da ${first(s.from_name)}`, body: 'Tocca per ascoltarlo nell\'SOS.', data: { type: 'sos', sosId: s.id }, sos: true });
    }
    case 'safe': {
      const s = await one('sos', ev.id); if (!s) return;
      return push(s.recipients, { title: `${first(s.from_name)} è al sicuro`, body: "Ha chiuso l'SOS. Tutto a posto.", data: { type: 'safe', sosId: s.id } });
    }
    case 'msg': {
      const m = await one('messages', ev.id); if (!m) return;
      const link = await one('links', m.chat_id), group = link ? null : await one('groups', m.chat_id);
      const to = (link?.uids || group?.member_uids || []).filter((u: string) => u !== m.from_uid);
      return push(to, { title: group ? `${first(m.from_name)} · ${group.name}` : m.from_name || 'Vicina', body: String(m.text || '').slice(0, 140), data: { type: 'msg', chatId: m.chat_id } });
    }
    case 'link':
      return push([String(ev.to)], { title: 'Nuovo collegamento', body: `${ev.name} ora è nella tua cerchia`, data: { type: 'link', chatId: ev.id } });
    case 'join': {
      const g = await one('groups', ev.id); if (!g) return;
      return push([g.admin_uid], { title: `Richiesta per "${g.name}"`, body: `${g.requests?.[String(ev.uid)] || 'Qualcuno'} vuole entrare nel gruppo`, data: { type: 'join', groupId: g.id } });
    }
    case 'joined': {
      const g = await one('groups', ev.id); if (!g) return;
      return push([String(ev.uid)], { title: 'Sei dentro!', body: `Ora fai parte del gruppo "${g.name}"`, data: { type: 'joined', chatId: g.id } });
    }
    case 'cleanup': { // foto e SOS più vecchi di 7 giorni
      const old = new Date(Date.now() - PHOTO_DAYS * 864e5).toISOString();
      const { data } = await SB.from('sos').select('id, from_uid').lt('created_at', old).limit(200);
      for (const s of data || []) { await removeFolder(`${s.from_uid}/${s.id}`); await SB.from('sos').delete().eq('id', s.id); }
      return (data || []).length;
    }
    case 'purge': { // account eliminato: via tutte le sue foto (e l'utente, se il database non ha potuto)
      await removeFolder(ev.id);
      await SB.auth.admin.deleteUser(ev.id).catch(() => {});
      return 1;
    }
  }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('ok');
  if (!SECRET || req.headers.get('x-vicina-secret') !== SECRET) return new Response('unauthorized', { status: 401 });
  try {
    const ev = await req.json();
    const r = await handle(ev);
    return Response.json({ ok: true, result: r ?? null });
  } catch (e) {
    console.error('vicina', e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
