import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const slides = JSON.parse(fs.readFileSync(new URL('../slides.json', import.meta.url), 'utf8'));
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../config.js', import.meta.url), 'utf8'), context);
const lobby = context.window.LOBBY;

assert.deepStrictEqual(JSON.parse(JSON.stringify(lobby.slides)), slides);
assert.equal(lobby.phone, '(781) 974-5239');
assert.equal(lobby.reviewUrl, '');
assert.equal(lobby.reloadHours, 6);
assert.ok(lobby.slideSeconds >= 10 && lobby.slideSeconds <= 12);
assert.equal(lobby.timezone, 'America/New_York');
assert.equal(lobby.weather.latitude, 42.16);
assert.equal(lobby.weather.longitude, -70.79);
assert.equal(slides.welcome.line1 + ' ' + slides.welcome.line2, 'WELCOME TO 3R PLUMBING & MECHANICAL');
assert.equal(slides.welcome.tagline, 'People | Service | Solutions');
assert.deepStrictEqual(
  slides.services.items.map((item) => item.title),
  ['Heating', 'Cooling', 'Plumbing', 'Maintenance plans']
);
assert.deepStrictEqual(slides.services.items[0].points, ['Boilers', 'Furnaces', 'Heat pumps']);
assert.deepStrictEqual(slides.services.items[1].points, ['AC', 'Ductless']);
assert.deepStrictEqual(slides.services.items[2].points, ['Water heaters', 'Repairs', 'Drains']);
assert.equal(slides.towns.title, 'Proudly serving the South Shore');
assert.deepStrictEqual(slides.towns.places, [
  'Norwell', 'Pembroke', 'Hanover', 'Scituate', 'Duxbury',
  'Marshfield', 'Hingham', 'Hanson', 'Rockland', 'Kingston'
]);
assert.equal(slides.reviewAsk.title, 'Leave us a review');
assert.equal(slides.cta.title, 'Questions? Ask us today');

const reviews = JSON.parse(fs.readFileSync(new URL('../reviews.json', import.meta.url), 'utf8'));
assert.deepStrictEqual(reviews, { reviews: [] });

const banned = /\b(free|financing|same-day|same day)\b|24\s*\/\s*7|24-7|\$\s*\d/i;
for (const file of ['slides.json', 'config.js', 'index.html', 'reviews.json', 'app.js', 'styles.css']) {
  const text = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.equal(banned.test(text), false, file + ' contains a claim the board does not make');
}

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.equal(/setInterval\s*\(/.test(app), false, 'app.js should not use setInterval');
assert.equal(/setTimeout\s*\(/.test(app), false, 'app.js should not use setTimeout');
assert.match(app, /requestAnimationFrame/);
assert.match(app, /wakeLock/);
assert.match(app, /visibilitychange/);

console.log('check-slides: ok');
