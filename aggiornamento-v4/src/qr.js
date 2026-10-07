// Codici QR di Vicina: mostra il tuo QR (per farti aggiungere) e scanner con la fotocamera dentro l'app.
// Il QR contiene «vicina://add/CODICE»: si legge con lo scanner di Vicina e anche con la fotocamera del telefono.
let QR = null, JSQR = null;
const loadGen = async () => QR || (QR = (await import('./vendor/qrcode.js')).default);
const loadReader = async () => JSQR || (JSQR = (await import('./vendor/jsqr.js')).default);

export const inviteLink = code => `vicina://add/${code}`;
export function parseInvite(text) {
  const t = String(text || '').trim();
  const m = t.match(/^vicina:\/\/add\/([A-Z0-9]{6})$/i) || t.match(/^VICINA:([A-Z0-9]{6})$/i) || t.match(/^([A-Z0-9]{6})$/i);
  return m ? m[1].toUpperCase() : null;
}

// SVG del QR (nitido a qualsiasi dimensione)
export async function qrSvg(text, { dark = '#000', light = '#fff', margin = 2 } = {}) {
  const q = (await loadGen())(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), s = n + margin * 2; let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
  return `<svg class="qr-svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" role="img" aria-label="Codice QR"><rect width="${s}" height="${s}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

// Scanner a tutto schermo con mirino, linea animata e torcia
export async function openScanner({ onCode, onManual, title = 'Inquadra il QR dell\'altra persona' }) {
  const host = document.getElementById('app') || document.body;
  const el = document.createElement('div'); el.className = 'qr-scan';
  el.innerHTML = `<video playsinline muted autoplay></video>
    <div class="qr-mask"><div class="qr-win"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i><b class="qr-line"></b><span class="qr-ok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div></div>
    <div class="qr-top"><button class="qr-x" aria-label="Chiudi"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button><p>${title}</p><button class="qr-torch" aria-label="Torcia" hidden><svg viewBox="0 0 24 24"><path d="M9 2h6l-1 6h-4zM10 8h4v13h-4z"/></svg></button></div>
    <div class="qr-bottom"><p class="qr-hint">Tienilo dentro il riquadro: si legge da solo</p><button class="qr-manual">Inserisci il codice a mano</button></div>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const v = el.querySelector('video');
  let stream = null, timer = null, done = false, torchOn = false;
  const close = () => {
    done = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop());
    el.classList.remove('on'); setTimeout(() => el.remove(), 250);
  };
  el.querySelector('.qr-x').onclick = close;
  el.querySelector('.qr-manual').onclick = () => { close(); onManual?.(); };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    el.querySelector('.qr-hint').textContent = 'Fotocamera non disponibile: consenti l\'accesso alla fotocamera per Vicina nelle impostazioni del telefono.';
    return { close };
  }
  if (done) { stream.getTracks().forEach(t => t.stop()); return { close }; }
  v.srcObject = stream; v.play().catch(() => {});
  const track = stream.getVideoTracks()[0], caps = track.getCapabilities?.() || {};
  if (caps.torch) {
    const tb = el.querySelector('.qr-torch'); tb.hidden = false;
    tb.onclick = () => { torchOn = !torchOn; tb.classList.toggle('on', torchOn); track.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => {}); };
  }
  // lettura: BarcodeDetector se c'è (veloce), altrimenti jsQR
  let detector = null;
  try { if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch {}
  const reader = detector ? null : await loadReader();
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  let busy = false;
  timer = setInterval(async () => {
    if (done || busy || v.readyState < 2 || !v.videoWidth) return;
    busy = true;
    try {
      let text = null;
      if (detector) { const r = await detector.detect(v); text = r[0]?.rawValue || null; }
      else {
        const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        g.drawImage(v, 0, 0, c.width, c.height);
        const img = g.getImageData(0, 0, c.width, c.height);
        text = reader(img.data, c.width, c.height, { inversionAttempts: 'attemptBoth' })?.data || null;
      }
      if (text && !done) {
        const code = parseInvite(text);
        if (!code) { el.querySelector('.qr-hint').textContent = 'Questo non è un QR di Vicina'; busy = false; return; }
        done = true; clearInterval(timer);
        try { navigator.vibrate?.(60); } catch {}
        el.classList.add('found');
        setTimeout(() => { close(); onCode(code); }, 650);
      }
    } catch (e) { console.warn('qr', e); }
    busy = false;
  }, 220);
  return { close };
}
