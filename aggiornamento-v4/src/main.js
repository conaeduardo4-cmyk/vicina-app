// Punto di ingresso dell'app. Se le chiavi Supabase non sono configurate parte in modalità DEMO.
import './style.css';
import { boot } from './app.js';
import { native } from './native.js';

const env = import.meta.env;
// sicurezza: lo splash nativo non deve mai restare bloccato
setTimeout(() => native.hideSplash(), 4000);
(async () => {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const { createApi } = await import('./api-supabase.js');
    boot(createApi(env), native);
  } else {
    console.warn('Vicina: chiavi Supabase mancanti, avvio in modalità demo');
    const { createDemoApi } = await import('./demo-api.js');
    boot(createDemoApi(), native);
  }
})();
