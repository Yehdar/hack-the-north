// ============================================================================
// PERSONA LIBRARY GENERATOR
//
// Writes src/data/personas/library.json. Run with: npm run personas
//
// Deterministic from a fixed seed, so the library is stable across machines and
// across runs. That matters more than it sounds: if the population shifts every
// time, two runs of the same idea are not comparable and the refine loop is
// measuring noise.
//
// Head count per hub is weighted by capital density rather than spread evenly,
// so the globe looks like the real world instead of a uniform sprinkle.
// ============================================================================

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "personas",
  "library.json"
);

/** mulberry32 — small, fast, and seeded, which is the only property we need. */
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20260919);
// A second stream for the figure, so adding it did not shift a single draw of
// the first — every other attribute of every persona is exactly as it was.
const figureRand = rng(20260920);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
/** Bell-ish 1..10 via three samples, so extremes are rare and the middle is
 *  crowded — which is how real populations distribute. */
const scale = (bias = 0) => {
  const base = (rand() + rand() + rand()) / 3;
  return Math.max(1, Math.min(10, Math.round(base * 10 + bias)));
};

// Single source of truth, shared with the app. Duplicating the hub list here
// is how the globe and the crowd drift apart.
const HUBS = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "hubs.json"),
    "utf8"
  )
).map((h) => ({ ...h, city: h.name, n: h.personas }));

// Each persona is drawn on the globe as a mini figure, a girl or a boy, and the
// figure is decided here, explicitly, rather than guessed later from a name —
// names are a poor guide to anybody. The first name is then chosen to suit the
// figure, so the person on the globe and the name on the call card agree.
const GIRL_FIRST = [
  "Priya","Mei","Amara","Yuki","Sofia","Aisha","Ines","Hannah","Nina","Elena","Clara","Fatima","Leila","Sana",
  "Zoe","Maya","Ana","Ruth","Petra","Nadia","Grace","Iris","Alex","Jordan","Kai",
];
const BOY_FIRST = [
  "Tomas","Noah","Dmitri","Chen","Liam","Omar","Rafael","Kwame","Arjun","Diego","Jonas","Marco","Theo","Ravi",
  "Lucas","Kenji","Oscar","Felix","Hugo","Sami","Mateo","Yusuf","Alex","Jordan","Kai",
];
const LAST = [
  "Nguyen","Okafor","Silva","Kaur","Weber","Rossi","Haddad","Lindqvist","Oyelaran","Bianchi","Novak","Sharma","Costa",
  "Yamada","Fischer","Duarte","Kowalski","Mensah","Petrov","Ivanov","Torres","Ahmed","Laurent","Dube","Reyes","Kim",
  "Banerjee","Moreau","Schneider","Tanaka","Almeida","Eriksen","Mbeki","Vargas","Oconnell","Rahman","Zhao","Bergstrom",
];

const INDUSTRIES = {
  software: ["Platform Engineer","Engineering Manager","Staff Engineer","DevOps Lead","CTO","Product Manager","SRE","Security Engineer"],
  fintech: ["Risk Analyst","Payments Lead","Compliance Officer","Quant Developer","Treasury Manager","Head of Fraud"],
  healthcare: ["Clinical Informaticist","Hospital Ops Director","Health Data Analyst","Practice Manager","Biotech PM"],
  commerce: ["Head of Growth","Merchandising Lead","Supply Planner","Marketplace Ops","Retail Systems Manager"],
  manufacturing: ["Plant Systems Lead","Quality Engineer","Operations Director","Industrial Automation Lead"],
  education: ["Learning Platform Lead","Registrar Systems Manager","EdTech Product Lead","Academic IT Director"],
  logistics: ["Fleet Operations Manager","Warehouse Systems Lead","Last-Mile Analyst","Freight Ops Director"],
  media: ["Content Platform Lead","Audience Analyst","Ad Tech Engineer","Editorial Systems Manager"],
  energy: ["Grid Systems Engineer","Sustainability Analyst","Field Operations Lead","Energy Data Scientist"],
  government: ["Digital Services Lead","Procurement Officer","Civic Data Analyst","Public Systems Architect"],
};

const SENIORITY = ["IC", "IC", "Senior", "Senior", "Senior", "Lead", "Lead", "Director", "Exec"];
const GENERATIONS = [
  { name: "Gen Z", range: [22, 27] },
  { name: "Millennial", range: [28, 41] },
  { name: "Millennial", range: [28, 41] },
  { name: "Gen X", range: [42, 56] },
];
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000-5000", "5000+"];
const INTERESTS = [
  "Running","Cycling","Cooking","Chess","Photography","Hiking","Board games","Woodworking","Climbing","Jazz",
  "Open source","Gardening","Sailing","Pottery","Language learning","Cold water swimming","Baking","Motorsport",
];

/** Seniority is the dominant input to budget authority — that relationship
 *  must be real or the "who can actually sign" signal is noise. */
const AUTHORITY_BY_SENIORITY = { IC: -3.5, Senior: -1.5, Lead: 0.5, Director: 2.0, Exec: 3.5 };


/**
 * Position i of n around a hub, on a sunflower spiral.
 *
 * Golden angle between successive points, radius growing as sqrt(i) so density
 * stays even rather than crowding the centre. Longitude is divided by cos(lat)
 * because degrees of longitude get narrower toward the poles — without that,
 * Stockholm's crowd looks squashed and Lagos's looks stretched.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function spiralOffset(hub, i) {
  // Big hubs spread wider instead of packing denser.
  const maxRadius = 3.4 + Math.sqrt(hub.n) * 1.5;
  const radius = maxRadius * Math.sqrt((i + 0.5) / hub.n);
  const angle = i * GOLDEN_ANGLE;

  // A touch of noise so it reads as a city rather than a mathematical pattern.
  const wobble = 0.55;
  const dLat = radius * Math.sin(angle) + (rand() - 0.5) * wobble;
  const dLon = radius * Math.cos(angle) + (rand() - 0.5) * wobble;

  const latScale = Math.max(0.35, Math.cos((hub.lat * Math.PI) / 180));

  return {
    lat: +Math.max(-82, Math.min(82, hub.lat + dLat)).toFixed(3),
    lon: +(((hub.lon + dLon / latScale + 540) % 360) - 180).toFixed(3),
  };
}

const personas = [];
let id = 1;

for (const hub of HUBS) {
  for (let i = 0; i < hub.n; i++) {
    const industry = pick(Object.keys(INDUSTRIES));
    const seniority = pick(SENIORITY);
    const gen = pick(GENERATIONS);
    const age = between(gen.range[0], gen.range[1]);
    const tilt = hub.tilt ?? {};
    const figure = figureRand() < 0.5 ? "girl" : "boy";

    personas.push({
      id: id++,
      // One draw from the main stream, as the single name list took before.
      name: `${pick(figure === "girl" ? GIRL_FIRST : BOY_FIRST)} ${pick(LAST)}`,
      figure,
      title: pick(INDUSTRIES[industry]),
      hubId: hub.id,
      // Placed on a sunflower spiral around the hub rather than jittered
      // randomly. Random offsets clump — you get dense knots and bare patches,
      // and at 34 personas in one city that reads as a smear rather than a
      // population. A golden-angle spiral spreads them evenly by construction,
      // and the radius grows with headcount so a big hub covers more ground
      // instead of packing tighter.
      location: {
        city: hub.city,
        country: hub.country,
        ...spiralOffset(hub, i),
      },
      demographics: { generation: gen.name, ageRange: `${age}-${age + 5}` },
      professional: {
        seniority,
        industry,
        companySize: pick(COMPANY_SIZES),
        yearsExperience: Math.max(1, age - 22),
      },
      psychographics: {
        techAdoption: scale(tilt.techAdoption ?? 0),
        riskTolerance: scale(tilt.riskTolerance ?? 0),
        priceSensitivity: scale(tilt.priceSensitivity ?? 0),
        influenceScore: scale(tilt.influenceScore ?? 0),
        brandLoyalty: scale(tilt.brandLoyalty ?? 0),
        budgetAuthority: scale((tilt.budgetAuthority ?? 0) + AUTHORITY_BY_SENIORITY[seniority]),
        painTolerance: scale(tilt.painTolerance ?? 0),
      },
      interests: Array.from({ length: between(2, 4) }, () => pick(INTERESTS)).filter(
        (v, idx, a) => a.indexOf(v) === idx
      ),
    });
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(personas));

const byHub = {};
for (const p of personas) byHub[p.hubId] = (byHub[p.hubId] ?? 0) + 1;

console.log(`${personas.length} personas -> ${OUT}`);
console.log("per hub:", byHub);
const auth = personas.filter((p) => p.psychographics.budgetAuthority >= 7).length;
console.log(`${auth} with real budget authority (${((auth / personas.length) * 100).toFixed(0)}%)`);
