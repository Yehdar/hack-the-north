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

import { writeFileSync, mkdirSync } from "node:fs";
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
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
/** Bell-ish 1..10 via three samples, so extremes are rare and the middle is
 *  crowded — which is how real populations distribute. */
const scale = (bias = 0) => {
  const base = (rand() + rand() + rand()) / 3;
  return Math.max(1, Math.min(10, Math.round(base * 10 + bias)));
};

const HUBS = [
  { id: "sf", city: "San Francisco", country: "United States", lat: 37.77, lon: -122.42, n: 60, tilt: { techAdoption: 1.5, riskTolerance: 1.2, priceSensitivity: -1.5 } },
  { id: "nyc", city: "New York", country: "United States", lat: 40.71, lon: -74.01, n: 45, tilt: { budgetAuthority: 1.0, priceSensitivity: -0.8 } },
  { id: "london", city: "London", country: "United Kingdom", lat: 51.51, lon: -0.13, n: 35, tilt: { riskTolerance: -0.5 } },
  { id: "bangalore", city: "Bangalore", country: "India", lat: 12.97, lon: 77.59, n: 30, tilt: { priceSensitivity: 2.0, techAdoption: 0.8 } },
  { id: "toronto", city: "Toronto", country: "Canada", lat: 43.65, lon: -79.38, n: 25, tilt: { riskTolerance: -0.8 } },
  { id: "berlin", city: "Berlin", country: "Germany", lat: 52.52, lon: 13.4, n: 25, tilt: { priceSensitivity: 1.0, brandLoyalty: -0.8 } },
  { id: "singapore", city: "Singapore", country: "Singapore", lat: 1.35, lon: 103.82, n: 25, tilt: { budgetAuthority: 0.8 } },
  { id: "telaviv", city: "Tel Aviv", country: "Israel", lat: 32.08, lon: 34.78, n: 22, tilt: { riskTolerance: 1.8, techAdoption: 1.2 } },
  { id: "waterloo", city: "Waterloo", country: "Canada", lat: 43.46, lon: -80.52, n: 18, tilt: { techAdoption: 1.0, budgetAuthority: -1.2 } },
  { id: "saopaulo", city: "São Paulo", country: "Brazil", lat: -23.55, lon: -46.63, n: 15, tilt: { priceSensitivity: 2.2 } },
];

const FIRST = [
  "Alex","Priya","Jordan","Mei","Tomas","Amara","Noah","Yuki","Sofia","Dmitri","Chen","Aisha","Liam","Ines","Omar",
  "Hannah","Rafael","Nina","Kwame","Elena","Arjun","Clara","Diego","Fatima","Jonas","Leila","Marco","Sana","Theo","Zoe",
  "Ravi","Maya","Lucas","Ana","Kenji","Ruth","Sami","Petra","Oscar","Nadia","Felix","Grace","Hugo","Iris","Kai",
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

const personas = [];
let id = 1;

for (const hub of HUBS) {
  for (let i = 0; i < hub.n; i++) {
    const industry = pick(Object.keys(INDUSTRIES));
    const seniority = pick(SENIORITY);
    const gen = pick(GENERATIONS);
    const age = between(gen.range[0], gen.range[1]);
    const tilt = hub.tilt ?? {};

    personas.push({
      id: id++,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      title: pick(INDUSTRIES[industry]),
      hubId: hub.id,
      // Scattered around the hub rather than stacked on its exact coordinate.
      // Without this, sixty San Francisco personas render as one dot and the
      // globe shows ten points instead of a population.
      location: {
        city: hub.city,
        country: hub.country,
        lat: +(hub.lat + (rand() - 0.5) * 5.5).toFixed(3),
        lon: +(hub.lon + (rand() - 0.5) * 7).toFixed(3),
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
