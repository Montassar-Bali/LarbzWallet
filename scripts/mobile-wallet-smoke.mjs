import { chromium } from "playwright-core";

const baseUrl = process.env.WALLET_TEST_URL || "http://localhost:3000";
const executablePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
/** @type {import("playwright-core").BrowserContextOptions} */
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
await page.waitForLoadState("load");
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
const activatedLedgerKey = `larpz_wallet_ledger_v2:${activatedIdentity.id}`;
await context.route("**/api/wallet-ledger", createInMemoryWalletLedger(activatedIdentity.id));

await assertMobileLayout("/download-wallet", "Search Phantom", 20_000);
await page.getByText("Parody wallet", { exact: true }).waitFor();
const phantomFontFamily = await page.locator(".download-wallet-app").evaluate((element) => getComputedStyle(element).fontFamily);
if (!phantomFontFamily.includes("-apple-system") || !phantomFontFamily.includes("SF Pro Text")) {
  throw new Error(`Phantom did not use the iOS system font stack: ${phantomFontFamily}`);
}
if (await page.getByText("Demo · No real funds", { exact: true }).isVisible().catch(() => false)) {
  throw new Error("Phantom still shows the repeated demo disclaimer instead of its compact parody watermark.");
}
if (await page.getByRole("button", { name: "Not Now" }).isVisible().catch(() => false)) await page.getByRole("button", { name: "Not Now" }).click();
await page.waitForTimeout(650);

const homeNavigation = page.locator(".phantom-home-nav");
for (const label of ["Home", "Trade", "Predictions", "Explore"]) {
  if (await homeNavigation.getByRole("button", { name: label, exact: true }).count() !== 1) {
    throw new Error(`Phantom navigation is missing the English ${label} label.`);
  }
}

const dock = page.locator(".phantom-home-dock");
const searchPill = page.getByTestId("phantom-home-search");
const searchField = page.getByLabel("Search Phantom");
const walletActionsButton = page.getByRole("button", { name: "Open wallet actions" });
const [dockBox, searchBox, inputBox, actionsBox] = await Promise.all([
  dock.boundingBox(),
  searchPill.boundingBox(),
  searchField.boundingBox(),
  walletActionsButton.boundingBox(),
]);
if (!dockBox || !searchBox || !inputBox || !actionsBox) {
  throw new Error("Phantom home dock controls did not render.");
}
const right = (box) => box.x + box.width;
const bottom = (box) => box.y + box.height;
for (const [name, box] of [["dock", dockBox], ["search", searchBox], ["input", inputBox], ["actions", actionsBox]]) {
  if (box.x < -0.5 || box.y < -0.5 || right(box) > 390.5 || bottom(box) > 844.5) {
    throw new Error(`Phantom ${name} is clipped outside the mobile viewport: ${JSON.stringify(box)}`);
  }
}
if (Math.abs(dockBox.x) > 1 || Math.abs(dockBox.width - 390) > 1 || Math.abs(bottom(dockBox) - 844) > 1) {
  throw new Error(`Phantom dock is not centered across the viewport: ${JSON.stringify(dockBox)}`);
}
if (searchBox.width < 260 || actionsBox.width < 55 || actionsBox.height < 55) {
  throw new Error(`Phantom dock controls are undersized: ${JSON.stringify({ searchBox, actionsBox })}`);
}
const dockGap = actionsBox.x - right(searchBox);
const verticalCenterDifference = Math.abs((searchBox.y + searchBox.height / 2) - (actionsBox.y + actionsBox.height / 2));
if (dockGap < 11 || dockGap > 13 || verticalCenterDifference > 1 || searchBox.x < 19 || right(actionsBox) > 371) {
  throw new Error(`Phantom dock spacing does not match the reference: ${JSON.stringify({ dockGap, verticalCenterDifference, searchBox, actionsBox })}`);
}
const dockControlsAreReachable = await page.evaluate(() => {
  const input = document.querySelector('input[aria-label="Search Phantom"]');
  const button = document.querySelector('button[aria-label="Open wallet actions"]');
  if (!(input instanceof HTMLElement) || !(button instanceof HTMLElement)) return false;
  return [input, button].every((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(hit && element.contains(hit));
  });
});
if (!dockControlsAreReachable) throw new Error("Phantom dock controls are visually covered and cannot be tapped.");

const cashMarkBox = await page.getByTestId("phantom-cash-mark").boundingBox();
const cashLabelBox = await page.getByTestId("phantom-cash-label").boundingBox();
if (!cashMarkBox || !cashLabelBox || cashMarkBox.width < 23 || cashMarkBox.width > 25 || cashMarkBox.height < 19 || cashMarkBox.height > 21) {
  throw new Error(`Phantom Cash did not use the filled reference-sized banknote mark: ${JSON.stringify({ cashMarkBox, cashLabelBox })}`);
}
const cashMarkGap = cashLabelBox.x - right(cashMarkBox);
if (cashMarkGap < 15 || cashMarkGap > 17) throw new Error(`Phantom Cash mark spacing is incorrect: ${cashMarkGap}px.`);

await searchField.fill("sol");
await page.waitForFunction(() => document.querySelectorAll(".phantom-home-token-row").length === 1);
const filteredTokenText = await page.locator(".phantom-home-token-row").innerText();
if (!filteredTokenText.includes("Solana")) throw new Error(`Search Phantom returned the wrong token: ${filteredTokenText}`);
await searchField.fill("");
await page.waitForFunction(() => document.querySelectorAll(".phantom-home-token-row").length > 1);

const refreshWalletButton = page.getByRole("button", { name: "Refresh wallet data" });
await refreshWalletButton.waitFor();
await refreshWalletButton.click();
await page.locator('[role="status"]').filter({ hasText: "Refreshing wallet" }).waitFor();
await page.locator('[role="status"]').filter({ hasText: "Wallet updated" }).waitFor({ timeout: 10_000 });
await page.getByRole("button", { name: "Open wallet actions" }).click();
await page.getByRole("button", { name: "Send" }).click();
await page.getByRole("heading", { name: "Send" }).waitFor();
await page.getByRole("button", { name: "Choose one of my accounts" }).click();
await page.getByRole("button", { name: "Use Ledger Account 1" }).click();
await page.getByLabel("Transfer amount").fill("0.01");
await page.waitForFunction(() => [...document.querySelectorAll("button")]
  .some((button) => button.textContent?.includes("Review transfer") && !button.disabled));
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

await page.getByRole("button", { name: "Close Send" }).click();
const expectedPhantomSol = source.balances.SOL;
const expectedPhantomSolLabel = `${expectedPhantomSol.toLocaleString("en-US", { maximumFractionDigits: 5 })} SOL`;
const updatedSolanaHomeRow = page.getByRole("button")
  .filter({ hasText: "Solana" })
  .filter({ hasText: expectedPhantomSolLabel })
  .first();
await updatedSolanaHomeRow.waitFor({ state: "visible", timeout: 6_000 });

await page.getByRole("button", { name: "Open wallet menu" }).click();
await page.getByRole("button", { name: "Profile", exact: true }).click();
await page.getByRole("heading", { name: "Edit Profile" }).waitFor();
const profileSolanaHolding = page.getByLabel("Solana holding");
await profileSolanaHolding.waitFor();
const profileSolanaAmount = Number(await profileSolanaHolding.inputValue());
if (Math.abs(profileSolanaAmount - expectedPhantomSol) > 1e-8) {
  throw new Error(`Edit Profile SOL holding ${profileSolanaAmount} did not match the homepage/account balance ${expectedPhantomSol}.`);
}
await page.getByRole("button", { name: "Go back" }).click();
await page.getByLabel("Search Phantom").waitFor();

await page.getByRole("button", { name: "Open wallet actions" }).click();
await page.getByRole("button", { name: "Receive", exact: true }).click();
const receiveSheet = page.locator("section[aria-label='Receive']");
await receiveSheet.getByRole("heading", { name: "Receive" }).waitFor();
await receiveSheet.getByRole("tab", { name: "Token" }).waitFor();
await receiveSheet.getByRole("tab", { name: "Cash" }).waitFor();
await receiveSheet.getByRole("img", { name: "Wallet address QR code" }).waitFor();
await receiveSheet.getByRole("button", { name: "Copy address" }).waitFor();
await receiveSheet.getByRole("tab", { name: "Cash" }).click();
await receiveSheet.getByText("Stablecoins · Arrives as cash", { exact: true }).waitFor();
await receiveSheet.getByRole("button", { name: "About receiving cash" }).click();
const cashHelpDialog = receiveSheet.getByRole("dialog", { name: "Add cash with stablecoins" });
await cashHelpDialog.waitFor();
await cashHelpDialog.getByRole("button", { name: "Okay" }).click();
await cashHelpDialog.waitFor({ state: "hidden" });
await receiveSheet.press("Escape");
await receiveSheet.waitFor({ state: "hidden" });

const cashBeforeAdd = await page.evaluate((storageKey) => {
  const state = JSON.parse(window.localStorage.getItem(storageKey) || "null");
  const wallet = state?.wallets?.ghost;
  const account = wallet?.accounts?.find((candidate) => candidate.id === wallet.selectedAccountId);
  return Number(account?.balances?.USD ?? 0);
}, activatedLedgerKey);
if (!Number.isFinite(cashBeforeAdd)) throw new Error("Phantom cash balance was unavailable before Add Cash.");

await page.getByRole("button", { name: "Open wallet actions" }).click();
await page.getByRole("button", { name: "Add cash", exact: true }).click();
await page.getByRole("heading", { name: "Add Cash", exact: true }).waitFor();
await page.getByText("Parody wallet · No payment is processed", { exact: true }).waitFor();
await page.getByRole("button", { name: "Apple Pay", exact: true }).click();
const paymentMethodsDialog = page.getByRole("dialog", { name: "Payment methods" });
await paymentMethodsDialog.waitFor();
await paymentMethodsDialog.getByText("Debit card required", { exact: true }).waitFor();
await paymentMethodsDialog.getByRole("radio", { name: "Card", exact: true }).click();
await paymentMethodsDialog.waitFor({ state: "hidden" });
await page.getByRole("button", { name: "Card", exact: true }).waitFor();
await page.getByRole("button", { name: "$50", exact: true }).click();
await page.getByRole("button", { name: "Edit cash amount" }).waitFor();
await page.getByText("50 CASH", { exact: true }).waitFor();
await page.getByText("Payment", { exact: true }).waitFor();
await page.getByText("Card · $1.52 fee", { exact: true }).waitFor();
await page.getByText("Delivery", { exact: true }).waitFor();
await page.getByRole("button", { name: "Add Cash", exact: true }).click();
await page.getByLabel("Search Phantom").waitFor();
await page.waitForFunction(({ storageKey, previousCash }) => {
  const state = JSON.parse(window.localStorage.getItem(storageKey) || "null");
  const wallet = state?.wallets?.ghost;
  const account = wallet?.accounts?.find((candidate) => candidate.id === wallet.selectedAccountId);
  return Math.abs(Number(account?.balances?.USD ?? 0) - previousCash - 50) <= 1e-9;
}, { storageKey: activatedLedgerKey, previousCash: cashBeforeAdd }, { timeout: 6_000 });

const cashAfterAdd = await page.evaluate((storageKey) => {
  const state = JSON.parse(window.localStorage.getItem(storageKey) || "null");
  const wallet = state?.wallets?.ghost;
  const account = wallet?.accounts?.find((candidate) => candidate.id === wallet.selectedAccountId);
  return Number(account?.balances?.USD ?? 0);
}, activatedLedgerKey);
if (Math.abs(cashAfterAdd - cashBeforeAdd - 50) > 1e-9) {
  throw new Error(`Add Cash changed Phantom cash by ${cashAfterAdd - cashBeforeAdd}, expected exactly $50.`);
}
const expectedCashLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(cashAfterAdd);
await page.waitForFunction((expectedLabel) => [...document.querySelectorAll("button")]
  .some((button) => button.textContent?.includes("Cash") && button.textContent.includes(expectedLabel)), expectedCashLabel, { timeout: 6_000 })
  .catch(async () => {
    const visibleCashRows = await page.getByRole("button").filter({ hasText: "Cash" }).allInnerTexts();
    throw new Error(`Phantom home did not render ${expectedCashLabel} after Add Cash. Cash buttons: ${JSON.stringify(visibleCashRows)}`);
  });

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
await phantomPage.getByRole("button", { name: "Choose one of my accounts" }).click();
await phantomPage.getByRole("button", { name: "Use Ledger Account 1" }).click();
await phantomPage.waitForFunction(() => [...document.querySelectorAll("button")]
  .some((button) => button.textContent?.includes("Review transfer") && !button.disabled), undefined, { timeout: 20_000 });
await phantomPage.getByRole("button", { name: "Close Send" }).click();

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

console.log("Mobile wallet smoke test passed: Phantom recipient-first send and Token/Cash receive, shared transfer/persistence, isolated-PWA BNB receipt/activity, plus Ledger and Trust functional flows.");
