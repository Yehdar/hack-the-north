// ============================================================================
// READING A PITCH WITHOUT A MODEL.
//
// The demo provider used to answer every idea with the same dev-tools script:
// pitch a feeder for cats and the market "actually" had a problem with risky
// code paths. This reads the founder's own words — what the thing is, who it is
// for, which market it sits in — so everything the demo says afterwards is at
// least about the idea on the table.
//
// It is still no substitute for a model. With OPENAI_API_KEY or
// ANTHROPIC_API_KEY set, none of this runs.
// ============================================================================

export type Domain =
  | "pets"
  | "software"
  | "health"
  | "money"
  | "food"
  | "learning"
  | "home"
  | "climate"
  | "work"
  | "retail"
  | "travel"
  | "general";

export type Pitch = {
  solution: string;
  /** "self-feeding machine for cats" */
  thing: string;
  /** "self-feeding machine" */
  short: string;
  /** "cat owners" */
  audience: string;
  domain: Domain;
  consumer: boolean;
  /** "cat", for pet products. */
  animal?: string;
};

const DOMAIN_WORDS: Record<Exclude<Domain, "general">, RegExp> = {
  pets: /\b(cats?|dogs?|pets?|kittens?|pupp(?:y|ies)|vets?|litter|leash|aquarium|hamsters?|birds?|feeder)\b/i,
  software: /\b(code|repo|developers?|devops|api|apis|deploy|software|saas|github|bugs?|tests?|engineers?|codebase|kubernetes|ci)\b/i,
  health: /\b(health|patients?|clinics?|doctors?|nurses?|hospitals?|medic\w*|therap\w*|fitness|sleep|symptoms?|mental|pharmac\w*|wellness)\b/i,
  money: /\b(bank\w*|payments?|invoices?|financ\w*|budget\w*|loans?|credit|tax(?:es)?|accounting|expenses?|invest\w*|savings?|wallet|crypto|bills?)\b/i,
  food: /\b(food|meals?|recipes?|grocer\w*|restaurants?|cook\w*|kitchen|coffee|snacks?|nutrition|takeaway|dining)\b/i,
  learning: /\b(students?|school|learn\w*|teachers?|course\w*|tutor\w*|study|exams?|class(?:room)?|homework|universit\w*)\b/i,
  home: /\b(home|house\w*|apartments?|rent\w*|cleaning|laundry|furniture|fridges?|roommates?|housemates?|landlords?|tenants?|appliances?)\b/i,
  climate: /\b(solar|carbon|energy|emissions?|batter(?:y|ies)|eco|recycl\w*|waste|sustainab\w*|climate|compost\w*|green)\b/i,
  work: /\b(hiring|recruit\w*|employees?|teams?|meetings?|remote|hr|payroll|onboard\w*|managers?|workplace|freelanc\w*)\b/i,
  retail: /\b(shops?|stores?|e-?commerce|sellers?|inventory|marketplace|retail\w*|merchants?|customers?)\b/i,
  travel: /\b(travel\w*|trips?|flights?|hotels?|commut\w*|cars?|bikes?|parking|transport\w*|rides?|luggage)\b/i,
};

// Order matters when two markets both match: the more specific one wins.
const DOMAIN_ORDER: Exclude<Domain, "general">[] = [
  "pets", "software", "health", "learning", "food", "money", "climate", "travel", "retail", "home", "work",
];

const ANIMALS: Record<string, string> = {
  cat: "cat", cats: "cat", kitten: "cat", kittens: "cat",
  dog: "dog", dogs: "dog", puppy: "dog", puppies: "dog",
  pet: "pet", pets: "pet", bird: "bird", birds: "bird", fish: "fish", hamster: "hamster", hamsters: "hamster",
};

const GROUPS =
  /\b(students?|parents?|teachers?|developers?|engineers?|teams?|doctors?|nurses?|patients?|restaurants?|landlords?|tenants?|freelancers?|creators?|seniors?|kids|children|families|founders?|designers?|musicians?|athletes?|drivers?|farmers?|artists?|shops?|retailers?|small businesses|homeowners?|renters?|commuters?|travellers?|travelers?)\b/i;

const BUSINESS =
  /\b(teams?|compan(?:y|ies)|business(?:es)?|enterprise|developers?|engineers?|clinics?|hospitals?|restaurants?|stores?|shops?|landlords?|b2b|saas|invoices?|payroll|crm|repo|codebase|api|merchants?|retailers?|sellers?)\b/i;

const DEFAULT_AUDIENCE: Record<Domain, string> = {
  pets: "pet owners",
  software: "engineering teams",
  health: "people managing their health",
  money: "people managing their money",
  food: "people who cook at home",
  learning: "students",
  home: "busy households",
  climate: "households trying to cut their footprint",
  work: "managers",
  retail: "small shop owners",
  travel: "people who travel for work",
  general: "the people it is for",
};

function plural(word: string): string {
  if (/s$/i.test(word)) return word;
  if (/(ch|sh|x)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export function readPitch(raw: string): Pitch {
  const solution = raw.trim().replace(/\s+/g, " ");

  const stripped = solution
    .replace(/^(?:so\s+)?(?:we|i)(?:'ve| have)?\s+(?:are\s+)?(?:built|building|made|making|created|designed|launched)\s+/i, "")
    .replace(/^(?:an?|the)\s+/i, "")
    .replace(/[.!?]+$/, "");

  // The noun phrase: up to the first clause, six words at most.
  const head = stripped.split(/\s+(?:that|which|who|so|because|where|to help|while)\s+|[,;:—–-]\s/i)[0];
  const thing = head.split(/\s+/).slice(0, 7).join(" ").toLowerCase() || "this";
  const short = thing.split(/\s+for\s+/)[0].split(/\s+/).slice(0, 4).join(" ");

  const scores = DOMAIN_ORDER.map((d) => [d, (solution.match(new RegExp(DOMAIN_WORDS[d], "gi")) ?? []).length] as const);
  const best = scores.reduce((a, b) => (b[1] > a[1] ? b : a), ["general", 0] as readonly [Domain, number]);
  const domain: Domain = best[1] > 0 ? best[0] : "general";

  // Who it is for: "for cats" → cat owners, "for student housing" → students.
  let audience = DEFAULT_AUDIENCE[domain];
  let animal: string | undefined;
  const forWhom = solution.match(/\bfor\s+([a-z][a-z\s-]{1,40}?)(?=\s+(?:that|which|who|so|because|and|with|to|in|on|at|by)\b|[.,!?;]|$)/i)?.[1];
  const inText = (forWhom ?? solution).toLowerCase();
  const animalWord = Object.keys(ANIMALS).find((a) => new RegExp(`\\b${a}\\b`).test(inText));
  if (domain === "pets" && animalWord) {
    animal = ANIMALS[animalWord];
    audience = animal === "pet" ? "pet owners" : `${animal} owners`;
  } else {
    const group = (forWhom?.match(GROUPS) ?? solution.match(GROUPS))?.[1];
    if (group) audience = plural(group.toLowerCase());
    else if (forWhom && forWhom.split(/\s+/).length <= 4) audience = forWhom.toLowerCase();
  }

  return {
    solution,
    thing,
    short: short || thing,
    audience,
    domain,
    consumer: !BUSINESS.test(solution),
    animal,
  };
}

// ---------------------------------------------------------------------------
// What each market is like, in the words a partner would use about it.

export type Market = {
  category: string;
  incumbent: string;
  channel: string;
  regulation: string;
  /** How products in this category usually die. */
  failure: string;
  /** The moment in someone's day the product has to own. */
  moment: string;
};

export const MARKETS: Record<Domain, Market> = {
  pets: {
    category: "pet tech",
    incumbent: "the big pet brands and every cheap feeder on Amazon",
    channel: "vets, pet stores and a lot of paid social",
    regulation: "product-safety and electrical certification before it can ship to homes",
    failure: "people love it for a month, it jams once, and it goes in a cupboard",
    moment: "the morning rush and the late nights away",
  },
  software: {
    category: "developer tools",
    incumbent: "GitHub and the platform vendors",
    channel: "developers trying it free and pulling it into their team",
    regulation: "security reviews before any company lets it near their code",
    failure: "it becomes one more dashboard that nobody opens after the first sprint",
    moment: "the pull request, where the work actually happens",
  },
  health: {
    category: "digital health",
    incumbent: "the clinics' own portals and the big wearables",
    channel: "clinicians who recommend it, which is slow but sticky",
    regulation: "health-data rules, and possibly medical-device approval if it gives advice",
    failure: "engagement falls off a cliff after the first two weeks",
    moment: "the daily routine the doctor asked for",
  },
  money: {
    category: "fintech",
    incumbent: "the banks' own apps, which are already on everyone's phone",
    channel: "word of mouth and paid acquisition that gets expensive fast",
    regulation: "financial licensing and a lot of compliance before you touch anyone's money",
    failure: "people link an account, look twice, and never open it again",
    moment: "payday and the week before it",
  },
  food: {
    category: "food tech",
    incumbent: "the delivery apps and the supermarkets",
    channel: "social, referrals and grocery partnerships",
    regulation: "food-safety rules the moment you handle anything edible",
    failure: "the habit never forms and it becomes a novelty",
    moment: "the 6pm 'what's for dinner' moment",
  },
  learning: {
    category: "edtech",
    incumbent: "the tools schools already bought and free YouTube",
    channel: "schools, which buy slowly, or parents, who churn",
    regulation: "student-data privacy rules, which schools take very seriously",
    failure: "students use it the week before the exam and never again",
    moment: "homework time and the week before an exam",
  },
  home: {
    category: "home and living",
    incumbent: "the appliance makers and whatever people already bought",
    channel: "retail partners and landlords buying in bulk",
    regulation: "safety certification and warranty obligations",
    failure: "it works, but nobody replaces something that already works",
    moment: "the chores nobody wants to own",
  },
  climate: {
    category: "climate tech",
    incumbent: "the utilities and the big hardware makers",
    channel: "installers, utilities and incentive programmes",
    regulation: "grid, safety and emissions-reporting standards",
    failure: "people like it in principle and won't pay a premium in practice",
    moment: "the energy bill arriving",
  },
  work: {
    category: "workplace software",
    incumbent: "Slack, Microsoft and the HR suites",
    channel: "a manager trying it, then a painful procurement cycle",
    regulation: "data-protection reviews on anything that touches employee data",
    failure: "it becomes another tool the team is told to update and doesn't",
    moment: "the weekly planning meeting",
  },
  retail: {
    category: "commerce tools",
    incumbent: "Shopify, Square and the point-of-sale vendors",
    channel: "partners and marketplaces, because small shops are expensive to reach one by one",
    regulation: "payments and consumer-protection rules",
    failure: "owners are too busy to set it up, so it never gets used",
    moment: "closing time, when they count what sold",
  },
  travel: {
    category: "travel and mobility",
    incumbent: "Google, the airlines and the booking giants",
    channel: "search and the travel managers at companies",
    regulation: "consumer-protection and transport rules that differ by country",
    failure: "people use it for one trip and go back to what they know",
    moment: "the moment a plan falls apart",
  },
  general: {
    category: "this category",
    incumbent: "whatever people cobble together today",
    channel: "word of mouth, which is slow",
    regulation: "the usual product and consumer rules",
    failure: "it's nice to have, so nobody makes it a habit",
    moment: "the moment the problem actually bites",
  },
};

// ---------------------------------------------------------------------------
// The candidate problems: the founder's framing, and three things the market
// might actually be feeling instead. Each carries the words the crowd model
// reads to decide who has it — "budget" for the people who can pay, "can't
// tell" for the people who need proof, "skip" for the people who just avoid it.

export type ProblemDraft = {
  statement: string;
  whoHasIt: string;
  severity: number;
  frequency: string;
  currentWorkaround: string;
  willingnessToPay: string;
  confidence: number;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function marketProblems(p: Pitch): ProblemDraft[] {
  const a = p.audience;
  const pet = p.animal ?? "pet";

  const PACKS: Record<Domain, [ProblemDraft, ProblemDraft, ProblemDraft]> = {
    pets: [
      {
        statement: `Owners who are out for long or unpredictable days can't keep their ${pet}'s routine on track, so meals and care slip exactly when nobody's home.`,
        whoHasIt: `Working ${a} who already hold the budget for sitters, walkers and gadgets.`,
        severity: 79, frequency: "Every week — worst on long workdays and trips",
        currentWorkaround: "A neighbour, a pricey sitter, or hoping for the best.",
        willingnessToPay: "Yes — they already pay a sitter, and this competes with that spend.",
        confidence: 0.72,
      },
      {
        statement: `They can't tell how much their ${pet} is actually eating or whether anything has changed, so health problems get noticed late — usually at the vet.`,
        whoHasIt: `Owners of older or sick ${plural(pet)} who have to report back to a vet.`,
        severity: 64, frequency: "Every few months, and badly when it matters",
        currentWorkaround: "Eyeballing the bowl and guessing.",
        willingnessToPay: "Maybe — if the vet recommends it.",
        confidence: 0.6,
      },
      {
        statement: `Feeding takes thirty seconds, so most owners never think of it as a problem and skip the gadget entirely.`,
        whoHasIt: `${cap(a)} who are home most of the day.`,
        severity: 30, frequency: "Twice a day", currentWorkaround: "They just do it.",
        willingnessToPay: "No — it doesn't feel broken.", confidence: 0.86,
      },
    ],
    software: [
      {
        statement: "When something breaks, nobody can say which part was the risky one — so the team keeps tidying the safe corners and the dangerous bits stay untouched.",
        whoHasIt: "Team leads who get the blame but do not do the work themselves.",
        severity: 81, frequency: "Every planning meeting, and badly after anything goes wrong",
        currentWorkaround: "One person happens to know, and a to-do from the last post-mortem that quietly expired.",
        willingnessToPay: "Yes — this comes out of a budget they will fight for.", confidence: 0.74,
      },
      {
        statement: "They cannot prove to their boss or an auditor that the work was done properly, so they end up arguing about it again every few months.",
        whoHasIt: "Directors who have to report upwards, especially anywhere regulated.",
        severity: 66, frequency: "Every quarter", currentWorkaround: "A spreadsheet somebody rebuilds from scratch each time.",
        willingnessToPay: "Probably — compliance money exists, but buying takes months.", confidence: 0.61,
      },
      {
        statement: "It is boring, so people quietly skip it.", whoHasIt: "The people actually doing the work.",
        severity: 35, frequency: "Daily", currentWorkaround: "They do not do it.",
        willingnessToPay: "No — nobody pays out of their own pocket to be less bored.", confidence: 0.88,
      },
    ],
    health: [
      {
        statement: "People can't stick to the routine their doctor set once life gets busy, so it slips until the next bad week.",
        whoHasIt: `${cap(a)}, and the family members who hold the budget for their care.`,
        severity: 78, frequency: "Most weeks", currentWorkaround: "Reminders they ignore and a guilty catch-up before appointments.",
        willingnessToPay: "Yes, if it visibly keeps them out of trouble.", confidence: 0.7,
      },
      {
        statement: "They can't tell whether what they're doing is working, so every appointment starts from guesswork.",
        whoHasIt: "People who have to report progress back to a clinician.",
        severity: 63, frequency: "Every appointment", currentWorkaround: "Memory, and a notes app.",
        willingnessToPay: "Maybe — if a clinician asks for it.", confidence: 0.6,
      },
      {
        statement: "Logging it is tedious, so people skip it after the first week.",
        whoHasIt: "Anyone who has ever downloaded a tracking app.",
        severity: 33, frequency: "Daily", currentWorkaround: "They stop logging.",
        willingnessToPay: "No.", confidence: 0.85,
      },
    ],
    money: p.consumer
      ? [
          {
            statement: "Bills, subscriptions and uneven income never line up, so money runs short a few days before payday and the fees pile up.",
            whoHasIt: "People who run the household budget on unpredictable income.",
            severity: 80, frequency: "Every month", currentWorkaround: "Juggling due dates and hoping.",
            willingnessToPay: "Yes — if it costs less than the fees it saves.", confidence: 0.71,
          },
          {
            statement: "They can't tell where last month's money actually went, so every plan starts from a guess.",
            whoHasIt: "Anyone who has to prove their spending to a partner, a lender or the tax office.",
            severity: 62, frequency: "Monthly", currentWorkaround: "Scrolling back through the banking app.",
            willingnessToPay: "Maybe.", confidence: 0.6,
          },
          {
            statement: "Tracking spending is tedious, so people skip it until something goes wrong.",
            whoHasIt: "Everyone who opened a budgeting app once.",
            severity: 34, frequency: "Daily", currentWorkaround: "They don't track.", willingnessToPay: "No.", confidence: 0.86,
          },
        ]
      : [
          {
            statement: "Month-end close takes days because the numbers live in systems that don't agree, and the finance lead gets the blame when it's late.",
            whoHasIt: "Finance managers who own the close and the budget for tools.",
            severity: 82, frequency: "Every month-end", currentWorkaround: "Spreadsheets and late nights.",
            willingnessToPay: "Yes — they pay for tools that save the team days.", confidence: 0.74,
          },
          {
            statement: "They can't prove to an auditor how a number was reached, so the same questions come back every quarter.",
            whoHasIt: "Controllers and directors who report upward.",
            severity: 66, frequency: "Every quarter", currentWorkaround: "A binder of screenshots.",
            willingnessToPay: "Probably — audit budgets exist, but buying is slow.", confidence: 0.61,
          },
          {
            statement: "Reconciling by hand is tedious, so it gets skipped until quarter end.",
            whoHasIt: "The accountants doing the work.", severity: 36, frequency: "Daily",
            currentWorkaround: "They batch it and suffer.", willingnessToPay: "No — they'd ask their manager.", confidence: 0.85,
          },
        ],
    food: [
      {
        statement: "Busy households buy food with good intentions and throw a third of it away, and whoever does the shopping pays for it twice.",
        whoHasIt: "The person who holds the grocery budget in a busy household.",
        severity: 74, frequency: "Every week", currentWorkaround: "Guessing, and a fridge full of good intentions.",
        willingnessToPay: "Yes, if it clearly saves more than it costs.", confidence: 0.68,
      },
      {
        statement: "They can't tell what's actually in the fridge or when it goes off, so meals get planned around guesses.",
        whoHasIt: "People cooking for others with dietary needs.",
        severity: 58, frequency: "Most days", currentWorkaround: "Opening the fridge and hoping.", willingnessToPay: "Maybe.", confidence: 0.6,
      },
      {
        statement: "Planning meals is tedious, so people skip it and order takeaway instead.",
        whoHasIt: "Everyone who meant to meal-prep this week.", severity: 38, frequency: "Daily",
        currentWorkaround: "Takeaway.", willingnessToPay: "No.", confidence: 0.84,
      },
    ],
    learning: [
      {
        statement: "Students fall behind quietly and nobody notices until the exam, when it's too late to catch up.",
        whoHasIt: "Parents and schools who hold the budget for extra help.",
        severity: 79, frequency: "Every term", currentWorkaround: "Last-minute tutoring.",
        willingnessToPay: "Yes — parents already pay for tutors.", confidence: 0.7,
      },
      {
        statement: "Teachers can't tell who actually understood the lesson, so they re-teach the whole class to reach the few who didn't.",
        whoHasIt: "Teachers who have to report progress upward.",
        severity: 64, frequency: "Every week", currentWorkaround: "Quick quizzes they don't have time to mark.",
        willingnessToPay: "Maybe — through the school, slowly.", confidence: 0.6,
      },
      {
        statement: "Revision is tedious, so students skip it until the night before.",
        whoHasIt: "The students themselves.", severity: 40, frequency: "Every exam season",
        currentWorkaround: "Cramming.", willingnessToPay: "No — and they're not the ones paying.", confidence: 0.86,
      },
    ],
    home: [
      {
        statement: "Shared homes run on unspoken rules, so bills, chores and repairs land on whoever cares most — and they end up paying for it.",
        whoHasIt: "The one housemate or landlord who ends up holding the budget and the blame.",
        severity: 72, frequency: "Every month", currentWorkaround: "Group chats and resentment.",
        willingnessToPay: "Some — landlords pay; housemates split small costs.", confidence: 0.66,
      },
      {
        statement: "Landlords and tenants can't tell who broke something or whether it was used properly, so every move-out becomes an argument about the deposit.",
        whoHasIt: "Landlords and letting agents who answer to the owners.",
        severity: 61, frequency: "Every tenancy", currentWorkaround: "Photos on move-in, if anyone remembers.",
        willingnessToPay: "Maybe — per property.", confidence: 0.6,
      },
      {
        statement: "Keeping on top of it is tedious, so people skip it until something breaks.",
        whoHasIt: "Everyone living there.", severity: 36, frequency: "Weekly",
        currentWorkaround: "Nothing, until it breaks.", willingnessToPay: "No.", confidence: 0.85,
      },
    ],
    climate: [
      {
        statement: "Energy bills keep rising and households can't see which appliance or habit is driving them, so they cut the wrong things.",
        whoHasIt: "Households and building managers who hold the energy budget.",
        severity: 76, frequency: "Every bill", currentWorkaround: "Turning things off at random.",
        willingnessToPay: "Yes — if the saving shows up on the bill.", confidence: 0.69,
      },
      {
        statement: "They can't prove their footprint actually went down, so green claims get dismissed and incentives go unclaimed.",
        whoHasIt: "Companies that have to report emissions to a standard.",
        severity: 65, frequency: "Every reporting cycle", currentWorkaround: "Estimates from a consultant.",
        willingnessToPay: "Probably — reporting is becoming mandatory.", confidence: 0.62,
      },
      {
        statement: "Changing habits is tedious, so people skip it once the novelty wears off.",
        whoHasIt: "People who care but are busy.", severity: 34, frequency: "Daily",
        currentWorkaround: "Good intentions.", willingnessToPay: "No — not a premium.", confidence: 0.85,
      },
    ],
    work: [
      {
        statement: "Managers can't see who is overloaded until someone burns out or quits, and the rehiring comes out of their budget.",
        whoHasIt: "Team leads and managers who own headcount and the budget.",
        severity: 78, frequency: "Every quarter, and badly when someone leaves",
        currentWorkaround: "One-to-ones and gut feel.", willingnessToPay: "Yes — attrition is expensive.", confidence: 0.7,
      },
      {
        statement: "They can't prove to leadership where the team's time actually goes, so every planning cycle turns into an argument.",
        whoHasIt: "Directors who report upward.", severity: 64, frequency: "Every planning cycle",
        currentWorkaround: "Slides built from memory.", willingnessToPay: "Probably, slowly.", confidence: 0.6,
      },
      {
        statement: "Updating the tracker is tedious, so people skip it and the data is always stale.",
        whoHasIt: "The people doing the work.", severity: 35, frequency: "Daily",
        currentWorkaround: "They don't update it.", willingnessToPay: "No.", confidence: 0.86,
      },
    ],
    retail: [
      {
        statement: "Small shops run out of what sells and sit on what doesn't, and the owner only finds out when the cash is already gone.",
        whoHasIt: "Owners who manage stock and hold the budget.",
        severity: 77, frequency: "Every week", currentWorkaround: "Instinct and a notebook.",
        willingnessToPay: "Yes — if it pays for itself in the first month.", confidence: 0.7,
      },
      {
        statement: "They can't tell which supplier or promotion actually drove a sale, so money goes to whoever shouts loudest.",
        whoHasIt: "Owners who have to show their numbers to a bank or investors.", severity: 60, frequency: "Monthly",
        currentWorkaround: "The till report and a guess.", willingnessToPay: "Maybe.", confidence: 0.6,
      },
      {
        statement: "Counting stock by hand is tedious, so it gets skipped until the shelves are empty.",
        whoHasIt: "Staff on the shop floor.", severity: 36, frequency: "Daily",
        currentWorkaround: "They skip it.", willingnessToPay: "No — it's the owner's call.", confidence: 0.85,
      },
    ],
    travel: [
      {
        statement: "Plans fall apart at the last minute — delays, cancellations, lost bookings — and the traveller pays for the rescue out of their own pocket.",
        whoHasIt: "Frequent travellers and the managers who hold the travel budget.",
        severity: 75, frequency: "Every few trips", currentWorkaround: "Hours on hold and a credit card.",
        willingnessToPay: "Yes — companies already pay for travel management.", confidence: 0.68,
      },
      {
        statement: "They can't prove what was spent or why, so expense claims bounce back and forth for weeks.",
        whoHasIt: "People who have to report spending to a finance team.", severity: 58, frequency: "After every trip",
        currentWorkaround: "Photos of receipts.", willingnessToPay: "Maybe — through their company.", confidence: 0.6,
      },
      {
        statement: "Comparing options is tedious, so people skip it and book the first thing they see.",
        whoHasIt: "Everyone booking in a hurry.", severity: 33, frequency: "Every booking",
        currentWorkaround: "The first result.", willingnessToPay: "No.", confidence: 0.85,
      },
    ],
    general: [
      {
        statement: `${cap(a)} lose time and money to this every week, and the person who pays for the workaround isn't the one who suffers it.`,
        whoHasIt: "The people who hold the budget for fixing it.",
        severity: 72, frequency: "Every week", currentWorkaround: "Something cobbled together that half works.",
        willingnessToPay: "Yes — if it replaces what they already spend.", confidence: 0.65,
      },
      {
        statement: "They can't tell whether today's workaround is actually working, so they keep paying for it out of habit.",
        whoHasIt: "People who have to report results upward.", severity: 58, frequency: "Monthly",
        currentWorkaround: "Habit.", willingnessToPay: "Maybe.", confidence: 0.58,
      },
      {
        statement: "It's tedious, so people quietly skip it.", whoHasIt: "The people who'd actually use it.",
        severity: 35, frequency: "Daily", currentWorkaround: "They skip it.", willingnessToPay: "No.", confidence: 0.85,
      },
    ],
  };

  return PACKS[p.domain];
}
