// Edge Function "assistente": risponde agli utenti di Vicina con modelli di IA gratuiti.
// Affidabilità: prova più fornitori e più modelli in ordine, ritenta sugli errori temporanei,
// non blocca mai la risposta se il contatore giornaliero ha un problema.
// La chiamata arriva dall'app con il token dell'utente. Le chiavi restano qui, mai dentro l'app.
//
// Secrets (Edge Functions → Secrets) – basta almeno UNO:
//   GROQ_API_KEY       = chiave gratuita da console.groq.com (consigliata: veloce)
//   GEMINI_API_KEY     = chiave gratuita da aistudio.google.com
//   OPENROUTER_API_KEY = chiave gratuita da openrouter.ai (riserva, modelli ":free")
// Facoltativi:
//   AI_PROVIDERS       = ordine dei fornitori (predefinito "groq,gemini,openrouter")
//   GROQ_MODELS        = predefinito "llama-3.3-70b-versatile,openai/gpt-oss-120b,llama-3.1-8b-instant"
//   GEMINI_MODELS      = predefinito "gemini-flash-latest,gemini-flash-lite-latest"
//   OPENROUTER_MODELS  = predefinito "meta-llama/llama-3.3-70b-instruct:free,openrouter/free"
//   AI_DAILY_LIMIT     = messaggi al giorno per utente (predefinito 40)
//
// Diagnosi: apri nel browser  https://TUO-PROGETTO.supabase.co/functions/v1/assistente?diag=1
// (oppure Impostazioni → Assistente → "Verifica collegamento" nell'app): dice cosa è configurato e cosa risponde.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const env = (k: string, d = '') => (Deno.env.get(k) || d).trim();
const SB = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const KEYS: Record<string, string> = { groq: env('GROQ_API_KEY'), gemini: env('GEMINI_API_KEY'), openrouter: env('OPENROUTER_API_KEY') };
const list = (k: string, d: string) => env(k, d).split(',').map(x => x.trim()).filter(Boolean);
const PROVIDERS = list('AI_PROVIDERS', 'groq,gemini,openrouter').map(x => x.toLowerCase()).filter(p => KEYS[p]);
const MODELS: Record<string, string[]> = {
  groq: list('GROQ_MODELS', 'llama-3.3-70b-versatile,openai/gpt-oss-120b,llama-3.1-8b-instant'),
  gemini: list('GEMINI_MODELS', env('GEMINI_MODEL') || 'gemini-flash-latest,gemini-flash-lite-latest'),
  openrouter: list('OPENROUTER_MODELS', 'meta-llama/llama-3.3-70b-instruct:free,openrouter/free')
};
const LIMIT = Math.max(1, Number(env('AI_DAILY_LIMIT', '40')) || 40);
const BUDGET_MS = 45000;                // tempo massimo totale per una risposta
const FUORI_TEMA = "Questa domanda non c'entra con Vicina. Posso aiutarti solo con l'uso dell'app e con la tua sicurezza personale.";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const GUIDA = `
COME FUNZIONA L'APP VICINA (usa queste informazioni per rispondere sulle funzioni):
- SOS: nella scheda "SOS" si tiene premuto il pulsante rosso per 1,5 secondi. Parte subito l'allarme con posizione GPS a tutta la cerchia, poi l'app scatta in automatico una foto con la fotocamera posteriore e una con quella frontale. Prima che parta l'allarme si può toccare "Annulla".
- Posizione live: dopo l'SOS la posizione si aggiorna da sola e resta attiva finché non si tocca "Sono al sicuro" (anche a schermo spento, con una notifica fissa). Non si può fermare prima, così la cerchia non perde mai di vista chi chiede aiuto.
- Messaggio vocale (facoltativo): nella schermata "SOS attivo" si tocca "Registra un vocale", si parla e si invia; lo sentono tutte le persone della cerchia (massimo 60 secondi). Si può non mandarlo affatto.
- Mappa: la scheda "Mappa" mostra una mappa vera dentro l'app con la posizione live di chi ha chiesto aiuto e il percorso fatto. "Raggiungi" apre le indicazioni in Apple Mappe su iPhone e in Google Maps su Android.
- Dopo l'invio compare "SOS attivo": mostra chi ha visto l'allarme ("Ho visto, me ne occupo"). Quando si è al sicuro si tocca "Sono al sicuro" e tutti vengono avvisati. Un SOS resta attivo al massimo 12 ore. Tra un SOS e l'altro servono 20 secondi.
- Chi riceve un SOS vede una schermata rossa con posizione live ("Vedi sulla mappa" e "Raggiungi"), messaggio vocale se c'è, foto, pulsante Chiama (se la persona ha inserito il telefono), 112 e chat.
- Cerchia: partner (uno solo), amici e gruppi fino a 8 persone, massimo 10 gruppi. Ci si collega con un codice di 6 caratteri: scheda "Cerchia" → "+" → Invita (il codice vale 10 minuti, si condivide con il pulsante Condividi) oppure "Ho un codice". Per i gruppi l'admin deve approvare la richiesta. Nella scheda del gruppo si può escludere il gruppo dagli SOS con l'interruttore "Includi negli SOS".
- Chat: scheda "Avvisi", una chat per ogni persona e gruppo; qui arrivano anche gli SOS.
- Impostazioni (ultima scheda): profilo e telefono (lo vede solo chi riceve un tuo SOS), opzione messaggio vocale, permessi, Guida rapida interattiva, Assistente, esci, elimina account.
- Permessi necessari: posizione, fotocamera, notifiche. Se le notifiche non arrivano: Impostazioni → Permessi; su Android controllare anche che l'app non sia in "risparmio batteria/ottimizzata" e che le notifiche del canale "SOS" siano attive; su iPhone le notifiche push arriveranno con la versione definitiva.
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
6. ARGOMENTI AMMESSI: uso dell'app Vicina; sicurezza personale, prevenzione, cosa fare in un'emergenza; paura, ansia o disagio legati a sentirsi in pericolo. Se il messaggio riguarda QUALSIASI altro argomento (compiti, ricette, sport, programmazione, notizie, giochi, curiosità, traduzioni, ecc.) rispondi SOLO con la parola: FUORI_TEMA
7. Niente markdown complesso: al massimo **grassetto** ed elenchi con "- ".
${GUIDA}`;
}

type Msg = { role: 'user' | 'model'; text: string };
type Turn = { role: 'user' | 'model'; text: string };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  if (req.method === 'GET' || url.searchParams.has('diag')) return json(await diagnose());
  if (req.method !== 'POST') return json({ error: 'Metodo non supportato' }, 405);

  // 1) chi sta scrivendo?
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let uid = '';
  try { const { data } = await SB.auth.getUser(jwt); uid = data?.user?.id || ''; } catch (e) { console.warn('auth', e); }
  if (!uid) return json({ error: 'Sessione scaduta: esci e accedi di nuovo per usare l\'assistente.', code: 'auth' }, 401);

  // 2) messaggi (ultimi 12, testo limitato)
  let body: { messages?: Msg[]; diag?: boolean } = {};
  try { body = await req.json(); } catch { /* vuoto */ }
  if (body.diag) return json(await diagnose(true));
  const msgs: Turn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .slice(-12).map(m => ({ role: m.role, text: m.text.slice(0, 1500) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ error: 'Scrivi una domanda.', code: 'empty' }, 400);

  // 3) limite giornaliero: se il contatore ha un problema NON blocca l'assistente
  let left: number | null = null;
  try {
    const { data, error } = await SB.rpc('ai_take_quota', { p_uid: uid, p_limit: LIMIT });
    if (error) console.warn('quota (ignorata)', error.message); else left = data as number;
  } catch (e) { console.warn('quota (ignorata)', e); }
  if (left !== null && left < 0) return json({ error: `Hai usato i ${LIMIT} messaggi di oggi con l'assistente. Riprova domani. In emergenza usa il pulsante SOS o chiama il 112.`, code: 'quota' }, 429);

  // 4) nome e genere (solo il nome di battesimo), se non riesce va avanti lo stesso
  let p: { name?: string; gender?: string } | null = null;
  try { p = (await SB.from('profiles').select('name, gender').eq('id', uid).maybeSingle()).data; } catch { /* niente */ }

  // 5) IA
  if (!PROVIDERS.length) return json({ error: "L'assistente non è configurato sul server: manca la chiave (GROQ_API_KEY, GEMINI_API_KEY o OPENROUTER_API_KEY).", code: 'config' }, 503);
  const { reply, errors } = await ask(regole(p?.name || '', p?.gender || ''), msgs);
  if (!reply) {
    console.error('assistente: nessun fornitore ha risposto', errors);
    return json({ error: "L'assistente non risponde in questo momento. Riprova tra un minuto. In emergenza usa il pulsante SOS o chiama il 112.", code: 'providers', detail: errors.slice(-3) }, 502);
  }
  let out = reply;
  if (/^\W*FUORI[_ ]TEMA\W*$/i.test(out) || (/FUORI[_ ]TEMA/i.test(out) && out.length < 40)) out = FUORI_TEMA;
  return json({ reply: out, left });
});

// Prova fornitori e modelli in ordine finché uno risponde, entro il tempo massimo.
async function ask(system: string, msgs: Turn[]) {
  const t0 = Date.now(), errors: string[] = [];
  for (const prov of PROVIDERS) {
    let down = false;                   // fornitore che non risponde affatto: si passa subito al prossimo
    for (const model of MODELS[prov] || []) {
      if (down) break;
      for (let attempt = 0; attempt < 2; attempt++) {
        const left = BUDGET_MS - (Date.now() - t0);
        if (left < 3000) return { reply: '', errors: [...errors, 'tempo scaduto'] };
        try {
          const r = await callModel(prov, model, system, msgs, Math.min(15000, left));
          if (r) return { reply: r, errors };
          errors.push(`${prov}/${model}: risposta vuota`); break;
        } catch (e) {
          const m = String((e as Error)?.message || e);
          errors.push(`${prov}/${model}: ${m.slice(0, 160)}`);
          if (/timed out|abort|network|connection|dns|HTTP 401|HTTP 403/i.test(m)) { down = true; break; }   // irraggiungibile o chiave errata
          // ritenta una volta sugli errori temporanei (troppe richieste, server occupato)
          if (attempt === 0 && /HTTP (429|500|502|503|504)/.test(m)) { await new Promise(r => setTimeout(r, 900)); continue; }
          break;
        }
      }
    }
  }
  return { reply: '', errors };
}

function callModel(prov: string, model: string, system: string, msgs: Turn[], ms: number) {
  if (prov === 'gemini') return askGemini(model, system, msgs, ms);
  const url = prov === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  return askOpenAI(url, KEYS[prov], model, system, msgs, ms, prov === 'openrouter');
}

async function withTimeout(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(new Error('timed out')), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}

// Groq / OpenRouter (API compatibile OpenAI)
async function askOpenAI(url: string, key: string, model: string, system: string, msgs: Turn[], ms: number, openrouter: boolean) {
  const body: Record<string, unknown> = {
    model, temperature: 0.3, max_tokens: 2048,
    messages: [{ role: 'system', content: system }, ...msgs.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))]
  };
  if (/gpt-oss/.test(model)) body.reasoning_effort = 'low';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
  if (openrouter) { headers['HTTP-Referer'] = 'https://vicina.app'; headers['X-Title'] = 'Vicina'; }
  const r = await withTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, ms);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return clean(String(d?.choices?.[0]?.message?.content || ''));
}

// Gemini (Google AI Studio). Il "ragionamento" interno viene spento: altrimenti può consumare
// tutti i token e restituire una risposta vuota (era uno dei motivi degli errori).
async function askGemini(model: string, system: string, msgs: Turn[], ms: number) {
  const base = {
    systemInstruction: { parts: [{ text: system }] },
    contents: msgs.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
      .map(category => ({ category, threshold: 'BLOCK_ONLY_HIGH' }))
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': KEYS.gemini };
  const tries = [
    { ...base, generationConfig: { temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } },
    { ...base, generationConfig: { temperature: 0.3, maxOutputTokens: 8192 } }
  ];
  let last = '';
  for (const b of tries) {
    const r = await withTimeout(url, { method: 'POST', headers, body: JSON.stringify(b) }, ms);
    if (!r.ok) {
      last = `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`;
      if (r.status === 400 && /thinking/i.test(last)) continue;   // modello che non accetta l'opzione: riprova senza
      throw new Error(last);
    }
    const d = await r.json();
    const text = (d?.candidates?.[0]?.content?.parts || []).filter((x: { thought?: boolean }) => !x.thought).map((x: { text?: string }) => x.text || '').join('');
    if (text.trim()) return clean(text);
    last = 'vuota (' + (d?.candidates?.[0]?.finishReason || d?.promptFeedback?.blockReason || '?') + ')';
  }
  throw new Error(last);
}

// Toglie eventuali blocchi di "ragionamento" e spazi in eccesso
const clean = (t: string) => t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

// Diagnosi: cosa è configurato e se ogni fornitore risponde davvero (una domanda di prova)
async function diagnose(full = false) {
  const out: Record<string, unknown> = { ok: false, configurati: PROVIDERS, mancanti: Object.keys(KEYS).filter(k => !KEYS[k]), prove: {} as Record<string, string> };
  let quota = 'ok';
  try { const { error } = await SB.rpc('ai_take_quota', { p_uid: '00000000-0000-0000-0000-000000000000', p_limit: 0 }); if (error && !/foreign key|violates/i.test(error.message)) quota = error.message; } catch (e) { quota = String(e); }
  out.contatore = quota === 'ok' ? 'ok' : 'non installato (esegui supabase/assistente.sql) – l\'assistente funziona lo stesso: ' + quota;
  const prove = out.prove as Record<string, string>;
  for (const prov of PROVIDERS) {
    const model = (MODELS[prov] || [])[0];
    try { const r = await callModel(prov, model, 'Rispondi solo: OK', [{ role: 'user', text: 'Prova' }], 15000); prove[prov] = r ? `ok (${model})` : `vuota (${model})`; if (r) out.ok = true; }
    catch (e) { prove[prov] = `errore (${model}): ${String((e as Error)?.message || e).slice(0, 160)}`; }
    if (!full && out.ok) break;
  }
  if (!PROVIDERS.length) out.consiglio = 'Aggiungi GROQ_API_KEY (console.groq.com → API Keys) in Supabase → Edge Functions → Secrets, poi riprova.';
  else if (!out.ok) out.consiglio = 'Le chiavi ci sono ma nessun fornitore risponde: controlla che la chiave sia copiata giusta (senza spazi) o creane una nuova.';
  return out;
}
