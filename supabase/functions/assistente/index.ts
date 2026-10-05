// Edge Function "assistente": risponde agli utenti di Vicina usando Gemini (piano gratuito di Google AI Studio).
// La chiama l'app con il token dell'utente. La chiave di Gemini resta qui, mai dentro l'app.
//
// Secrets richiesti (Edge Functions → Secrets):
//   GEMINI_API_KEY   = la chiave creata su aistudio.google.com (gratis)
// Facoltativi:
//   GEMINI_MODEL     = modello da usare (predefinito: gemini-flash-latest)
//   AI_DAILY_LIMIT   = messaggi al giorno per utente (predefinito: 30)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SB = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const KEY = Deno.env.get('GEMINI_API_KEY') || '';
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest';
const LIMIT = Math.max(1, Number(Deno.env.get('AI_DAILY_LIMIT') || 30));

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const GUIDA = `
COME FUNZIONA L'APP VICINA (usa queste informazioni per rispondere sulle funzioni):
- SOS: nella scheda "SOS" si tiene premuto il pulsante rosso per 1,5 secondi. Parte subito l'allarme con posizione GPS a tutta la cerchia, poi l'app scatta in automatico una foto con la fotocamera posteriore e una con quella frontale. Prima che parta l'allarme si può toccare "Annulla".
- Dopo l'invio compare "SOS attivo": mostra chi ha visto l'allarme ("Ho visto, me ne occupo"). Quando si è al sicuro si tocca "Sono al sicuro" e tutti vengono avvisati. Un SOS resta attivo al massimo 12 ore. Tra un SOS e l'altro servono 20 secondi.
- Chi riceve un SOS vede una schermata rossa con posizione (Apri la posizione), foto, pulsante Chiama (se la persona ha inserito il telefono), 112 e chat.
- Cerchia: partner (uno solo), amici e gruppi fino a 8 persone, massimo 10 gruppi. Ci si collega con un codice di 6 caratteri: scheda "Cerchia" → "+" → Invita (il codice vale 10 minuti, si condivide con il pulsante Condividi) oppure "Ho un codice". Per i gruppi l'admin deve approvare la richiesta. Nella scheda del gruppo si può escludere il gruppo dagli SOS con l'interruttore "Includi negli SOS".
- Chat: scheda "Avvisi", una chat per ogni persona e gruppo; qui arrivano anche gli SOS.
- Profilo: telefono (lo vede solo chi riceve un tuo SOS), permessi, esci, elimina account.
- Permessi necessari: posizione, fotocamera, notifiche. Se le notifiche non arrivano: Profilo → "Controlla i permessi"; su Android controllare anche che l'app non sia in "risparmio batteria/ottimizzata" e che le notifiche del canale "SOS" siano attive; su iPhone le notifiche push arriveranno con la versione definitiva.
- Le foto degli SOS vengono cancellate dopo 7 giorni. Nessuno può collegarsi senza il consenso di entrambi.
- Su Android l'app si installa dal sito (link in bio): se il telefono avvisa, "Scarica comunque" e poi "Installa comunque". Su iPhone è in beta.
- Limiti noti: per scattare le foto l'app deve essere aperta in primo piano; senza internet l'SOS non parte e l'app propone di chiamare il 112.
`;

function regole(nome: string, genere: string) {
  return `Sei l'Assistente di Vicina, un'app italiana di sicurezza personale (SOS alla propria cerchia di persone fidate).
Parli SEMPRE in italiano, in modo caldo, chiaro e breve (di norma 2-6 frasi o un elenco corto). ${nome ? `L'utente si chiama ${nome}` : ''}${genere === 'f' ? ' (usa il femminile)' : genere === 'm' ? ' (usa il maschile)' : ''}.

REGOLE DI SICUREZZA, da rispettare sempre:
1. Se l'utente dice o fa capire di essere in pericolo ADESSO (seguita/o, minacciata/o, aggressione, ferite, malore, violenza in corso): rispondi per prima cosa, in una riga, di chiamare subito il 112 o di tenere premuto il pulsante SOS di Vicina. Solo dopo, pochissimi consigli pratici immediati (andare in un luogo affollato e illuminato, entrare in un negozio o bar, restare al telefono con qualcuno). Niente testi lunghi.
2. Non dire mai che non serve chiamare il 112 o i soccorsi. Nel dubbio, consiglia di chiamare.
3. Non fare diagnosi mediche né dare consigli medici o legali come certi: dai solo indicazioni generali di primo soccorso riconosciute e rimanda al 112 / al medico / a un avvocato o a un centro antiviolenza. Numeri utili in Italia: 112 emergenze, 1522 antiviolenza e stalking (gratuito, 24 ore su 24), 114 emergenza infanzia.
4. Non chiedere mai password, codici, indirizzi o dati personali. Non hai accesso a posizione, foto, contatti o chat dell'utente e non puoi inviare SOS o messaggi: se te lo chiedono, spiega come farlo nell'app.
5. Non inventare funzioni che l'app non ha. Se non sai qualcosa, dillo.
6. Rifiuta con gentilezza richieste non legate a sicurezza personale, benessere o uso dell'app, riportando la conversazione su questi temi.
7. Niente markdown complesso: al massimo **grassetto** ed elenchi con "- ".
${GUIDA}`;
}

type Msg = { role: 'user' | 'model'; text: string };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metodo non supportato' }, 405);
  if (!KEY) return json({ error: "L'assistente non è ancora configurato (manca GEMINI_API_KEY)." }, 503);

  // 1) chi sta scrivendo?
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await SB.auth.getUser(jwt);
  const uid = u?.user?.id;
  if (!uid) return json({ error: 'Accedi per usare l\'assistente.' }, 401);

  // 2) messaggi (ultimi 12, testo limitato)
  let body: { messages?: Msg[] } = {};
  try { body = await req.json(); } catch { /* vuoto */ }
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .slice(-12)
    .map(m => ({ role: m.role, parts: [{ text: m.text.slice(0, 1500) }] }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ error: 'Scrivi una domanda.' }, 400);
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();

  // 3) limite giornaliero
  const { data: left, error: qErr } = await SB.rpc('ai_take_quota', { p_uid: uid, p_limit: LIMIT });
  if (qErr) { console.error('quota', qErr); return json({ error: 'Assistente momentaneamente non disponibile.' }, 500); }
  if (left < 0) return json({ error: `Hai usato i ${LIMIT} messaggi di oggi con l'assistente. Riprova domani. In emergenza usa il pulsante SOS o chiama il 112.` }, 429);

  // 4) nome e genere per un italiano corretto (solo il nome di battesimo)
  const { data: p } = await SB.from('profiles').select('name, gender').eq('id', uid).maybeSingle();

  // 5) Gemini
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: regole(p?.name || '', p?.gender || '') }] },
      contents: msgs,
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 }
    })
  });
  if (!r.ok) {
    const t = await r.text();
    console.error('Gemini', r.status, t.slice(0, 500));
    const msg = r.status === 429 ? "L'assistente ha ricevuto troppe richieste, riprova tra un minuto."
      : r.status === 400 || r.status === 403 ? "Configurazione dell'assistente non valida (chiave o modello)."
      : 'Assistente momentaneamente non disponibile.';
    return json({ error: msg }, 502);
  }
  const d = await r.json();
  const reply = (d?.candidates?.[0]?.content?.parts || []).map((x: { text?: string }) => x.text || '').join('').trim();
  if (!reply) return json({ reply: "Non posso rispondere a questa domanda. Se sei in pericolo tieni premuto il pulsante SOS o chiama il 112.", left });
  return json({ reply, left });
});
