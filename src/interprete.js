// Interprete d'emergenza: frasi pronte che compaiono GRANDI in italiano e il telefono legge ad alta voce in italiano,
// più le domande tipiche di soccorritori e polizia con la traduzione nella tua lingua. Funziona senza internet.
import { SAY, ASK, PH_LANGS, SPEAK_IT, SPEAK_OWN } from './phrases.js';

export function createInterprete(ctx) {
  const { $, I, esc, openSheet, closeSheet, native, toast } = ctx;
  const li = () => Math.max(0, PH_LANGS.indexOf(globalThis.vLang || 'it'));
  const own = r => r[li()] || r[1];
  let tab = 'say';
  function open(which) {
    if (which) tab = which;
    const L = globalThis.vLang || 'it';
    const say = [[SPEAK_IT[L] || SPEAK_IT.en, SPEAK_OWN[L] || SPEAK_OWN.en], ...SAY.map(r => [r[0], own(r)])];
    openSheet(`<div class="ip"><h2>Interprete d'emergenza</h2>
      <p class="sub">Tocca una frase: compare grande in italiano e il telefono la legge ad alta voce. Mostrala o falla ascoltare a chi ti aiuta.</p>
      <div class="seg ip-seg"><button class="${tab === 'say' ? 'on' : ''}" data-a="ip-tab" data-t="say">Voglio dire</button><button class="${tab === 'ask' ? 'on' : ''}" data-a="ip-tab" data-t="ask">Mi chiedono</button></div>
      <div class="ip-list">${tab === 'say'
        ? say.map(([it, mine], i) => `<button class="ip-row" data-a="ip-show" data-i="${i}"><b translate="no">${esc(L === 'it' ? it : mine)}</b><span translate="no" lang="it">${esc(it)}</span>${I('mic')}</button>`).join('')
        : ASK.map((r, i) => `<button class="ip-row ask" data-a="ip-ask" data-i="${i}"><b translate="no" lang="it">${esc(r[0])}</b><span translate="no">${esc(L === 'it' ? r[1] : own(r))}</span>${I('mic')}</button>`).join('')}</div>
      <a class="btn red" href="tel:112">${I('phone')}Chiama 112</a></div>`, 'interprete');
    ctx.sayList = say;
  }
  function big(it, mine) {
    closeSheet();
    ctx.showOv('ip-big', `<div class="ip-big" translate="no"><button class="iconbtn ip-x" data-a="tool-close" aria-label="Chiudi">${I('x')}</button>
      <b lang="it">${esc(it)}</b>${mine && mine !== it ? `<span>${esc(mine)}</span>` : ''}
      <div class="ip-acts"><button class="btn" data-a="ip-again" data-t="${esc(it)}">${I('mic')}Leggi di nuovo</button><button class="btn ghost" data-a="ip-back">Altre frasi</button></div></div>`);
    native.vx.speak(it, 'it-IT-x');
  }
  async function handle(a, t) {
    switch (a) {
      case 'ip-open': open(); return true;
      case 'ip-tab': tab = t.dataset.t; open(); return true;
      case 'ip-show': { const r = ctx.sayList?.[+t.dataset.i]; if (r) big(r[0], r[1]); return true; }
      case 'ip-ask': { const r = ASK[+t.dataset.i]; if (r) { native.vx.speak(own(r), globalThis.vLoc || 'en-GB'); toast(own(r)); } return true; }
      case 'ip-again': native.vx.speak(t.dataset.t, 'it-IT-x'); return true;
      case 'ip-back': ctx.closeOv(); open(); return true;
    }
    return false;
  }
  return {
    handle, open,
    groups: [['Adesso', [['ip-open', 'chat', 'blue', "Interprete d'emergenza", 'Frasi pronte in italiano, lette ad alta voce']]]]
  };
}
