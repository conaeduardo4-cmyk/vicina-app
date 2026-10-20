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
const REASON: Record<string, string> = { terremoto: 'Terremoto', alluvione: 'Alluvione', incendio: 'Incendio', attentato: 'Emergenza', blackout: 'Blackout', maltempo: 'Maltempo', serata: 'Serata' };
const first = (n?: string) => String(n || '').split(' ')[0];
const b64url = (u8: Uint8Array) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/* ---------- notifiche nella lingua di chi le riceve (profiles.lang) ---------- */
// {n} nome · {f} nome breve · {w} chi ha chiesto aiuto · {g} gruppo · {eta} « (circa N min)» · {why} motivo · {note} · {a}/{t} risposte
type Tx = Record<string, string>;
const T: Record<string, Tx> = {
  en: {
    sos_t: '🆘 SOS from {n}', sos_bl: 'Needs help. Tap to see location and photos.', sos_b: 'Needs help. Tap to open.', q_seek: '{f} is looking for you', q_open: 'Open Vicina.', q_now: 'Open Vicina now.',
    ack_t: '{f} has seen your SOS', ack_b: 'They are on it. Stay where you are if you can.', q_ans: '{f} replied',
    voice_t: '🎙 Voice message from {f}', voice_b: 'Tap to listen in the SOS.', q_voice: '{f} left you a voice message',
    safe_t: '{f} is safe', safe_b: 'The SOS is closed. All good.', q_safe: '{f} is fine', q_safeb: 'All good.',
    link_t: 'New connection', link_b: '{n} is now in your circle', join_t: 'Request for "{g}"', join_b: '{n} wants to join the group', joined_t: "You're in!", joined_b: 'You are now part of the group "{g}"',
    eta: ' (about {m} min)', c_v: '🏃 {n} is on the way{eta}', c_vb: 'Stay where you are if you can. You can see them on the map.', c_o: '{n} is going to {w}{eta}', c_ob: 'Coordinate in the Rescue Centre.',
    k_v: '📞 {n} is calling 112 for you', k_vb: 'Emergency services are being alerted.', k_o: '{n} is calling 112', k_ob: "No need to call too: help {w} another way.",
    a_v: '✅ {n} has reached you', a_vb: 'Look around.', a_o: '{n} has reached {w}', a_ob: 'Tap to see the situation.', q_c: '{n} is on the way', q_k: '{n} is calling', q_a: '{n} has arrived', q_go: '{n} is going to {w}',
    chk_t: '⚠️ {why}{f} asks: are you OK?', chk_b: 'Tap to answer "I\'m fine" or "I need help".', chk_bn: '"{note}" Answer with one tap.', q_chk: '{f} is asking how you are', q_chkb: 'Open Vicina and answer.',
    ok_t: '✅ {n} is fine', ok_b: 'Answered your check-in ({a} of {t}).', q_okt: '{n} answered', hp_t: '🆘 {n} needs help', hp_b: 'Answered the check-in. Tap to see where they are.', q_hp: '{n} is looking for you',
    rm_t: '⏳ {f} is waiting for your answer', rm_b: 'Are you OK? Answer with one tap.',
    terremoto: 'Earthquake', alluvione: 'Flood', incendio: 'Fire', attentato: 'Emergency', blackout: 'Blackout', maltempo: 'Bad weather', serata: 'Night out'
  },
  es: {
    sos_t: '🆘 SOS de {n}', sos_bl: 'Necesita ayuda. Toca para ver la ubicación y las fotos.', sos_b: 'Necesita ayuda. Toca para abrir.', q_seek: '{f} te está buscando', q_open: 'Abre Vicina.', q_now: 'Abre Vicina ahora.',
    ack_t: '{f} ha visto tu SOS', ack_b: 'Se está ocupando. Quédate donde estás si puedes.', q_ans: '{f} ha respondido',
    voice_t: '🎙 Mensaje de voz de {f}', voice_b: 'Toca para escucharlo en el SOS.', q_voice: '{f} te ha dejado un audio',
    safe_t: '{f} está a salvo', safe_b: 'Ha cerrado el SOS. Todo bien.', q_safe: '{f} está bien', q_safeb: 'Todo bien.',
    link_t: 'Nueva conexión', link_b: '{n} ya está en tu círculo', join_t: 'Solicitud para "{g}"', join_b: '{n} quiere entrar en el grupo', joined_t: '¡Ya estás dentro!', joined_b: 'Ahora formas parte del grupo "{g}"',
    eta: ' (unos {m} min)', c_v: '🏃 {n} está llegando{eta}', c_vb: 'Quédate donde estás si puedes. Lo ves en el mapa.', c_o: '{n} va hacia {w}{eta}', c_ob: 'Coordinaos en la Central de ayuda.',
    k_v: '📞 {n} está llamando al 112 por ti', k_vb: 'Se está avisando a los servicios de emergencia.', k_o: '{n} está llamando al 112', k_ob: 'No hace falta que llames tú también: ayuda a {w} de otra forma.',
    a_v: '✅ {n} ha llegado a donde estás', a_vb: 'Mira a tu alrededor.', a_o: '{n} ha llegado a donde está {w}', a_ob: 'Toca para ver la situación.', q_c: '{n} está llegando', q_k: '{n} está llamando', q_a: '{n} ha llegado', q_go: '{n} va hacia {w}',
    chk_t: '⚠️ {why}{f} pregunta: ¿estás bien?', chk_b: 'Toca para responder «Estoy bien» o «Necesito ayuda».', chk_bn: '«{note}» Responde con un toque.', q_chk: '{f} te pregunta cómo estás', q_chkb: 'Abre Vicina y responde.',
    ok_t: '✅ {n} está bien', ok_b: 'Ha respondido a tu llamada ({a} de {t}).', q_okt: '{n} ha respondido', hp_t: '🆘 {n} necesita ayuda', hp_b: 'Ha respondido a la llamada. Toca para ver dónde está.', q_hp: '{n} te está buscando',
    rm_t: '⏳ {f} espera tu respuesta', rm_b: '¿Estás bien? Responde con un toque.',
    terremoto: 'Terremoto', alluvione: 'Inundación', incendio: 'Incendio', attentato: 'Emergencia', blackout: 'Apagón', maltempo: 'Mal tiempo', serata: 'Noche de fiesta'
  },
  fr: {
    sos_t: '🆘 SOS de {n}', sos_bl: "A besoin d'aide. Touchez pour voir la position et les photos.", sos_b: "A besoin d'aide. Touchez pour ouvrir.", q_seek: '{f} vous cherche', q_open: 'Ouvrez Vicina.', q_now: 'Ouvrez Vicina maintenant.',
    ack_t: '{f} a vu votre SOS', ack_b: "Il/elle s'en occupe. Restez où vous êtes si possible.", q_ans: '{f} a répondu',
    voice_t: '🎙 Message vocal de {f}', voice_b: "Touchez pour l'écouter dans le SOS.", q_voice: '{f} vous a laissé un vocal',
    safe_t: '{f} est en sécurité', safe_b: 'Le SOS est terminé. Tout va bien.', q_safe: '{f} va bien', q_safeb: 'Tout va bien.',
    link_t: 'Nouvelle connexion', link_b: '{n} fait maintenant partie de votre cercle', join_t: 'Demande pour « {g} »', join_b: '{n} veut rejoindre le groupe', joined_t: 'Vous y êtes !', joined_b: 'Vous faites maintenant partie du groupe « {g} »',
    eta: ' (environ {m} min)', c_v: '🏃 {n} arrive{eta}', c_vb: 'Restez où vous êtes si possible. Vous le/la voyez sur la carte.', c_o: '{n} se rend auprès de {w}{eta}', c_ob: 'Coordonnez-vous dans le Centre de secours.',
    k_v: '📞 {n} appelle le 112 pour vous', k_vb: 'Les secours vont être prévenus.', k_o: '{n} appelle le 112', k_ob: "Inutile d'appeler aussi : aidez {w} autrement.",
    a_v: '✅ {n} est arrivé(e) près de vous', a_vb: 'Regardez autour de vous.', a_o: '{n} est arrivé(e) auprès de {w}', a_ob: 'Touchez pour voir la situation.', q_c: '{n} arrive', q_k: '{n} appelle', q_a: '{n} est arrivé(e)', q_go: '{n} se rend auprès de {w}',
    chk_t: '⚠️ {why}{f} demande : ça va ?', chk_b: "Touchez pour répondre « Je vais bien » ou « J'ai besoin d'aide ».", chk_bn: '« {note} » Répondez en un geste.', q_chk: '{f} vous demande comment vous allez', q_chkb: 'Ouvrez Vicina et répondez.',
    ok_t: '✅ {n} va bien', ok_b: 'A répondu à votre appel ({a} sur {t}).', q_okt: '{n} a répondu', hp_t: "🆘 {n} a besoin d'aide", hp_b: "A répondu à l'appel. Touchez pour voir où il/elle est.", q_hp: '{n} vous cherche',
    rm_t: '⏳ {f} attend votre réponse', rm_b: 'Ça va ? Répondez en un geste.',
    terremoto: 'Séisme', alluvione: 'Inondation', incendio: 'Incendie', attentato: 'Urgence', blackout: 'Panne de courant', maltempo: 'Intempéries', serata: 'Soirée'
  },
  de: {
    sos_t: '🆘 SOS von {n}', sos_bl: 'Braucht Hilfe. Tippe, um Standort und Fotos zu sehen.', sos_b: 'Braucht Hilfe. Tippe zum Öffnen.', q_seek: '{f} sucht dich', q_open: 'Öffne Vicina.', q_now: 'Öffne Vicina jetzt.',
    ack_t: '{f} hat dein SOS gesehen', ack_b: 'Kümmert sich darum. Bleib, wo du bist, wenn du kannst.', q_ans: '{f} hat geantwortet',
    voice_t: '🎙 Sprachnachricht von {f}', voice_b: 'Tippe, um sie im SOS anzuhören.', q_voice: '{f} hat dir eine Sprachnachricht geschickt',
    safe_t: '{f} ist in Sicherheit', safe_b: 'Das SOS ist beendet. Alles in Ordnung.', q_safe: '{f} geht es gut', q_safeb: 'Alles in Ordnung.',
    link_t: 'Neue Verbindung', link_b: '{n} ist jetzt in deinem Kreis', join_t: 'Anfrage für „{g}“', join_b: '{n} möchte der Gruppe beitreten', joined_t: 'Du bist dabei!', joined_b: 'Du gehörst jetzt zur Gruppe „{g}“',
    eta: ' (etwa {m} Min.)', c_v: '🏃 {n} ist unterwegs{eta}', c_vb: 'Bleib, wo du bist, wenn du kannst. Du siehst es auf der Karte.', c_o: '{n} ist auf dem Weg zu {w}{eta}', c_ob: 'Stimmt euch in der Rettungszentrale ab.',
    k_v: '📞 {n} ruft für dich die 112 an', k_vb: 'Die Rettungskräfte werden gleich alarmiert.', k_o: '{n} ruft die 112 an', k_ob: 'Du musst nicht auch anrufen: hilf {w} auf andere Weise.',
    a_v: '✅ {n} ist bei dir angekommen', a_vb: 'Schau dich um.', a_o: '{n} ist bei {w} angekommen', a_ob: 'Tippe, um die Lage zu sehen.', q_c: '{n} ist unterwegs', q_k: '{n} telefoniert', q_a: '{n} ist angekommen', q_go: '{n} ist auf dem Weg zu {w}',
    chk_t: '⚠️ {why}{f} fragt: Geht es dir gut?', chk_b: 'Tippe, um mit „Mir geht es gut“ oder „Ich brauche Hilfe“ zu antworten.', chk_bn: '„{note}“ Antworte mit einem Tipp.', q_chk: '{f} fragt, wie es dir geht', q_chkb: 'Öffne Vicina und antworte.',
    ok_t: '✅ {n} geht es gut', ok_b: 'Hat auf deinen Aufruf geantwortet ({a} von {t}).', q_okt: '{n} hat geantwortet', hp_t: '🆘 {n} braucht Hilfe', hp_b: 'Hat auf den Aufruf geantwortet. Tippe, um zu sehen, wo.', q_hp: '{n} sucht dich',
    rm_t: '⏳ {f} wartet auf deine Antwort', rm_b: 'Geht es dir gut? Antworte mit einem Tipp.',
    terremoto: 'Erdbeben', alluvione: 'Hochwasser', incendio: 'Brand', attentato: 'Notfall', blackout: 'Stromausfall', maltempo: 'Unwetter', serata: 'Abend unterwegs'
  },
  pt: {
    sos_t: '🆘 SOS de {n}', sos_bl: 'Precisa de ajuda. Toca para ver a localização e as fotos.', sos_b: 'Precisa de ajuda. Toca para abrir.', q_seek: '{f} está à tua procura', q_open: 'Abre o Vicina.', q_now: 'Abre o Vicina agora.',
    ack_t: '{f} viu o teu SOS', ack_b: 'Está a tratar disso. Fica onde estás, se puderes.', q_ans: '{f} respondeu',
    voice_t: '🎙 Mensagem de voz de {f}', voice_b: 'Toca para ouvir no SOS.', q_voice: '{f} deixou-te uma mensagem de voz',
    safe_t: '{f} está em segurança', safe_b: 'Fechou o SOS. Está tudo bem.', q_safe: '{f} está bem', q_safeb: 'Está tudo bem.',
    link_t: 'Nova ligação', link_b: '{n} já está no teu círculo', join_t: 'Pedido para "{g}"', join_b: '{n} quer entrar no grupo', joined_t: 'Já estás dentro!', joined_b: 'Agora fazes parte do grupo "{g}"',
    eta: ' (cerca de {m} min)', c_v: '🏃 {n} está a caminho{eta}', c_vb: 'Fica onde estás, se puderes. Vês no mapa.', c_o: '{n} vai ter com {w}{eta}', c_ob: 'Coordenem-se na Central de socorro.',
    k_v: '📞 {n} está a ligar para o 112 por ti', k_vb: 'Os serviços de emergência vão ser avisados.', k_o: '{n} está a ligar para o 112', k_ob: 'Não precisas de ligar também: ajuda {w} de outra forma.',
    a_v: '✅ {n} chegou até ti', a_vb: 'Olha à tua volta.', a_o: '{n} chegou até {w}', a_ob: 'Toca para ver a situação.', q_c: '{n} está a caminho', q_k: '{n} está a ligar', q_a: '{n} chegou', q_go: '{n} vai ter com {w}',
    chk_t: '⚠️ {why}{f} pergunta: estás bem?', chk_b: 'Toca para responder «Estou bem» ou «Preciso de ajuda».', chk_bn: '«{note}» Responde com um toque.', q_chk: '{f} pergunta como estás', q_chkb: 'Abre o Vicina e responde.',
    ok_t: '✅ {n} está bem', ok_b: 'Respondeu ao teu apelo ({a} de {t}).', q_okt: '{n} respondeu', hp_t: '🆘 {n} precisa de ajuda', hp_b: 'Respondeu ao apelo. Toca para ver onde está.', q_hp: '{n} está à tua procura',
    rm_t: '⏳ {f} está à espera da tua resposta', rm_b: 'Estás bem? Responde com um toque.',
    terremoto: 'Sismo', alluvione: 'Inundação', incendio: 'Incêndio', attentato: 'Emergência', blackout: 'Apagão', maltempo: 'Mau tempo', serata: 'Saída à noite'
  },
  ar: {
    sos_t: '🆘 نداء استغاثة من {n}', sos_bl: 'يحتاج إلى مساعدة. اضغط لرؤية الموقع والصور.', sos_b: 'يحتاج إلى مساعدة. اضغط للفتح.', q_seek: '{f} يبحث عنك', q_open: 'افتح Vicina.', q_now: 'افتح Vicina الآن.',
    ack_t: '{f} رأى نداء الاستغاثة', ack_b: 'يتولى الأمر. ابقَ في مكانك إن استطعت.', q_ans: '{f} ردّ',
    voice_t: '🎙 رسالة صوتية من {f}', voice_b: 'اضغط للاستماع إليها في نداء الاستغاثة.', q_voice: '{f} ترك لك رسالة صوتية',
    safe_t: '{f} في أمان', safe_b: 'أُغلق نداء الاستغاثة. كل شيء على ما يرام.', q_safe: '{f} بخير', q_safeb: 'كل شيء على ما يرام.',
    link_t: 'اتصال جديد', link_b: '{n} أصبح الآن في دائرتك', join_t: 'طلب انضمام إلى «{g}»', join_b: '{n} يريد الانضمام إلى المجموعة', joined_t: 'لقد انضممت!', joined_b: 'أنت الآن عضو في المجموعة «{g}»',
    eta: ' (حوالي {m} دقيقة)', c_v: '🏃 {n} في الطريق إليك{eta}', c_vb: 'ابقَ في مكانك إن استطعت. تراه على الخريطة.', c_o: '{n} في طريقه إلى {w}{eta}', c_ob: 'نسّقوا في مركز الإغاثة.',
    k_v: '📞 {n} يتصل بالرقم 112 من أجلك', k_vb: 'يجري إبلاغ خدمات الطوارئ.', k_o: '{n} يتصل بالرقم 112', k_ob: 'لا داعي لأن تتصل أنت أيضًا: ساعد {w} بطريقة أخرى.',
    a_v: '✅ وصل {n} إليك', a_vb: 'انظر حولك.', a_o: 'وصل {n} إلى {w}', a_ob: 'اضغط لرؤية الوضع.', q_c: '{n} في الطريق', q_k: '{n} يتصل', q_a: 'وصل {n}', q_go: '{n} في طريقه إلى {w}',
    chk_t: '⚠️ {why}{f} يسأل: هل أنت بخير؟', chk_b: 'اضغط للرد بـ «أنا بخير» أو «أحتاج إلى مساعدة».', chk_bn: '«{note}» رُدّ بلمسة واحدة.', q_chk: '{f} يسأل عن حالك', q_chkb: 'افتح Vicina ورُدّ.',
    ok_t: '✅ {n} بخير', ok_b: 'ردّ على ندائك ({a} من {t}).', q_okt: '{n} ردّ', hp_t: '🆘 {n} يحتاج إلى مساعدة', hp_b: 'ردّ على النداء. اضغط لترى أين هو.', q_hp: '{n} يبحث عنك',
    rm_t: '⏳ {f} ينتظر ردك', rm_b: 'هل أنت بخير؟ رُدّ بلمسة واحدة.',
    terremoto: 'زلزال', alluvione: 'فيضان', incendio: 'حريق', attentato: 'حالة طوارئ', blackout: 'انقطاع الكهرباء', maltempo: 'سوء الأحوال الجوية', serata: 'سهرة'
  },
  uk: {
    sos_t: '🆘 SOS від {n}', sos_bl: 'Потрібна допомога. Торкніться, щоб побачити місце і фото.', sos_b: 'Потрібна допомога. Торкніться, щоб відкрити.', q_seek: '{f} шукає вас', q_open: 'Відкрийте Vicina.', q_now: 'Відкрийте Vicina зараз.',
    ack_t: '{f} побачив(ла) ваш SOS', ack_b: 'Вже допомагає. Залишайтеся на місці, якщо можете.', q_ans: '{f} відповів(ла)',
    voice_t: '🎙 Голосове повідомлення від {f}', voice_b: 'Торкніться, щоб прослухати в SOS.', q_voice: '{f} залишив(ла) вам голосове',
    safe_t: '{f} у безпеці', safe_b: 'SOS закрито. Усе гаразд.', q_safe: '{f} у порядку', q_safeb: 'Усе гаразд.',
    link_t: 'Нове з’єднання', link_b: '{n} тепер у вашому колі', join_t: 'Запит до «{g}»', join_b: '{n} хоче приєднатися до групи', joined_t: 'Ви в групі!', joined_b: 'Тепер ви учасник групи «{g}»',
    eta: ' (приблизно {m} хв)', c_v: '🏃 {n} вже їде до вас{eta}', c_vb: 'Залишайтеся на місці, якщо можете. Ви бачите це на карті.', c_o: '{n} прямує до {w}{eta}', c_ob: 'Координуйтеся в Центрі допомоги.',
    k_v: '📞 {n} телефонує на 112 замість вас', k_vb: 'Служби екстреної допомоги зараз отримають повідомлення.', k_o: '{n} телефонує на 112', k_ob: 'Вам не треба теж телефонувати: допоможіть {w} інакше.',
    a_v: '✅ {n} прибув(ла) до вас', a_vb: 'Озирніться навколо.', a_o: '{n} прибув(ла) до {w}', a_ob: 'Торкніться, щоб побачити ситуацію.', q_c: '{n} вже їде', q_k: '{n} телефонує', q_a: '{n} прибув(ла)', q_go: '{n} прямує до {w}',
    chk_t: '⚠️ {why}{f} питає: з вами все гаразд?', chk_b: 'Торкніться, щоб відповісти «Я в порядку» або «Мені потрібна допомога».', chk_bn: '«{note}» Відповідайте одним дотиком.', q_chk: '{f} питає, як ви', q_chkb: 'Відкрийте Vicina і відповідайте.',
    ok_t: '✅ {n} у порядку', ok_b: 'Відповів(ла) на ваш заклик ({a} з {t}).', q_okt: '{n} відповів(ла)', hp_t: '🆘 {n} потрібна допомога', hp_b: 'Відповів(ла) на заклик. Торкніться, щоб побачити, де.', q_hp: '{n} шукає вас',
    rm_t: '⏳ {f} чекає на вашу відповідь', rm_b: 'З вами все гаразд? Відповідайте одним дотиком.',
    terremoto: 'Землетрус', alluvione: 'Повінь', incendio: 'Пожежа', attentato: 'Надзвичайна ситуація', blackout: 'Відключення світла', maltempo: 'Негода', serata: 'Вечір поза домом'
  },
  ro: {
    sos_t: '🆘 SOS de la {n}', sos_bl: 'Are nevoie de ajutor. Atinge pentru a vedea locația și fotografiile.', sos_b: 'Are nevoie de ajutor. Atinge pentru a deschide.', q_seek: '{f} te caută', q_open: 'Deschide Vicina.', q_now: 'Deschide Vicina acum.',
    ack_t: '{f} a văzut SOS-ul tău', ack_b: 'Se ocupă. Rămâi unde ești, dacă poți.', q_ans: '{f} a răspuns',
    voice_t: '🎙 Mesaj vocal de la {f}', voice_b: 'Atinge pentru a-l asculta în SOS.', q_voice: '{f} ți-a lăsat un mesaj vocal',
    safe_t: '{f} este în siguranță', safe_b: 'A închis SOS-ul. Totul e în regulă.', q_safe: '{f} este bine', q_safeb: 'Totul e în regulă.',
    link_t: 'Conexiune nouă', link_b: '{n} este acum în cercul tău', join_t: 'Cerere pentru „{g}”', join_b: '{n} vrea să intre în grup', joined_t: 'Ești înăuntru!', joined_b: 'Acum faci parte din grupul „{g}”',
    eta: ' (cam {m} min)', c_v: '🏃 {n} vine spre tine{eta}', c_vb: 'Rămâi unde ești, dacă poți. Îl vezi pe hartă.', c_o: '{n} merge la {w}{eta}', c_ob: 'Coordonați-vă în Centrul de ajutor.',
    k_v: '📞 {n} sună la 112 pentru tine', k_vb: 'Serviciile de urgență urmează să fie anunțate.', k_o: '{n} sună la 112', k_ob: 'Nu e nevoie să suni și tu: ajută-l pe {w} altfel.',
    a_v: '✅ {n} a ajuns la tine', a_vb: 'Uită-te în jur.', a_o: '{n} a ajuns la {w}', a_ob: 'Atinge pentru a vedea situația.', q_c: '{n} vine', q_k: '{n} sună', q_a: '{n} a ajuns', q_go: '{n} merge la {w}',
    chk_t: '⚠️ {why}{f} întreabă: ești bine?', chk_b: 'Atinge pentru a răspunde „Sunt bine” sau „Am nevoie de ajutor”.', chk_bn: '„{note}” Răspunde cu o atingere.', q_chk: '{f} te întreabă ce faci', q_chkb: 'Deschide Vicina și răspunde.',
    ok_t: '✅ {n} este bine', ok_b: 'A răspuns la apelul tău ({a} din {t}).', q_okt: '{n} a răspuns', hp_t: '🆘 {n} are nevoie de ajutor', hp_b: 'A răspuns la apel. Atinge pentru a vedea unde este.', q_hp: '{n} te caută',
    rm_t: '⏳ {f} așteaptă răspunsul tău', rm_b: 'Ești bine? Răspunde cu o atingere.',
    terremoto: 'Cutremur', alluvione: 'Inundație', incendio: 'Incendiu', attentato: 'Urgență', blackout: 'Pană de curent', maltempo: 'Vreme rea', serata: 'Ieșire în oraș'
  },
  sq: {
    sos_t: '🆘 SOS nga {n}', sos_bl: 'Ka nevojë për ndihmë. Prek për të parë vendndodhjen dhe fotot.', sos_b: 'Ka nevojë për ndihmë. Prek për ta hapur.', q_seek: '{f} po të kërkon', q_open: 'Hap Vicina.', q_now: 'Hap Vicina tani.',
    ack_t: '{f} e pa SOS-in tënd', ack_b: 'Po merret me të. Qëndro ku je, nëse mundesh.', q_ans: '{f} u përgjigj',
    voice_t: '🎙 Mesazh zanor nga {f}', voice_b: 'Prek për ta dëgjuar te SOS-i.', q_voice: '{f} të la një mesazh zanor',
    safe_t: '{f} është i/e sigurt', safe_b: 'E mbylli SOS-in. Gjithçka në rregull.', q_safe: '{f} është mirë', q_safeb: 'Gjithçka në rregull.',
    link_t: 'Lidhje e re', link_b: '{n} tani është në rrethin tënd', join_t: 'Kërkesë për "{g}"', join_b: '{n} dëshiron të hyjë në grup', joined_t: 'Je brenda!', joined_b: 'Tani je pjesë e grupit "{g}"',
    eta: ' (rreth {m} min)', c_v: '🏃 {n} po vjen{eta}', c_vb: 'Qëndro ku je, nëse mundesh. E sheh në hartë.', c_o: '{n} po shkon te {w}{eta}', c_ob: 'Koordinohuni në Qendrën e ndihmës.',
    k_v: '📞 {n} po telefonon 112 për ty', k_vb: 'Shërbimet e urgjencës po njoftohen.', k_o: '{n} po telefonon 112', k_ob: 'Nuk ka nevojë të telefonosh edhe ti: ndihmoje {w} ndryshe.',
    a_v: '✅ {n} arriti te ti', a_vb: 'Shiko përreth.', a_o: '{n} arriti te {w}', a_ob: 'Prek për të parë situatën.', q_c: '{n} po vjen', q_k: '{n} po telefonon', q_a: '{n} arriti', q_go: '{n} po shkon te {w}',
    chk_t: '⚠️ {why}{f} pyet: je mirë?', chk_b: 'Prek për t’u përgjigjur «Jam mirë» ose «Kam nevojë për ndihmë».', chk_bn: '«{note}» Përgjigju me një prekje.', q_chk: '{f} po pyet si je', q_chkb: 'Hap Vicina dhe përgjigju.',
    ok_t: '✅ {n} është mirë', ok_b: 'U përgjigj në thirrjen tënde ({a} nga {t}).', q_okt: '{n} u përgjigj', hp_t: '🆘 {n} ka nevojë për ndihmë', hp_b: 'U përgjigj në thirrje. Prek për të parë ku është.', q_hp: '{n} po të kërkon',
    rm_t: '⏳ {f} pret përgjigjen tënde', rm_b: 'Je mirë? Përgjigju me një prekje.',
    terremoto: 'Tërmet', alluvione: 'Përmbytje', incendio: 'Zjarr', attentato: 'Urgjencë', blackout: 'Ndërprerje e energjisë', maltempo: 'Mot i keq', serata: 'Mbrëmje jashtë'
  }
};
const fill = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
// L: lingua di chi riceve. k: chiavi [titolo, testo, titolo discreto, testo discreto]; v: valori
type Loc = { k: [string, string, string?, string?]; v: Record<string, unknown> };
function localize(lang: string, loc: Loc | undefined, discreet: boolean) {
  const t = loc && T[lang]; if (!t) return null;
  const v = { ...loc.v };
  if (v.etaM != null) v.eta = fill(t.eta, { m: v.etaM });
  if (v.reason) v.why = t[String(v.reason)] ? t[String(v.reason)] + ' · ' : '';
  const [a, b, qa, qb] = loc.k;
  if (discreet && qa) return { title: fill(t[qa] || '', v), body: fill(t[qb || 'q_open'] || '', v) };
  if (!t[a] || !t[b]) return null;
  return { title: fill(t[a], v), body: fill(t[b], v) };
}


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

// quiet: testo neutro per chi ha attivato la modalità anonima (nessun riferimento a SOS)
type Push = { title: string; body: string; data?: Record<string, string>; sos?: boolean; quiet?: { title: string; body: string }; loc?: Loc };
async function push(uids: string[], p: Push) {
  uids = [...new Set(uids.filter(Boolean))];
  if (!uids.length || !SA) return 0;
  let first_ = await SB.from('profiles').select('id, fcm_tokens, discreet, lang').in('id', uids);
  // se le colonne «discreet» o «lang» non sono ancora state create (SQL non lanciato) si va avanti senza
  if (first_.error) first_ = await SB.from('profiles').select('id, fcm_tokens, discreet').in('id', uids);
  const rows: any[] = (first_.error ? (await SB.from('profiles').select('id, fcm_tokens').in('id', uids)).data : first_.data) || [];
  const access = await fcmToken();
  let sent = 0;
  await Promise.all((rows || []).flatMap(row => (row.fcm_tokens || []).map(async (token: string) => {
    const message = {
      token,
      notification: localize(row.lang || 'it', p.loc, !!(row.discreet && p.quiet)) || (row.discreet && p.quiet ? p.quiet : { title: p.title, body: p.body }),
      data: p.data || {},
      android: {
        priority: 'HIGH', ttl: p.sos ? '3600s' : '86400s',
        notification: { channel_id: p.sos ? 'sos' : 'messages', sound: 'default', ...(p.sos ? { visibility: row.discreet ? 'PRIVATE' : 'PUBLIC', default_vibrate_timings: true, notification_priority: 'PRIORITY_MAX' } : {}) }
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
async function removeFolder(prefix: string, bucket = 'sos') {
  const { data } = await SB.storage.from(bucket).list(prefix, { limit: 100 });
  const files = (data || []).filter(f => f.id).map(f => `${prefix}/${f.name}`);
  const dirs = (data || []).filter(f => !f.id).map(f => `${prefix}/${f.name}`);
  if (files.length) await SB.storage.from(bucket).remove(files);
  for (const d of dirs) await removeFolder(d, bucket);
}

/* ---------- eventi ---------- */
async function handle(ev: { event: string; id: string; [k: string]: unknown }) {
  const one = async (table: string, id: string) => (await SB.from(table).select('*').eq('id', id).maybeSingle()).data;
  switch (ev.event) {
    case 'sos': {
      const s = await one('sos', ev.id); if (!s) return;
      return push(s.recipients, { title: `🆘 SOS da ${s.from_name}`, body: s.lat != null ? 'Ha bisogno di aiuto. Tocca per vedere posizione e foto.' : 'Ha bisogno di aiuto. Tocca per aprire.', data: { type: 'sos', sosId: s.id }, sos: true, quiet: { title: `${first(s.from_name)} ti cerca`, body: 'Apri Vicina adesso.' }, loc: { k: ['sos_t', s.lat != null ? 'sos_bl' : 'sos_b', 'q_seek', 'q_now'], v: { n: s.from_name, f: first(s.from_name) } } });
    }
    case 'ack': {
      const s = await one('sos', ev.id); if (!s) return;
      const n = s.acks?.[String(ev.uid)] || 'Qualcuno';
      return push([s.from_uid], { title: `${first(n)} ha visto il tuo SOS`, body: 'Sta intervenendo. Resta dove sei se puoi.', data: { type: 'ack', sosId: s.id }, quiet: { title: `${first(n)} ha risposto`, body: 'Apri Vicina.' }, loc: { k: ['ack_t', 'ack_b', 'q_ans', 'q_open'], v: { f: first(n) } } });
    }
    case 'voice': {
      const s = await one('sos', ev.id); if (!s) return;
      return push(s.recipients, { title: `🎙 Messaggio vocale da ${first(s.from_name)}`, body: 'Tocca per ascoltarlo nell\'SOS.', data: { type: 'sos', sosId: s.id }, sos: true, quiet: { title: `${first(s.from_name)} ti ha lasciato un vocale`, body: 'Apri Vicina.' }, loc: { k: ['voice_t', 'voice_b', 'q_voice', 'q_open'], v: { f: first(s.from_name) } } });
    }
    case 'safe': {
      const s = await one('sos', ev.id); if (!s) return;
      return push(s.recipients, { title: `${first(s.from_name)} è al sicuro`, body: "Ha chiuso l'SOS. Tutto a posto.", data: { type: 'safe', sosId: s.id }, quiet: { title: `${first(s.from_name)} sta bene`, body: 'Tutto a posto.' }, loc: { k: ['safe_t', 'safe_b', 'q_safe', 'q_safeb'], v: { f: first(s.from_name) } } });
    }
    // Centrale di soccorso: chi aiuta dice cosa fa (lo sanno la persona in pericolo e gli altri della cerchia)
    case 'help_role': {
      const s = await one('sos', ev.id); if (!s) return;
      const h = s.helpers?.[String(ev.uid)] || {}, n = first(h.name) || 'Qualcuno', who = first(s.from_name);
      const eta = h.eta != null ? ` (circa ${h.eta} min)` : '';
      const others = (s.recipients || []).filter((x: string) => x !== String(ev.uid));
      const M: Record<string, [Push, Push] | null> = {
        coming: [{ title: `🏃 ${n} sta arrivando${eta}`, body: 'Resta dove sei se puoi. Lo vedi sulla mappa.', data: { type: 'ack', sosId: s.id }, quiet: { title: `${n} sta arrivando`, body: 'Apri Vicina.' } },
                 { title: `${n} sta andando da ${who}${eta}`, body: 'Coordinatevi nella Centrale di soccorso.', data: { type: 'sos', sosId: s.id }, quiet: { title: `${n} sta andando da ${who}`, body: 'Apri Vicina.' } }],
        calling: [{ title: `📞 ${n} sta chiamando il 112 per te`, body: 'I soccorsi stanno per essere avvisati.', data: { type: 'ack', sosId: s.id }, quiet: { title: `${n} sta chiamando`, body: 'Apri Vicina.' } },
                  { title: `${n} sta chiamando il 112`, body: `Non serve che chiami anche tu: aiuta ${who} in un altro modo.`, data: { type: 'sos', sosId: s.id }, quiet: { title: `${n} sta chiamando`, body: 'Apri Vicina.' } }],
        arrived: [{ title: `✅ ${n} è arrivato/a da te`, body: 'Guardati intorno.', data: { type: 'ack', sosId: s.id }, quiet: { title: `${n} è arrivato/a`, body: 'Apri Vicina.' } },
                  { title: `${n} è arrivato/a da ${who}`, body: 'Tocca per vedere la situazione.', data: { type: 'sos', sosId: s.id }, quiet: { title: `${n} è arrivato/a`, body: 'Apri Vicina.' } }]
      };
      const m = M[String(ev.role)]; if (!m) return 0;
      const K: Record<string, [Loc['k'], Loc['k']]> = { coming: [['c_v', 'c_vb', 'q_c', 'q_open'], ['c_o', 'c_ob', 'q_go', 'q_open']], calling: [['k_v', 'k_vb', 'q_k', 'q_open'], ['k_o', 'k_ob', 'q_k', 'q_open']], arrived: [['a_v', 'a_vb', 'q_a', 'q_open'], ['a_o', 'a_ob', 'q_a', 'q_open']] };
      const lv = { n, w: who, etaM: h.eta ?? undefined };
      m[0].loc = { k: K[String(ev.role)][0], v: lv }; m[1].loc = { k: K[String(ev.role)][1], v: lv };
      const a = await push([s.from_uid], m[0]); const b = await push(others, m[1]);
      return a + b;
    }
    // Appello «State tutti bene?»
    case 'check': {
      const c = await one('checks', ev.id); if (!c) return;
      const why = REASON[c.reason] ? REASON[c.reason] + ' · ' : '';
      return push(c.recipients, { title: `⚠️ ${why}${first(c.from_name)} chiede: stai bene?`, body: c.note ? `«${String(c.note).slice(0, 100)}» Rispondi con un tocco.` : 'Tocca per rispondere «Sto bene» o «Ho bisogno di aiuto».', data: { type: 'check', checkId: c.id }, sos: true, quiet: { title: `${first(c.from_name)} ti chiede come stai`, body: 'Apri Vicina e rispondi.' }, loc: { k: ['chk_t', c.note ? 'chk_bn' : 'chk_b', 'q_chk', 'q_chkb'], v: { f: first(c.from_name), reason: c.reason, note: String(c.note || '').slice(0, 100) } } });
    }
    case 'check_ans': {
      const c = await one('checks', ev.id); if (!c) return;
      const uid = String(ev.uid);
      const a = (await SB.from('check_answers').select('name, status').eq('check_id', c.id).eq('uid', uid).maybeSingle()).data;
      const n = first(a?.name) || 'Qualcuno';
      if (ev.status !== 'help') {
        if (uid === c.from_uid) return 0;
        return push([c.from_uid], { title: `✅ ${n} sta bene`, body: `Ha risposto al tuo appello (${(c.answered || 0)} su ${(c.recipients || []).length}).`, data: { type: 'check', checkId: c.id }, quiet: { title: `${n} ha risposto`, body: 'Apri Vicina.' }, loc: { k: ['ok_t', 'ok_b', 'q_okt', 'q_open'], v: { n, a: c.answered || 0, t: (c.recipients || []).length } } });
      }
      // chiede aiuto: lo sanno chi ha lanciato l'appello e chi, tra i destinatari, conosce questa persona
      const [l, g] = await Promise.all([
        SB.from('links').select('uids').contains('uids', [uid]),
        SB.from('groups').select('member_uids').contains('member_uids', [uid])
      ]);
      const known = new Set<string>([...(l.data || []).flatMap((x: any) => x.uids), ...(g.data || []).flatMap((x: any) => x.member_uids)]);
      const to = [c.from_uid, ...(c.recipients || [])].filter((x: string) => x !== uid && (x === c.from_uid || known.has(x)));
      return push(to, { title: `🆘 ${n} ha bisogno di aiuto`, body: 'Ha risposto all\'appello. Tocca per vedere dov\'è.', data: { type: 'check', checkId: c.id }, sos: true, quiet: { title: `${n} ti cerca`, body: 'Apri Vicina adesso.' }, loc: { k: ['hp_t', 'hp_b', 'q_hp', 'q_now'], v: { n } } });
    }
    case 'check_remind': {
      const c = await one('checks', ev.id); if (!c) return;
      const { data } = await SB.from('check_answers').select('uid').eq('check_id', c.id);
      const done = new Set((data || []).map((x: any) => x.uid));
      return push((c.recipients || []).filter((x: string) => !done.has(x)), { title: `⏳ ${first(c.from_name)} aspetta la tua risposta`, body: 'Stai bene? Rispondi con un tocco.', data: { type: 'check', checkId: c.id }, sos: true, quiet: { title: `${first(c.from_name)} ti cerca`, body: 'Apri Vicina e rispondi.' }, loc: { k: ['rm_t', 'rm_b', 'q_chk', 'q_chkb'], v: { f: first(c.from_name) } } });
    }
    case 'msg': {
      const m = await one('messages', ev.id); if (!m) return;
      const link = await one('links', m.chat_id), group = link ? null : await one('groups', m.chat_id);
      const to = (link?.uids || group?.member_uids || []).filter((u: string) => u !== m.from_uid);
      return push(to, { title: group ? `${first(m.from_name)} · ${group.name}` : m.from_name || 'Vicina', body: String(m.text || '').slice(0, 140), data: { type: 'msg', chatId: m.chat_id } });
    }
    case 'link':
      return push([String(ev.to)], { title: 'Nuovo collegamento', body: `${ev.name} ora è nella tua cerchia`, data: { type: 'link', chatId: ev.id }, loc: { k: ['link_t', 'link_b'], v: { n: ev.name } } });
    case 'join': {
      const g = await one('groups', ev.id); if (!g) return;
      return push([g.admin_uid], { title: `Richiesta per "${g.name}"`, body: `${g.requests?.[String(ev.uid)] || 'Qualcuno'} vuole entrare nel gruppo`, data: { type: 'join', groupId: g.id }, loc: { k: ['join_t', 'join_b'], v: { g: g.name, n: g.requests?.[String(ev.uid)] || '?' } } });
    }
    case 'joined': {
      const g = await one('groups', ev.id); if (!g) return;
      return push([String(ev.uid)], { title: 'Sei dentro!', body: `Ora fai parte del gruppo "${g.name}"`, data: { type: 'joined', chatId: g.id }, loc: { k: ['joined_t', 'joined_b'], v: { g: g.name } } });
    }
    case 'cleanup': { // foto e SOS più vecchi di 7 giorni
      const old = new Date(Date.now() - PHOTO_DAYS * 864e5).toISOString();
      const { data } = await SB.from('sos').select('id, from_uid').lt('created_at', old).limit(200);
      for (const s of data || []) { await removeFolder(`${s.from_uid}/${s.id}`); await SB.from('sos').delete().eq('id', s.id); }
      return (data || []).length;
    }
    case 'purge': { // account eliminato: via tutte le sue foto (e l'utente, se il database non ha potuto)
      await removeFolder(ev.id);
      await removeFolder(ev.id, 'avatars').catch(() => {});   // foto profilo
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
