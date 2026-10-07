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

## Aggiornamenti automatici (Android) e avviso di aggiornamento (iPhone)
**Come funziona**
- Ogni volta che lanci **Actions → Compila app** (con "Pubblica come aggiornamento" spuntato) GitHub:
  1. dà alla build un numero di versione (`1.0.<numero build>`), lo scrive dentro l'app e nel nome dei file;
  2. firma l'APK **sempre con la stessa chiave**;
  3. pubblica una **Release** con `Vicina.apk`, `Eduardo.apk` (stesso file, per il link del sito) e `version.json` (versione, data, novità, link).
- L'app controlla `version.json` all'avvio e ogni 6 ore. Si può controllare anche a mano da **Impostazioni → App → Aggiornamenti**.
- **Android**: compare "Aggiornamento disponibile" → **Aggiorna ora** → l'app scarica l'APK e apre l'installazione → tocchi **Aggiorna**.
  L'app si aggiorna sopra quella vecchia e account, cerchia e chat restano. La prima volta Android chiede di consentire
  "Installa app da questa fonte" per Vicina. Il tocco finale su "Aggiorna" lo chiede sempre Android: non si può saltare per le app fuori dal Play Store.
- **iPhone**: compare "Nuova versione disponibile" con i passi per reinstallarla (AltStore, SideStore o Sideloadly) e il pulsante per aprire la pagina di download.
- Nel campo **Novità** di "Run workflow" scrivi cosa è cambiato: lo vedono gli utenti. Se lo lasci vuoto viene usato il messaggio dell'ultimo commit.
- Facoltativo: in *Settings → Secrets and variables → Actions → Variables* crea `SITE_URL` con l'indirizzo del tuo sito: sarà la pagina di download mostrata su iPhone.

**Una volta sola: la chiave di firma**
1. Apri il file `SEGRETI-da-copiare-su-GitHub.txt` (cartella `chiave-firma-android`) e crea i 4 secrets indicati:
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
2. **Non** caricare quella cartella su GitHub; tienine una copia di sicurezza. Senza quella chiave gli aggiornamenti non si installano più sopra.
3. Le app installate finora sono firmate con una chiave diversa (quella "debug" cambia a ogni build). Quindi **una sola volta** bisogna
   **disinstallare** Vicina e installare la prima versione firmata. Da lì in poi gli aggiornamenti arrivano da soli.

**File da caricare su GitHub** (oltre a `src/`): `vite.config.js` nella cartella principale, `scripts/android/ApkUpdaterPlugin.java`, `scripts/patch-native.mjs` e il nuovo `.github/workflows/build-app.yml` (in questa cartella si trova in `workflow-github/`). Se il workflow resta quello vecchio l'APK non viene firmato e non viene pubblicato `version.json`.

**Requisiti**: il repository deve essere **pubblico**. Le Release di un repository privato non si scaricano senza login, quindi l'app non le vede.

## Termini d'uso
- Testo in `src/terms.js`. **Prima di pubblicare** completa `[NOME E COGNOME O RAGIONE SOCIALE DEL TITOLARE]` e `[EMAIL DI CONTATTO]`
  (e, se ce l'hai, `PRIVACY_URL` con il link all'informativa privacy) e fai controllare il testo da un avvocato.
- Alla creazione di ogni account compare la schermata **"Prima di iniziare"** con i punti chiave e due caselle obbligatorie
  (accettazione + approvazione specifica delle clausole ex artt. 1341–1342 c.c.). Senza accettare non si entra nell'app.
- Se cambi i termini in modo importante aumenta `TERMS_VERSION`: a tutti verrà chiesto di accettarli di nuovo.
- L'accettazione (versione e data) viene salvata nel profilo sul server: esegui `supabase/aggiornamento-termini.sql` nel SQL Editor.
- Il testo completo si legge sempre da **Impostazioni → Aiuto → Termini d'uso e limiti** e dalla schermata di registrazione.

## Nuovo stile "C morbido" e aggiornamenti su iPhone
- Interfaccia: fondo nero, rosso pieno, angoli arrotondati; Home con scheda "Sei protetta", pulsanti 112 / Chiedi all'AI / +, grande scheda SOS con barra di avanzamento; nuova schermata "SOS attivo"; barra in basso con 5 voci.
- **iPhone**: quando c'è un aggiornamento l'app scarica il file **.ipa non firmato** della release e lo salva in **File › Sul mio iPhone › Vicina › Aggiornamenti**; con «Apri con…» lo passi a SideStore/AltStore (o lo trasferisci su computer per Sideloadly). L'installazione la fa l'utente.
  Serve una build con **iOS** (scegli "ios" o "entrambe" in Compila app): se l'ultima build è solo Android, gli iPhone continuano a vedere l'ultimo IPA pubblicato.
- **Android**: invariato, aggiornamento con un tocco dentro l'app.
- Nuova dipendenza: `@capacitor/filesystem` (si installa da sola durante la compilazione).

## Strumenti di sicurezza

In Home: **Chiama 112 · Accompagnami · Sirena · Strumenti**. Tutto funziona sul telefono, anche offline.

- **Accompagnami**: scegli quanto ci metti (10 min – 1,5 ore). Se non tocchi «Sono arrivata/o» in tempo, compare «Tutto bene?» con 30 secondi di conto alla rovescia e suoneria, poi parte l'SOS da solo. Resta attivo a schermo spento (usa la posizione in background); +10 min per allungare.
- **Sirena**: suono fortissimo e schermo che lampeggia rosso/bianco (su iPhone suona anche in modalità silenziosa da iOS 17).
- **Luce**: schermo bianco fisso o SOS luminoso in codice Morse.
- **Finta chiamata**: una chiamata finta con suoneria tra 5 s – 5 min (tenere l'app aperta).
- **Dove sono**: indirizzo (se c'è internet) e coordinate da leggere al 112; copia, condividi, apri in Mappe.
- **Scheda medica**: gruppo sanguigno, allergie, farmaci, patologie. «Mostra ai soccorritori» a schermo intero; si può aggiungere agli SMS di SOS. Resta solo sul telefono.
- **Numeri utili**: 112, 118, 113, 115, 1522, 114, 1530, 116117, Telefono Amico.
- **Scuoti per SOS** (Impostazioni o Strumenti): scuotendo forte il telefono parte un conto alla rovescia di 5 secondi e poi l'SOS. Funziona con l'app aperta.
- **SOS discreto** (Impostazioni): niente vibrazioni e flash mentre l'SOS parte.

Nuovo file: `src/tools.js` (va caricato insieme a `src/app.js`).

## Contatti senza app (SMS)

In **Cerchia → Senza app · via SMS → Aggiungi contatto** inserisci nome e numero e lascia attiva la spunta «Avvisa ad SOS».
Quando parte un SOS il contatto riceve un SMS con: messaggio di soccorso, link alla posizione (Google Maps, si apre anche su iPhone),
link alle 2 foto (validi 7 giorni) e il tuo numero.

- **Android**: l'SMS parte da solo (plugin nativo `scripts/android/SosSmsPlugin.java`, permesso «SMS» chiesto la prima volta).
  Il primo SMS con la posizione parte subito, il secondo con le foto appena sono caricate. Se il permesso è negato si apre Messaggi.
- **iPhone**: Apple non permette a nessuna app di inviare SMS da sola: si apre Messaggi già compilato con destinatari e testo, basta premere **Invia**.
- Dalla schermata «SOS attivo»: **Rimanda SMS** (posizione aggiornata) e **Invia le foto** (le foto vere, tramite il foglio di condivisione).
- I contatti SMS sono salvati sul telefono (non servono modifiche al database). Gli SMS costano come normali messaggi del piano.

File da caricare su GitHub per questa funzione: `src/tools.js`, `scripts/android/SosSmsPlugin.java`, `scripts/patch-native.mjs`, `src/native.js`, `src/native-web.js`, `src/api-supabase.js`, `src/app.js`, `src/style.css`, `src/map.js`, `index.html`.

## Regole dei file (solo se compare l'avviso "Regole dei file non aggiornate")
Su alcuni progetti Supabase il database non può modificare le regole dello spazio file: in quel caso la pubblicazione **non si blocca più**,
ma le regole vanno create una volta a mano. Supabase → **Storage → Policies** → bucket **sos** → **New policy → For full customization**:

1. Nome `vicina: carico le mie foto SOS` · operazione **INSERT** · ruolo **authenticated** · definizione:
   ```
   bucket_id = 'sos' and (storage.foldername(name))[1] = auth.uid()::text
   and storage.filename(name) in ('back.jpg','front.jpg','voice.webm','voice.m4a','voice.mp4','voice.ogg','voice.aac')
   ```
2. Nome `vicina: vedo le foto SOS` · operazione **SELECT** · ruolo **authenticated** · definizione:
   ```
   bucket_id = 'sos' and ((storage.foldername(name))[1] = auth.uid()::text
   or exists (select 1 from public.sos s where s.id = (storage.foldername(name))[2] and auth.uid() = any(s.recipients)))
   ```
Se esistono già (le avevi create all'installazione) e foto e vocali funzionano, non serve fare nulla.
