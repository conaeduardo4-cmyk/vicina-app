# Vicina – app SOS (iOS + Android) · 100% gratuita

| Pezzo | Servizio | Costo |
|---|---|---|
| Database, login, foto, tempo reale, logica sicura | **Supabase** – piano Free | 0 € (nessuna carta richiesta) |
| Notifiche push | **Firebase Cloud Messaging** – piano Spark | 0 € (niente Blaze) |
| Compilazione APK + IPA | **GitHub Actions** | 0 € |

```
Ordine:  1. Supabase  →  2. Firebase (solo push)  →  3. Server  →  4. GitHub  →  5. Compila  →  6. Firma
```

> Senza chiavi l'app si compila lo stesso e parte in **modalità DEMO** (etichetta gialla): tutto il flusso
> è navigabile ma nulla viene inviato. Utile per provarla subito.

### Limiti dei piani gratuiti (da sapere)
- **Supabase Free**: 500 MB di database, 1 GB di foto, 50.000 utenti al mese, 500.000 chiamate alle funzioni: per Vicina basta e avanza.
  Il progetto va **in pausa dopo 7 giorni senza attività**: il workflow incluso *Tieni attivo Supabase* lo "sveglia" ogni giorno, gratis.
  Massimo 2 progetti gratuiti per account.
- **Email di Supabase**: quelle predefinite sono poche all'ora. Per questo si consiglia di **disattivare la conferma email** (punto 1.4).
- **GitHub Actions**: illimitato se il repository è **pubblico**. Se è **privato** hai 2.000 minuti gratuiti al mese e il Mac conta ×10,
  quindi circa 10 compilazioni iOS al mese. Superato il limite le compilazioni si fermano: non ti viene addebitato nulla
  (il limite di spesa di GitHub è 0 € di default).
- **Notifiche su iPhone**: Apple le permette solo con l'Apple Developer Program, che è **a pagamento**: non esiste un'alternativa gratuita.
  Senza quell'account l'app iOS funziona, ma gli SOS arrivano solo quando l'app è aperta. Su **Android le push sono gratuite**.
  Anche l'installazione su iPhone senza account a pagamento (firma con ID Apple gratuito) dura 7 giorni, poi va rifirmata.

---

## Cosa fa l'app
1. **Benvenuto** → **Registrati / Accedi** (email + password, recupero password con codice via email).
2. **Configurazione in 3 passi**: profilo → permessi → "Chi vuoi avvisare?".
3. **4 schede**: SOS · Avvisi · Cerchia · Profilo.
4. **SOS**: tieni premuto 1,5 s → posizione → allarme a tutti → foto posteriore e frontale → schermata **"SOS attivo"** con chi ha visto e **"Sono al sicuro"**.
5. **SOS in arrivo**: schermata rossa con posizione, foto, **Chiama**, 112, chat, **"Ho visto, me ne occupo"**.
6. **Cerchia**: partner, amici, gruppi (max 8, approvazione dell'admin), codici a 6 caratteri con timer e **Condividi**.

## Struttura
| Percorso | Contenuto |
|---|---|
| `index.html`, `src/style.css`, `src/app.js` | Interfaccia e flussi |
| `src/api-supabase.js` | Collegamento al server Supabase |
| `src/demo-api.js` | Server finto per la modalità demo |
| `src/native.js`, `src/native-web.js` | Posizione, fotocamera, push, condivisione, vibrazione |
| `supabase/schema.sql` | **Tutto il server**: tabelle, sicurezza (RLS), azioni (RPC), foto, tempo reale, pulizia oraria |
| `supabase/functions/vicina/index.ts` | Edge Function: invio push FCM e cancellazione foto dopo 7 giorni |
| `scripts/patch-native.mjs`, `scripts/ios-setup.rb` | Permessi e push nei progetti nativi |
| `.github/workflows/build-app.yml` | Compila APK + IPA non firmato |
| `.github/workflows/deploy-server.yml` | Pubblica il server da GitHub (alternativa al punto 3) |
| `.github/workflows/keepalive.yml` | Evita la pausa del piano gratuito |
| `preview.html` | Anteprima demo nel browser |

---

## 1. Supabase (10 minuti)
1. Vai su **supabase.com** → *Start your project* → accedi (anche con GitHub) → **New project**.
   Nome `vicina`, scegli una **password del database** (salvala), regione **Central EU (Frankfurt)**, piano **Free**.
2. **Project Settings → API** (o *Data API* / *API Keys*): copia
   - **Project URL** (es. `https://abcd1234.supabase.co`)
   - chiave **anon / publishable** (quella pubblica, **non** la `service_role`/secret).
3. **Authentication → Sign In / Providers → Email**: lascia attivo *Email*, **disattiva "Confirm email"** → Save.
4. **Authentication → Emails → Templates → Reset Password**: sostituisci il testo con
   ```html
   <h2>Reimposta la password di Vicina</h2>
   <p>Il tuo codice è: <strong>{{ .Token }}</strong></p>
   <p>Inseriscilo nell'app. Se non hai chiesto tu il cambio, ignora questa email.</p>
   ```
   (l'app usa il codice, non il link) → Save.

## 2. Firebase – solo per le notifiche push (piano Spark gratuito)
1. **console.firebase.google.com** → *Aggiungi progetto* (es. `vicina-push`), Analytics non serve.
   **Non** passare a Blaze: FCM è gratuito sul piano Spark.
2. *Impostazioni progetto ⚙️ → Generali → Le tue app*:
   - **Android**, package `it.vicina.app` → scarica **`google-services.json`**
   - **iOS**, bundle `it.vicina.app` → scarica **`GoogleService-Info.plist`**
   > Vuoi un altro ID (es. `com.tuonome.vicina`)? Cambialo prima in `capacitor.config.json` e usa lo stesso qui.
3. *Impostazioni progetto → Account di servizio → Genera nuova chiave privata* → scarichi un file **JSON** (tienilo segreto).
4. *(Solo se un giorno avrai l'account Apple a pagamento)*: *Cloud Messaging → App iOS → Chiave APNs* → carica la chiave `.p8`.

## 3. Pubblica il server (tutto dal browser)
**a) Database** – Supabase → **SQL Editor** → *New query* → incolla **tutto** `supabase/installa.sql` → **Run**.
(`installa.sql` = `reset.sql` + `schema.sql`: toglie eventuali tabelle vecchie con gli stessi nomi e installa il server. Si può rieseguire.)
Poi esegui (con i tuoi valori; il segreto inventalo tu, solo lettere e numeri, almeno 32 caratteri):
```sql
select private.configure('https://abcd1234.supabase.co', 'IlTuoSegretoLungoECasuale1234567890');
```

**b) Edge Function** – Supabase → **Edge Functions → Deploy a new function → Via Editor**:
nome **`vicina`**, incolla il contenuto di `supabase/functions/vicina/index.ts` → **Deploy**.
Poi nelle impostazioni della funzione **disattiva "Verify JWT" / "Enforce JWT verification"** (la protegge il segreto).

**c) Secrets della funzione** – *Edge Functions → Secrets* (o *Project Settings → Edge Functions*), aggiungi:
| Nome | Valore |
|---|---|
| `VICINA_PUSH_SECRET` | lo stesso segreto del punto a) |
| `FCM_SERVICE_ACCOUNT` | tutto il contenuto del file JSON del punto 2.3 |

Fatto: login, cerchia, gruppi, chat, SOS, foto, push e pulizia automatica (ogni ora: SOS dimenticati aperti >12 h,
codici scaduti, foto e SOS più vecchi di 7 giorni) sono attivi.

> **Alternativa da GitHub**: workflow *Pubblica server*, con i secrets `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens),
> `SUPABASE_PROJECT_REF` (l'`abcd1234` dell'URL), `SUPABASE_DB_URL` (*Connect → Session pooler*, con la password del database),
> `VICINA_PUSH_SECRET`, `FCM_SERVICE_ACCOUNT`, `VITE_SUPABASE_URL`.

## 4. GitHub
1. Crea un repository (pubblico = minuti illimitati; privato = 2.000 min/mese) e carica tutti i file, compresa la cartella nascosta `.github`.
   Da web: *Add file → Upload files*. Oppure:
   ```bash
   git init && git add . && git commit -m "Vicina" && git branch -M main
   git remote add origin https://github.com/TUONOME/vicina.git && git push -u origin main
   ```
   > Se il repository è pubblico il codice è visibile, ma **nessuna chiave segreta è nel codice**: stanno nei *secrets*.
2. **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valore |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | chiave anon / publishable |
| `GOOGLE_SERVICES_JSON` | `google-services.json` **in base64** |
| `GOOGLE_SERVICE_INFO_PLIST` | `GoogleService-Info.plist` **in base64** |

Base64 su **Windows (PowerShell)**: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\percorso\google-services.json")) | Set-Clipboard`
— su Mac: `base64 -i google-services.json | pbcopy`.

## 5. Compila APK e IPA
GitHub → **Actions → Compila app → Run workflow** (~15 min). In fondo alla pagina, **Artifacts**:
- **Vicina-android**: `…-debug.apk` (si installa subito), `…-release-unsigned.apk`, `…-release-unsigned.aab`
- **Vicina-ios**: `…-unsigned.ipa` + `Vicina-entitlements.plist`

Con un tag `v1.0.0` (*Releases → Draft new release*) i file vengono allegati alla release.

## 6. Firma
**Android** (strumenti gratuiti dell'Android SDK):
```bash
keytool -genkey -v -keystore vicina.jks -alias vicina -keyalg RSA -keysize 2048 -validity 10000
zipalign -p 4 Vicina-release-unsigned.apk aligned.apk
apksigner sign --ks vicina.jks --out Vicina.apk aligned.apk
```
Conserva `vicina.jks` e la password. Per distribuire senza Google Play basta condividere l'APK firmato.

**iOS**: con il tuo strumento (Sideloadly, AltStore, ESign, Xcode…). Con ID Apple gratuito la firma dura 7 giorni e le push non funzionano.

## Prova nel browser
`npx serve .` → apri `http://localhost:3000/preview.html` (demo). Con `npm install && npm run dev` e un file `.env` usa il server vero.

## Note tecniche
- Il pacchetto `firebase` resta in `package.json` solo perché il plugin delle notifiche lo richiede per la versione web; l'app non usa i servizi Firebase a pagamento.
- Tutte le azioni sensibili (collegamenti, gruppi, SOS) sono funzioni SQL `security definer`: l'app non può scrivere direttamente su quelle tabelle (Row Level Security).
- Lo schema è stato provato su PostgreSQL 16 con test automatici di sicurezza (accessi non autorizzati, codici scaduti, limiti dei gruppi, SOS, foto, eliminazione account).

## Limiti noti
- Per scattare le foto l'app deve essere in primo piano (limite di iOS e Android).
- Nessun SMS senza internet: se l'invio fallisce, l'app propone di chiamare il 112.
- Solo accesso con email e password.
- Vicina non sostituisce i servizi di emergenza.

## Assistente (gratuito, Groq + Gemini + OpenRouter di riserva)
1. Vai su **console.groq.com** → accedi → **API Keys → Create API Key** (piano gratuito, senza carta).
   Consigliato: crea anche una chiave Gemini su **aistudio.google.com** e/o una su **openrouter.ai** (Keys): vengono usate se Groq non risponde.
2. Supabase → **SQL Editor** → esegui `supabase/assistente.sql` (già incluso in `installa.sql`).
3. Supabase → **Edge Functions → Deploy a new function → Via Editor**: nome **`assistente`**, incolla `supabase/functions/assistente/index.ts` → Deploy. Disattiva "Verify JWT".
4. **Edge Functions → Secrets**: `GROQ_API_KEY` (e, se le hai, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`). Facoltativi: `AI_DAILY_LIMIT` (predefinito 40), `GROQ_MODELS`, `GEMINI_MODELS`, `OPENROUTER_MODELS`.
5. **Verifica**: apri nel browser `https://TUO-PROGETTO.supabase.co/functions/v1/assistente?diag=1` oppure, nell'app, Assistente → *Verifica collegamento*. Ti dice quali chiavi ci sono e se l'IA risponde davvero.

L'assistente risponde solo su uso dell'app e sicurezza personale: a qualsiasi altra domanda risponde che non c'entra.
La chiave resta sul server. La conversazione è salvata solo sul telefono e all'IA arriva solo il nome di battesimo.

## Aggiornamento v3 (posizione live e messaggio vocale)
1. Supabase → **SQL Editor** → esegui `supabase/aggiornamento-v3.sql` (si può rieseguire).
2. **Edge Functions**: aggiorna `vicina` (nuova notifica del vocale) e `assistente` incollando i nuovi `index.ts`.
3. GitHub: carica i file nuovi e lancia **Actions → Compila app**, scegliendo **android** (veloce, consuma pochi minuti).

## Compilazione: "in attesa di un runner"
GitHub mette in coda i job finché non trova un server libero. Se resta in attesa a lungo:
- con repository **privato** i minuti gratuiti (2.000/mese, il Mac ne conta 10 per minuto) possono essere finiti: rendi il repository **pubblico** (minuti illimitati) oppure compila solo **android**;
- controlla **Settings → Billing** del tuo account GitHub e la pagina **githubstatus.com**.

## Aggiornamento v4 (assistente affidabile, posizione live fino a "Sono al sicuro", vocale, mappa)
**Cosa cambia**
- **Assistente**: prova più IA gratuite in ordine (Groq → Gemini → OpenRouter) e più modelli per ciascuna, ritenta da solo, e non si blocca più se il contatore giornaliero ha un problema.
  Corretto un difetto per cui Gemini poteva restituire risposte vuote (il "ragionamento" interno consumava tutti i token).
  Se il server non risponde l'app risponde comunque con la **guida integrata** e mostra il pulsante **Verifica collegamento** con il motivo preciso.
- **Posizione live**: parte con ogni SOS e resta attiva finché non tocchi **Sono al sicuro** (massimo 12 ore). Non si può più fermare prima. Se il GPS è fermo, la posizione viene rimandata comunque ogni minuto.
- **Messaggio vocale**: nella schermata SOS attivo c'è la scheda **"Vuoi lasciare un vocale?"** → *Registra un vocale* → *Invia a tutti* (o *Annulla*). Facoltativo, massimo 1 minuto. Lo ascolta tutta la cerchia: nella schermata rossa dell'SOS, nella chat e nella mappa.
- **Mappa**: nuova scheda **Mappa** con una mappa vera dentro l'app (MapLibre + OpenFreeMap, dati OpenStreetMap: gratis, senza chiavi né limiti). Mostra la posizione live di chi ha chiesto aiuto, il percorso fatto, la distanza da te e il tuo SOS.
  **Raggiungi** apre le indicazioni nell'app di mappe del telefono: **Apple Mappe su iPhone**, **Google Maps su Android** (se manca, si apre il sito).

**Come installarlo**
1. Supabase → **SQL Editor** → esegui `supabase/aggiornamento-v4.sql` (si può rieseguire; è già dentro `installa.sql` e `schema.sql`).
2. Supabase → **Edge Functions** → `assistente` → incolla il nuovo `supabase/functions/assistente/index.ts` → Deploy (lascia "Verify JWT" disattivato).
3. Controlla che in **Edge Functions → Secrets** ci sia almeno `GROQ_API_KEY` (meglio anche `GEMINI_API_KEY`), poi apri `…/functions/v1/assistente?diag=1`: deve comparire `"ok": true`.
4. GitHub: carica tutti i file di questa cartella sopra quelli vecchi (compresi `package.json`, `src/map.js` nuovo e `scripts/patch-native.mjs`) e lancia **Actions → Compila app**.
   Le nuove librerie (`maplibre-gl`, `@capacitor/app-launcher`) vengono installate da sole durante la compilazione.

**Nota sulla mappa dentro l'app**: incorporare la mappa *di Google* richiede una chiave Google Cloud con un account di fatturazione (carta di credito),
e quella *di Apple* dentro l'app richiede codice nativo iOS o l'account sviluppatore a pagamento. Per restare gratis la mappa interna usa OpenStreetMap,
mentre per farsi guidare **Raggiungi** usa Apple Mappe o Google Maps del telefono.
