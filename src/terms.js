// Termini d'uso di Vicina. Se cambi il testo in modo sostanziale aumenta TERMS_VERSION:
// a tutti verrà chiesto di accettarli di nuovo.
// ⚠ Completa i campi tra [PARENTESI QUADRE] e fai controllare il testo da un avvocato prima della pubblicazione.
export const TERMS_VERSION = 1;
export const TERMS_DATE = '6 ottobre 2026';
export const TERMS_OWNER = '[NOME E COGNOME O RAGIONE SOCIALE DEL TITOLARE]';
export const TERMS_CONTACT = '[EMAIL DI CONTATTO]';
export const PRIVACY_URL = '';   // es. 'https://tuosito.it/privacy' (informativa privacy completa)

// Punti chiave mostrati prima di creare l'account e a ogni nuova versione dei termini
export const TERMS_KEY = [
  ['Vicina non sostituisce il 112', 'Non è un servizio di emergenza e non è collegata al 112, alle forze dell\'ordine, al 118 o ai vigili del fuoco. Nessun operatore controlla gli allarmi.'],
  ['In pericolo, prima i soccorsi ufficiali', 'Se tu o altri siete in pericolo, chiama subito il 112. Usa Vicina solo in aggiunta, mai al posto dei soccorsi.'],
  ['Può non funzionare', 'Dipende da internet, GPS, batteria, permessi e notifiche del telefono e da servizi esterni. Un avviso può arrivare in ritardo, non arrivare o mostrare una posizione imprecisa.'],
  ['Le persone della tua cerchia non sono soccorritori', 'Possono non vedere l\'avviso, non rispondere o non poter intervenire.'],
  ['L\'assistente può sbagliare', 'Dà risposte automatiche, non consigli medici, legali o di soccorso.']
];

// Testo completo. Sezioni: [titolo, paragrafi[]]
export const TERMS_SECTIONS = [
  ['1. Chi siamo e accettazione', [
    `Vicina è un'app gratuita, attualmente in versione beta, messa a disposizione da ${TERMS_OWNER} (di seguito «noi» o «gli sviluppatori»). Contatti: ${TERMS_CONTACT}.`,
    'Creando un account o usando l\'app accetti questi Termini d\'uso. Se non li accetti, non puoi usare Vicina.',
    'Per usare Vicina devi avere almeno 14 anni. Se sei minorenne, puoi usarla solo con il consenso di chi esercita la responsabilità genitoriale, che deve leggere questi termini insieme a te.'
  ]],
  ['2. Cos\'è Vicina e cosa non è', [
    'Vicina è uno strumento di comunicazione tra privati: permette di inviare un avviso, con posizione, foto e messaggi, alle persone di fiducia che hai scelto (la tua «cerchia»).',
    '<b>Vicina NON è un servizio di emergenza.</b> Non è collegata al Numero Unico di Emergenza 112, alle forze dell\'ordine, al 118, ai vigili del fuoco né ad altri servizi pubblici di soccorso. Gli avvisi non vengono letti, controllati o gestiti da noi né da alcun operatore. Inviare un SOS con Vicina non equivale a chiamare i soccorsi.'
  ]],
  ['3. In caso di emergenza', [
    '<b>Se tu o altre persone siete in pericolo, chiama sempre e subito il 112</b> (gratuito, attivo 24 ore su 24, si può chiamare anche senza credito). Usa Vicina solo in aggiunta ai canali ufficiali, mai al loro posto.',
    'Altri numeri utili in Italia: 1522 antiviolenza e stalking (gratuito, 24 ore su 24), 114 emergenza infanzia. Valuta anche le app ufficiali dei servizi di emergenza della tua regione.',
    'Il pulsante «Chiama 112» presente in Vicina apre solo il tastierino telefonico del tuo dispositivo: la chiamata avviene attraverso il tuo operatore, non attraverso Vicina.'
  ]],
  ['4. Limiti tecnici: nessuna garanzia di funzionamento', [
    'Il funzionamento di Vicina dipende da fattori che non controlliamo, tra cui: connessione internet, segnale GPS, stato della batteria, permessi concessi, impostazioni di risparmio energetico, notifiche del sistema operativo, funzionamento dei servizi esterni che usiamo (server, notifiche push, mappe, intelligenza artificiale).',
    'Di conseguenza un avviso può <b>non essere inviato, arrivare in ritardo o non essere ricevuto</b>; la posizione può essere <b>imprecisa, non aggiornata o assente</b>; foto e messaggi vocali possono non essere inviati. Su iPhone, nella versione beta, le notifiche possono arrivare solo con l\'app aperta. Le foto vengono scattate solo se l\'app è aperta in primo piano.',
    'Vicina è in versione beta: può contenere errori e può essere interrotta, modificata o non disponibile in qualsiasi momento, anche senza preavviso. Ti consigliamo di provarla periodicamente con la tua cerchia e di tenerla aggiornata.'
  ]],
  ['5. Assistente con intelligenza artificiale', [
    'L\'assistente dà risposte generate automaticamente da sistemi di intelligenza artificiale di terzi. Le risposte possono essere <b>sbagliate, incomplete o non adatte</b> alla tua situazione.',
    'L\'assistente non è un servizio di soccorso e non fornisce consulenza medica, psicologica o legale. Non vede la tua posizione, le tue foto o le tue chat e non può avvisare nessuno. Non basare decisioni importanti sulle sue risposte: in emergenza chiama il 112.',
    'Il testo che scrivi all\'assistente viene inviato ai fornitori del servizio di intelligenza artificiale (ad esempio Groq, Google, OpenRouter), che possono trattarlo anche fuori dall\'Unione Europea. Non scrivere dati personali sensibili.'
  ]],
  ['6. I tuoi impegni', [
    'Ti impegni a usare Vicina in modo lecito e responsabile e in particolare a:',
    '• non inviare falsi allarmi né usare l\'SOS per scherzo;<br>• aggiungere alla cerchia solo persone che sono d\'accordo a ricevere i tuoi avvisi;<br>• non usare Vicina per seguire, controllare o localizzare altre persone senza il loro consenso: oltre a violare questi termini, può costituire reato (ad esempio atti persecutori, art. 612-bis c.p.);<br>• non caricare contenuti illeciti, offensivi o che violano i diritti di altri;<br>• custodire le credenziali del tuo account.',
    'Possiamo sospendere o chiudere gli account che violano questi impegni.'
  ]],
  ['7. Limitazione di responsabilità', [
    'Vicina è fornita gratuitamente, «così com\'è» e «come disponibile», senza garanzie di alcun tipo su funzionamento, continuità, precisione o idoneità a uno scopo particolare.',
    'Nei limiti massimi consentiti dalla legge, gli sviluppatori e il titolare dell\'app <b>non sono responsabili</b> di danni, diretti o indiretti, derivanti da: mancato, ritardato o errato invio o ricezione di avvisi, posizioni, foto o messaggi; imprecisione della posizione; mancata risposta o mancato intervento delle persone della cerchia; interruzioni, errori o malfunzionamenti dell\'app, del dispositivo, della rete o dei servizi di terzi; contenuti e risposte dell\'assistente; uso improprio dell\'app da parte tua o di altri; decisioni prese facendo affidamento su Vicina.',
    'Restano salve la responsabilità per dolo o colpa grave (art. 1229 c.c.) e ogni altra responsabilità che per legge non può essere esclusa o limitata, compresi i diritti che la legge riconosce ai consumatori.'
  ]],
  ['8. Dati personali (in breve)', [
    'Quando invii un SOS, la tua cerchia riceve: nome, posizione (aggiornata finché non tocchi «Sono al sicuro»), due foto, l\'eventuale messaggio vocale e, se l\'hai inserito, il tuo numero di telefono. Le foto vengono cancellate dopo 7 giorni; gli SOS rimasti aperti vengono chiusi dopo 12 ore.',
    'I dati sono conservati su server nell\'Unione Europea (Supabase, Francoforte); le notifiche passano da Firebase Cloud Messaging (Google). Puoi eliminare il tuo account e i tuoi dati in qualsiasi momento da Impostazioni → Elimina account.',
    PRIVACY_URL ? `L'informativa privacy completa è disponibile qui: <a href="${PRIVACY_URL}" target="_blank" rel="noopener">${PRIVACY_URL}</a>.` : 'L\'informativa privacy completa ai sensi del Regolamento (UE) 2016/679 è disponibile su richiesta all\'indirizzo di contatto indicato sopra.'
  ]],
  ['9. Modifiche e sospensione', [
    'Possiamo modificare l\'app, sospenderla o interromperla, in tutto o in parte, in qualsiasi momento.',
    'Possiamo aggiornare questi termini: in caso di modifiche importanti ti chiederemo di accettarli di nuovo dentro l\'app. Puoi smettere di usare Vicina ed eliminare il tuo account quando vuoi.'
  ]],
  ['10. Legge applicabile', [
    'Questi termini sono regolati dalla legge italiana. Se sei un consumatore, per le controversie è competente il giudice del luogo in cui risiedi (art. 66-bis del Codice del Consumo) e restano salvi i diritti che la legge del tuo Paese ti riconosce.',
    'Se una clausola risultasse non valida, le altre restano valide.'
  ]],
  ['11. Contatti', [
    `Per domande, segnalazioni o richieste sui tuoi dati: ${TERMS_CONTACT}.`
  ]]
];
