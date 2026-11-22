// Turns raw numbers into things you can picture. Used by the wave debriefs,
// the end screen and the logbook.

import { fmtDiameter, fmtDate } from './util.js';

const AU_KM = 149597870.7;
const EARTH_D_KM = 12742;
const GEO_KM = 42164; // geostationary orbit radius from Earth's center
const GPS_KM = 26560; // GPS orbit radius from Earth's center
const NYC_LA_KM = 3940;

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
  if (ratio < 1.4) return `about the size of ${ref.one}`;
  return `about ${Math.round(ratio)} ${ref.many} ${ref.dim}`;
}

export function speedCompare(v) {
  const secs = NYC_LA_KM / v;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  const kmh = nice(v * 3600);
  return { kmh, nycla: m ? `${m}m ${s}s` : `${s}s` };
}

// Where it passed, in terms you can feel.
export function distanceCompare(o) {
  const km = o.au * AU_KM;
  let ref;
  if (km < GPS_KM) ref = 'inside the orbits of GPS satellites';
  else if (km < GEO_KM) ref = 'inside the ring of geostationary satellites';
  else if (o.ld < 1) ref = 'closer than the Moon';
  else ref = `${o.ld < 10 ? o.ld.toFixed(1) : Math.round(o.ld)}× the distance to the Moon`;
  // Scale model: Earth as a 24 cm basketball.
  const ball = (km / EARTH_D_KM) * 0.24;
  const ballTxt = ball < 1 ? `${Math.round(ball * 100)} cm` : ball < 1000 ? `${Math.round(ball)} m` : `${(ball / 1000).toFixed(1)} km`;
  const kmTxt = nice(km);
  return { ref, km: kmTxt, ball: ballTxt };
}

// Rough impact energy: stony density, entry speed boosted by Earth's gravity.
export function impact(o) {
  const r = o.d / 2;
  const mass = 2600 * (4 / 3) * Math.PI * r ** 3;
  const v = Math.sqrt(o.v ** 2 + 11.2 ** 2) * 1000;
  const mt = (0.5 * mass * v * v) / 4.184e15;
  const kt = mt * 1000;
  const hiro = kt / 15;
  let energy;
  if (mt >= 1) energy = `${nice(mt)} megatons of TNT`;
  else energy = `${nice(kt)} kilotons of TNT`;
  const hiroTxt = hiro < 1 ? 'less than a Hiroshima bomb' : Math.round(hiro) === 1 ? 'about one Hiroshima bomb' : `about ${hiro < 10 ? Math.round(hiro) : nice(hiro)} Hiroshima bombs`;
  let effect;
  if (o.d < 10) effect = 'It would most likely burn up as a brilliant fireball.';
  else if (o.d < 30) effect = 'Likely an airburst, like Chelyabinsk in 2013, which shattered windows across a city.';
  else if (o.d < 100) effect = 'Tunguska class: the 1908 blast flattened about 2,000 km² of Siberian forest.';
  else if (o.d < 1000) effect = 'Enough to devastate a region.';
  else effect = 'An impact this size would have global consequences.';
  return { energy, hiro: hiroTxt, effect };
}

export function whenText(o, mode) {
  const t = Date.parse(o.t);
  const now = Date.now();
  const time = o.t.slice(11, 16);
  if (mode === 'today') return t < now ? `Passed Earth today at ${time} UTC.` : `Passes Earth today at ${time} UTC.`;
  const year = new Date(t).getUTCFullYear();
  const diff = Math.round((t - now) / (365.25 * 86400000));
  if (diff > 0) return `Forecast: passes Earth on ${fmtDate(o.t)}, ${diff} year${diff === 1 ? '' : 's'} from now.`;
  if (diff === 0) return `Passed Earth on ${fmtDate(o.t)}.`;
  return `Passed Earth on ${fmtDate(o.t)}, ${-diff} year${diff === -1 ? '' : 's'} ago${year < 1990 ? '. Its orbit lets astronomers work out past passes like this one' : ''}.`;
}

// The line that connects what you felt in the game to the real thing.
export function gameplayLine(item, mode) {
  const { o, status, hits } = item;
  const size = fmtDiameter(o).replace('≈', '');
  if (status === 'hit') {
    let h = 'You intercepted it.';
    if (hits) h = hits <= 6 ? `Only ${hits} hits: it's just ${size} across.` : `It took ${hits} hits because it's ${size} across.`;
    return o.v >= 18 ? `${h} It came in fast because it really is fast.` : h;
  }
  if (status === 'miss') {
    return `It slipped past you, but in reality it missed Earth by ${o.ld < 1 ? `${distanceCompare(o).km} km` : `${o.ld.toFixed(1)} lunar distances`}. No shield needed.`;
  }
  return `You didn't reach this one.`;
}

export function facts(o) {
  const sz = sizeCompare(o.d);
  const sp = speedCompare(o.v);
  const di = distanceCompare(o);
  const im = impact(o);
  const rows = [
    ['SIZE', `${fmtDiameter(o)}, ${sz}.${o.dEst ? ' Estimated from how bright it looks: a darker rock would be bigger.' : ''}`],
    ['SPEED', `${o.v.toFixed(1)} km/s (${sp.kmh} km/h). New York to LA in ${sp.nycla}.`],
    ['MISS', `${di.km} km: ${di.ref}. If Earth were a basketball, this passed ${di.ball} away.`],
    ['IF IT HIT', `Roughly ${im.energy}, ${im.hiro}. ${im.effect}`],
  ];
  if (o.pha) rows.push(['HAZARD', 'Flagged "potentially hazardous": big enough, and its orbit comes close enough to ours, that astronomers keep watching it.']);
  return rows;
}

// One per wave, in order.
export const DID_YOU_KNOW = {
  today: [
    "Today's waves follow the real data: the farthest flybys come first, and the closest one is the finale.",
    'Bigger rocks take more hits. Their health comes straight from their real diameter.',
    'One lunar distance (LD) is 384,400 km, the average distance to the Moon.',
    'Earth itself moves around the Sun at about 30 km/s, faster than most of these asteroids pass us.',
    'A size marked ≈ is estimated from brightness. Asteroids range from coal-dark to bright, so the true size can differ quite a bit.',
    "In 2022, NASA's DART spacecraft hit the asteroid Dimorphos on purpose and changed its orbit. Planetary defense is real.",
    'This level rebuilds every night from NASA/JPL\'s Center for Near-Earth Object Studies. Tomorrow\'s sky will be different.',
  ],
  history: [
    'These waves are in time order. You are flying through every close flyby on this calendar date from 1900 to 2100.',
    'Most flybys before the 1990s went unseen. Astronomers worked out these past passes later from the asteroids\' orbits.',
    'Future dates are forecasts. Orbits can be predicted for decades, and they get refined with each new observation.',
    'Bigger rocks take more hits. Their health comes straight from their real diameter.',
    'One lunar distance (LD) is 384,400 km, the average distance to the Moon.',
    "In 2022, NASA's DART spacecraft hit the asteroid Dimorphos on purpose and changed its orbit. Planetary defense is real.",
    'Most of these were only discovered recently, as sky surveys got better at finding small, dark rocks.',
  ],
  legends: [
    'Legends are famous real flybys, in time order, from 2004 to Apophis in 2029.',
    'Bigger rocks take more hits. Their health comes straight from their real diameter.',
    '"Potentially hazardous" means larger than about 140 m, on an orbit that comes within 7.5 million km of Earth\'s.',
    "In 2022, NASA's DART spacecraft hit the asteroid Dimorphos on purpose and changed its orbit. Planetary defense is real.",
    'One lunar distance (LD) is 384,400 km, the average distance to the Moon.',
    'Earth moves around the Sun at about 30 km/s, faster than most asteroids pass us.',
    'Asteroid orbits are tracked by NASA/JPL, with new observations reported from observatories around the world.',
  ],
};
