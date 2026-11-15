import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/play", "/how", "/code", "/live"];
const watch = (page: Page) => { const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); return errs; };

for (const path of PAGES) {
  test(`${path} loads cleanly with one h1 and no sideways scroll`, async ({ page }) => {
    const errs = watch(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect(errs).toEqual([]);
  });
}

test("home: explains a kuri, the organiser problem, the trust trade-off and why it exists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("The chit fund nobody can run away with.")).toBeVisible();
  for (const h of [/What's a kuri\?/, /The weak point is the person holding the money/, /Code can hold the money/, /Learning to build on a blockchain/]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
});

async function playWhole(page: Page, mode: "Trust mode" | "Escrow mode", joseph = false) {
  await page.goto("/play");
  await page.getByRole("radio", { name: new RegExp(mode) }).check();
  if (joseph) await page.getByRole("checkbox", { name: /Invite Joseph/ }).check();
  await page.getByRole("slider", { name: /Members/ }).fill("5");
  await page.getByRole("button", { name: "Start the circle" }).click();
  for (let r = 0; r < 5; r++) {
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    const bid = page.getByRole("button", { name: "Seal my bid" });
    if (await bid.isVisible().catch(() => false)) {
      if (r === 0) await bid.click();
      else await page.getByRole("button", { name: "Don't bid this round" }).click();
    }
    await page.getByRole("button", { name: /Reveal bids and settle|Settle the last round/ }).click();
    await expect(page.getByTestId("round-result").or(page.getByTestId("results"))).toBeVisible();
    await expect(page.getByTestId("solvency")).toContainText("contract holds exactly what it owes");
  }
}

test("play: a whole circle through the UI — every round settles, books balance, results show rates", async ({ page }) => {
  const errs = watch(page);
  await playWhole(page, "Trust mode");
  const results = page.getByTestId("results");
  await expect(results).toBeVisible();
  await expect(results.getByRole("row")).toHaveCount(6);
  // early winners pay for getting the pot early; later winners are paid for waiting — in plain rupees
  await expect(results.getByText(/^paid ₹[\d,]+ to get ₹[\d,]+ in month 1$/)).toBeVisible();
  await expect(results.getByText(/^earned ₹[\d,]+ by waiting until month \d$/).first()).toBeVisible();
  expect(await results.getByText(/%/).count()).toBe(0);
  expect(errs).toEqual([]);
});

test("play: Joseph defaults in trust mode", async ({ page }) => {
  await playWhole(page, "Trust mode", true);
  await expect(page.getByTestId("results").getByText("defaulted")).toBeVisible();
});

test("play: escrow mode holds back a winner's own dues and shows it", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("radio", { name: /Escrow mode/ }).check();
  await page.getByRole("button", { name: "Start the circle" }).click();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(page.getByText(/held to pay your own future instalments/)).toBeVisible();
});

test("play: under the hood lists real contract calls with gas and events", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("button", { name: "Start the circle" }).click();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await page.getByText("Under the hood: every transaction").click();
  await expect(page.getByText(/pay\(\)/).first()).toBeVisible();
  await expect(page.getByText(/gas · emits .*Paid/i).first()).toBeVisible();
});

test("how: the sealed-bid hash changes when the bid changes", async ({ page }) => {
  await page.goto("/how");
  const seal = page.getByTestId("seal");
  const before = await seal.innerText();
  await page.getByRole("slider", { name: /Your bid/ }).fill("2000");
  await expect(seal).not.toHaveText(before);
  expect(await seal.innerText()).toMatch(/^0x[0-9a-f]{64}$/);
});
