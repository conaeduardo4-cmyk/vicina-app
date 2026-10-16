// Edge Function "luoghi": luoghi sicuri intorno a un punto (polizia, carabinieri, pronto soccorso, farmacie, defibrillatori…).
// Perché dal server: da aprile 2026 i server Overpass di OpenStreetMap rifiutano (errore 406) le richieste senza un
// User-Agent/Referer riconoscibile e sono spesso sovraccarichi; dal telefono l'app diceva «serve internet» anche con internet.
// Qui: richiesta POST con User-Agent e Referer di Vicina a più server insieme, riserva su Photon (komoot) e
// risultati salvati per 7 giorni per zona (~2 km): la stessa zona chiesta da più persone non tocca di nuovo i server.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const env = (k: string, d = '') => (Deno.env.get(k) || d).trim();
const SB = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const UA = env('PLACES_USER_AGENT', 'Vicina-app/1.0 (app SOS gratuita; +https://vicina.netlify.app)');
const REF = env('PLACES_REFERER', 'https://vicina.netlify.app/');
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const TTL_DAYS = 7, RADIUS = 4000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const withTimeout = async (u: string, init: RequestInit, ms: number) => {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(u, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
};
const firstOk = <T>(ps: Promise<T>[]) => new Promise<T>((ok, ko) => { let n = ps.length; ps.forEach(p => p.then(ok, () => { if (--n === 0) ko(new Error('nessuna risposta')); })); });

async function overpass(lat: number, lng: number) {
  const a = `around:${RADIUS},${lat},${lng}`;
  const q = `[out:json][timeout:20];(nwr(${a})[amenity~"^(police|hospital|clinic|pharmacy|fuel)$"];nwr(${a})[emergency=defibrillator];nwr(${a})[shop~"^(supermarket|convenience)$"][opening_hours="24/7"];);out center tags 300;`;
  const ask = async (u: string) => {
    const r = await withTimeout(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA, Referer: REF } }, 22000);
    if (!r.ok) throw new Error(u + ' HTTP ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j.elements) || (j.remark && !j.elements.length)) throw new Error(u + ' ' + (j.remark || 'risposta non valida'));
    return j.elements;
  };
  return await firstOk(SERVERS.map(ask));
}

// riserva: Photon (ricerca di OpenStreetMap di komoot), una richiesta per tipo, vicino al punto
const PHOTON: [string, string][] = [['polizia', 'amenity:police'], ['carabinieri', 'amenity:police'], ['ospedale', 'amenity:hospital'], ['farmacia', 'amenity:pharmacy'], ['defibrillatore', 'emergency:defibrillator']];
async function photon(lat: number, lng: number) {
  const all = await Promise.allSettled(PHOTON.map(async ([q, tag]) => {
    const r = await withTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=25&lang=it&osm_tag=${encodeURIComponent(tag)}`, { headers: { 'User-Agent': UA, Referer: REF } }, 12000);
    if (!r.ok) throw new Error('photon ' + r.status);
    return (await r.json()).features || [];
  }));
  const seen = new Set<string>(), out: unknown[] = [];
  for (const s of all) if (s.status === 'fulfilled') for (const f of s.value) {
    const p = f.properties || {}, [lo, la] = f.geometry?.coordinates || [];
    const id = (p.osm_type || 'N') + p.osm_id; if (seen.has(id) || la == null) continue; seen.add(id);
    if (Math.hypot((la - lat) * 111, (lo - lng) * 111 * Math.cos(lat * Math.PI / 180)) > RADIUS / 1000 + 1) continue;
    out.push({ type: { N: 'node', W: 'way', R: 'relation' }[p.osm_type as string] || 'node', id: p.osm_id, lat: la, lon: lo,
      tags: { name: p.name, [p.osm_key]: p.osm_value, 'addr:street': p.street, 'addr:housenumber': p.housenumber } });
  }
  if (!out.length && all.every(s => s.status === 'rejected')) throw new Error('photon non risponde');
  return out;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: true });
  // solo utenti di Vicina
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await SB.auth.getUser(tok);
  if (!u?.user) return json({ error: 'Accedi di nuovo' }, 401);
  let b: { lat?: number; lng?: number } = {};
  try { b = await req.json(); } catch {}
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: 'Posizione non valida' }, 400);
  // zona di circa 2 km: chi è vicino usa gli stessi risultati
  const glat = Math.round(lat * 50) / 50, glng = Math.round(lng * 50) / 50, key = `${glat.toFixed(2)},${glng.toFixed(2)}`;
  try {
    const { data: c } = await SB.from('places_cache').select('data, src, at').eq('key', key).maybeSingle();
    if (c && Date.now() - Date.parse(c.at) < TTL_DAYS * 864e5) return json({ elements: c.data, src: c.src, cached: true, center: { lat: glat, lng: glng } });
  } catch { /* tabella assente: si va avanti senza cache */ }
  let elements: unknown[] = [], src = 'overpass';
  try { elements = await overpass(glat, glng); }
  catch (e) {
    console.warn('overpass', String(e));
    try { elements = await photon(glat, glng); src = 'photon'; }
    catch (e2) { console.warn('photon', String(e2)); return json({ error: 'I server delle mappe non rispondono adesso. Riprova tra poco.' }, 503); }
  }
  try { await SB.from('places_cache').upsert({ key, data: elements, src, at: new Date().toISOString() }); } catch {}
  return json({ elements, src, cached: false, center: { lat: glat, lng: glng } });
});
