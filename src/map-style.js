// Stile «cartina fisica» scura fatta da noi: rilievi (ombreggiatura del terreno), boschi, parchi, acqua,
// strade gerarchiche e nomi leggibili. Dati: OpenFreeMap (OpenStreetMap) + rilievi Terrarium (AWS Open Data), gratis e senza chiave.
export const OFM = 'https://tiles.openfreemap.org';
const NAME = ['coalesce', ['get', 'name:it'], ['get', 'name:latin'], ['get', 'name']];
const F = ['Noto Sans Regular'], FB = ['Noto Sans Bold'];
const z = (...st) => ['interpolate', ['exponential', 1.5], ['zoom'], ...st];
const road = (id, classes, color, w, extra = {}) => ({ id, type: 'line', source: 'omt', 'source-layer': 'transportation',
  filter: ['all', ['match', ['get', 'class'], classes, true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
  layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': w, ...extra } });
export const DARK_PHYSICAL = {
  version: 8, name: 'Vicina scura fisica',
  glyphs: OFM + '/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: OFM + '/planet' },
    dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 13, attribution: 'Rilievi: Mapzen Terrain Tiles' }
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#161A21' } },
    { id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'forest'], true, false], paint: { 'fill-color': '#18291F', 'fill-opacity': 0.9 } },
    { id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['grass', 'farmland', 'scrub', 'wetland'], true, false], paint: { 'fill-color': '#1A231D', 'fill-opacity': 0.75 } },
    { id: 'landcover-ice', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['ice', 'glacier'], true, false], paint: { 'fill-color': '#2C3440' } },
    { id: 'landcover-sand', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['sand', 'rock'], true, false], paint: { 'fill-color': '#26251F', 'fill-opacity': 0.7 } },
    { id: 'landuse-city', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood', 'commercial', 'retail', 'industrial'], true, false], paint: { 'fill-color': '#1C2028', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 14, 0.5] } },
    { id: 'landuse-green', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['match', ['get', 'class'], ['cemetery', 'pitch', 'playground', 'stadium'], true, false], paint: { 'fill-color': '#182A1F' } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#173022', 'fill-opacity': 0.85 } },
    { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.55, 'hillshade-shadow-color': '#05070B', 'hillshade-highlight-color': '#3A4558', 'hillshade-accent-color': '#0E131B', 'hillshade-illumination-direction': 315 } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#173452' } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': '#1D3E60', 'line-width': z(8, 0.6, 14, 2.5, 18, 6) } },
    { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': '#252933', 'fill-outline-color': '#2E333F', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 0.9] } },
    { id: 'aeroway', type: 'line', source: 'omt', 'source-layer': 'aeroway', minzoom: 11, paint: { 'line-color': '#2D3240', 'line-width': z(11, 1, 16, 20) } },
    { id: 'boundary-region', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': '#3A3F4D', 'line-width': 1, 'line-dasharray': [3, 2] } },
    { id: 'boundary-country', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': '#59607A', 'line-width': z(3, 0.8, 10, 2) } },
    road('road-path', ['path', 'track'], '#30353F', z(14, 0.6, 18, 2), { 'line-dasharray': [2, 1.5] }),
    road('road-minor', ['minor', 'service'], '#2F343E', z(13, 0.6, 16, 4, 19, 14)),
    road('road-secondary', ['secondary', 'tertiary'], '#434957', z(9, 0.6, 14, 3, 18, 16)),
    road('road-primary', ['primary', 'trunk'], '#596071', z(6, 0.6, 12, 2.4, 18, 20)),
    road('road-motorway', ['motorway'], '#7C6A4A', z(5, 0.7, 12, 3, 18, 22)),
    road('rail', ['rail', 'transit'], '#3D4250', z(10, 0.6, 16, 2), { 'line-dasharray': [3, 2] }),
    { id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name', layout: { 'text-field': NAME, 'text-font': F, 'text-size': 12, 'text-max-width': 6 }, paint: { 'text-color': '#6F9BC6', 'text-halo-color': '#0B0E13', 'text-halo-width': 1.2 } },
    { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': F, 'text-size': z(13, 10, 18, 14), 'text-padding': 4 }, paint: { 'text-color': '#A7ADBA', 'text-halo-color': '#0B0E13', 'text-halo-width': 1.4 } },
    { id: 'place-minor', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 11, filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood', 'village', 'hamlet'], true, false], layout: { 'text-field': NAME, 'text-font': F, 'text-size': z(11, 10.5, 16, 14), 'text-max-width': 8 }, paint: { 'text-color': '#9AA1AF', 'text-halo-color': '#0B0E13', 'text-halo-width': 1.4 } },
    { id: 'place-town', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 7, filter: ['match', ['get', 'class'], ['town'], true, false], layout: { 'text-field': NAME, 'text-font': F, 'text-size': z(7, 11, 14, 16), 'text-max-width': 8 }, paint: { 'text-color': '#CDD2DC', 'text-halo-color': '#0B0E13', 'text-halo-width': 1.5 } },
    { id: 'place-city', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['==', ['get', 'class'], 'city'], layout: { 'text-field': NAME, 'text-font': FB, 'text-size': z(4, 11, 12, 19), 'text-max-width': 8 }, paint: { 'text-color': '#EEF0F5', 'text-halo-color': '#0B0E13', 'text-halo-width': 1.6 } },
    { id: 'place-country', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 7, filter: ['==', ['get', 'class'], 'country'], layout: { 'text-field': NAME, 'text-font': FB, 'text-size': z(2, 11, 6, 15), 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 }, paint: { 'text-color': '#8D94A6', 'text-halo-color': '#0B0E13', 'text-halo-width': 1.4 } }
  ]
};


// telefoni lenti: stessa cartina senza l'ombreggiatura del rilievo (è la parte più pesante da disegnare)
export const darkPhysical = ({ relief = true } = {}) => relief ? DARK_PHYSICAL
  : { ...DARK_PHYSICAL, sources: { omt: DARK_PHYSICAL.sources.omt }, layers: DARK_PHYSICAL.layers.filter(l => l.type !== 'hillshade') };
