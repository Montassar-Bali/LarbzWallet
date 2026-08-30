import { chromium } from "playwright-core";

const baseUrl = process.env.WALLET_TEST_URL || "http://localhost:3000";
const executablePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const mobileContextOptions = {
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  locale: "en-US",
  serviceWorkers: "block",
};

async function createMobileContext(ownerId = null) {
  const mobileContext = await browser.newContext(mobileContextOptions);
  await mobileContext.addInitScript(({ syntheticOwnerId }) => {
    Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query.includes("display-mode: standalone")
      ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }
      : originalMatchMedia(query);
    try {
      window.localStorage.setItem("larpz_download_notifications_prompted", "true");
      if (syntheticOwnerId) {
        const user = {
          id: syntheticOwnerId,
          name: "Cross-PWA Smoke User",
          email: `${syntheticOwnerId}@smoke.local`,
          passwordHash: "synthetic-browser-test-session",
          role: "user",
          status: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
        };
        window.localStorage.setItem("larpz_users", JSON.stringify([user]));
        window.localStorage.setItem("larpz_session", JSON.stringify({ userId: syntheticOwnerId }));
        document.cookie = `larpz_wallet_owner_id=${encodeURIComponent(syntheticOwnerId)}; Path=/; SameSite=Lax`;
      }
    } catch {}
  }, { syntheticOwnerId: ownerId });
  return mobileContext;
}

const context = await createMobileContext();

const page = await context.newPage();
const errors = [];
function capturePageErrors(targetPage, label = "wallet") {
  targetPage.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  targetPage.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
}
capturePageErrors(page);

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

await page.goto(`${baseUrl}/trust-wallet`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Link this installed wallet" }).waitFor({ timeout: 15_000 });
if (await page.getByRole("button", { name: "Send", exact: true }).isVisible().catch(() => false)) {
  throw new Error("An unlinked installed wallet exposed transfers before activation.");
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
await context.route("**/api/wallet-ledger", createInMemoryWalletLedger(activatedIdentity.id));

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

function createInMemoryWalletLedger(ownerId) {
  let snapshot = null;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const accountsFromState = (state) => Object.values(state.wallets).flatMap((wallet) =>
    wallet.accounts.map((account) => ({ ...clone(account), ownerId })));
  const responseSnapshot = () => clone(snapshot ?? { accounts: [], transactions: [] });
  const fulfill = (route, payload, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify(payload),
  });

  return async (route) => {
    let body;
    try {
      body = route.request().postDataJSON();
    } catch {
      await fulfill(route, { code: "INVALID_REQUEST", error: "Invalid wallet request." }, 400);
      return;
    }
    if (body.ownerId !== ownerId) {
      await fulfill(route, { code: "INVALID_REQUEST", error: "Unexpected wallet owner." }, 400);
      return;
    }

    if (body.action === "bootstrap" || body.action === "sync") {
      if (!snapshot) {
        snapshot = {
          accounts: accountsFromState(body.state),
          transactions: clone(body.state.transactions ?? []),
        };
      } else if (body.action === "sync") {
        for (const incoming of accountsFromState(body.state)) {
          const current = snapshot.accounts.find((account) => account.id === incoming.id);
          if (current) {
            current.walletId = incoming.walletId;
            current.name = incoming.name;
            current.address = incoming.address;
          } else {
            snapshot.accounts.push(incoming);
          }
        }
      }
      await fulfill(route, { connected: true, snapshot: responseSnapshot() });
      return;
    }

    if (body.action === "patchAccount") {
      const account = snapshot?.accounts.find((candidate) => candidate.id === body.accountId);
      if (!account) {
        await fulfill(route, { code: "ACCOUNT_NOT_FOUND", error: "Account not found." }, 404);
        return;
      }
      if (typeof body.name === "string" && body.name.trim()) account.name = body.name.trim();
      if (body.balances && typeof body.balances === "object") Object.assign(account.balances, clone(body.balances));
      await fulfill(route, { connected: true, snapshot: responseSnapshot() });
      return;
    }

    if (body.action === "transfer" && body.transfer) {
      const existing = snapshot?.transactions.find((transaction) => transaction.clientRequestId === body.transfer.clientRequestId);
      if (existing) {
        await fulfill(route, { connected: true, snapshot: responseSnapshot(), transaction: clone(existing) });
        return;
      }
      const source = snapshot?.accounts.find((account) => account.id === body.transfer.sourceAccountId);
      const destination = snapshot?.accounts.find((account) =>
        body.transfer.destinationAddress
          ? account.address === body.transfer.destinationAddress
          : account.id === body.transfer.destinationAccountId);
      const symbol = String(body.transfer.tokenSymbol ?? "").toUpperCase();
      const transferAmount = Number(body.transfer.amount);
      const fee = symbol === "BNB" ? 0.0001 : 0;
      if (!source || !destination || source.id === destination.id || !Number.isFinite(transferAmount) || transferAmount <= 0) {
        await fulfill(route, { code: "INVALID_REQUEST", error: "Invalid transfer." }, 400);
        return;
      }
      if ((source.balances[symbol] ?? 0) + Number.EPSILON < transferAmount + fee) {
        await fulfill(route, { code: "INSUFFICIENT_FUNDS", error: `Insufficient ${symbol}.` }, 400);
        return;
      }
      source.balances[symbol] = Number(((source.balances[symbol] ?? 0) - transferAmount - fee).toFixed(8));
      destination.balances[symbol] = Number(((destination.balances[symbol] ?? 0) + transferAmount).toFixed(8));
      const transaction = {
        id: `simtx_smoke_${Date.now()}`,
        clientRequestId: body.transfer.clientRequestId,
        sourceWalletId: source.walletId,
        sourceAccountId: source.id,
        destinationWalletId: destination.walletId,
        destinationAccountId: destination.id,
        senderAddress: source.address,
        recipientAddress: destination.address,
        tokenSymbol: symbol,
        amount: transferAmount,
        fee,
        feeSymbol: symbol,
        network: symbol === "BNB" ? "BNB Smart Chain" : symbol,
        timestamp: new Date().toISOString(),
        status: "completed",
        note: "SIMULATED TRANSFER — NOT BROADCAST ON-CHAIN",
      };
      snapshot.transactions.unshift(transaction);
      await fulfill(route, { connected: true, snapshot: responseSnapshot(), transaction: clone(transaction) });
      return;
    }

    await fulfill(route, { code: "INVALID_REQUEST", error: "Unknown shared wallet action." }, 400);
  };
}

// Regression: installed PWAs can have isolated browser storage. They must still
// resolve to the same server-side owner after the same user signs in, and a
// foregrounded receiving PWA must pull an asset it did not previously hold.
const sharedOwnerId = `lic_${crypto.randomUUID().replaceAll("-", "")}`;
const phantomContext = await createMobileContext(sharedOwnerId);
const trustContext = await createMobileContext(sharedOwnerId);
const sharedWalletLedger = createInMemoryWalletLedger(sharedOwnerId);
await Promise.all([
  phantomContext.route("**/api/wallet-ledger", sharedWalletLedger),
  trustContext.route("**/api/wallet-ledger", sharedWalletLedger),
]);
const phantomPage = await phantomContext.newPage();
const trustPage = await trustContext.newPage();
capturePageErrors(phantomPage, "cross-PWA Phantom");
capturePageErrors(trustPage, "cross-PWA Trust");

await phantomPage.goto(`${baseUrl}/download-wallet`, { waitUntil: "domcontentloaded" });
await phantomPage.getByLabel("Search Phantom").waitFor({ timeout: 20_000 });
await phantomPage.getByRole("button", { name: "Open wallet actions" }).click();
await phantomPage.getByRole("button", { name: "Send", exact: true }).click();
await phantomPage.getByText("Shared network connected:", { exact: false }).waitFor({ timeout: 20_000 });
await phantomPage.getByRole("button", { name: "Close", exact: true }).click();

await trustPage.goto(`${baseUrl}/trust-wallet`, { waitUntil: "domcontentloaded" });
await trustPage.getByRole("button", { name: "Send", exact: true }).waitFor({ timeout: 20_000 });
await trustPage.getByRole("button", { name: "Send", exact: true }).click();
const crossWalletTransfer = trustPage.locator("section[aria-label='Send']");
await crossWalletTransfer.getByText("Shared network connected:", { exact: false }).waitFor({ timeout: 20_000 });
await crossWalletTransfer.getByLabel("Source wallet").selectOption("trust");
await crossWalletTransfer.getByLabel("Currency").selectOption("BNB");
const transferSelects = crossWalletTransfer.locator("select");
if (await transferSelects.count() !== 5) throw new Error("Cross-PWA transfer form did not expose the expected wallet and account selectors.");
await transferSelects.nth(3).selectOption("ghost");
await crossWalletTransfer.getByLabel("Transfer amount").fill("0.2999");
await crossWalletTransfer.getByRole("button", { name: /Review transfer/ }).click();
await crossWalletTransfer.getByRole("heading", { name: "Review transfer" }).waitFor();
await crossWalletTransfer.getByRole("button", { name: "Confirm transfer" }).click();
await crossWalletTransfer.getByRole("heading", { name: "Transfer complete" }).waitFor({ timeout: 10_000 });

await phantomPage.bringToFront();
await phantomPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
const receivedBnbHolding = phantomPage.getByRole("button")
  .filter({ hasText: "BNB" })
  .filter({ hasText: "0.2999 BNB" })
  .first();
await receivedBnbHolding.waitFor({ state: "visible", timeout: 6_000 });
await receivedBnbHolding.locator('img[alt="BNB logo"]').waitFor({ state: "attached" });

await phantomPage.getByRole("button", { name: "Open wallet menu" }).click();
await phantomPage.getByRole("button", { name: "Activity", exact: true }).click();
const phantomActivity = phantomPage.locator("section[aria-label='Activity']");
await phantomActivity.getByText("Received BNB", { exact: true }).waitFor({ timeout: 6_000 });
await phantomActivity.getByText("+0.2999", { exact: false }).waitFor();

await trustContext.close();
await phantomContext.close();

const actionableErrors = errors.filter((message) => !message.includes("Failed to load resource") && !message.includes("net::ERR"));
await browser.close();
if (actionableErrors.length) throw new Error(`Browser errors: ${actionableErrors.join(" | ")}`);

console.log("Mobile wallet smoke test passed: shared transfer/persistence, isolated-PWA BNB receipt/activity, plus Ledger and Trust functional flows.");
