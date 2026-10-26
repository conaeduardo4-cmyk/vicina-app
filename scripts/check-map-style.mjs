// Controlla che lo stile della mappa sia valido (se non lo fosse MapLibre non disegnerebbe niente).
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { darkPhysical } from '../src/map-style.js';
let bad = 0;
for (const relief of [true, false]) {
  const s = darkPhysical({ relief }), errs = validateStyleMin(s);
  if (errs.length) { bad++; console.error(`Stile mappa (rilievo ${relief}) NON valido:\n` + errs.map(e => ' - ' + e.message).join('\n')); }
  else console.log(`Stile mappa valido, rilievo ${relief ? 'sì' : 'no'} (${s.layers.length} livelli)`);
}
if (bad) process.exit(1);
