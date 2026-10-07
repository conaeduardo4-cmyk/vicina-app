// Punto di ingresso dell'app. Se le chiavi Supabase non sono configurate parte in modalità DEMO.
import './style.css';
import './style-dz.css';
import { boot } from './app.js';
import { native } from './native.js';

const env = import.meta.env;
// sicurezza: lo splash nativo non deve mai restare bloccato
setTimeout(() => native.hideSplash(), 4000);
// rete di sicurezza: se qualcosa va storto all'avvio non resta uno schermo vuoto
const rescue = e => {
  console.error('Vicina avvio', e);
  if (document.getElementById('rescue') || document.querySelector('.screen.on:not(#s-load)')) return;
  const d = document.createElement('div'); d.id = 'rescue';
  d.style.cssText = 'position:fixed;inset:0;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:#0B0B10;color:#fff;font:16px -apple-system,Roboto,sans-serif;text-align:center';
  d.innerHTML = '<b style="font-size:20px">Vicina non è partita bene</b><span style="color:#9E9EA8">In emergenza chiama subito il 112.</span><a href="tel:112" style="padding:14px 22px;border-radius:16px;background:#E8192C;color:#fff;text-decoration:none;font-weight:700">Chiama 112</a><button onclick="location.reload()" style="padding:12px 20px;border-radius:14px;border:1px solid #333;background:#16161C;color:#fff;font:inherit">Riprova</button>';
  document.body.appendChild(d);
};
setTimeout(() => { if (document.querySelector('#s-load.on') && !document.querySelector('.screen.on:not(#s-load)')) rescue(new Error('avvio lento')); }, 15000);
(async () => {
  try {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const { createApi } = await import('./api-supabase.js');
    boot(createApi(env), native);
  } else {
    console.warn('Vicina: chiavi Supabase mancanti, avvio in modalità demo');
    const { createDemoApi } = await import('./demo-api.js');
    boot(createDemoApi(), native);
  }
  } catch (e) { rescue(e); }
})();
