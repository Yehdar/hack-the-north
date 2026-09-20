// ============================================================================
// THE WHOLE APP, DRIVEN IN A REAL BROWSER.
//
// Every bug worth finding in this repo was found by clicking, not by a unit
// test: the report's missing grade, a run inheriting the last run's committee,
// speech bubbles printed over each other, a call card stuck on "calling…".
// This is that click-through, scripted — intake to report to dashboard in
// about ninety seconds, with screenshots and a log of everything said aloud.
//
//   npm run dev                      # in one terminal
//   npm run walkthrough              # in another
//   npm run walkthrough -- "A budgeting app that warns you before payday"
//
// Reads: BASE (default http://localhost:3000), OUT (screenshot directory),
// CHROME (path to Chrome). It uses the Chrome already installed rather than
// downloading one. Do NOT pass --use-angle=swiftshader: software GL runs the
// globe at ~2.5fps and the animations never settle.
// ============================================================================

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? new URL("../.walkthrough/", import.meta.url).pathname;
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PITCH = process.argv[2] ?? "A self feeding machine for cats";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADED !== "1" });
const page = await browser.newPage({ viewport: { width: 1470, height: 812 } });

const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 300)));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

// Speech, stubbed: records what was said, in which voice, and flags any line
// that starts while another is still going — which is how "voices never
// overlap" is actually proved. A real SpeechSynthesisVoice cannot be faked, so
// the utterance class is replaced too.
await page.addInitScript(() => {
  const voices = [
    { name: "Albert", lang: "en-US" }, { name: "Samantha", lang: "en-US" },
    { name: "Ava (Premium)", lang: "en-US" }, { name: "Zoe (Enhanced)", lang: "en-US" },
    { name: "Evan (Enhanced)", lang: "en-US" }, { name: "Google US English", lang: "en-US" },
    { name: "Google UK English Male", lang: "en-GB" }, { name: "Google UK English Female", lang: "en-GB" },
  ].map((v) => ({ ...v, default: false, localService: true, voiceURI: v.name }));
  window.__spoken = [];
  let speaking = null;
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.pitch = 1; this.rate = 1; this.voice = null; }
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => voices,
      speak(u) {
        if (speaking) window.__spoken.push({ overlap: true, text: u.text, over: speaking.text });
        speaking = u;
        window.__spoken.push({ text: u.text, voice: u.voice?.name ?? null, pitch: +u.pitch.toFixed(2), rate: +u.rate.toFixed(2) });
        setTimeout(() => { if (speaking === u) { speaking = null; u.onend?.(); } }, 250);
      },
      cancel() { const u = speaking; speaking = null; u?.onend?.(); },
      addEventListener() {}, removeEventListener() {},
      get speaking() { return Boolean(speaking); },
    },
  });
});

const shot = (name, full = false) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
const button = (name) => page.getByRole("button", { name });
// "Now defend it", "Enter the committee" and "Take it to the committee" are
// links, not buttons: getByRole("button") waits for them forever.
const control = (name) => page.locator("button, a").filter({ hasText: name }).first();
const say = (s) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${s}`);
const spoken = [];
const collect = async () => spoken.push(...(await page.evaluate(() => window.__spoken ?? [])));

await page.goto(BASE + "/");
await page.evaluate(() => localStorage.clear());
await page.reload();

say("intake");
const box = page.getByPlaceholder("We built…");
await box.waitFor({ timeout: 30000 });
await box.fill(PITCH);
await shot("01-intake");
await button("Ask the market").click();

say("problem split");
await button(/Next: choose who to ask/).waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);
await shot("02-split");
await button(/Next: choose who to ask/).click();

say("deploy");
await button(/Next: ask them/).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await shot("03-deploy");
await button(/Next: ask them/).click();

say("listen");
await button(/Show me what they said/).waitFor({ timeout: 120000 });
await page.waitForTimeout(800);
await shot("04-heard");

say("call one person — they should pick up and say hello");
await page.locator("aside button").filter({ hasText: /“/ }).first().click();
await page.getByText(/Happy to — ask me anything|here\./).first().waitFor({ timeout: 25000 });
await page.waitForTimeout(600);
await shot("05-call");
await page.getByRole("button", { name: "end call" }).click();

say("the reveal");
await button(/Show me what they said/).click();
await page.waitForTimeout(2500);
await shot("06-reveal");
const accept = control(/Use their problem, and study it in/);
if (await accept.count()) await accept.click();
else await control(/Convene the/).click();

say("hub council");
await page.waitForTimeout(9000);
await shot("07-council");
await button(/See the validation score/).waitFor({ timeout: 180000 });
await page.waitForTimeout(800);
await shot("08-council-done");
await button(/See the validation score/).click();
await page.waitForTimeout(1500);
await shot("09-validation");

say("the committee");
await control(/Take it to the committee/).click();
await control(/Enter the committee/).waitFor({ timeout: 20000 });
await page.waitForTimeout(800);
await shot("10-finding");
await control(/Enter the committee/).click();
await button("Convene the committee").waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);
await button("Convene the committee").click();
await control(/Now defend it/).waitFor({ timeout: 180000 });
await page.waitForTimeout(1500);
await shot("11-committee-minutes");

say("the pitch");
await control(/Now defend it/).click();
const floor = page.getByPlaceholder("type, or hold the floor and talk");
await floor.waitFor({ timeout: 30000 });
for (const line of [
  "The people who have this problem are out for long days and can't keep the routine going.",
  "Forty of them pay us twelve dollars a month, and one has cancelled.",
]) {
  await floor.fill(line);
  await floor.press("Enter");
  await page.waitForTimeout(6000);
}
await shot("12-pitch");
await collect();

say("the report");
await page.goto(BASE + "/report");
await page.waitForTimeout(2500);
await shot("13-report", true);
const report = await page.locator("main").innerText();

say("saved runs");
await page.goto(BASE + "/dashboard");
await page.waitForTimeout(1500);
const minutes = page.getByText(/Minutes of the meeting/i).first();
if (await minutes.count()) await minutes.click();
await page.waitForTimeout(500);
await shot("14-dashboard", true);

// ---- what it found -------------------------------------------------------
console.log(`\n=== SPOKEN (${spoken.length})`);
for (const s of spoken) {
  console.log(
    s.overlap
      ? `!! "${s.text.slice(0, 60)}" STARTED OVER "${(s.over ?? "").slice(0, 60)}"`
      : `${(s.voice ?? "default").padEnd(22)} ${s.text.slice(0, 110)}`
  );
}

// Headings render uppercase, so compare case-insensitively.
const checks = [
  ["report shows the minutes", /minutes of the meeting/i.test(report)],
  ["report grades the idea", !/run the market first/i.test(report)],
  ["the score says why", /(mostly because|its weak spot)/i.test(report)],
  ["nobody talked over anybody", !spoken.some((s) => s.overlap)],
  ["no console errors", problems.length === 0],
];
console.log("\n=== CHECKS");
for (const [name, ok] of checks) console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
for (const p of problems.slice(0, 10)) console.log(p);
console.log(`\nScreenshots: ${OUT}`);

await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
