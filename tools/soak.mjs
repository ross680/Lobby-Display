// Headless soak for the lobby board.
// Serves the folder, screenshots each slide, then cycles fast and checks
// that the DOM, listener count, and heap stay flat.
//
//   npm install --prefix /tmp/lobby-deps puppeteer-core
//   NODE_PATH=/tmp/lobby-deps/node_modules node tools/soak.mjs

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function resolvePuppeteer() {
  const listed = [
    process.env.PUPPETEER_CORE,
    fileURLToPath(new URL('../node_modules/puppeteer-core/package.json', import.meta.url)),
    '/tmp/lobby-deps/node_modules/puppeteer-core/package.json'
  ];
  for (let i = 0; i < listed.length; i++) {
    const pkg = listed[i];
    if (pkg && fs.existsSync(pkg)) {
      return pathToFileURL(path.join(path.dirname(pkg), 'lib/puppeteer/puppeteer-core.js')).href;
    }
  }
  throw new Error('Install puppeteer-core. See the comment at the top of tools/soak.mjs.');
}

const puppeteer = (await import(resolvePuppeteer())).default;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = '/opt/cursor/artifacts';
const port = 8765;
const base = 'http://127.0.0.1:' + port;
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error('FAIL: ' + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(base + '/');
      if (res.ok) return;
    } catch (e) {}
    await sleep(100);
  }
  throw new Error('server did not start');
}

async function sample(page) {
  return page.evaluate(() => {
    if (window.gc) window.gc();
    const mem = performance.memory;
    return {
      nodes: document.getElementsByTagName('*').length,
      images: document.images.length,
      deck: document.getElementById('deck').childElementCount,
      listeners: window.__probe.listeners,
      intervals: window.__probe.intervals,
      timeouts: window.__probe.timeouts,
      heap: mem ? mem.usedJSHeapSize : null,
      shows: window.__lobby.shows,
      frames: window.__lobby.frames,
      ids: window.__lobby.ids.slice(),
      id: window.__lobby.id
    };
  });
}

async function prepare(page) {
  await page.evaluateOnNewDocument(() => {
    const origAdd = EventTarget.prototype.addEventListener;
    const origInterval = window.setInterval;
    const origTimeout = window.setTimeout;
    window.__probe = { listeners: 0, intervals: 0, timeouts: 0 };
    EventTarget.prototype.addEventListener = function () {
      window.__probe.listeners += 1;
      return origAdd.apply(this, arguments);
    };
    window.setInterval = function () {
      window.__probe.intervals += 1;
      return origInterval.apply(this, arguments);
    };
    window.setTimeout = function () {
      window.__probe.timeouts += 1;
      return origTimeout.apply(this, arguments);
    };
  });
  page.on('pageerror', (err) => fail('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.indexOf('net::ERR_') !== -1 || text.indexOf('Failed to load resource') !== -1) return;
    fail('console: ' + text);
  });
}

async function open(page, url) {
  await page.goto(base + url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__lobby && window.__lobby.shows >= 1, { timeout: 10000 });
  await sleep(1100);
}

async function shoot(page, url, name, opts) {
  await open(page, url);
  if (opts && opts.weather) {
    try {
      await page.waitForFunction(() => {
        const el = document.getElementById('weather');
        return el && !el.hidden && el.textContent.indexOf('\u00b0') !== -1;
      }, { timeout: 8000 });
    } catch (e) {
      console.log('weather did not appear for ' + name);
    }
  }
  const file = path.join(artifacts, name);
  await page.screenshot({ path: file, type: 'png' });
  console.log('shot ' + file);
  return file;
}

function assertLayout(page, label) {
  return page.evaluate((label) => {
    const problems = [];
    const nodes = document.querySelectorAll('.title, .phone, .headline, .town, .card-title, .kicker, .tagline, #clock, .points li');
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      if (rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1) {
        problems.push(label + ' overflow ' + node.className + ' ' + Math.round(rect.left) + ',' + Math.round(rect.top) + ' ' + Math.round(rect.right) + ',' + Math.round(rect.bottom));
      }
      if (node.scrollWidth > node.clientWidth + 2 && node.classList.contains('title')) {
        problems.push(label + ' title scroll ' + node.scrollWidth + ' > ' + node.clientWidth);
      }
      if (node.classList.contains('phone') && node.scrollWidth > node.clientWidth + 2) {
        problems.push(label + ' phone scroll ' + node.scrollWidth + ' > ' + node.clientWidth);
      }
    });
    return problems;
  }, label);
}

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore'
});

try {
  await mkdir(artifacts, { recursive: true });
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
      '--window-size=1920,1080'
    ]
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await prepare(page);

    await shoot(page, '/?slide=1&dwell=60', 'slide_welcome.png', { weather: true });
    const welcome = await page.evaluate(() => {
      const heading = document.querySelector('[data-id="welcome"] h1').innerText.replace(/\s+/g, ' ').trim();
      const tag = document.querySelector('.tagline').innerText.replace(/\s+/g, ' ').trim();
      const date = document.getElementById('date').textContent;
      const clock = document.getElementById('clock').textContent;
      const weather = document.getElementById('weather');
      const nyDate = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      }).format(new Date());
      const nyClock = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date());
      const nyClockPrev = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date(Date.now() - 1500));
      return {
        heading: heading,
        tag: tag,
        date: date,
        nyDate: nyDate,
        clockOk: clock === nyClock || clock === nyClockPrev,
        clock: clock,
        weather: weather && !weather.hidden ? weather.textContent : '',
        ids: window.__lobby.ids.slice()
      };
    });
    console.log(JSON.stringify(welcome));
    if (welcome.heading !== 'WELCOME TO 3R PLUMBING & MECHANICAL') fail('welcome heading: ' + welcome.heading);
    if (welcome.tag !== 'People | Service | Solutions') fail('tagline: ' + welcome.tag);
    if (welcome.date !== welcome.nyDate) fail('date is not America/New_York: ' + welcome.date + ' vs ' + welcome.nyDate);
    if (!welcome.clockOk) fail('clock is not America/New_York: ' + welcome.clock);
    if (welcome.ids.join(',') !== 'welcome,services,towns,cta') fail('active slides: ' + welcome.ids.join(','));
    if (!welcome.weather || welcome.weather.indexOf('°') === -1) fail('weather missing: ' + welcome.weather);
    for (const problem of await assertLayout(page, 'welcome')) fail(problem);

    await shoot(page, '/?slide=2&dwell=60', 'slide_services.png');
    const services = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.card')).map((card) => ({
        title: card.querySelector('.card-title').textContent,
        points: Array.from(card.querySelectorAll('li')).map((li) => li.textContent)
      }));
    });
    console.log(JSON.stringify(services));
    const expected = [
      ['Heating', ['Boilers', 'Furnaces', 'Heat pumps']],
      ['Cooling', ['AC', 'Ductless']],
      ['Plumbing', ['Water heaters', 'Repairs', 'Drains']],
      ['Maintenance plans', []]
    ];
    if (JSON.stringify(services.map((s) => [s.title, s.points])) !== JSON.stringify(expected)) {
      fail('services mismatch ' + JSON.stringify(services));
    }
    for (const problem of await assertLayout(page, 'services')) fail(problem);

    await shoot(page, '/?slide=3&dwell=60', 'slide_towns.png');
    const towns = await page.evaluate(() => Array.from(document.querySelectorAll('.town')).map((node) => node.textContent));
    if (towns.join('|') !== 'Norwell|Pembroke|Hanover|Scituate|Duxbury|Marshfield|Hingham|Hanson|Rockland|Kingston') {
      fail('towns: ' + towns.join('|'));
    }
    for (const problem of await assertLayout(page, 'towns')) fail(problem);

    await shoot(page, '/?slide=4&dwell=60', 'slide_cta.png');
    const phone = await page.evaluate(() => {
      const node = document.getElementById('phone');
      return node ? node.textContent : '';
    });
    if (phone !== '(781) 974-5239') fail('phone: ' + phone);
    const cta = await page.evaluate(() => document.querySelector('[data-id="cta"] .headline').textContent);
    if (cta !== 'Questions? Ask us today') fail('cta: ' + cta);
    for (const problem of await assertLayout(page, 'cta')) fail(problem);

    await shoot(page, '/?slide=4&dwell=60&reviewUrl=' + encodeURIComponent('https://example.com/3r-review'), 'slide_review_qr.png');
    const qr = await page.evaluate(() => {
      const svg = document.querySelector('[data-id="review-ask"] svg');
      const path = svg ? svg.querySelector('path') : null;
      return {
        id: window.__lobby.id,
        ids: window.__lobby.ids.slice(),
        title: document.querySelector('.ask-title') ? document.querySelector('.ask-title').textContent : '',
        d: path ? path.getAttribute('d').length : 0
      };
    });
    console.log(JSON.stringify(qr));
    if (qr.ids.join(',') !== 'welcome,services,towns,review-ask,cta') fail('qr slides: ' + qr.ids.join(','));
    if (qr.id !== 'review-ask') fail('qr slide not showing: ' + qr.id);
    if (qr.title !== 'Leave us a review') fail('qr title: ' + qr.title);
    if (qr.d < 100) fail('qr path too small: ' + qr.d);
    for (const problem of await assertLayout(page, 'qr')) fail(problem);

    const blocked = await browser.newPage();
    await blocked.setViewport({ width: 1920, height: 1080 });
    await prepare(blocked);
    await open(blocked, '/?dwell=30&reviewUrl=' + encodeURIComponent('javascript:alert(1)'));
    const blockedIds = await blocked.evaluate(() => window.__lobby.ids.join(','));
    if (blockedIds !== 'welcome,services,towns,cta') fail('javascript review url was not skipped: ' + blockedIds);
    await blocked.close();

    const keys = await browser.newPage();
    await keys.setViewport({ width: 1280, height: 720 });
    await prepare(keys);
    await open(keys, '/?dwell=40&slide=2');
    const keyStart = await keys.evaluate(() => window.__lobby.index);
    if (keyStart !== 1) fail('slide=2 should be index 1, got ' + keyStart);
    await keys.keyboard.press('ArrowRight');
    await keys.waitForFunction(() => window.__lobby.id === 'towns');
    await keys.keyboard.press('Space');
    await keys.waitForFunction(() => window.__lobby.id === 'cta');
    await keys.keyboard.press('ArrowLeft');
    await keys.waitForFunction(() => window.__lobby.id === 'towns');
    const narrow = await assertLayout(keys, 'narrow');
    for (const problem of narrow) fail(problem);
    await keys.close();

    const offline = await browser.newPage();
    await offline.setViewport({ width: 1920, height: 1080 });
    await prepare(offline);
    await open(offline, '/?dwell=1&reload=0.003');
    const urlBefore = offline.url();
    await offline.setOfflineMode(true);
    await sleep(14000);
    const offlineState = await offline.evaluate(() => ({
      online: navigator.onLine,
      pending: window.__lobby.pendingReload,
      shows: window.__lobby.shows,
      id: window.__lobby.id
    }));
    console.log('offline ' + JSON.stringify(offlineState));
    if (offline.url() !== urlBefore) fail('offline navigation changed the url');
    if (offlineState.online !== false) fail('navigator.onLine stayed true');
    if (offlineState.shows < 5) fail('stopped cycling offline, shows=' + offlineState.shows);
    if (offlineState.pending !== 'scheduled') fail('expected deferred reload, got ' + offlineState.pending);
    await offline.setOfflineMode(false);
    await offline.close();

    const hidden = await browser.newPage();
    await hidden.setViewport({ width: 1920, height: 1080 });
    await prepare(hidden);
    await open(hidden, '/?dwell=1');
    const vis = await hidden.evaluate(async () => {
      const before = window.__lobby.frames;
      function setHidden(value) {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => (value ? 'hidden' : 'visible')
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      setHidden(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const mid = window.__lobby.frames;
      setHidden(false);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const after = window.__lobby.frames;
      delete document.hidden;
      delete document.visibilityState;
      return { before: before, mid: mid, after: after };
    });
    console.log('visibility ' + JSON.stringify(vis));
    if (vis.mid > vis.before + 2) fail('animation loop kept running while hidden');
    if (vis.after <= vis.mid) fail('animation loop did not resume');
    await hidden.close();

    const reviewsPage = await browser.newPage();
    await reviewsPage.setViewport({ width: 1920, height: 1080 });
    await prepare(reviewsPage);
    await reviewsPage.setRequestInterception(true);
    reviewsPage.on('request', (req) => {
      if (req.url().indexOf('reviews.json') !== -1) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            reviews: [
              { quote: 'Soak fixture quote.', name: 'Fixture', town: 'Norwell', stars: 5 },
              { quote: 'Second fixture quote for rotation.', name: 'Other', town: 'Hingham', stars: 4 }
            ]
          })
        });
        return;
      }
      req.continue();
    });
    await open(reviewsPage, '/?dwell=40&slide=4');
    const firstReview = await reviewsPage.evaluate(() => ({
      id: window.__lobby.id,
      quote: document.querySelector('.quote') ? document.querySelector('.quote').textContent : '',
      who: document.querySelector('.who') ? document.querySelector('.who').textContent : '',
      stars: document.querySelectorAll('.star.on').length
    }));
    console.log('review ' + JSON.stringify(firstReview));
    if (firstReview.id !== 'reviews') fail('review slide not active: ' + firstReview.id);
    if (firstReview.quote !== 'Soak fixture quote.') fail('review quote: ' + firstReview.quote);
    if (firstReview.who !== 'Fixture · Norwell') fail('review who: ' + firstReview.who);
    if (firstReview.stars !== 5) fail('review stars: ' + firstReview.stars);
    for (let n = 0; n < 5; n++) await reviewsPage.keyboard.press('ArrowRight');
    await reviewsPage.waitForFunction(() => window.__lobby.id === 'reviews' && document.querySelector('.quote').textContent.indexOf('Second') === 0);
    const second = await reviewsPage.evaluate(() => document.querySelector('.quote').textContent);
    if (second !== 'Second fixture quote for rotation.') fail('review did not rotate: ' + second);
    await reviewsPage.screenshot({ path: '/tmp/slide_reviews_fixture.png', type: 'png' });
    await reviewsPage.close();

    const soak = await browser.newPage();
    await soak.setViewport({ width: 1920, height: 1080 });
    await prepare(soak);
    await open(soak, '/?dwell=1');
    await sleep(2000);
    const a = await sample(soak);
    await sleep(15000);
    const b = await sample(soak);
    await sleep(15000);
    const c = await sample(soak);
    console.log('sample A ' + JSON.stringify(a));
    console.log('sample B ' + JSON.stringify(b));
    console.log('sample C ' + JSON.stringify(c));
    if (a.nodes !== b.nodes || b.nodes !== c.nodes) fail('DOM grew ' + a.nodes + ' -> ' + b.nodes + ' -> ' + c.nodes);
    if (a.deck !== c.deck) fail('deck children changed');
    if (a.images !== c.images) fail('image count changed');
    if (a.listeners !== b.listeners || b.listeners !== c.listeners) {
      fail('listeners grew ' + a.listeners + ' -> ' + b.listeners + ' -> ' + c.listeners);
    }
    if (a.intervals !== 0 || b.intervals !== 0 || c.intervals !== 0) fail('setInterval was used');
    if (a.timeouts !== b.timeouts || b.timeouts !== c.timeouts) {
      fail('setTimeout grew ' + a.timeouts + ' -> ' + b.timeouts + ' -> ' + c.timeouts);
    }
    if (c.shows < a.shows + 20) fail('did not advance enough slides ' + a.shows + ' -> ' + c.shows);
    if (a.heap == null || c.heap == null) fail('performance.memory unavailable');
    else {
      const growth = c.heap - a.heap;
      console.log('heap growth bytes ' + growth);
      if (growth > 5 * 1024 * 1024) fail('heap grew by ' + growth + ' bytes');
      if (c.heap - b.heap > 2 * 1024 * 1024 && b.heap - a.heap > 2 * 1024 * 1024) {
        fail('heap climbed across both intervals');
      }
    }
    await soak.close();
  } finally {
    await browser.close();
  }
} finally {
  server.kill('SIGTERM');
}

if (failures.length) {
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('soak: ok');
