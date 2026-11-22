# ☄️ Close Approach

**Defend Earth from the real asteroids passing it today.**

Close Approach is an arcade game that runs in a phone browser and is built from live NASA/JPL data. Every named asteroid is a real one. After each wave, a short debrief explains what you just fought, in terms you can picture: how big it is, how fast it moves, how close it really came, and what it would do if it hit.

▶ **Play:** https://rohanctucker.github.io/close-approach/

## How the data drives the game

| Real property | In the game |
| --- | --- |
| Diameter | How big it looks and how many hits it takes |
| Speed relative to Earth | How fast it falls |
| Miss distance | Wave order in Today's Sky (closest flyby is the finale) |
| "Potentially hazardous" | Boss behavior (sheds fragments) |

Purple debris is made up, to fill the screen. Amber and red rocks are real.

### Modes

- **Today's Sky**: today's real flybys. Everyone gets the same level (same random seed), so scores are comparable.
- **On This Day**: close flybys on today's calendar date from 1900 to 2100, in time order. Future ones are forecasts.
- **Legends**: famous flybys, from Toutatis (2004) to Apophis (2029).

Destroyed asteroids are saved to a **logbook** in the browser (localStorage).

## How it's built

There's no framework and no build step: plain HTML, CSS and JavaScript modules in `site/`.

```
site/                     the game (served by GitHub Pages)
  js/game.js              waves, entities, collisions
  js/render.js            retro-vector drawing
  js/learn.js             turns numbers into comparisons (the debriefs)
  js/data.js              loads data, with fallbacks
  js/audio.js             Web Audio synth (no audio files)
  js/main.js              screens, input, share
scripts/fetch-data.mjs    builds site/data/*.json from JPL
scripts/test-fetch.mjs    offline tests for the data pipeline
scripts/make-assets.py    regenerates icons + link-preview image
.github/workflows/deploy.yml
```

**Data pipeline.** The GitHub Action runs on every push and every night at 05:17 UTC, just after midnight in New York. It calls the [JPL SBDB Close-Approach API](https://ssd-api.jpl.nasa.gov/doc/cad.html), which needs no API key, writes `site/data/`, and deploys to Pages.

- `today.json`: today's flybys. The search widens from 0.05 au to 0.5 au until there are enough to play.
- `history/MM-DD.json`: the most interesting flybys within 0.05 au for each calendar date, 1900–2100. Rebuilt monthly and cached between runs.
- `legends.json`: the famous ones, looked up by name and date window.

If the build-time feed fails, the game falls back to NASA's NeoWs API from the browser, then to a clearly labeled simulation. It never shows a blank screen.

Sizes marked **≈** are estimated from brightness (absolute magnitude H, assuming 14% albedo). Impact energies are rough figures for a stony asteroid (2,600 kg/m³) entering at its approach speed plus Earth's escape velocity.

## One-time setup

1. In the repo, go to **Settings → Pages**, and under **Build and deployment → Source**, choose **GitHub Actions**.
2. Go to **Actions → Build & deploy → Run workflow**, or just push a commit.

The first run takes a few minutes because it builds the 200-year archive. Later runs reuse the cache.

## Run locally

```bash
cd site && python3 -m http.server 8000
# open http://localhost:8000
```

Without `site/data/` the game uses the fallbacks. To pull real data locally, run `node scripts/fetch-data.mjs` (needs Node 18+ and internet).

## Ideas for later

- Global daily leaderboard (an Apps Script web app writing to a Google Sheet would do it)
- Custom domain
- "Guess the size" mini-quiz in the debrief
- Haptics on Android (wired up for hits already) and iOS once Safari supports it

## Credits

Data: NASA/JPL Center for Near-Earth Object Studies. Fonts: Syncopate and VT323 (SIL Open Font License). Made by Rohan Tucker.
