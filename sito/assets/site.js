// Sito di Vicina e Vicina Extra: effetti e parti dinamiche comuni alle due pagine.
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches, FINE = matchMedia('(pointer: fine)').matches;
  const css = getComputedStyle(document.documentElement);
  window.SITE = { $, $$, RM, FINE };

  /* ---------- selettore Vicina / Vicina Extra ---------- */
  const sw = $('.switch');
  if (sw) {
    const pill = $('.pill', sw), place = a => { pill.style.left = a.offsetLeft + 'px'; pill.style.width = a.offsetWidth + 'px'; };
    const on = $('a.on', sw); requestAnimationFrame(() => { pill.style.transition = 'none'; place(on); requestAnimationFrame(() => { pill.style.transition = ''; }); });
    addEventListener('resize', () => place($('a.on', sw)));
    $$('a', sw).forEach(a => {
      a.addEventListener('mouseenter', () => { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = a.href; document.head.appendChild(l); }, { once: true });
      a.addEventListener('click', e => {
        if (a.classList.contains('on')) { e.preventDefault(); return; }
        if (document.startViewTransition && 'onpagereveal' in window) return; // transizione tra pagine del browser
        e.preventDefault(); $$('a', sw).forEach(x => x.classList.toggle('on', x === a)); place(a);
        document.body.style.transition = 'opacity .35s'; document.body.style.opacity = '.0';
        setTimeout(() => { location.href = a.href; }, 330);
      });
    });
  }

  /* ---------- aurora: macchie di luce che si muovono e seguono il puntatore ---------- */
  const cv = $('#aurora');
  if (cv && !RM) {
    const ctx = cv.getContext('2d'); let W, H, t = 0, mx = .7, my = .3, tx = .7, ty = .3;
    const acc = css.getPropertyValue('--acc').trim(), oth = css.getPropertyValue('--other').trim();
    const rs = () => { W = cv.width = Math.round(innerWidth / 4); H = cv.height = Math.round(innerHeight / 4); };
    rs(); addEventListener('resize', rs);
    addEventListener('pointermove', e => { tx = e.clientX / innerWidth; ty = e.clientY / innerHeight; }, { passive: true });
    const blob = (x, y, r, c, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c + a); g.addColorStop(1, c + '00'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    const hx = c => c.length === 4 ? '#' + [...c.slice(1)].map(x => x + x).join('') : c;
    const A = hx(acc), O = hx(oth);
    let vis = true; document.addEventListener('visibilitychange', () => { vis = !document.hidden; });
    const frame = () => {
      if (vis) {
        t += .004; mx += (tx - mx) * .03; my += (ty - my) * .03;
        ctx.clearRect(0, 0, W, H);
        const sy = scrollY / innerHeight;
        blob(W * (.78 + Math.sin(t) * .08), H * (.18 + Math.cos(t * 1.3) * .08 - sy * .05), W * .55, A, '55');
        blob(W * (.1 + Math.cos(t * .8) * .06), H * (.75 + Math.sin(t * 1.1) * .06), W * .45, O, '22');
        blob(W * mx, H * my, W * .32, A, '30');
      }
      requestAnimationFrame(frame);
    };
    frame();
  }

  /* ---------- luce sotto il puntatore, barra di avanzamento ---------- */
  const cur = $('#cursor');
  if (cur && FINE && !RM) addEventListener('pointermove', e => { cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, { passive: true });
  else if (cur) cur.remove();
  const pr = $('#progress');
  const onScroll = () => { if (pr) pr.style.transform = `scaleX(${scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)})`; };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- schede: luce che segue il puntatore ---------- */
  document.addEventListener('pointermove', e => {
    const c = e.target.closest?.('.card'); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  /* ---------- inclinazione 3D e bottoni magnetici ---------- */
  if (FINE && !RM) {
    $$('[data-tilt]').forEach(el => {
      const k = +el.dataset.tilt || 10; let raf;
      const box = el.closest('.stage') || el;
      box.addEventListener('pointermove', e => { const r = box.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { el.style.transform = `rotateY(${x * k}deg) rotateX(${-y * k}deg)`; }); });
      box.addEventListener('pointerleave', () => { el.style.transition = 'transform .8s var(--ease)'; el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 800); });
    });
    $$('[data-mag]').forEach(el => {
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- comparsa allo scorrimento e contatori ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('[data-r]').forEach(el => io.observe(el));
  const fmt = n => n.toLocaleString('it-IT');
  const count = el => {
    const to = parseFloat(el.dataset.count), dec = (el.dataset.count.split('.')[1] || '').length, t0 = performance.now(), D = 1600;
    const step = now => { const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 4); el.textContent = (el.dataset.pre || '') + (dec ? (to * e).toFixed(dec).replace('.', ',') : fmt(Math.round(to * e))) + (el.dataset.suf || ''); if (p < 1) requestAnimationFrame(step); };
    RM ? (el.textContent = (el.dataset.pre || '') + fmt(to) + (el.dataset.suf || '')) : requestAnimationFrame(step);
  };
  const ioc = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { count(e.target); ioc.unobserve(e.target); } }), { threshold: .6 });
  $$('[data-count]').forEach(el => ioc.observe(el));

  /* ---------- racconto a scorrimento: la schermata del telefono segue il passo ---------- */
  $$('[data-scrolly]').forEach(sc => {
    const imgs = $$('.sticky .scr img', sc), steps = $$('.st', sc);
    const set = i => { steps.forEach((s, k) => s.classList.toggle('on', k === i)); const key = steps[i]?.dataset.img; imgs.forEach(im => im.classList.toggle('on', im.dataset.k === key)); };
    const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) set(steps.indexOf(e.target)); }), { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(s => so.observe(s)); set(0);
  });

  /* ---------- carosello automatico nei telefoni ---------- */
  $$('[data-car]').forEach(ph => {
    const imgs = $$('.scr img', ph); if (imgs.length < 2) return; let i = 0;
    imgs[0].classList.add('on');
    setInterval(() => { if (document.hidden) return; imgs[i].classList.remove('on'); i = (i + 1) % imgs.length; imgs[i].classList.add('on'); }, +ph.dataset.car || 2800);
  });

  /* ---------- domande: apri/chiudi e cerca ---------- */
  $$('.qa button').forEach(b => b.addEventListener('click', () => { const q = b.closest('.qa'); q.classList.toggle('open'); b.setAttribute('aria-expanded', q.classList.contains('open')); }));
  const fq = $('#faq-q');
  if (fq) fq.addEventListener('input', () => { const v = fq.value.trim().toLowerCase(); $$('.qa').forEach(q => { const hit = !v || q.textContent.toLowerCase().includes(v); q.hidden = !hit; if (v && hit) q.classList.add('open'); }); });

  /* ---------- finestre (avvisi prima del download) ---------- */
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-modal]'); if (o) { e.preventDefault(); $('#' + o.dataset.modal)?.classList.add('on'); return; }
    const c = e.target.closest('[data-close]'); if (c || e.target.classList.contains('modal')) (c?.closest('.modal') || e.target).classList.remove('on');
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal.on').forEach(m => m.classList.remove('on')); });
  $$('.modal [data-needs]').forEach(btn => { const cb = $('#' + btn.dataset.needs); const up = () => { btn.classList.toggle('dis', !cb.checked); btn.setAttribute('aria-disabled', !cb.checked); }; cb.addEventListener('change', up); up(); btn.addEventListener('click', e => { if (!cb.checked) e.preventDefault(); }); });

  /* ---------- ultima versione dalle release di GitHub (numero, peso, data, novità) ---------- */
  window.SITE.release = async (repo, map) => {
    const KEY = 'rel:' + repo;
    let rel = null;
    try { const c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (c && Date.now() - c.at < 6e5) rel = c.rel; } catch { /* */ }
    if (!rel) {
      try {
        const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
        if (r.ok) { const j = await r.json(); rel = { tag: j.tag_name, date: j.published_at, body: j.body || '', assets: (j.assets || []).map(a => ({ n: a.name, s: a.size, u: a.browser_download_url })) }; try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rel })); } catch { /* */ } }
      } catch { /* resta il testo scritto nella pagina */ }
    }
    if (!rel) return null;
    const v = rel.tag.replace(/^v/, ''), mb = s => (s / 1048576).toFixed(1).replace('.', ',') + ' MB';
    $$('[data-rel="v"]').forEach(e => { e.textContent = v; });
    $$('[data-rel="date"]').forEach(e => { e.textContent = new Date(rel.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }); });
    $$('[data-rel="notes"]').forEach(e => { if (rel.body.trim()) { e.textContent = rel.body.trim(); e.closest('[data-rel-box]')?.removeAttribute('hidden'); } });
    for (const [key, re] of Object.entries(map)) {
      const a = rel.assets.find(x => re.test(x.n)); if (!a) continue;
      $$(`[data-rel-size="${key}"]`).forEach(e => { e.textContent = mb(a.s); });
      $$(`[data-rel-name="${key}"]`).forEach(e => { e.textContent = a.n; });
      $$(`[data-rel-href="${key}"]`).forEach(e => { e.href = a.u; });
    }
    return rel;
  };
})();
