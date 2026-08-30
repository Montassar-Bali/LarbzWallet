import { chromium } from "playwright-core";

const baseUrl = process.env.WALLET_TEST_URL || "http://localhost:3000";
const executablePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  locale: "en-US",
  serviceWorkers: "block",
});

await context.addInitScript(() => {
  Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
  const originalMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => query.includes("display-mode: standalone")
    ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }
    : originalMatchMedia(query);
  try { window.localStorage.setItem("larpz_download_notifications_prompted", "true"); } catch {}
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

async function assertMobileLayout(route, readyText, timeout = 15_000) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((text) => document.body.innerText.includes(text) || [...document.querySelectorAll("input")].some((input) => input.placeholder.includes(text)), readyText, { timeout });
  const layout = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    language: document.documentElement.lang,
  }));
  if (layout.width !== 390 || layout.documentWidth > 390 || layout.bodyWidth > 390) {
    throw new Error(`${route} overflows the 390px mobile viewport: ${JSON.stringify(layout)}`);
  }
  if (layout.language !== "en") throw new Error(`${route} is not marked as English.`);
}

await page.goto(`${baseUrl}/activate`, { waitUntil: "domcontentloaded" });
await page.getByLabel("License Key").fill("DEMO-STAR-0001-2026");
await page.getByRole("button", { name: "Activate License" }).click();
await page.waitForURL(/\/wallet-launch/, { timeout: 10_000 });
const activatedIdentity = await page.evaluate(() => {
  const session = JSON.parse(window.localStorage.getItem("larpz_session") || "null");
  const users = JSON.parse(window.localStorage.getItem("larpz_users") || "[]");
  return users.find((user) => user.id === session?.userId);
});
if (!activatedIdentity?.id?.startsWith("lic_") || activatedIdentity.licenseKey !== "DEMO-STAR-0001-2026") {
  throw new Error("Activation key did not create its own stable wallet identity.");
}

await assertMobileLayout("/download-wallet", "Search Phantom", 20_000);
if (await page.getByRole("button", { name: "Not Now" }).isVisible().catch(() => false)) await page.getByRole("button", { name: "Not Now" }).click();
await page.getByRole("button", { name: "Open wallet actions" }).click();
await page.getByRole("button", { name: "Send" }).click();
await page.getByRole("heading", { name: "Send" }).waitFor();
await page.getByLabel("Transfer amount").fill("0.01");
await page.getByRole("button", { name: /Review transfer/ }).click();
await page.getByRole("heading", { name: "Review transfer" }).waitFor();
await page.getByRole("button", { name: "Confirm transfer" }).click();
await page.getByRole("heading", { name: "Transfer complete" }).waitFor({ timeout: 10_000 });

const transferState = await page.evaluate(() => {
  const key = Object.keys(window.localStorage).find((item) => item.startsWith("larpz_wallet_ledger_v2:")) ?? "larpz_wallet_ledger_v1";
  return JSON.parse(window.localStorage.getItem(key) || "null");
});
if (!transferState?.transactions?.some((transaction) => transaction.status === "completed" && transaction.sourceWalletId === "ghost" && transaction.destinationWalletId === "ledger")) {
  throw new Error("Phantom-to-Ledger transfer was not persisted.");
}
const completed = transferState.transactions.find((transaction) => transaction.sourceWalletId === "ghost" && transaction.destinationWalletId === "ledger");
const source = transferState.wallets.ghost.accounts.find((account) => account.id === completed.sourceAccountId);
const destination = transferState.wallets.ledger.accounts.find((account) => account.id === completed.destinationAccountId);
if (!source || !destination || destination.balances.SOL < completed.amount) throw new Error("Atomic destination balance update was not persisted.");

await assertMobileLayout("/ledger-wallet", "Demo · No real funds");
await page.waitForFunction(() => document.body.innerText.includes("0.01 SOL"), undefined, { timeout: 10_000 });
await page.getByRole("button", { name: "Transfer" }).click();
await page.getByRole("heading", { name: "Send" }).waitFor();
await page.getByRole("button", { name: "Close", exact: true }).click();
await page.getByRole("button", { name: "Accounts" }).click();
await page.getByRole("heading", { name: "Accounts" }).waitFor();
await page.getByRole("button", { name: "Close", exact: true }).click();
await page.getByRole("button", { name: "Swap", exact: true }).last().click();
await page.getByRole("heading", { name: "Swap", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Ledger home" }).click();
await page.getByRole("button", { name: "Earn", exact: true }).click();
await page.getByRole("heading", { name: "Earn", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Ledger home" }).click();
await page.getByRole("button", { name: "Card", exact: true }).click();
await page.getByRole("heading", { name: "Card", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Ledger home" }).click();
await page.getByRole("button", { name: "Explore", exact: true }).first().click();
await page.getByRole("heading", { name: "Explore", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Ledger home" }).click();

await assertMobileLayout("/trust-wallet", "Home");
await page.getByRole("button", { name: "Send" }).click();
await page.getByRole("heading", { name: "Send" }).waitFor();
const sheetBounds = await page.locator("section[aria-label='Send']").boundingBox();
if (!sheetBounds || sheetBounds.x < 0 || sheetBounds.x + sheetBounds.width > 390 || sheetBounds.y < 0 || sheetBounds.y + sheetBounds.height > 844.5) {
  throw new Error(`Transfer sheet exceeds the mobile viewport: ${JSON.stringify(sheetBounds)}`);
}
await page.getByRole("button", { name: "Close", exact: true }).click();
await page.getByRole("button", { name: "Swap", exact: true }).click();
await page.getByRole("heading", { name: "Trade tokens", exact: true }).waitFor();
await page.getByRole("button", { name: "Discover", exact: true }).click();
await page.getByRole("heading", { name: "Explore crypto", exact: true }).waitFor();
await page.getByRole("button", { name: /Learn crypto/ }).click();
await page.getByText(/Verify recipient addresses/).waitFor();
await page.getByRole("button", { name: "Browser", exact: true }).click();
await page.getByRole("heading", { name: "Web3 browser", exact: true }).waitFor();
await page.getByRole("button", { name: /Wallet help center/ }).click();
await page.getByText(/Use Receive to view an account address/).waitFor();

const actionableErrors = errors.filter((message) => !message.includes("Failed to load resource") && !message.includes("net::ERR"));
await browser.close();
if (actionableErrors.length) throw new Error(`Browser errors: ${actionableErrors.join(" | ")}`);

console.log("Mobile wallet smoke test passed: shared transfer/persistence plus Ledger and Trust functional flows.");
