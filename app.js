(() => {
  // Lobby TV. Slides are built once. One animation loop, no per-slide listeners.
  // Words come from slides.json, with the copy in config.js used when that
  // file cannot be loaded. Reviews and the review code are skipped while empty.
  'use strict';

  const params = new URLSearchParams(location.search);
  const cfg = window.LOBBY || {};
  const CURSOR_IDLE_MS = 3000;
  const WEATHER_MS = 30 * 60 * 1000;

  function clamp(n, min, max, fallback) {
    n = Number(n);
    if (!isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function num(key, fallback, min, max) {
    if (!params.has(key)) return fallback;
    return clamp(params.get(key), min, max, fallback);
  }

  const dwellMs = Math.round(num('dwell', clamp(cfg.slideSeconds, 1, 120, 11), 1, 120) * 1000);
  const reloadHours = num('reload', clamp(cfg.reloadHours, 0, 168, 6), 0, 168);
  const hardExtraMin = num('hardmin', 15, 0, 240);
  const fresh = params.get('fresh') === '1';
  const debug = params.get('debug') === '1';
  const assetV = window.LOBBY_ASSET || '20261027a';

  const stage = document.getElementById('stage');
  const deck = document.getElementById('deck');
  const bar = document.querySelector('#progress span');
  const counter = document.getElementById('counter');
  const pauseBtn = document.getElementById('pause');
  const mark = document.getElementById('mark');

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  if (!store.get('lb_since')) store.set('lb_since', String(Date.now()));
  store.set('lb_loads', String((Number(store.get('lb_loads')) || 0) + 1));

  const booted = Date.now();
  const boundaryAt = reloadHours > 0 ? booted + reloadHours * 3600 * 1000 : 0;
  const hardAt = boundaryAt ? boundaryAt + hardExtraMin * 60 * 1000 : 0;

  const active = [];
  const pub = {
    index: 0,
    count: 0,
    id: '',
    ids: [],
    paused: false,
    shows: 0,
    frames: 0,
    weather: 'hidden',
    pendingReload: ''
  };
  window.__lobby = pub;

  let index = -1;
  let shows = 0;
  let paused = params.get('pause') === '1';
  let pausedAt = paused ? Date.now() : 0;
  let reloading = false;
  let reloadDue = false;
  let pendingReload = '';
  let rafId = 0;
  let wakeLock = null;
  let lastWakeAt = 0;
  let lastClockAt = 0;
  let lastBarAt = 0;
  let lastPct = '';
  let lastDebugAt = 0;
  let lastWeatherAt = 0;
  let weatherBusy = false;
  let slideStartedAt = Date.now();
  let cursorAt = 0;
  let hiddenAt = 0;
  let reviewPos = 0;
  let reviews = [];
  let dateEl = null;
  let clockEl = null;
  let weatherEl = null;
  let quoteEl = null;
  let whoEl = null;
  let starRow = null;
  let starNodes = [];
  let dbg = null;

  let timeFmt;
  let dateFmt;
  try {
    const zone = cfg.timezone || 'America/New_York';
    timeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
    dateFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    timeFmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
    dateFmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }

  const ICONS = {
    heating: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 6c.3 5.2 7.2 8.2 7.6 15.6C32.2 28.8 29 34 24 34s-8.2-5.2-7.6-12.4C16.8 14.2 23.6 11.2 24 6z"/><path d="M24 34c-1.2 2.4-1.4 4.2-.6 6.2 2.2-1.2 4.4-1.2 6.4.2-.6-2.6-.2-4.6 1-6.6"/><path d="M18.5 41.5h11"/></svg>',
    cooling: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 7v34"/><path d="M24 12.5 20.4 8.2M24 12.5l3.6-4.3M24 35.5 20.4 39.8M24 35.5l3.6 4.3"/><path d="M9.2 16.2 38.8 31.8"/><path d="M13.2 14.2l-2.2 5M13.2 14.2l5.2-.6M34.8 33.8l2.2-5M34.8 33.8l-5.2.6"/><path d="M9.2 31.8 38.8 16.2"/><path d="M13.2 33.8l5.2.6M13.2 33.8l-2.2-5M34.8 14.2l-5.2-.6M34.8 14.2l2.2 5"/><circle cx="24" cy="24" r="2.1" fill="currentColor" stroke="none"/></svg>',
    plumbing: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 6c7.2 9 12 15.2 12 22.2A12 12 0 0 1 12 28.2C12 21.2 16.8 15 24 6z"/></svg>',
    plans: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="13" y="12" width="22" height="28" rx="3"/><rect x="19" y="8" width="10" height="7" rx="2"/><path d="M18 27.5 22.2 31.5 31 21.5"/></svg>',
    generic: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="24" cy="24" r="10"/></svg>'
  };

  const STAR_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.7 12.4 6.7l5.5.8-4 3.9.9 5.4L10 14.4 5.2 16.8l.9-5.4-4-3.9 5.5-.8z"/></svg>';

  function note(msg) {
    store.set('lb_err', new Date().toLocaleTimeString() + ' ' + msg);
  }

  function asset(path) {
    return path + '?v=' + encodeURIComponent(assetV);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function textOr(block, key, fallback) {
    if (block && typeof block[key] === 'string' && block[key].trim()) return block[key].trim();
    return fallback;
  }

  function publish() {
    pub.index = index < 0 ? 0 : index;
    pub.count = active.length;
    pub.id = index >= 0 && active[index] ? active[index].id : '';
    pub.paused = paused;
    pub.shows = shows;
    pub.weather = weatherEl && !weatherEl.hidden ? 'shown' : 'hidden';
    pub.pendingReload = pendingReload;
  }

  function loadJson(url) {
    function once(cache) {
      return fetch(url, { cache: cache }).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      });
    }
    return once('no-cache').catch(() => once('force-cache')).catch(() => null);
  }

  function readSlides(remote) {
    const base = cfg.slides && typeof cfg.slides === 'object' ? cfg.slides : {};
    const src = remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : {};
    function pick(key) {
      if (src[key] && typeof src[key] === 'object') return src[key];
      return base[key] || {};
    }
    return {
      welcome: pick('welcome'),
      services: pick('services'),
      towns: pick('towns'),
      reviewAsk: pick('reviewAsk'),
      cta: pick('cta')
    };
  }

  function readItems(block) {
    const items = block && Array.isArray(block.items) ? block.items : [];
    const out = [];
    for (let i = 0; i < items.length && out.length < 6; i++) {
      const item = items[i];
      if (!item || typeof item.title !== 'string' || !item.title.trim()) continue;
      const points = [];
      if (Array.isArray(item.points)) {
        for (let p = 0; p < item.points.length && points.length < 6; p++) {
          if (typeof item.points[p] === 'string' && item.points[p].trim()) points.push(item.points[p].trim());
        }
      }
      out.push({
        icon: typeof item.icon === 'string' ? item.icon : '',
        title: item.title.trim(),
        points: points
      });
    }
    return out;
  }

  function readTowns(block) {
    const places = [];
    const src = block && Array.isArray(block.places) ? block.places : [];
    for (let i = 0; i < src.length && places.length < 16; i++) {
      if (typeof src[i] === 'string' && src[i].trim()) places.push(src[i].trim());
    }
    const home = {};
    const homes = block && Array.isArray(block.home) ? block.home : [];
    for (let h = 0; h < homes.length; h++) {
      if (typeof homes[h] === 'string' && homes[h].trim()) home[homes[h].trim()] = true;
    }
    return {
      title: textOr(block, 'title', 'Proudly serving the South Shore'),
      note: block && typeof block.note === 'string' ? block.note.trim() : '',
      places: places,
      home: home
    };
  }

  function readReviews(file) {
    let list = [];
    if (Array.isArray(file)) list = file;
    else if (file && Array.isArray(file.reviews)) list = file.reviews;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || typeof item.quote !== 'string') continue;
      const quote = item.quote.replace(/\s+/g, ' ').trim();
      if (!quote) continue;
      let stars = null;
      if (item.stars != null && item.stars !== '') {
        let n = Math.round(Number(item.stars));
        if (isFinite(n) && n >= 1 && n <= 5) stars = n;
      }
      out.push({
        quote: quote,
        name: typeof item.name === 'string' ? item.name.trim() : '',
        town: typeof item.town === 'string' ? item.town.trim() : '',
        stars: stars
      });
    }
    return out;
  }

  function cleanUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 2000) return '';
    if (!/^https?:\/\/\S+$/i.test(raw)) return '';
    return raw;
  }

  function reviewLink() {
    if (params.has('reviewUrl')) return cleanUrl(params.get('reviewUrl'));
    return cleanUrl(cfg.reviewUrl);
  }

  function fillTagline(node, text) {
    const parts = String(text || '').split('|');
    for (let i = 0; i < parts.length; i++) {
      if (i) {
        node.appendChild(document.createTextNode(' '));
        node.appendChild(el('span', 'sep', '|'));
        node.appendChild(document.createTextNode(' '));
      }
      node.appendChild(document.createTextNode(parts[i].trim()));
    }
  }

  function svgIcon(name) {
    const wrap = el('div', 'icon');
    wrap.innerHTML = ICONS[name] || ICONS.generic;
    return wrap;
  }

  function addSlide(id, node) {
    node.classList.add('slide');
    node.setAttribute('data-id', id);
    node.setAttribute('aria-hidden', 'true');
    node.inert = true;
    deck.appendChild(node);
    active.push({ id: id, el: node });
  }

  function buildWelcome(block) {
    const slide = el('section');
    const inner = el('div', 'welcome');
    const logo = el('img', 'logo');
    logo.src = asset('assets/3r-logo.png');
    logo.alt = '3R Plumbing & Mechanical';
    inner.appendChild(logo);
    const h = el('h1');
    h.appendChild(el('span', 'kicker', textOr(block, 'line1', 'WELCOME TO')));
    h.appendChild(el('span', 'title', textOr(block, 'line2', '3R PLUMBING & MECHANICAL')));
    inner.appendChild(h);
    const tag = el('p', 'tagline');
    fillTagline(tag, textOr(block, 'tagline', 'People | Service | Solutions'));
    inner.appendChild(tag);
    const facts = el('div', 'facts');
    dateEl = el('div', 'fact fact-date');
    dateEl.id = 'date';
    clockEl = el('div', 'fact fact-time');
    clockEl.id = 'clock';
    weatherEl = el('div', 'fact fact-weather');
    weatherEl.id = 'weather';
    weatherEl.hidden = true;
    facts.appendChild(dateEl);
    facts.appendChild(clockEl);
    facts.appendChild(weatherEl);
    inner.appendChild(facts);
    slide.appendChild(inner);
    return slide;
  }

  function buildServices(block) {
    const slide = el('section');
    const inner = el('div', 'sheet');
    inner.appendChild(el('h2', 'headline', textOr(block, 'title', 'What we do')));
    const row = el('div', 'cards');
    const items = readItems(block);
    for (let i = 0; i < items.length; i++) {
      const card = el('article', items[i].points.length ? 'card' : 'card wide');
      card.appendChild(svgIcon(items[i].icon));
      card.appendChild(el('h3', 'card-title', items[i].title));
      if (items[i].points.length) {
        const list = el('ul', 'points');
        for (let p = 0; p < items[i].points.length; p++) {
          list.appendChild(el('li', '', items[i].points[p]));
        }
        card.appendChild(list);
      }
      row.appendChild(card);
    }
    inner.appendChild(row);
    slide.appendChild(inner);
    return slide;
  }

  function buildTowns(block) {
    const data = readTowns(block);
    const slide = el('section');
    const inner = el('div', 'sheet');
    inner.appendChild(el('h2', 'headline', data.title));
    if (data.note) inner.appendChild(el('p', 'subhead', data.note));
    const grid = el('div', 'town-grid');
    for (let i = 0; i < data.places.length; i++) {
      const name = data.places[i];
      grid.appendChild(el('div', data.home[name] ? 'town home' : 'town', name));
    }
    inner.appendChild(grid);
    slide.appendChild(inner);
    return slide;
  }

  function buildReviews() {
    const slide = el('section');
    const inner = el('div', 'review');
    const qmark = el('div', 'qmark', '\u201C');
    qmark.setAttribute('aria-hidden', 'true');
    starRow = el('div', 'stars');
    starNodes = [];
    for (let i = 0; i < 5; i++) {
      const star = el('span', 'star');
      star.innerHTML = STAR_SVG;
      starRow.appendChild(star);
      starNodes.push(star);
    }
    starRow.hidden = true;
    quoteEl = el('p', 'quote xl');
    whoEl = el('p', 'who');
    whoEl.hidden = true;
    inner.appendChild(qmark);
    inner.appendChild(starRow);
    inner.appendChild(quoteEl);
    inner.appendChild(whoEl);
    slide.appendChild(inner);
    return slide;
  }

  function makeQr(url) {
    if (typeof qrcode !== 'function') return '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createSvgTag({
        cellSize: 10,
        margin: 40,
        scalable: true,
        alt: 'Code to leave a review'
      });
    } catch (e) {
      note('qr ' + e);
      return '';
    }
  }

  function buildQr(block, url) {
    const svg = makeQr(url);
    if (!svg) return null;
    const slide = el('section');
    const inner = el('div', 'ask');
    const copy = el('div', 'ask-copy');
    copy.appendChild(el('h2', 'headline ask-title', textOr(block, 'title', 'Leave us a review')));
    copy.appendChild(el('p', 'hint', textOr(block, 'hint', 'Scan the code to share your experience')));
    const frame = el('div', 'qr-frame');
    frame.innerHTML = svg;
    inner.appendChild(copy);
    inner.appendChild(frame);
    slide.appendChild(inner);
    return slide;
  }

  function buildCta(block) {
    const slide = el('section');
    const inner = el('div', 'cta');
    const logo = el('img', 'logo logo-small');
    logo.src = asset('assets/3r-logo.png');
    logo.alt = '';
    logo.setAttribute('aria-hidden', 'true');
    inner.appendChild(logo);
    inner.appendChild(el('h2', 'headline', textOr(block, 'title', 'Questions? Ask us today')));
    const phone = String(cfg.phone || '').trim();
    if (phone) {
      const node = el('p', 'phone', phone);
      node.id = 'phone';
      inner.appendChild(node);
    }
    slide.appendChild(inner);
    return slide;
  }

  function quoteClass(text) {
    const n = text.length;
    if (n > 280) return 'quote sm';
    if (n > 180) return 'quote md';
    if (n > 100) return 'quote lg';
    return 'quote xl';
  }

  function paintReview() {
    if (!reviews.length || !quoteEl) return;
    const item = reviews[reviewPos];
    reviewPos = (reviewPos + 1) % reviews.length;
    quoteEl.className = quoteClass(item.quote);
    quoteEl.textContent = item.quote;
    const who = item.name && item.town ? item.name + ' \u00b7 ' + item.town : (item.name || item.town || '');
    whoEl.textContent = who;
    whoEl.hidden = !who;
    if (starRow) {
      for (let i = 0; i < starNodes.length; i++) {
        starNodes[i].classList.toggle('on', item.stars != null && i < item.stars);
      }
      starRow.hidden = item.stars == null;
    }
  }

  function weatherLabel(code) {
    const n = Number(code);
    if (!isFinite(n)) return '';
    if (n === 0) return 'Clear';
    if (n === 1) return 'Mostly clear';
    if (n === 2) return 'Partly cloudy';
    if (n === 3) return 'Overcast';
    if (n === 45 || n === 48) return 'Fog';
    if (n >= 51 && n <= 57) return 'Drizzle';
    if (n >= 61 && n <= 67) return 'Rain';
    if (n >= 71 && n <= 77) return 'Snow';
    if (n >= 80 && n <= 82) return 'Showers';
    if (n === 85 || n === 86) return 'Snow showers';
    if (n >= 95) return 'Thunderstorms';
    return '';
  }

  function hideWeather() {
    if (!weatherEl) return;
    weatherEl.hidden = true;
    weatherEl.textContent = '';
    publish();
  }

  function showWeather(temp, code) {
    if (!weatherEl || !isFinite(temp)) {
      hideWeather();
      return;
    }
    const place = cfg.weather && cfg.weather.place ? String(cfg.weather.place) : 'Norwell';
    const label = weatherLabel(code);
    let text = place + '  \u00b7  ' + Math.round(temp) + '\u00b0';
    if (label) text += '  \u00b7  ' + label;
    weatherEl.textContent = text;
    weatherEl.hidden = false;
    publish();
  }

  function loadWeather() {
    if (weatherBusy) return;
    lastWeatherAt = Date.now();
    if (!cfg.weather) {
      hideWeather();
      return;
    }
    const lat = Number(cfg.weather.latitude);
    const lon = Number(cfg.weather.longitude);
    if (!isFinite(lat) || !isFinite(lon)) {
      hideWeather();
      return;
    }
    weatherBusy = true;
    const tz = encodeURIComponent(cfg.timezone || 'America/New_York');
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat
      + '&longitude=' + lon
      + '&current=temperature_2m,weather_code'
      + '&temperature_unit=fahrenheit'
      + '&timezone=' + tz;
    fetch(url).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    }).then((data) => {
      const cur = data && data.current;
      if (!cur) throw new Error('shape');
      showWeather(Number(cur.temperature_2m), cur.weather_code);
    }).catch(() => {
      hideWeather();
    }).then(() => {
      weatherBusy = false;
    });
  }

  function paintClock(wall) {
    if (!clockEl || !dateEl) return;
    if (lastClockAt && wall - lastClockAt < 1000) return;
    lastClockAt = wall;
    const now = new Date();
    const t = timeFmt.format(now);
    const d = dateFmt.format(now);
    if (clockEl.textContent !== t) clockEl.textContent = t;
    if (dateEl.textContent !== d) dateEl.textContent = d;
  }

  function paintProgress(wall) {
    if (wall - lastBarAt < 200) return;
    lastBarAt = wall;
    const elapsed = Math.max(0, wall - slideStartedAt);
    const pct = dwellMs ? Math.min(100, (100 * elapsed) / dwellMs) : 0;
    const rounded = (pct + 0.05).toFixed(1);
    if (rounded === lastPct) return;
    lastPct = rounded;
    bar.style.width = rounded + '%';
  }

  function nextIndex() {
    if (!active.length) return 0;
    return (index + 1) % active.length;
  }

  // Full navigation. Returns false when we must stay on this page (offline).
  // The slide loop keeps going.
  function navigate(reason, resumeAt) {
    if (reloading) return true;
    if (navigator.onLine === false) {
      pendingReload = reason;
      note('offline defer ' + reason);
      publish();
      return false;
    }
    reloading = true;
    pendingReload = '';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    store.set('lb_reload_at', String(Date.now()));
    store.set('lb_reason', reason);
    if (active.length) store.set('lb_next', String(resumeAt));
    try {
      const url = new URL(location.href);
      url.searchParams.set('cb', String(Date.now()));
      location.replace(url.toString());
    } catch (e) {
      reloading = false;
      note('reload ' + e);
      publish();
      return false;
    }
    return true;
  }

  function show(n) {
    if (!active.length || reloading) return;
    const next = ((n % active.length) + active.length) % active.length;
    const prev = index;
    if (prev >= 0 && active[prev] && prev !== next) {
      active[prev].el.classList.remove('on');
      active[prev].el.setAttribute('aria-hidden', 'true');
      active[prev].el.inert = true;
      active[prev].el.style.zIndex = '1';
    }
    index = next;
    const node = active[index].el;
    node.style.zIndex = '2';
    node.classList.add('on');
    node.setAttribute('aria-hidden', 'false');
    node.inert = false;
    const id = active[index].id;
    if (mark) mark.hidden = id === 'welcome' || id === 'cta';
    if (id === 'reviews' && prev !== next) paintReview();
    slideStartedAt = Date.now();
    lastBarAt = 0;
    lastPct = '';
    bar.style.width = '0%';
    counter.textContent = (index + 1) + ' / ' + active.length;
    shows += 1;
    publish();
  }

  function advance() {
    if (!active.length || reloading) return;
    if (reloadDue && navigate('scheduled', nextIndex())) return;
    if (fresh && navigate('fresh', nextIndex())) return;
    show(index + 1);
  }

  function goBack() {
    if (!active.length || reloading) return;
    show(index - 1);
  }

  function setPauseLabel() {
    pauseBtn.textContent = paused ? '\u25b6' : '\u2161';
    pauseBtn.setAttribute('aria-label', paused ? 'Resume slideshow' : 'Pause slideshow');
  }

  function togglePause() {
    if (!paused) {
      paused = true;
      pausedAt = Date.now();
    } else {
      paused = false;
      if (pausedAt) {
        slideStartedAt += Date.now() - pausedAt;
        pausedAt = 0;
      }
    }
    setPauseLabel();
    publish();
  }

  function toggleFull() {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    if (request && request.catch) request.catch(() => {});
  }

  function startIndex() {
    // ?cb= means this load is a board reload. Resume at lb_next, not ?slide=.
    if (!params.has('cb') && params.has('slide')) {
      const q = Number(params.get('slide'));
      if (isFinite(q)) return Math.max(1, Math.floor(q)) - 1;
    }
    const raw = store.get('lb_next');
    if (raw) {
      const n = Number(raw);
      store.set('lb_next', '');
      if (isFinite(n) && n >= 0 && active.length) return n % active.length;
    }
    return 0;
  }

  function pokeCursor() {
    cursorAt = Date.now();
    if (!stage.classList.contains('awake')) stage.classList.add('awake');
  }

  async function wake() {
    if (!('wakeLock' in navigator) || document.hidden) return;
    try {
      if (wakeLock && !wakeLock.released) return;
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
  }

  function paintDebug(wall) {
    if (!dbg || wall - lastDebugAt < 1000) return;
    lastDebugAt = wall;
    const up = Math.round((wall - Number(store.get('lb_since'))) / 60000);
    dbg.textContent = 'slide: ' + (pub.id || 'none') + ' ' + (active.length ? (index + 1) + '/' + active.length : '0')
      + '\nrunning: ' + up + ' min'
      + '\npage loads: ' + store.get('lb_loads')
      + '\nweather: ' + pub.weather
      + '\npending reload: ' + (pendingReload || 'no')
      + '\nlast problem: ' + (store.get('lb_err') || 'none');
  }

  function step() {
    const wall = Date.now();
    pub.frames += 1;
    paintClock(wall);
    if (cursorAt && stage.classList.contains('awake') && wall - cursorAt > CURSOR_IDLE_MS) {
      stage.classList.remove('awake');
    }
    if (wall - lastWakeAt >= 60000) {
      lastWakeAt = wall;
      wake();
    }
    if (!lastWeatherAt || wall - lastWeatherAt >= WEATHER_MS) loadWeather();
    paintDebug(wall);
    if (boundaryAt && !reloadDue && wall >= boundaryAt) reloadDue = true;
    if (hardAt && wall >= hardAt) {
      if (navigate('hard', nextIndex())) return;
    }
    if (paused || !active.length) return;
    if (wall - slideStartedAt >= dwellMs) {
      advance();
      return;
    }
    paintProgress(wall);
  }

  function frame() {
    rafId = 0;
    if (document.hidden || reloading) return;
    step();
    if (!reloading && !document.hidden) rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (rafId || document.hidden || reloading) return;
    rafId = requestAnimationFrame(frame);
  }

  function onVisible() {
    if (document.hidden) {
      hiddenAt = Date.now();
      stage.classList.add('hold');
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
    stage.classList.remove('hold');
    if (hiddenAt) {
      const held = Date.now() - hiddenAt;
      slideStartedAt += held;
      if (pausedAt) pausedAt += held;
      hiddenAt = 0;
    }
    wake();
    if (pendingReload || (hardAt && Date.now() >= hardAt)) {
      if (navigate(pendingReload || 'hard', nextIndex())) return;
    }
    startLoop();
  }

  document.getElementById('next').addEventListener('click', () => advance());
  document.getElementById('prev').addEventListener('click', () => goBack());
  pauseBtn.addEventListener('click', togglePause);
  document.getElementById('full').addEventListener('click', toggleFull);
  addEventListener('keydown', (e) => {
    const key = e.key || '';
    if (key === 'ArrowRight' || key === ' ' || key === 'Spacebar') {
      e.preventDefault();
      advance();
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
    } else if (key === 'p' || key === 'P') {
      togglePause();
    } else if (key === 'f' || key === 'F') {
      toggleFull();
    }
  });
  stage.addEventListener('pointermove', pokeCursor);
  stage.addEventListener('pointerdown', pokeCursor);
  document.addEventListener('visibilitychange', onVisible);
  addEventListener('online', () => {
    if (reloading) return;
    if (pendingReload || (hardAt && Date.now() >= hardAt)) {
      if (navigate(pendingReload || 'hard', nextIndex())) return;
    }
    startLoop();
  });
  addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    reloading = false;
    onVisible();
  });
  window.onerror = (msg) => { note('error: ' + msg); };

  if (mark) mark.src = asset('assets/3r-logo.png');
  setPauseLabel();

  if (debug) {
    dbg = document.createElement('div');
    dbg.id = 'debug';
    document.body.appendChild(dbg);
  }

  function start(remote, reviewFile) {
    const slides = readSlides(remote);
    reviews = readReviews(reviewFile);
    addSlide('welcome', buildWelcome(slides.welcome));
    addSlide('services', buildServices(slides.services));
    addSlide('towns', buildTowns(slides.towns));
    if (reviews.length) addSlide('reviews', buildReviews());
    const link = reviewLink();
    if (link) {
      const qrSlide = buildQr(slides.reviewAsk, link);
      if (qrSlide) addSlide('review-ask', qrSlide);
    }
    addSlide('cta', buildCta(slides.cta));
    pub.ids = [];
    for (let i = 0; i < active.length; i++) pub.ids.push(active[i].id);
    paintClock(Date.now());
    if (active.length) show(startIndex());
    else counter.textContent = 'Nothing to show';
    publish();
    lastWakeAt = Date.now();
    wake();
    if (document.hidden) {
      hiddenAt = Date.now();
      stage.classList.add('hold');
    } else {
      startLoop();
    }
  }

  loadJson('slides.json').then((remote) => {
    return loadJson('reviews.json').then((reviewFile) => {
      try {
        start(remote, reviewFile);
      } catch (e) {
        note('start ' + e);
        counter.textContent = 'Display error';
      }
    });
  }).catch((e) => {
    note('load ' + e);
    try { start(null, null); } catch (err) { note('start ' + err); }
  });
})();
