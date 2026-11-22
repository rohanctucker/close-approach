// The learning layer: turns raw numbers into things you can picture, and asks
// one "Intel Check" question per wave (predict first, then see the answer).
//
// Reference facts used here were checked against NASA/JPL, ESA and other
// published sources; see README "Fact sources".

import { fmtDiameter, fmtDate, label, makeRng } from './util.js';

const AU_KM = 149597870.7;
const LD_KM = 384400; // average Earth–Moon distance
const EARTH_D_KM = 12742;
const GEO_KM = 42164; // geostationary orbit radius, measured from Earth's center
const GPS_KM = 26560; // GPS orbit radius, measured from Earth's center
const NYC_LA_KM = 3940;
const BALL_M = 0.24; // basketball diameter
const MOON_AT_BALL_M = (LD_KM / EARTH_D_KM) * BALL_M; // ≈ 7.2 m

export const centerKm = (o) => o.au * AU_KM;

const SIZES = [
  { m: 4.5, one: 'a car', many: 'cars', dim: 'long' },
  { m: 12, one: 'a school bus', many: 'school buses', dim: 'long' },
  { m: 25, one: 'a blue whale', many: 'blue whales', dim: 'long' },
  { m: 93, one: 'the Statue of Liberty (pedestal included)', many: 'Statues of Liberty', dim: 'tall' },
  { m: 110, one: 'a football field', many: 'football fields', dim: 'long' },
  { m: 330, one: 'the Eiffel Tower', many: 'Eiffel Towers', dim: 'tall' },
  { m: 443, one: 'the Empire State Building', many: 'Empire State Buildings', dim: 'tall' },
  { m: 828, one: 'the Burj Khalifa', many: 'Burj Khalifas', dim: 'tall' },
  { m: 4000, one: 'Central Park', many: 'Central Parks', dim: 'long' },
  { m: 8849, one: 'Mount Everest', many: 'Mount Everests', dim: 'tall' },
];

// Round big numbers to something readable: 7,798 -> 7,800; 18,642,887 -> 18.6 million.
export function nice(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`;
  if (n >= 1000) {
    const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
    return (Math.round(n / mag) * mag).toLocaleString('en-US');
  }
  return n >= 10 ? Math.round(n).toString() : n.toFixed(1);
}

export function sizeCompare(d) {
  let ref = SIZES[0];
  for (const s of SIZES) if (s.m <= d * 1.3) ref = s;
  const ratio = d / ref.m;
  if (ratio < 0.75) return `smaller than ${ref.one}`;
  if (ratio < 1.25) return `about the size of ${ref.one}`;
  if (ratio < 1.75) return `a bit bigger than ${ref.one}`;
  return `about ${Math.round(ratio)} ${ref.many} ${ref.dim}`;
}

function fmtDuration(secs) {
  if (secs < 90) return `${Math.max(5, Math.round(secs / 5) * 5)} seconds`;
  if (secs < 5400) return `${Math.round(secs / 60)} minutes`;
  return `${Math.round(secs / 3600)} hours`;
}

export function speedCompare(v) {
  const secs = NYC_LA_KM / v;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return { kmh: nice(v * 3600), nycla: m ? `${m}m ${s}s` : `${s}s`, secs };
}

function fmtBall(m) {
  const two = (x) => Number(x.toPrecision(2)).toLocaleString('en-US');
  if (m < 1) return `${m * 100 < 10 ? (m * 100).toFixed(1) : two(m * 100)} cm`;
  if (m < 1000) return `${m < 10 ? m.toFixed(1) : two(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Where it passed, in terms you can feel. Distances are from Earth's center,
// which is how JPL reports close approaches.
export function distanceCompare(o) {
  const km = centerKm(o);
  let ref;
  if (km < GPS_KM) ref = 'inside the orbits of GPS satellites';
  else if (km < GEO_KM) ref = 'inside the ring of geostationary satellites';
  else if (o.ld < 1) ref = 'closer than the Moon';
  else ref = `${o.ld < 10 ? o.ld.toFixed(1) : Math.round(o.ld)}× the distance to the Moon`;
  const ballM = (km / EARTH_D_KM) * BALL_M;
  return { ref, km: nice(km), ball: fmtBall(ballM), ballM };
}

// Rough impact energy for a stony asteroid (2,600 kg/m³). Entry speed is its
// speed far from Earth (v_inf) combined with Earth's escape velocity (11.2 km/s).
export function impact(o) {
  const r = o.d / 2;
  const mass = 2600 * (4 / 3) * Math.PI * r ** 3;
  const vinf = o.vi ?? o.v;
  const v = Math.sqrt(vinf ** 2 + 11.2 ** 2) * 1000;
  const mt = (0.5 * mass * v * v) / 4.184e15;
  const kt = mt * 1000;
  const hiro = kt / 15;
  const energy = mt >= 1 ? `${nice(mt)} megatons of TNT` : `${nice(kt)} kilotons of TNT`;
  const hiroTxt = hiro < 1 ? 'less than a Hiroshima bomb' : Math.round(hiro) === 1 ? 'about one Hiroshima bomb' : `about ${hiro < 10 ? Math.round(hiro) : nice(hiro)} Hiroshima bombs`;
  return { energy, hiro: hiroTxt, effect: IMPACT[impactClass(o.d)].effect };
}

// Short version for the in-game flash when a real asteroid slips past.
export function impactShort(o) {
  const r = o.d / 2;
  const mass = 2600 * (4 / 3) * Math.PI * r ** 3;
  const v = Math.sqrt((o.vi ?? o.v) ** 2 + 11.2 ** 2) * 1000;
  const hiro = (0.5 * mass * v * v) / 4.184e15 / 0.015;
  if (o.d < 10) return 'IF IT HIT: A FIREBALL';
  return `IF IT HIT: ≈${hiro < 10 ? Math.round(hiro) : nice(hiro).toUpperCase()} HIROSHIMA${Math.round(hiro) === 1 ? '' : 'S'}`;
}

const IMPACT = [
  { option: 'Burn up as a bright fireball', effect: 'It would most likely burn up or break apart high in the atmosphere as a brilliant fireball.' },
  { option: 'An airburst that shatters windows across a city', effect: 'Likely an airburst like Chelyabinsk in 2013: an ~18 m rock whose shock wave shattered windows across the city and injured about 1,500 people, mostly from flying glass.' },
  { option: 'Flatten a forest area the size of a big city', effect: 'Tunguska class: in 1908 a stony asteroid about 50–60 m wide exploded over Siberia and flattened about 80 million trees across 2,150 km².' },
  { option: 'Devastate a whole region', effect: 'Big enough to devastate a region. NASA is working to find 90% of near-Earth asteroids 140 m and larger for exactly this reason.' },
  { option: 'Global consequences', effect: 'An impact this size would have global consequences. More than 90% of near-Earth asteroids this big have already been found.' },
];
function impactClass(d) {
  return d < 10 ? 0 : d < 30 ? 1 : d < 100 ? 2 : d < 1000 ? 3 : 4;
}

export function whenText(o, mode, refDate) {
  const t = Date.parse(o.t);
  const now = Date.now();
  const time = o.t.slice(11, 16);
  if (mode === 'today') {
    const verb = t < now ? 'Passed' : 'Passes';
    return o.t.slice(0, 10) === refDate ? `${verb} Earth today at ${time} UTC.` : `${verb} Earth on ${fmtDate(o.t)} at ${time} UTC.`;
  }
  const year = new Date(t).getUTCFullYear();
  const diff = Math.round((t - now) / (365.25 * 86400000));
  if (diff > 0) return `Forecast: passes Earth on ${fmtDate(o.t)}, ${diff} year${diff === 1 ? '' : 's'} from now.`;
  if (diff === 0) return `Passed Earth on ${fmtDate(o.t)}.`;
  return `Passed Earth on ${fmtDate(o.t)}, ${-diff} year${diff === -1 ? '' : 's'} ago${year < 1990 ? '. Astronomers worked out this pass later from its orbit' : ''}.`;
}

// The line that connects what you felt in the game to the real thing.
export function gameplayLine(item) {
  const { o, status, hits } = item;
  const size = fmtDiameter(o).replace('≈', '');
  if (status === 'hit') {
    let h = 'You intercepted it.';
    if (hits) h = hits <= 6 ? `Only ${hits} hits: it's just ${size} across.` : `It took ${hits} hits because it's ${size} across.`;
    return o.v >= 18 ? `${h} It came in fast because it really is fast.` : h;
  }
  if (status === 'miss') {
    const d = o.ld < 1 ? `${distanceCompare(o).km} km from Earth's center` : `${o.ld.toFixed(1)} lunar distances away`;
    return `It slipped past you, but the real one passed ${d}. No shield needed.`;
  }
  return "You didn't reach this one.";
}

export function facts(o) {
  const sp = speedCompare(o.v);
  const di = distanceCompare(o);
  const im = impact(o);
  const rows = [
    ['SIZE', `${fmtDiameter(o)}, ${sizeCompare(o.d)}.${o.dEst ? ' Estimated from how bright it looks, so a darker rock would be bigger.' : ''}`],
    ['SPEED', `${o.v.toFixed(1)} km/s relative to Earth (${sp.kmh} km/h). New York to LA in ${sp.nycla}.`],
    ['MISS', `${di.km} km from Earth's center: ${di.ref}. If Earth were a basketball, this passed ${di.ball} away.`],
    ['IF IT HIT', `Roughly ${im.energy}, ${im.hiro}. ${im.effect}`],
  ];
  if (o.pha) rows.push(['HAZARD', 'Flagged "potentially hazardous": roughly 140 m or bigger, on an orbit that comes within 7.5 million km of Earth\'s. Astronomers keep watching these.']);
  return rows;
}

// ---------- Intel Check ----------

const QUIZ_SIZES = [
  { m: 4.5, text: 'About the size of a car' },
  { m: 12, text: 'About the size of a school bus' },
  { m: 25, text: 'About the size of a blue whale' },
  { m: 110, text: 'About the size of a football field' },
  { m: 330, text: 'About the size of the Eiffel Tower' },
  { m: 828, text: 'About the size of the Burj Khalifa' },
  { m: 4000, text: 'About the size of Central Park' },
  { m: 8849, text: 'About the size of Mount Everest' },
];

const DIST = [
  { text: 'Inside the ring of geostationary satellites', test: (o) => centerKm(o) < GEO_KM },
  { text: 'Closer than the Moon', test: (o) => o.ld < 1 },
  { text: "Between 1 and 10 times the Moon's distance", test: (o) => o.ld < 10 },
  { text: "More than 10 times the Moon's distance", test: () => true },
];

const SEQUENCE = {
  today: ['size', 'impact', 'distance', 'speed', 'ball', 'size', 'impact'],
  history: ['size', 'distance', 'impact', 'ball', 'speed', 'size', 'distance'],
  legends: ['size', 'impact', 'distance', 'ball', 'speed', 'impact', 'size'],
};

// Correct answer plus one neighbor and one farther option, so it takes real thought.
function pickOptions(list, correct, rng) {
  const near = [correct - 1, correct + 1].filter((i) => i >= 0 && i < list.length);
  const a = near[Math.floor(rng() * near.length)];
  const far = list.map((_, i) => i).filter((i) => i !== correct && i !== a);
  const farther = far.filter((i) => Math.abs(i - correct) >= 2);
  const b = (farther.length ? farther : far)[Math.floor(rng() * (farther.length || far.length))];
  return shuffle([correct, a, b], rng);
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeQuestion(items, waveIdx, mode) {
  if (!items.length) return null;
  const seq = SEQUENCE[mode] || SEQUENCE.today;
  let kind = seq[waveIdx % seq.length];
  if (kind === 'size' && items.length >= 2) kind = 'biggest';
  const subject = items.find((i) => i.boss) || items[0];
  const { o, hits, status } = subject;
  const name = label(o);
  const rng = makeRng(`q:${o.id}:${o.t}:${kind}`);
  const size = fmtDiameter(o);

  if (kind === 'biggest') {
    const pool = [...items].sort((a, b) => b.o.d - a.o.d).slice(0, 3);
    const opts = shuffle(pool, rng).map((it) => ({ text: label(it.o), correct: it === pool[0] }));
    const big = pool[0];
    return {
      kind,
      focus: 'SIZE',
      prompt: 'Which of these asteroids was the biggest?',
      hint: 'Think about which one took the most hits.',
      options: opts,
      explain: `${label(big.o)}, at ${fmtDiameter(big.o)} across. In this game, bigger rocks always take more hits${big.hits ? `: it took ${big.hits}` : ''}.`,
    };
  }

  if (kind === 'size') {
    const c = QUIZ_SIZES.reduce((best, s, i) => (Math.abs(Math.log(o.d / s.m)) < Math.abs(Math.log(o.d / QUIZ_SIZES[best].m)) ? i : best), 0);
    const idx = pickOptions(QUIZ_SIZES, c, rng);
    return {
      kind,
      focus: 'SIZE',
      prompt: `How big is ${name}?`,
      hint: hits ? (status === 'hit' ? `You needed ${hits} hits to destroy it.` : `It would have taken ${hits} hits.`) : '',
      options: idx.map((i) => ({ text: QUIZ_SIZES[i].text, correct: i === c })),
      explain: `It's ${size} across, ${sizeCompare(o.d)}. Size sets how many hits a rock takes.`,
    };
  }

  if (kind === 'impact') {
    const c = impactClass(o.d);
    const idx = pickOptions(IMPACT, c, rng);
    const im = impact(o);
    return {
      kind,
      focus: 'IF IT HIT',
      prompt: `${name} is ${size} across. If it hit Earth, what would most likely happen?`,
      hint: '',
      options: idx.map((i) => ({ text: IMPACT[i].option, correct: i === c })),
      explain: `Roughly ${im.energy}, ${im.hiro}. ${im.effect}`,
    };
  }

  if (kind === 'distance') {
    const c = DIST.findIndex((b) => b.test(o));
    const idx = pickOptions(DIST, c, rng);
    const di = distanceCompare(o);
    return {
      kind,
      focus: 'MISS',
      prompt: `How close did the real ${name} come to Earth?`,
      hint: mode === 'today' ? 'Its label showed the distance in lunar distances (LD).' : '',
      options: idx.map((i) => ({ text: DIST[i].text, correct: i === c })),
      explain: `${di.km} km from Earth's center (${o.ld.toFixed(o.ld < 10 ? 2 : 0)} lunar distances). One lunar distance is 384,400 km.`,
    };
  }

  if (kind === 'speed') {
    const sp = speedCompare(o.v);
    const choices = [sp.secs, sp.secs * 5, sp.secs / 5].map(fmtDuration);
    const unique = [...new Set(choices)];
    if (unique.length === 3) {
      const order = shuffle([0, 1, 2], rng);
      return {
        kind,
        focus: 'SPEED',
        prompt: `${name} moves at ${o.v.toFixed(1)} km/s. At that speed, how long would a trip from New York to LA take?`,
        hint: '',
        options: order.map((i) => ({ text: `About ${choices[i]}`, correct: i === 0 })),
        explain: `${sp.nycla}. That's ${sp.kmh} km/h. In the game, faster real asteroids fall faster.`,
      };
    }
    kind = 'ball';
  }

  // kind === 'ball'
  const di = distanceCompare(o);
  const opts = [di.ballM, di.ballM * 10, di.ballM / 10].map(fmtBall);
  const order = shuffle([0, 1, 2], rng);
  return {
    kind: 'ball',
    focus: 'MISS',
    prompt: `${name} passed ${o.ld < 10 ? o.ld.toFixed(2) : Math.round(o.ld)} lunar distances from Earth. If Earth were a basketball, how far away would that be?`,
    hint: '',
    options: order.map((i) => ({ text: `About ${opts[i]}`, correct: i === 0 })),
    explain: `About ${di.ball}. At basketball scale the Moon is only about ${MOON_AT_BALL_M.toFixed(1)} m away, so multiply lunar distances by ${MOON_AT_BALL_M.toFixed(1)} m.`,
  };
}

export function intelBonus(streak) {
  return 400 + 200 * Math.min(Math.max(streak - 1, 0), 2); // 400, 600, 800
}

// ---------- Did you know (one per wave) ----------

const DART = "In 2022, NASA's DART spacecraft crashed into the asteroid Dimorphos on purpose and shortened its orbit by 32 minutes. It was the first time people changed the motion of a celestial body.";
const CHELYABINSK = 'In 2013, an asteroid about 18 m wide exploded over Chelyabinsk, Russia. Nobody saw it coming, and the shock wave injured about 1,500 people, mostly from broken glass.';

export const DID_YOU_KNOW = {
  today: [
    "Today's waves follow the real data: the farthest flybys come first, and the closest one is the finale.",
    'Bigger rocks take more hits. Their health comes straight from their real diameter, and their speed from their real speed.',
    'One lunar distance (LD) is 384,400 km, the average distance to the Moon.',
    CHELYABINSK,
    'A size marked ≈ is estimated from brightness. Asteroids range from coal-dark to bright, so the true size can differ quite a bit.',
    DART,
    "This level rebuilds every night from NASA/JPL's Center for Near-Earth Object Studies. Tomorrow's sky will be different.",
  ],
  history: [
    'These waves are in time order: a selection of close flybys on this calendar date between 1900 and 2100.',
    "Most flybys before the 1990s went unseen. Astronomers worked out these past passes later from the asteroids' orbits.",
    'Future dates are forecasts. Orbits can be predicted for decades, and they get refined with each new observation.',
    'Bigger rocks take more hits. Their health comes straight from their real diameter.',
    'One lunar distance (LD) is 384,400 km, the average distance to the Moon.',
    DART,
    CHELYABINSK,
  ],
  legends: [
    'Legends are famous real flybys in time order, from Toutatis in 2004 to Apophis in 2029.',
    'Bigger rocks take more hits. Their health comes straight from their real diameter.',
    '"Potentially hazardous" means roughly 140 m or bigger, on an orbit that comes within 7.5 million km of Earth\'s.',
    DART,
    'One lunar distance (LD) is 384,400 km, the average distance to the Moon.',
    CHELYABINSK,
    'Asteroid orbits are tracked by NASA/JPL using observations reported from observatories around the world.',
  ],
};
