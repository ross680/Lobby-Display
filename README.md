# 3R Plumbing & Mechanical — Lobby TV

Customer-facing slideshow for the entrance TV in Norwell. It runs in a browser, full screen, and keeps cycling on its own.

Warm, plain, and readable from across the room. No prices, no staff notes, and no reviews we did not actually receive.

## Pages address

The site is a normal static folder. GitHub Pages is not turned on from this project. When someone enables it (**Settings → Pages → Deploy from a branch → `main` → `/`**), the TV address is:

https://ross680.github.io/Lobby-Display/

`.nojekyll` is included so Pages serves the files as they are. Open that address on the TV and press F for fullscreen (or use the button that appears when you move the pointer).

## Edit the slides

The words live in [`slides.json`](slides.json). Change a title, a town, or a service there, then commit and push to `main`. The TV picks the file up on its own reload (every 6 hours) or when you refresh the page.

[`config.js`](config.js) holds the phone number, the review link, how long each slide stays up, and a second copy of the slides. The board uses `slides.json` when it can load it. If the network is down and that file is not in the browser cache, it uses the copy inside `config.js`. When you change the words, update both files the same way.

Each slide stays up about 11 seconds (`slideSeconds` in `config.js`, keep it between 10 and 12) and fades into the next.

Slides, in order:

1. Welcome, with the logo, tagline, Eastern Time clock, and today's Norwell weather.
2. What we do.
3. Towns on the South Shore. Names in `home` get a filled dot. That is Norwell and Pembroke.
4. Customer reviews, only when [`reviews.json`](reviews.json) has at least one real review.
5. Leave us a review, only when `reviewUrl` in `config.js` is a real http(s) link.
6. Questions, with the phone number from `config.js`.

Weather comes from Open-Meteo for Norwell (42.16, -70.79). No API key. If the lookup fails, the weather line is left off and the clock stays. The board does not show an error.

## Add reviews

`reviews.json` ships with an empty list. **The review slide is skipped until you add one.** Do not write a review a customer did not give you. Do not paste a sample quote and leave it there.

```json
{
  "reviews": [
    {
      "quote": "Paste the customer's words here.",
      "name": "First name",
      "town": "Norwell",
      "stars": 5
    }
  ]
}
```

`name`, `town`, and `stars` can be left out. `stars` is a whole number from 1 to 5. If you have several reviews, the board shows one at a time, in order, each time that slide comes around. A blank `quote` is ignored.

## Set the review link

In `config.js`, `reviewUrl` ships as `""`. **The code slide is skipped while that string is blank.**

When you have the real page (the Google review link, or whichever page you want people to open), paste it between the quotes:

```js
reviewUrl: "https://example.com/your-review-page",
```

It has to start with `http://` or `https://`. The TV draws the code in the browser from `vendor/qrcode.js`. Nothing is loaded from a CDN.

The phone number on the last slide is `phone` in the same file. It is `(781) 974-5239`.

## What to leave off the board

This TV is the first thing a customer sees. Do not add prices, or the words free, 24/7, same-day, or financing. Do not add technician names, job stats, internal jokes, or anything that is not meant for a customer.

## Controls

Right arrow or Space: next slide. Left arrow: previous. P: pause. F: fullscreen.

The pointer hides after a few seconds still. Move it and the pause and arrow buttons show up, along with the slide count.

## URL options

- `?slide=3` starts on that slide. 1 is the welcome slide. Numbers follow the slides that are actually playing, so a skipped review slide is not counted.
- `?dwell=11` is how many seconds each slide stays up (default 11, from `config.js`).
- `?reload=6` reloads the page every 6 hours, after the current slide ends. About 15 minutes later it reloads even if that slide never ends (`?hardmin=15`). `?reload=0` turns both off. The new address carries `?cb=` so the TV picks up a new copy of the page, the script, and the stylesheet instead of a cached one, and it resumes on the next slide.
- `?pause=1` starts paused.
- `?fresh=1` loads a new page for every slide. Last resort if a TV still leaks memory.
- `?debug=1` shows the slide name, uptime, and the last problem.
- `?reviewUrl=` shows the code slide for that address without editing `config.js`. The shipped file stays blank.

If the network drops, the board keeps cycling what it already has and does not reload into an error page. When the network returns, a postponed reload runs. The screen wake lock is requested again whenever the page becomes visible.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page. The `20261027a` text is the cache buster used until the timed reload supplies its own. |
| `styles.css` | Layout and color. Navy background, the blue from the logo (`#26a4cb`), orange for the phone number. |
| `app.js` | The player. One animation frame loop. Listeners and the wake lock are set up once. |
| `config.js` | Phone, review link, timing, weather, offline copy of the slides. |
| `slides.json` | The words on each slide. |
| `reviews.json` | Customer reviews. Empty on purpose. |
| `assets/3r-logo.png` | Logo. |
| `assets/fonts/` | Inter, self-hosted. License in `OFL.txt`. |
| `vendor/qrcode.js` | QR Code Generator for JavaScript, MIT, Kazuhiko Arase. |

Inter is used so the type looks the same on the TV as it does here. If a font file fails to load, the browser falls back to Segoe UI, Helvetica, or Arial.

## Checking it

From this folder, with Node and Chrome installed:

```bash
node tools/check-slides.mjs
npm install --prefix /tmp/lobby-deps puppeteer-core
node tools/soak.mjs
```

`check-slides.mjs` makes sure `slides.json` and the copy in `config.js` match, the review list is empty, the review link is blank, and the claims we do not make are not in the customer-facing files. `soak.mjs` serves the page, saves a screenshot of each slide, and cycles the board headlessly while watching the DOM size, listener count, and heap.
