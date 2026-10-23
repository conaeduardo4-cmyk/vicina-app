// Controlla che lo stile della mappa sia valido (se non lo fosse MapLibre non disegnerebbe niente).
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { DARK_PHYSICAL } from '../src/map-style.js';
const errs = validateStyleMin(DARK_PHYSICAL);
if (errs.length) { console.error('Stile mappa NON valido:\n' + errs.map(e => ' - ' + e.message).join('\n')); process.exit(1); }
console.log('Stile mappa valido (' + DARK_PHYSICAL.layers.length + ' livelli)');
