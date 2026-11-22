# ☄️ Close Approach

**Defend Earth from the real asteroids passing it today.**

Close Approach is an arcade game that runs in a phone browser and is built from live NASA/JPL data. Every named asteroid is a real one, and you learn about it by playing rather than reading: size, speed and distance are things you see and feel in the game, and the words are there if you want them.

▶ **Play:** https://rohanctucker.github.io/close-approach/

## Learning by playing

The game *is* the data, so what you experience is accurate:

| Real property | What you experience |
| --- | --- |
| Diameter | How big it looks and how many hits it takes. Bigger always means more hits. |
| Speed relative to Earth | How fast it falls. Faster real asteroids always fall faster. |
| Miss distance | Its blip on the **radar**, against rings for geostationary orbit, the Moon and 10× the Moon. In Today's Sky it also sets the wave order: the closest flyby is the finale. |
| "Potentially hazardous" | Boss behavior (sheds fragments). |

There are also a few things you just see:

- **Scale in the moment.** Destroying a real asteroid flashes its size against something familiar ("≈142 m · FOOTBALL FIELD").
- **Stakes in the moment.** If one slips past, the impact point flashes what a real hit would equal ("IF IT HIT: ≈7,800 HIROSHIMAS").
- **Wave cleared card.** It shows each asteroid drawn to scale next to a car, bus, whale, football field, Eiffel Tower and so on, then **continues on its own** after 6 seconds.
- **Optional depth.** From that card you can open **Field Notes** (the full story in plain comparisons) or tap **Guess** to predict something about the asteroid for bonus points. Nothing is required.
- **Badges named after real ideas** (Inside the Moon, GEO Ring, Tunguska Stopper, Kilometer Club…) and a **logbook** of every real asteroid you've destroyed.
- **Daily streak**, because every day is a new, real sky.

Purple debris is made up, to fill the screen. Amber and red rocks are real.

### Modes

- **Today's Sky**: today's real flybys. Everyone gets the same level (same random seed), so scores are comparable.
- **On This Day**: a selection of close flybys on today's calendar date from 1900 to 2100, in time order. Future ones are forecasts.
- **Legends**: famous flybys, from Toutatis (2004) to Apophis (2029).

## Leaderboard (optional, about 2 minutes)

The leaderboard runs on Google Apps Script plus a Google Sheet (`leaderboard/Code.gs`). Until it's set up, the game hides every leaderboard feature.

1. Create a Google Sheet, then open **Extensions → Apps Script**.
2. Paste in `leaderboard/Code.gs` and save.
3. **Deploy → New deployment → Web app**, with *Execute as: Me* and *Who has access: Anyone*.
4. Paste the `/exec` URL into `site/js/config.js` and push.

How it works:

- Players type a name (2–12 letters or numbers; a basic name filter applies) the first time they post. After that, scores post automatically.
- There's a daily board for each mode, plus an all-time board for Legends. Each player keeps their best score per board.
- Guess bonuses count toward the score, so knowing your asteroids moves you up.
- The server rejects impossible scores, closed boards, too-fast runs and spam (6 posts per minute per player).
- Scores are submitted by the browser, so a determined cheater could still fake one. That's fine for friends, but it isn't a secure competition.
- It stores only the chosen name, a random player ID and the scores.

Tests: `node leaderboard/test-code.mjs`. For a local server: `node leaderboard/test-server.mjs`, then open the game with `?lb=http://localhost:8766`.

## How it's built

There's no framework and no build step: plain HTML, CSS and JavaScript modules in `site/`.

```
site/                     the game (served by GitHub Pages)
  js/game.js              waves, entities, collisions
  js/render.js            retro-vector drawing + radar
  js/learn.js             comparisons, field notes, optional guesses
  js/scale.js             to-scale size pictures (SVG)
  js/progress.js          badges, streak, logbook
  js/leaderboard.js       leaderboard client
  js/config.js            leaderboard URL
  js/data.js              loads data, with fallbacks
  js/audio.js             Web Audio synth (no audio files)
  js/main.js              screens, input, share
scripts/fetch-data.mjs    builds site/data/*.json from JPL
scripts/test-fetch.mjs    offline tests for the data pipeline
scripts/make-assets.py    regenerates icons + link-preview image
leaderboard/Code.gs       Apps Script backend
.github/workflows/deploy.yml
```

**Data pipeline.** The GitHub Action runs on every push and every night at 05:17 UTC, just after midnight in New York. It calls the [JPL SBDB Close-Approach API](https://ssd-api.jpl.nasa.gov/doc/cad.html), which needs no API key, writes `site/data/`, and deploys to Pages.

- `today.json`: today's flybys. The search widens from 0.05 au to 0.5 au until there are enough to play.
- `history/MM-DD.json`: the most interesting flybys within 0.05 au for each calendar date, 1900–2100. Rebuilt monthly and cached between runs.
- `legends.json`: the famous ones, looked up by name and date window.

If the build-time feed fails, the game falls back to NASA's NeoWs API from the browser, then to a clearly labeled simulation. It never shows a blank screen, and simulated runs never count for badges, the logbook or the leaderboard.

## Accuracy notes

- **Miss distances** are from Earth's center, the way JPL reports them (Apophis 2029: about 38,000 km from the center, or about 32,000 km above the surface).
- **Sizes marked ≈** are estimated from brightness (absolute magnitude H, assuming 14% albedo, the standard rule of thumb). Darker rocks would be bigger.
- **Impact energy** is a rough figure for a stony asteroid (2,600 kg/m³) entering at its speed far from Earth (v∞) combined with Earth's 11.2 km/s escape velocity. One Hiroshima bomb is taken as 15 kilotons.
- **Effect classes** are rough too: under 10 m, a fireball; 10–30 m, a Chelyabinsk-like airburst; 30–100 m, Tunguska class; 100 m–1 km, regional; over 1 km, global.

### Fact sources

| Claim in the game | Source |
| --- | --- |
| PHA = MOID ≤ 0.05 au and H ≤ 22 (≈140 m) | [CNEOS NEO groups](https://cneos.jpl.nasa.gov/about/neo_groups.html) |
| NASA goal: 90% of NEOs ≥140 m; >90% of ≥1 km found | [CNEOS FAQ](https://cneos.jpl.nasa.gov/faq/new.html) |
| Chelyabinsk 2013: ~18 m, ~440–500 kt, ~1,500 injured mostly by glass | [JPL](https://www.jpl.nasa.gov/news/additional-details-on-the-large-feb-15-fireball-over-russia/), [Wikipedia](https://en.wikipedia.org/wiki/Chelyabinsk_meteor) |
| Tunguska 1908: ~50–60 m, 2,150 km², 80 million trees | [Wikipedia](https://en.wikipedia.org/wiki/Tunguska_event) |
| DART shortened Dimorphos' orbit by 32 minutes | [NASA](https://www.nasa.gov/news-release/nasa-confirms-dart-mission-impact-changed-asteroids-motion-in-space) |
| Toutatis 2004: ~4.6 km, 1.55 million km, closest this century for its size | [CNEOS](https://cneos.jpl.nasa.gov/news/news144.html) |
| 2012 DA14: 27,700 km above Earth, ~16 h after Chelyabinsk, unrelated | [CNEOS](https://cneos.jpl.nasa.gov/news/fireball_130301.html) |
| Phaethon: Geminid parent; closest to the Sun of named asteroids | [Wikipedia](https://en.wikipedia.org/wiki/3200_Phaethon) |
| 2019 OK: found a day before; announced hours before | [CNEOS](https://cneos.jpl.nasa.gov/news/news203.html), [Wikipedia](https://en.wikipedia.org/wiki/2019_OK) |
| 2020 QG: 2,950 km above the Indian Ocean, a record at the time; seen 6 h later | [NASA/JPL](https://www.jpl.nasa.gov/news/tiny-asteroid-buzzes-by-earth-the-closest-flyby-on-record/) |
| 2024 YR4: passed 2 days before discovery; >1% 2032 risk in early 2025, later ruled out | [Wikipedia](https://en.wikipedia.org/wiki/2024_YR4), [NASA](https://science.nasa.gov/solar-system/asteroids/2024-yr4-facts) |
| Apophis 2029: ~32,000 km above Earth, inside GEO, naked-eye visible | [ESA](https://www.esa.int/ESA_Multimedia/Images/2021/03/Apophis_orbit_diverted_by_Earth_s_gravity), [ABC News](https://abc7news.com/post/god-chaos-asteroid-pass-close-earth-2029/18892270/) |

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

## Credits

Data: NASA/JPL Center for Near-Earth Object Studies. Fonts: Syncopate and VT323 (SIL Open Font License). Made by Rohan Tucker.
