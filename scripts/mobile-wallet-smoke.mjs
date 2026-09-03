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

async function createMobileContext(ownerId = null, cameraQrPayload = "sim_ledger_cameraqr123") {
  const mobileContext = await browser.newContext(mobileContextOptions);
  await mobileContext.addInitScript(({ syntheticOwnerId, syntheticCameraQrPayload }) => {
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

    if (syntheticCameraQrPayload) {
      const cameraState = { requested: false, constraints: null, detections: 0, tracksStopped: 0 };
      Object.defineProperty(window, "__walletQrCamera", { configurable: true, value: cameraState });
      Object.defineProperty(window, "BarcodeDetector", {
        configurable: true,
        value: class MockBarcodeDetector {
          static async getSupportedFormats() { return ["qr_code"]; }
          async detect() {
            cameraState.detections += 1;
            if (cameraState.detections < 2) return [];
            return [{
              rawValue: syntheticCameraQrPayload,
              cornerPoints: [{ x: 20, y: 20 }, { x: 180, y: 20 }, { x: 180, y: 180 }, { x: 20, y: 180 }],
            }];
          }
        },
      });
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          async enumerateDevices() {
            return [{ deviceId: "smoke-back-camera", groupId: "smoke", kind: "videoinput", label: "Back Camera", toJSON: () => ({}) }];
          },
          getSupportedConstraints() { return { facingMode: true, width: true, height: true }; },
          async getUserMedia(constraints) {
            cameraState.requested = true;
            cameraState.constraints = constraints;
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 320;
            const context = canvas.getContext("2d");
            let frame = 0;
            const draw = () => {
              if (!context) return;
              context.fillStyle = frame++ % 2 ? "#111" : "#222";
              context.fillRect(0, 0, canvas.width, canvas.height);
            };
            draw();
            const interval = window.setInterval(draw, 50);
            const stream = canvas.captureStream(10);
            for (const track of stream.getTracks()) {
              const stop = track.stop.bind(track);
              track.stop = () => {
                cameraState.tracksStopped += 1;
                window.clearInterval(interval);
                stop();
              };
            }
            return stream;
          },
        },
      });
    }
  }, { syntheticOwnerId: ownerId, syntheticCameraQrPayload: cameraQrPayload });
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

async function assertMobileLayout(route, readyText, timeout = 15_000, navigate = true) {
  if (navigate) await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
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

async function assertWritingFieldsAvoidIosZoom(targetPage, screen) {
  const undersized = await targetPage.locator("input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='hidden']), textarea, select").evaluateAll((elements) => elements.flatMap((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const fontSize = Number.parseFloat(style.fontSize);
    if (style.display === "none" || style.visibility === "hidden" || bounds.width <= 0 || bounds.height <= 0 || fontSize >= 16) return [];
    return [{
      control: element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.getAttribute("name") || element.id || element.tagName.toLowerCase(),
      fontSize,
    }];
  }));
  if (undersized.length > 0) {
    throw new Error(`${screen} has writing fields that can trigger iOS auto-zoom: ${JSON.stringify(undersized)}`);
  }
}

async function enterWalletKeypadAmount(targetPage, inputLabel, value) {
  const input = targetPage.getByLabel(inputLabel);
  const initialValue = await input.inputValue();
  if (initialValue !== "0") {
    throw new Error(`${inputLabel} did not start from a clean zero value: ${initialValue}`);
  }
  const keypad = targetPage.locator('[aria-label="Numeric keypad"]');
  for (const character of value.replace(/^0(?=\.)/, "")) {
    const buttonName = character === "." ? "Decimal point" : character;
    await keypad.getByRole("button", { name: buttonName, exact: true }).click();
  }
  const enteredValue = await input.inputValue();
  if (enteredValue !== value) {
    throw new Error(`${inputLabel} keypad entered ${enteredValue} instead of ${value}.`);
  }
}

async function assertViewportContentFits(targetPage, screen, expectedWidth) {
  const layout = await targetPage.evaluate(() => {
    const nav = document.querySelector('[data-testid="ledger-bottom-nav"]');
    const balance = document.querySelector('[data-testid="ledger-portfolio-balance"]');
    const navBounds = nav?.getBoundingClientRect();
    const balanceBounds = balance?.getBoundingClientRect();
    const balanceStyle = balance ? getComputedStyle(balance) : null;
    const navTargets = nav ? [...nav.querySelectorAll("button")].map((button) => button.getBoundingClientRect()) : [];
    return {
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      navBounds: navBounds ? { left: navBounds.left, right: navBounds.right, width: navBounds.width } : null,
      balanceFits: balance ? balance.scrollWidth <= balance.clientWidth + 1 || (balanceStyle?.overflowX === "hidden" && balanceStyle.textOverflow === "ellipsis") : false,
      balanceBounds: balanceBounds ? { left: balanceBounds.left, right: balanceBounds.right } : null,
      navTargets: navTargets.map((bounds) => ({ width: bounds.width, height: bounds.height })),
    };
  });
  const tolerance = 1;
  const contentOverflows = layout.documentWidth > expectedWidth + tolerance || layout.bodyWidth > expectedWidth + tolerance;
  const navOverflows = !layout.navBounds || layout.navBounds.left < -tolerance || layout.navBounds.right > expectedWidth + tolerance;
  const balanceOverflows = !layout.balanceFits || !layout.balanceBounds || layout.balanceBounds.left < -tolerance || layout.balanceBounds.right > expectedWidth + tolerance;
  const undersizedTargets = layout.navTargets.filter((bounds) => bounds.width < 44 || bounds.height < 44);
  if (layout.innerWidth !== expectedWidth || contentOverflows || navOverflows || balanceOverflows || undersizedTargets.length > 0) {
    throw new Error(`${screen} does not fit the ${expectedWidth}px viewport: ${JSON.stringify({ ...layout, undersizedTargets })}`);
  }
}

async function assertTrustViewportContentFits(targetPage, screen, expectedWidth) {
  const layout = await targetPage.evaluate(() => {
    const root = document.querySelector('[data-testid="trust-home"]');
    const nav = document.querySelector('[data-testid="trust-bottom-nav"]');
    const balance = document.querySelector('[data-testid="trust-portfolio-balance"]');
    const rootBounds = root?.getBoundingClientRect();
    const navBounds = nav?.getBoundingClientRect();
    const balanceBounds = balance?.getBoundingClientRect();
    const balanceStyle = balance ? getComputedStyle(balance) : null;
    const navTargets = nav ? [...nav.querySelectorAll("button")].map((button) => button.getBoundingClientRect()) : [];
    return {
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      rootBounds: rootBounds ? { left: rootBounds.left, right: rootBounds.right, width: rootBounds.width } : null,
      navBounds: navBounds ? { left: navBounds.left, right: navBounds.right, width: navBounds.width } : null,
      balanceFits: balance ? balance.scrollWidth <= balance.clientWidth + 1 || balanceStyle?.overflowX === "hidden" : false,
      balanceBounds: balanceBounds ? { left: balanceBounds.left, right: balanceBounds.right } : null,
      navTargets: navTargets.map((bounds) => ({ width: bounds.width, height: bounds.height })),
    };
  });
  const tolerance = 1;
  const contentOverflows = layout.documentWidth > expectedWidth + tolerance || layout.bodyWidth > expectedWidth + tolerance;
  const rootOverflows = !layout.rootBounds || layout.rootBounds.left < -tolerance || layout.rootBounds.right > expectedWidth + tolerance;
  const navOverflows = !layout.navBounds || layout.navBounds.left < -tolerance || layout.navBounds.right > expectedWidth + tolerance;
  const balanceOverflows = !layout.balanceFits || !layout.balanceBounds || layout.balanceBounds.left < -tolerance || layout.balanceBounds.right > expectedWidth + tolerance;
  const undersizedTargets = layout.navTargets.filter((bounds) => bounds.width < 44 || bounds.height < 44);
  if (layout.innerWidth !== expectedWidth || contentOverflows || rootOverflows || navOverflows || balanceOverflows || undersizedTargets.length > 0) {
    throw new Error(`${screen} does not fit the ${expectedWidth}px viewport: ${JSON.stringify({ ...layout, undersizedTargets })}`);
  }
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
await context.route("**/api/wallet-ledger", createInMemoryWalletLedger(activatedIdentity.id));

await assertMobileLayout("/download-wallet", "Search Phantom", 20_000);
await assertWritingFieldsAvoidIosZoom(page, "Phantom home");
const responsiveHomeLayout = await page.evaluate(() => {
  const tabs = document.querySelector('[data-testid="phantom-wallet-tabs"]');
  const total = document.querySelector('[data-testid="phantom-total-balance"]');
  const firstTokenValue = document.querySelector('[data-testid="phantom-token-value"]');
  const firstTokenRow = firstTokenValue?.closest(".phantom-home-token-row");
  if (!tabs || !total || !firstTokenValue || !firstTokenRow) return null;

  const originalTotal = total.textContent;
  const originalTokenValue = firstTokenValue.textContent;
  total.textContent = "$13,989,671.05";
  firstTokenValue.textContent = "$13,988,310.00";

  const tabLabelsFit = [...tabs.querySelectorAll("button")]
    .every((button) => button.scrollWidth <= button.clientWidth + 1);
  const result = {
    tabsFit: tabs.scrollWidth <= tabs.clientWidth + 1 && tabLabelsFit,
    totalFits: total.scrollWidth <= total.clientWidth + 1,
    tokenFits: firstTokenRow.scrollWidth <= firstTokenRow.clientWidth + 1,
  };
  total.textContent = originalTotal;
  firstTokenValue.textContent = originalTokenValue;
  return result;
});
if (!responsiveHomeLayout?.tabsFit || !responsiveHomeLayout.totalFits || !responsiveHomeLayout.tokenFits) {
  throw new Error(`Phantom home does not fit large values at 390px: ${JSON.stringify(responsiveHomeLayout)}`);
}
const phantomFontFamily = await page.locator(".download-wallet-app").evaluate((element) => getComputedStyle(element).fontFamily);
if (!phantomFontFamily.toLowerCase().includes("sans-serif")) {
  throw new Error(`Phantom did not use the requested sans-serif font: ${phantomFontFamily}`);
}
if (await page.getByText("Demo · No real funds", { exact: true }).isVisible().catch(() => false)) {
  throw new Error("Phantom still shows the repeated demo disclaimer instead of its compact parody watermark.");
}
if (await page.getByRole("button", { name: "Not Now" }).isVisible().catch(() => false)) await page.getByRole("button", { name: "Not Now" }).click();
const refreshWalletButton = page.getByRole("button", { name: "Refresh wallet data" });
await refreshWalletButton.waitFor();
await refreshWalletButton.click();
const phantomRefreshStatus = page.locator('[role="status"]').filter({ hasText: "Refreshing wallet" });
await phantomRefreshStatus.waitFor();
await phantomRefreshStatus.waitFor({ state: "hidden", timeout: 5_000 });
await page.getByRole("button", { name: "Open wallet actions" }).click();
await page.getByRole("button", { name: "Send" }).click();
const phantomSendSheet = page.locator("section[aria-label='Send']");
await phantomSendSheet.getByRole("heading", { name: "Send" }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Phantom recipient screen");
const phantomRecipientInput = phantomSendSheet.getByLabel("Recipient username or wallet address");
const phantomRecipientFontSize = await phantomRecipientInput.evaluate((input) => Number.parseFloat(getComputedStyle(input).fontSize));
if (phantomRecipientFontSize < 16) {
  throw new Error(`Phantom recipient input can trigger iOS auto-zoom at ${phantomRecipientFontSize}px.`);
}
await phantomRecipientInput.tap();
await phantomRecipientInput.pressSequentially("sim_focus_probe", { delay: 15 });
const recipientFocusState = await phantomRecipientInput.evaluate((input) => ({
  focused: document.activeElement === input,
  value: input.value,
}));
if (!recipientFocusState.focused || recipientFocusState.value !== "sim_focus_probe" || !await phantomSendSheet.isVisible()) {
  throw new Error(`Phantom Send closed or lost its recipient input after focus/type: ${JSON.stringify(recipientFocusState)}`);
}

await phantomSendSheet.getByRole("button", { name: "Scan wallet QR code" }).click();
const cameraScanner = page.getByRole("dialog", { name: "QR code scanner" });
await cameraScanner.waitFor();
await cameraScanner.getByLabel("Live camera preview").waitFor();
await cameraScanner.waitFor({ state: "hidden", timeout: 8_000 });
const scannedRecipient = await phantomRecipientInput.inputValue();
if (scannedRecipient !== "sim_ledger_cameraqr123") {
  throw new Error(`Phantom camera scanner did not decode the wallet QR address: ${scannedRecipient}`);
}
await page.waitForFunction(() => window.__walletQrCamera?.requested && window.__walletQrCamera?.tracksStopped > 0);
const cameraState = await page.evaluate(() => window.__walletQrCamera);
if (!JSON.stringify(cameraState?.constraints).includes("environment")) throw new Error(`Phantom scanner did not request the rear camera: ${JSON.stringify(cameraState)}`);
await phantomSendSheet.getByRole("button", { name: "Send to this address" }).waitFor();
await phantomRecipientInput.fill("");
await page.getByRole("button", { name: "Choose one of my accounts" }).click();
await page.getByRole("button", { name: "Use Larpz Wallet Account 1" }).click();
await assertWritingFieldsAvoidIosZoom(page, "Phantom transfer form");
await page.getByLabel("Transfer amount").fill("0.01");
await page.waitForFunction(() => [...document.querySelectorAll("button")]
  .some((button) => button.textContent?.includes("Review transfer") && !button.disabled));
await page.getByRole("button", { name: /Review transfer/ }).click();
await page.getByRole("heading", { name: "Review transfer" }).waitFor();
await page.getByRole("button", { name: "Confirm transfer" }).click();
await page.getByRole("heading", { name: "Transfer complete" }).waitFor({ timeout: 10_000 });

const transferState = await page.evaluate(() => {
  const ownerId = JSON.parse(window.localStorage.getItem("larpz_session") || "null")?.userId;
  const safeOwnerId = typeof ownerId === "string" ? ownerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) : "";
  const key = safeOwnerId ? `larpz_wallet_ledger_v2:${safeOwnerId}` : "larpz_wallet_ledger_v1";
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
await assertWritingFieldsAvoidIosZoom(page, "Phantom profile");
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
await assertWritingFieldsAvoidIosZoom(page, "Phantom receive screen");
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
const receiveSwipeHandle = receiveSheet.locator('[data-swipe-dismiss-handle="true"]');
await receiveSwipeHandle.waitFor();
const receiveHandleBounds = await receiveSwipeHandle.boundingBox();
if (!receiveHandleBounds) throw new Error("Phantom Receive swipe handle has no visible bounds.");
const receiveHandleX = receiveHandleBounds.x + receiveHandleBounds.width / 2;
const receiveHandleY = receiveHandleBounds.y + receiveHandleBounds.height / 2;
await page.mouse.move(receiveHandleX, receiveHandleY);
await page.mouse.down();
await page.mouse.move(receiveHandleX, receiveHandleY + 150, { steps: 8 });
await page.mouse.up();
await receiveSheet.waitFor({ state: "hidden" });

const cashBeforeAdd = await page.evaluate(() => {
  const ownerId = JSON.parse(window.localStorage.getItem("larpz_session") || "null")?.userId;
  const safeOwnerId = typeof ownerId === "string" ? ownerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) : "";
  const key = safeOwnerId ? `larpz_wallet_ledger_v2:${safeOwnerId}` : "larpz_wallet_ledger_v1";
  const state = JSON.parse(window.localStorage.getItem(key) || "null");
  const wallet = state?.wallets?.ghost;
  const account = wallet?.accounts?.find((candidate) => candidate.id === wallet.selectedAccountId);
  return Number(account?.balances?.USD ?? 0);
});
if (!Number.isFinite(cashBeforeAdd)) throw new Error("Phantom cash balance was unavailable before Add Cash.");

await page.getByRole("button", { name: "Open wallet actions" }).click();
await page.getByRole("button", { name: "Add cash", exact: true }).click();
await page.getByRole("heading", { name: "Add Cash", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Phantom Add Cash");
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
await page.waitForFunction((expectedCash) => {
  const ownerId = JSON.parse(window.localStorage.getItem("larpz_session") || "null")?.userId;
  const safeOwnerId = typeof ownerId === "string" ? ownerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) : "";
  const state = safeOwnerId
    ? JSON.parse(window.localStorage.getItem(`larpz_wallet_ledger_v2:${safeOwnerId}`) || "null")
    : null;
  const wallet = state?.wallets?.ghost;
  const account = wallet?.accounts?.find((candidate) => candidate.id === wallet.selectedAccountId);
  return Math.abs(Number(account?.balances?.USD ?? Number.NaN) - expectedCash) < 1e-9;
}, cashBeforeAdd + 50, { timeout: 8_000 });

const cashAfterAdd = await page.evaluate(() => {
  const ownerId = JSON.parse(window.localStorage.getItem("larpz_session") || "null")?.userId;
  const safeOwnerId = typeof ownerId === "string" ? ownerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) : "";
  const key = safeOwnerId ? `larpz_wallet_ledger_v2:${safeOwnerId}` : "larpz_wallet_ledger_v1";
  const state = JSON.parse(window.localStorage.getItem(key) || "null");
  const wallet = state?.wallets?.ghost;
  const account = wallet?.accounts?.find((candidate) => candidate.id === wallet.selectedAccountId);
  return Number(account?.balances?.USD ?? 0);
});
if (Math.abs(cashAfterAdd - cashBeforeAdd - 50) > 1e-9) {
  const cashDebug = await page.evaluate(() => ({
    session: JSON.parse(window.localStorage.getItem("larpz_session") || "null"),
    profile: JSON.parse(window.localStorage.getItem("larpz_download_profile") || "null"),
    ledgerKeys: Object.keys(window.localStorage).filter((key) => key.startsWith("larpz_wallet_ledger")),
    visibleCashRows: [...document.querySelectorAll("button")]
      .filter((button) => button.textContent?.includes("Cash"))
      .map((button) => button.textContent),
  }));
  throw new Error(`Add Cash changed Phantom cash by ${cashAfterAdd - cashBeforeAdd}, expected exactly $50: ${JSON.stringify(cashDebug)}`);
}
const expectedCashLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(cashAfterAdd);
await page.getByRole("button").filter({ hasText: "Cash" }).filter({ hasText: expectedCashLabel }).first().waitFor();

const requestedLedgerCharts = [];
await context.route("**/api/market-chart**", async (route) => {
  const requestUrl = new URL(route.request().url());
  const symbol = (requestUrl.searchParams.get("symbol") || "SOL").toUpperCase();
  const period = (requestUrl.searchParams.get("period") || "1D").toUpperCase();
  requestedLedgerCharts.push(`${symbol}:${period}`);
  const basePrice = symbol === "BTC" ? 76_500 : symbol === "ETH" ? 2_420 : 185;
  const now = Date.now();
  const points = Array.from({ length: 18 }, (_, index) => ({
    time: now - (17 - index) * 60 * 60 * 1000,
    price: basePrice * (0.985 + index * 0.0014 + Math.sin(index / 2.2) * 0.006),
  }));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify({ symbol, period, points }),
  });
});

await assertMobileLayout("/ledger-wallet", "LARPZ WALLET · DEMO ONLY", 20_000);
await page.locator('[data-testid="ledger-home"]').waitFor();
await page.waitForFunction(() => document.body.innerText.includes("SOL"), undefined, { timeout: 10_000 });
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet home");
const ledgerHomeText = await page.locator('[data-testid="ledger-home"]').innerText();
if (/TikTok|@northlarp|recording indicator/i.test(ledgerHomeText)) {
  throw new Error("Larpz Wallet still contains source-video watermarks or recording UI.");
}

const ledgerBottomNav = page.locator('[data-testid="ledger-bottom-nav"]');
await ledgerBottomNav.waitFor();
for (const tab of ["Home", "Swap", "Earn", "Card"]) {
  await ledgerBottomNav.getByRole("button", { name: tab, exact: true }).waitFor();
}

const originalLedgerBalance = await page.locator('[data-testid="ledger-portfolio-balance"]').textContent();
await page.locator('[data-testid="ledger-portfolio-balance"]').evaluate((element) => { element.textContent = "$98,765,432,109,876.54"; });
for (const viewport of [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
]) {
  await page.setViewportSize(viewport);
  await assertViewportContentFits(page, "Larpz Wallet home", viewport.width);
}
await page.locator('[data-testid="ledger-portfolio-balance"]').evaluate((element, original) => { element.textContent = original; }, originalLedgerBalance);
await page.setViewportSize({ width: 390, height: 844 });

const ledgerActions = page.locator('section[aria-label="Wallet actions"]');
await ledgerActions.getByRole("button", { name: "Receive", exact: true }).click();
const ledgerReceiveSheet = page.locator("section[aria-label='Receive']");
await ledgerReceiveSheet.getByRole("heading", { name: "Receive", exact: true }).waitFor();
await ledgerReceiveSheet.getByRole("img", { name: "Wallet address QR code" }).waitFor();
await ledgerReceiveSheet.getByText("Receive in Account 1", { exact: true }).waitFor();
await ledgerReceiveSheet.getByRole("button", { name: /Larpz Wallet address/ }).click();
await ledgerReceiveSheet.getByText("Address copied", { exact: true }).waitFor();
await ledgerReceiveSheet.getByRole("button", { name: "Close", exact: true }).click();
await ledgerReceiveSheet.waitFor({ state: "hidden" });

await ledgerActions.getByRole("button", { name: "Send", exact: true }).click();
const ledgerSendSheet = page.locator("section[aria-label='Send']");
await ledgerSendSheet.getByRole("heading", { name: "Send", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet send");
if (await ledgerSendSheet.getByLabel("Source wallet").inputValue() !== "ledger") {
  throw new Error("Larpz Wallet Send did not default to its own source account.");
}
await ledgerSendSheet.getByRole("button", { name: "Scan recipient QR code" }).click();
const ledgerCameraScanner = page.getByRole("dialog", { name: "QR code scanner" });
await ledgerCameraScanner.waitFor();
await ledgerCameraScanner.getByLabel("Live camera preview").waitFor();
await ledgerCameraScanner.waitFor({ state: "hidden", timeout: 8_000 });
const ledgerScannedAddress = await ledgerSendSheet.getByLabel("Destination wallet address").inputValue();
if (ledgerScannedAddress !== "sim_ledger_cameraqr123") {
  throw new Error(`Larpz Wallet camera scanner did not populate the real destination field: ${ledgerScannedAddress}`);
}
await ledgerSendSheet.getByRole("button", { name: "Close", exact: true }).click();
await ledgerSendSheet.waitFor({ state: "hidden" });

await page.getByRole("button", { name: "Accounts", exact: true }).click();
const ledgerAccountsSheet = page.locator("section[aria-label='Accounts']");
await ledgerAccountsSheet.getByRole("heading", { name: "Accounts", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet accounts");
await ledgerAccountsSheet.getByLabel("New account name").fill("Smoke Larpz Account");
await ledgerAccountsSheet.getByRole("button", { name: "Add account", exact: true }).click();
await ledgerAccountsSheet.getByText("Smoke Larpz Account", { exact: true }).waitFor();
await ledgerAccountsSheet.getByRole("button", { name: "Close", exact: true }).click();
await ledgerAccountsSheet.waitFor({ state: "hidden" });

await page.getByRole("button", { name: "Search Larpz Wallet" }).click();
await page.getByRole("heading", { name: "Search", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet search");
const ledgerSearch = page.getByLabel("Search assets and activity");
await ledgerSearch.fill("Solana");
await page.getByRole("button").filter({ hasText: "Solana" }).first().waitFor();
await page.getByRole("button", { name: "Clear search" }).click();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await page.getByRole("button", { name: "Open Larpz Wallet settings" }).click();
await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet settings");
await page.getByLabel("Currency").selectOption("EUR");
await page.getByLabel("Optional market API key").fill("smoke-market-key-2026");
await page.getByRole("checkbox", { name: "Pro market details" }).check();
await page.getByRole("radio", { name: "Send first", exact: true }).click();
await page.getByRole("radio", { name: "light", exact: true }).click();
await page.getByRole("button", { name: "Save settings", exact: true }).click();
await page.getByText("Settings saved on this device.", { exact: true }).waitFor();
await page.locator('html[data-ledger-color-scheme="light"]').waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();
await page.locator('[data-testid="ledger-home"]').waitFor();
await page.waitForFunction(() => document.querySelector('section[aria-label="Wallet actions"] button')?.textContent?.trim() === "Send");

await page.reload({ waitUntil: "domcontentloaded" });
await page.locator('[data-testid="ledger-home"]').waitFor({ timeout: 20_000 });
await page.locator('html[data-ledger-color-scheme="light"]').waitFor();
await page.waitForFunction(() => document.querySelector('section[aria-label="Wallet actions"] button')?.textContent?.trim() === "Send");
await page.getByRole("button", { name: "Open Larpz Wallet settings" }).click();
await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
if (await page.getByLabel("Currency").inputValue() !== "EUR" || await page.getByLabel("Optional market API key").inputValue() !== "smoke-market-key-2026") {
  throw new Error("Larpz Wallet settings did not persist after reload.");
}
if (!await page.getByRole("checkbox", { name: "Pro market details" }).isChecked() || !await page.getByRole("radio", { name: "Send first", exact: true }).isChecked()) {
  throw new Error("Larpz Wallet market and quick-action preferences did not persist after reload.");
}
await page.getByRole("button", { name: "Manage accounts", exact: true }).click();
await page.locator("section[aria-label='Accounts']").getByText("Smoke Larpz Account", { exact: true }).waitFor();
await page.locator("section[aria-label='Accounts']").getByRole("button", { name: "Close", exact: true }).click();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await page.getByRole("button", { name: "Refresh portfolio" }).click();
const ledgerRefreshStatus = page.getByRole("status").filter({ hasText: "Refreshing portfolio" });
await ledgerRefreshStatus.waitFor();
await ledgerRefreshStatus.waitFor({ state: "hidden", timeout: 5_000 });

await page.locator('section[aria-label="Wallet actions"]').getByRole("button", { name: "Buy", exact: true }).click();
await page.getByRole("heading", { name: "Buy", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet buy");
await page.locator("#ledger-buy-asset").selectOption("SOL");
await page.locator("#ledger-buy-amount").fill("5");
await page.getByRole("button", { name: "Add to demo balance", exact: true }).click();
await page.getByRole("status").filter({ hasText: /SOL added to this demo account/ }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await page.getByRole("button").filter({ hasText: "Solana" }).last().click();
await page.getByLabel("Select asset").waitFor();
if (await page.getByLabel("Select asset").inputValue() !== "SOL") throw new Error("The Solana asset row did not open the SOL detail screen.");
await page.getByRole("img", { name: "SOL 1D market price chart" }).waitFor({ timeout: 10_000 });
for (const period of ["1W", "1M", "1Y", "ALL"]) {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/market-chart" && url.searchParams.get("symbol") === "SOL" && url.searchParams.get("period") === period;
  });
  await page.getByRole("tab", { name: period, exact: true }).click();
  await responsePromise;
  await page.getByRole("img", { name: `SOL ${period} market price chart` }).waitFor();
}
for (const period of ["1D", "1W", "1M", "1Y", "ALL"]) {
  if (!requestedLedgerCharts.includes(`SOL:${period}`)) throw new Error(`The SOL ${period} chart was not requested.`);
}
await page.getByText("Smoke Larpz Account", { exact: true }).waitFor();
await page.getByRole("button", { name: "Transfer", exact: true }).click();
await page.locator("section[aria-label='Send']").getByRole("heading", { name: "Send", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet asset transfer");
await page.locator("section[aria-label='Send']").getByRole("button", { name: "Close", exact: true }).click();
const bitcoinChartResponse = page.waitForResponse((response) => {
  const url = new URL(response.url());
  return url.pathname === "/api/market-chart" && url.searchParams.get("symbol") === "BTC" && url.searchParams.get("period") === "ALL";
});
await page.getByLabel("Select asset").selectOption("BTC");
await bitcoinChartResponse;
await page.getByRole("img", { name: "BTC ALL market price chart" }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await page.getByRole("button", { name: "Discover markets" }).click();
await page.getByRole("heading", { name: "Explore", exact: true }).waitFor();
await page.getByText(/Market cap/).first().waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();
await page.getByRole("button").filter({ hasText: "Explore perpetual markets" }).click();
await page.getByRole("heading", { name: "Perpetuals", exact: true }).waitFor();
await page.getByText("No leveraged order or real-money position is opened.", { exact: false }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await page.getByRole("button", { name: "Open transaction history" }).click();
await page.getByRole("heading", { name: "Transaction history", exact: true }).waitFor();
await page.getByText("SOL Main", { exact: true }).first().waitFor();
await page.getByRole("button", { name: "Back to home", exact: true }).click();

await ledgerBottomNav.getByRole("button", { name: "Swap", exact: true }).click();
await page.getByRole("heading", { name: "Swap", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet swap");
await page.getByLabel("Token to receive").selectOption("ETH");
await page.getByLabel("Token to pay").selectOption("SOL");
await page.getByLabel("Swap amount").fill("0.001");
await page.getByRole("button", { name: "Review swap", exact: true }).click();
await page.getByRole("status").filter({ hasText: /Swapped .* SOL for .* ETH/ }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await ledgerBottomNav.getByRole("button", { name: "Earn", exact: true }).click();
await page.getByRole("heading", { name: "Earn", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet Earn");
await page.getByLabel("Asset to earn").selectOption("SOL");
await page.getByLabel("Amount to earn").fill("0.001");
await page.getByRole("button", { name: "Start earning", exact: true }).click();
await page.getByRole("status").filter({ hasText: "SOL moved to Earn" }).waitFor();
await page.getByRole("button", { name: "Withdraw", exact: true }).click();
await page.getByRole("status").filter({ hasText: "SOL returned to your balance" }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await ledgerBottomNav.getByRole("button", { name: "Card", exact: true }).click();
await page.getByRole("heading", { name: "Card", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet card");
await page.getByRole("button", { name: "Show details", exact: true }).click();
await page.getByText("5412  8940  2731  4242", { exact: true }).waitFor();
await page.getByRole("button", { name: "Freeze card", exact: true }).click();
await page.getByRole("status").filter({ hasText: "Card frozen" }).waitFor();
await page.getByLabel("Monthly spending limit").fill("2500");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForFunction(() => [...document.querySelectorAll("p")].some((element) => element.textContent?.includes("Current limit:") && element.textContent.includes("2,500")));
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();
await ledgerBottomNav.getByRole("button", { name: "Home", exact: true }).click();
await page.locator('[data-testid="ledger-home"]').waitFor();

await page.goto(`${baseUrl}/trust-wallet`, { waitUntil: "domcontentloaded" });
const trustSplash = page.locator('[data-testid="trust-splash"]');
await trustSplash.waitFor({ state: "visible", timeout: 10_000 });
await trustSplash.getByText("TRUST WALLET", { exact: true }).waitFor();
if (await trustSplash.getByText(/TRUST STYLE|DEMO ONLY/i).count() !== 0) {
  throw new Error("Trust wallet splash still shows the removed style/demo subtitle.");
}
const trustSplashState = await trustSplash.evaluate((splash) => {
  const style = window.getComputedStyle(splash);
  const bounds = splash.getBoundingClientRect();
  const mark = splash.querySelector(".trust-splash-mark-frame");
  const markStyle = mark ? window.getComputedStyle(mark) : null;
  return {
    background: style.backgroundColor,
    animationName: style.animationName,
    markAnimationName: markStyle?.animationName ?? "none",
    left: bounds.left,
    right: bounds.right,
    width: bounds.width,
    height: bounds.height,
  };
});
if (trustSplashState.background !== "rgb(0, 0, 0)" || trustSplashState.animationName !== "larpz-trust-splash-exit" || trustSplashState.markAnimationName !== "larpz-trust-mark" || trustSplashState.left < -1 || trustSplashState.right > 391 || trustSplashState.width !== 390 || trustSplashState.height < 844) {
  throw new Error(`Trust wallet splash is not a full-screen animated black launch experience: ${JSON.stringify(trustSplashState)}`);
}
const trustWalletContent = page.locator('[data-testid="trust-wallet-content"]');
if (await trustWalletContent.getAttribute("aria-hidden") !== "true" || await trustWalletContent.getAttribute("inert") === null) {
  throw new Error("Trust wallet content became interactive before the splash animation completed.");
}
await trustSplash.waitFor({ state: "detached", timeout: 5_000 });
if (await trustWalletContent.getAttribute("aria-hidden") !== "false" || await trustWalletContent.getAttribute("inert") !== null) {
  throw new Error("Trust wallet splash did not hand control to the wallet after its animation.");
}
await assertMobileLayout("/trust-wallet", "Explore perpetual markets", 20_000, false);
await page.locator('[data-testid="trust-wallet"]').waitFor();
await page.locator('[data-testid="trust-home"]').waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style home");
const trustHomeText = await page.locator('[data-testid="trust-wallet"]').innerText();
if (/TikTok|@northlarp|recording indicator|\b(?:Kaufen|Verkaufen|Tausch|Senden|Empfangen|Suchen|Weiter|Anpassen|Haupt-Wallet)\b/i.test(trustHomeText)) {
  throw new Error("The Larpz Trust-style wallet still contains source-video, watermark, or German interface text.");
}

const trustBottomNav = page.locator('[data-testid="trust-bottom-nav"]');
await trustBottomNav.waitFor();
for (const tab of ["Home", "Market", "Earn", "Discover", "Search"]) {
  await trustBottomNav.getByRole("button", { name: tab, exact: true }).waitFor();
}
for (const action of ["Send", "Receive", "Swap", "Buy"]) {
  await page.locator('[data-testid="trust-home"]').getByRole("button", { name: action, exact: true }).waitFor();
}

const originalTrustBalance = await page.locator('[data-testid="trust-portfolio-balance"]').textContent();
await page.locator('[data-testid="trust-portfolio-balance"]').evaluate((element) => { element.textContent = "$98,765,432,109,876.54"; });
for (const viewport of [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
]) {
  await page.setViewportSize(viewport);
  await assertTrustViewportContentFits(page, "Larpz Trust-style home", viewport.width);
}
await page.locator('[data-testid="trust-portfolio-balance"]').evaluate((element, original) => { element.textContent = original; }, originalTrustBalance);
await page.setViewportSize({ width: 390, height: 844 });

// Exercise the actual pull gesture, rather than only the refresh icon.
await page.locator('[data-testid="trust-home"]').evaluate((home) => {
  const target = home.parentElement;
  if (!target) throw new Error("Trust home has no scroll container.");
  target.scrollTop = 0;
  const start = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(start, "touches", { value: [{ clientY: 20 }] });
  target.dispatchEvent(start);
  const move = new Event("touchmove", { bubbles: true, cancelable: true });
  Object.defineProperty(move, "touches", { value: [{ clientY: 108 }] });
  target.dispatchEvent(move);
});
await page.getByText("Release to refresh", { exact: true }).waitFor();
await page.locator('[data-testid="trust-home"]').evaluate((home) => {
  const target = home.parentElement;
  if (!target) throw new Error("Trust home has no scroll container.");
  const end = new Event("touchend", { bubbles: true, cancelable: true });
  Object.defineProperty(end, "touches", { value: [] });
  target.dispatchEvent(end);
});
const trustRefreshStatus = page.locator('[data-testid="trust-refresh-status"]');
await trustRefreshStatus.waitFor();
await trustRefreshStatus.waitFor({ state: "hidden", timeout: 10_000 });

await page.locator('[data-testid="trust-home"]').getByRole("button", { name: "Receive", exact: true }).click();
const trustReceiveSheet = page.locator("section[aria-label='Receive']");
await trustReceiveSheet.getByRole("heading", { name: "Receive", exact: true }).waitFor();
const trustReceiveQr = trustReceiveSheet.getByRole("img", { name: "Wallet address QR code" });
await trustReceiveQr.waitFor();
if (await trustReceiveQr.locator("circle").count() < 20) throw new Error("Trust Receive did not render a generated wallet-address QR matrix.");
await trustReceiveSheet.getByRole("button", { name: "Copy", exact: true }).click();
await trustReceiveSheet.getByRole("status").filter({ hasText: "Address copied" }).waitFor();
await trustReceiveSheet.getByRole("button", { name: "Deposit from crypto exchange", exact: true }).click();
await trustReceiveSheet.getByText("This demo never requests exchange credentials.", { exact: false }).waitFor();
await trustReceiveSheet.getByRole("button", { name: "Close", exact: true }).click();
await trustReceiveSheet.waitFor({ state: "hidden" });

await page.locator('[data-testid="trust-home"]').getByRole("button", { name: "Send", exact: true }).click();
const trustSendSheet = page.locator("section[aria-label='Send']");
await trustSendSheet.getByRole("heading", { name: "Send", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style send");
const trustSheetBounds = await trustSendSheet.boundingBox();
if (!trustSheetBounds || trustSheetBounds.x < 0 || trustSheetBounds.x + trustSheetBounds.width > 390 || trustSheetBounds.y < 0 || trustSheetBounds.y + trustSheetBounds.height > 844.5) {
  throw new Error(`Trust Send exceeds the mobile viewport: ${JSON.stringify(trustSheetBounds)}`);
}
await trustSendSheet.getByRole("button", { name: "Scan recipient QR code" }).click();
const trustCameraScanner = page.getByRole("dialog", { name: "QR code scanner" });
await trustCameraScanner.waitFor();
await trustCameraScanner.getByLabel("Live camera preview").waitFor();
await trustCameraScanner.waitFor({ state: "hidden", timeout: 8_000 });
if (await trustSendSheet.getByLabel("Destination wallet address").inputValue() !== "sim_ledger_cameraqr123") {
  throw new Error("Trust rear-camera QR scan did not populate the real destination field.");
}
await page.waitForFunction(() => window.__walletQrCamera?.tracksStopped > 0);
const trustCameraState = await page.evaluate(() => window.__walletQrCamera);
if (!trustCameraState?.requested || !JSON.stringify(trustCameraState.constraints).includes("environment") || trustCameraState.tracksStopped < 1) {
  throw new Error(`Trust QR scanner did not request and release the rear camera: ${JSON.stringify(trustCameraState)}`);
}
await trustSendSheet.getByRole("button", { name: "Close", exact: true }).click();
await trustSendSheet.waitFor({ state: "hidden" });

const trustBalanceBeforeTrades = await page.locator('[data-testid="trust-portfolio-balance"]').getAttribute("aria-label");
await page.locator('[data-testid="trust-home"]').getByRole("button", { name: "Buy", exact: true }).click();
await page.getByRole("heading", { name: "Buy and sell", exact: true }).waitFor();
await page.locator('[data-testid="trust-buy-screen"]').waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Buy");
await page.getByRole("button", { name: "Select purchase token" }).click();
const trustBuyPicker = page.locator('[data-testid="trust-token-picker"]');
await trustBuyPicker.getByLabel("Search tokens").fill("Solana");
await trustBuyPicker.getByRole("button").filter({ hasText: "Solana" }).first().click();
const trustBuyKeypad = page.locator('[aria-label="Numeric keypad"]');
await page.getByLabel("Fiat amount").fill("0");
await trustBuyKeypad.getByRole("button", { name: "2", exact: true }).click();
await trustBuyKeypad.getByRole("button", { name: "5", exact: true }).click();
if (await page.getByLabel("Fiat amount").inputValue() !== "25") throw new Error("Trust Buy keypad did not enter 25.");
await page.getByRole("button", { name: "Review purchase", exact: true }).click();
await page.locator('[data-testid="trust-buy-review"]').waitFor();
await page.getByRole("heading", { name: "Review buy", exact: true }).waitFor();
await page.getByText("Internal demo only.", { exact: false }).waitFor();
await page.getByRole("button", { name: "Confirm buy", exact: true }).click();
await page.locator('[data-testid="trust-buy-success"]').waitFor({ timeout: 10_000 });
await page.getByRole("heading", { name: "Purchase complete", exact: true }).waitFor();
await page.getByRole("heading", { name: "Balance updated", exact: true }).waitFor();
await page.getByRole("button", { name: "Done", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();

await page.locator('[data-testid="trust-home"]').getByRole("button", { name: "Buy", exact: true }).click();
await page.getByRole("heading", { name: "Buy and sell", exact: true }).waitFor();
await page.getByRole("button", { name: /^sell$/i }).click();
await page.getByLabel("Fiat amount").fill("1");
await page.getByRole("button", { name: "Review sale", exact: true }).click();
await page.locator('[data-testid="trust-buy-review"]').waitFor();
await page.getByRole("heading", { name: "Review sell", exact: true }).waitFor();
await page.getByRole("button", { name: "Confirm sell", exact: true }).click();
await page.locator('[data-testid="trust-buy-success"]').waitFor({ timeout: 10_000 });
await page.getByRole("heading", { name: "Sale complete", exact: true }).waitFor();
await page.getByRole("button", { name: "Done", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();
const trustBalanceAfterTrades = await page.locator('[data-testid="trust-portfolio-balance"]').getAttribute("aria-label");
if (!trustBalanceBeforeTrades || trustBalanceBeforeTrades === trustBalanceAfterTrades) throw new Error("Trust Buy/Sell did not update the portfolio balance.");
await page.getByText("Received SOL", { exact: true }).first().waitFor();
await page.getByText("Sent SOL", { exact: true }).first().waitFor();

await page.locator('[data-testid="trust-home"]').getByRole("button", { name: "Swap", exact: true }).click();
await page.getByRole("heading", { name: "Swap", exact: true }).waitFor();
await page.locator('[data-testid="trust-swap-screen"]').waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Swap");
await page.getByRole("button", { name: "Select destination token" }).click();
const trustSwapPicker = page.locator('[data-testid="trust-token-picker"]');
await trustSwapPicker.getByLabel("Search tokens").fill("Ethereum");
await trustSwapPicker.getByRole("button").filter({ hasText: "Ethereum" }).first().click();
await page.getByLabel("Swap amount").fill("0.01");
if (Number(await page.getByLabel("Swap percentage").inputValue()) <= 0) throw new Error("Trust Swap percentage did not follow its amount.");
const trustSwipe = page.locator('[data-testid="trust-swipe-confirm"]');
await trustSwipe.scrollIntoViewIfNeeded();
const trustSwipeBounds = await trustSwipe.boundingBox();
if (!trustSwipeBounds) throw new Error("Trust Swipe-to-swap control has no visible bounds.");
await page.mouse.move(trustSwipeBounds.x + 12, trustSwipeBounds.y + trustSwipeBounds.height / 2);
await page.mouse.down();
await page.mouse.move(trustSwipeBounds.x + trustSwipeBounds.width - 12, trustSwipeBounds.y + trustSwipeBounds.height / 2, { steps: 12 });
await page.mouse.up();
await page.locator('[data-testid="trust-swap-success"]').waitFor({ timeout: 10_000 });
await page.getByRole("heading", { name: "Swap complete", exact: true }).waitFor();
await page.getByRole("heading", { name: "Assets swapped", exact: true }).waitFor();
await page.getByRole("button", { name: "Done", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();

// Complete a real same-wallet Account 1 -> Account 2 transfer and verify Activity.
await page.locator('[data-testid="trust-home"]').getByRole("button", { name: "Send", exact: true }).click();
await trustSendSheet.getByText("Shared network connected:", { exact: false }).waitFor({ timeout: 10_000 });
await trustSendSheet.getByLabel("Source wallet").selectOption("trust");
await trustSendSheet.getByLabel("Currency").selectOption("SOL");
const trustTransferSelects = trustSendSheet.locator("select");
if (await trustTransferSelects.count() !== 5) throw new Error("Trust same-wallet transfer did not expose all wallet/account selectors.");
await trustTransferSelects.nth(3).selectOption("trust");
await trustTransferSelects.nth(4).selectOption({ label: "Account 2" });
await trustSendSheet.getByLabel("Transfer amount").fill("0.0001");
await trustSendSheet.getByRole("button", { name: /Review transfer/ }).click();
await trustSendSheet.getByRole("heading", { name: "Review transfer" }).waitFor();
await trustSendSheet.getByRole("button", { name: "Confirm transfer" }).click();
await trustSendSheet.getByRole("heading", { name: "Transfer complete" }).waitFor({ timeout: 10_000 });
await trustSendSheet.getByRole("button", { name: "Close", exact: true }).click();
await page.getByRole("button", { name: "Open transaction history" }).click();
const trustActivitySheet = page.locator("section[aria-label='Activity']");
await trustActivitySheet.locator("article").filter({ hasText: "Sent SOL" }).filter({ hasText: "0.0001" }).first().waitFor();
await trustActivitySheet.getByRole("button", { name: "Close", exact: true }).click();

await trustBottomNav.getByRole("button", { name: "Market", exact: true }).click();
await page.getByRole("heading", { name: "Market", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Market");
await page.getByLabel("Search tokens").fill("Bitcoin");
await page.getByRole("button").filter({ hasText: "Bitcoin" }).first().click();
await page.getByRole("heading", { name: "Bitcoin", exact: true }).waitFor();
await page.getByRole("img", { name: "BTC 1D market price chart" }).waitFor({ timeout: 10_000 });
for (const period of ["1W", "1M", "1Y", "ALL"]) {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/market-chart" && url.searchParams.get("symbol") === "BTC" && url.searchParams.get("period") === period;
  });
  await page.getByRole("button", { name: period, exact: true }).click();
  await responsePromise;
  await page.getByRole("img", { name: `BTC ${period} market price chart` }).waitFor();
}
await page.getByRole("button", { name: "Remove from watchlist" }).click();
const trustRemoveWatchNotice = page.getByRole("status").filter({ hasText: "BTC removed from your watchlist" });
await trustRemoveWatchNotice.waitFor();
await trustRemoveWatchNotice.waitFor({ state: "hidden", timeout: 5_000 });
await page.getByRole("button", { name: "Go back", exact: true }).click();
await page.getByLabel("Search tokens").fill("BNB");
await page.getByRole("button").filter({ hasText: "BNB" }).first().click();
await page.getByRole("button", { name: "Add to watchlist" }).click();
const trustAddWatchNotice = page.getByRole("status").filter({ hasText: "BNB added to your watchlist" });
await trustAddWatchNotice.waitFor();
await trustAddWatchNotice.waitFor({ state: "hidden", timeout: 5_000 });
await page.getByRole("button", { name: "Go back", exact: true }).click();
await page.getByRole("button", { name: "Go back", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();

await page.locator('[data-testid="trust-home"]').getByRole("button", { name: /^Perpetuals/ }).first().click();
const trustPerpetuals = page.locator('[data-testid="trust-perpetuals"]');
await trustPerpetuals.getByRole("heading", { name: "Perpetuals", exact: true }).waitFor();
await trustPerpetuals.getByText("Practice markets", { exact: true }).waitFor();
await trustPerpetuals.getByRole("button", { name: "Open BTC perpetual market", exact: true }).click();
const trustPerpetualOrder = page.locator('[data-testid="trust-perpetual-order"]');
await trustPerpetualOrder.getByRole("heading", { name: "BTC perpetual", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style perpetual order");
await trustPerpetualOrder.getByRole("button", { name: "short", exact: true }).click();
await trustPerpetualOrder.getByRole("button", { name: "5x", exact: true }).click();
await enterWalletKeypadAmount(trustPerpetualOrder, "Perpetual collateral", "0.00001");
await trustPerpetualOrder.getByRole("button", { name: "Review practice order", exact: true }).click();
const trustPerpetualReview = page.locator('[data-testid="trust-perpetual-review"]');
await trustPerpetualReview.getByRole("heading", { name: "Review practice order", exact: true }).waitFor();
await trustPerpetualReview.getByText(/short BTC · 5x/i).waitFor();
await trustPerpetualReview.getByText("0.00001 BTC", { exact: true }).first().waitFor();
await trustPerpetualReview.getByRole("button", { name: "Open practice position", exact: true }).click();
const trustPerpetualSuccess = page.locator('[data-testid="trust-perpetual-success"]');
await trustPerpetualSuccess.getByRole("heading", { name: "Practice position updated", exact: true }).waitFor({ timeout: 10_000 });
await trustPerpetualSuccess.getByRole("heading", { name: "Position updated", exact: true }).waitFor();
await trustPerpetualSuccess.getByRole("button", { name: "View practice markets", exact: true }).click();
await trustPerpetuals.getByRole("heading", { name: "Open positions", exact: true }).waitFor();
await trustPerpetuals.getByText(/short BTC · 5x/i).waitFor();
await trustPerpetuals.getByText("0.00001 BTC collateral", { exact: true }).waitFor();
await page.getByRole("button", { name: "Go back", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();

await trustBottomNav.getByRole("button", { name: "Earn", exact: true }).click();
const trustEarn = page.locator('[data-testid="trust-earn"]');
await trustEarn.getByRole("heading", { name: "Earn", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Earn");
await trustEarn.getByRole("button", { name: "Allocate SOL to Earn", exact: true }).click();
const trustEarnAmount = page.locator('[data-testid="trust-earn-amount"]');
await trustEarnAmount.getByRole("heading", { name: "Earn SOL", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Earn allocation");
await enterWalletKeypadAmount(trustEarnAmount, "Earn amount", "0.001");
await trustEarnAmount.getByRole("button", { name: "Review allocation", exact: true }).click();
const trustEarnReview = page.locator('[data-testid="trust-earn-review"]');
await trustEarnReview.getByRole("heading", { name: "Review allocation", exact: true }).waitFor();
await trustEarnReview.getByText("0.001 SOL", { exact: true }).waitFor();
await trustEarnReview.getByRole("button", { name: "Confirm allocation", exact: true }).click();
const trustEarnSuccess = page.locator('[data-testid="trust-earn-success"]');
await trustEarnSuccess.getByRole("heading", { name: "Earn updated", exact: true }).waitFor({ timeout: 10_000 });
await trustEarnSuccess.getByRole("heading", { name: "Position updated", exact: true }).waitFor();
await trustEarnSuccess.getByRole("button", { name: "View positions", exact: true }).click();
await trustEarn.getByRole("heading", { name: "Your positions", exact: true }).waitFor();
await trustEarn.getByText("0.001 SOL", { exact: true }).waitFor();
await trustEarn.getByText("7.18% APY · Active", { exact: true }).waitFor();
await trustEarn.getByRole("button", { name: "Redeem", exact: true }).waitFor();

await trustBottomNav.getByRole("button", { name: "Search", exact: true }).click();
await page.getByRole("heading", { name: "Search", exact: true }).waitFor();
await page.getByLabel("Search wallet").fill("Solana");
await page.getByRole("button").filter({ hasText: "Solana" }).first().waitFor();
await page.getByRole("button", { name: "Go back", exact: true }).click();

await trustBottomNav.getByRole("button", { name: "Home", exact: true }).click();
await page.locator('[data-testid="trust-home"]').getByRole("button", { name: /^Watchlist/ }).click();
await page.getByRole("heading", { name: "Watchlist", exact: true }).waitFor();
await page.getByRole("button", { name: "Add BTC to watchlist", exact: true }).waitFor();
await page.getByRole("button", { name: "Remove BNB from watchlist", exact: true }).waitFor();
await page.getByRole("button", { name: "Go back", exact: true }).click();

await trustBottomNav.getByRole("button", { name: "Discover", exact: true }).click();
await page.getByRole("heading", { name: "Discover", exact: true }).waitFor();
await page.getByRole("button").filter({ hasText: "Wallet settings" }).click();
await page.getByRole("heading", { name: "Wallet settings", exact: true }).waitFor();
const darkThemeOption = page.getByRole("radio", { name: "Dark theme", exact: true });
const lightThemeOption = page.getByRole("radio", { name: "Light theme", exact: true });
if (await darkThemeOption.getAttribute("aria-checked") !== "true") {
  throw new Error("Trust wallet did not start with its saved dark appearance.");
}
await lightThemeOption.click();
await page.locator('html[data-trust-color-scheme="light"]').waitFor();
if (await lightThemeOption.getAttribute("aria-checked") !== "true") {
  throw new Error("Trust wallet Light appearance control did not become selected.");
}
const trustLightPalette = await page.locator('[data-testid="trust-wallet"]').evaluate((wallet) => {
  const style = window.getComputedStyle(wallet);
  return { background: style.backgroundColor, foreground: style.color, colorScheme: style.colorScheme };
});
if (trustLightPalette.background !== "rgb(245, 247, 251)" || trustLightPalette.foreground !== "rgb(18, 19, 29)" || trustLightPalette.colorScheme !== "light") {
  throw new Error(`Trust wallet Light appearance was selected but not rendered: ${JSON.stringify(trustLightPalette)}`);
}
await page.getByRole("button", { name: "Accounts", exact: true }).click();
const trustLightAccountsSheet = page.getByRole("dialog", { name: "Accounts", exact: true });
await trustLightAccountsSheet.waitFor();
const trustLightSheetPalette = await trustLightAccountsSheet.evaluate((sheet) => {
  const style = window.getComputedStyle(sheet);
  return { background: style.backgroundColor, foreground: style.color, colorScheme: style.colorScheme };
});
if (trustLightSheetPalette.background !== "rgb(245, 247, 251)" || trustLightSheetPalette.foreground !== "rgb(18, 19, 29)" || trustLightSheetPalette.colorScheme !== "light") {
  throw new Error(`Trust runtime sheets did not inherit Light appearance: ${JSON.stringify(trustLightSheetPalette)}`);
}
await trustLightAccountsSheet.getByRole("button", { name: "Close", exact: true }).click();
await page.getByRole("heading", { name: "Wallet settings", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Settings");
await page.getByLabel("Wallet name").fill("Smoke Trust Account");
await page.getByLabel("Currency").selectOption("EUR");
await page.getByRole("button", { name: "Toggle portfolio notifications" }).click();
await page.getByRole("button", { name: "Save settings", exact: true }).click();
await page.getByRole("status").filter({ hasText: "Wallet settings saved" }).waitFor();
await page.locator('[data-testid="trust-home"]').waitFor();
await page.getByRole("button", { name: "Open wallet accounts" }).filter({ hasText: "Smoke Trust Account" }).waitFor();

await page.reload({ waitUntil: "domcontentloaded" });
await page.locator('[data-testid="trust-home"]').waitFor({ timeout: 20_000 });
await page.getByRole("button", { name: "Open wallet accounts" }).filter({ hasText: "Smoke Trust Account" }).waitFor();
await trustBottomNav.getByRole("button", { name: "Discover", exact: true }).click();
await page.getByRole("button").filter({ hasText: "Wallet settings" }).click();
if (await page.getByLabel("Wallet name").inputValue() !== "Smoke Trust Account" || await page.getByLabel("Currency").inputValue() !== "EUR") {
  throw new Error("Trust wallet name and currency settings did not persist after reload.");
}
if (await page.getByRole("radio", { name: "Light theme", exact: true }).getAttribute("aria-checked") !== "true" || await page.locator("html").getAttribute("data-trust-color-scheme") !== "light") {
  throw new Error("Trust wallet Light appearance did not persist after reload.");
}
await page.getByRole("button", { name: "Go back", exact: true }).click();
await page.getByRole("heading", { name: "Discover", exact: true }).waitFor();
await trustBottomNav.getByRole("button", { name: "Earn", exact: true }).click();
// Both staged positions must survive a full reload before they are closed.
await trustEarn.getByRole("heading", { name: "Your positions", exact: true }).waitFor();
await trustEarn.getByText("0.001 SOL", { exact: true }).waitFor();
await trustEarn.getByRole("button", { name: "Redeem", exact: true }).waitFor();
await trustBottomNav.getByRole("button", { name: "Home", exact: true }).click();
await page.locator('[data-testid="trust-home"]').getByRole("button", { name: /^Perpetuals/ }).first().click();
await trustPerpetuals.getByRole("heading", { name: "Open positions", exact: true }).waitFor();
await trustPerpetuals.getByText(/short BTC · 5x/i).waitFor();
await trustPerpetuals.getByRole("button", { name: "Close", exact: true }).click();
await trustPerpetualReview.getByRole("heading", { name: "Review close", exact: true }).waitFor();
await trustPerpetualReview.getByText("0.00001 BTC", { exact: true }).first().waitFor();
await trustPerpetualReview.getByRole("button", { name: "Close position", exact: true }).click();
await trustPerpetualSuccess.getByRole("heading", { name: "Practice position updated", exact: true }).waitFor({ timeout: 10_000 });
await trustPerpetualSuccess.getByRole("button", { name: "View practice markets", exact: true }).click();
if (await trustPerpetuals.getByRole("heading", { name: "Open positions", exact: true }).count() !== 0) {
  throw new Error("Trust practice position remained open after its confirmed close.");
}
await trustPerpetuals.getByRole("button", { name: "Go back", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();
await trustBottomNav.getByRole("button", { name: "Earn", exact: true }).click();
await trustEarn.getByRole("button", { name: "Redeem", exact: true }).click();
await trustEarnReview.getByRole("heading", { name: "Review redemption", exact: true }).waitFor();
await trustEarnReview.getByText("0.001 SOL", { exact: true }).waitFor();
await trustEarnReview.getByRole("button", { name: "Confirm redemption", exact: true }).click();
await trustEarnSuccess.getByRole("heading", { name: "Earn updated", exact: true }).waitFor({ timeout: 10_000 });
await trustEarnSuccess.getByRole("button", { name: "View positions", exact: true }).click();
if (await trustEarn.getByRole("heading", { name: "Your positions", exact: true }).count() !== 0) {
  throw new Error("Trust Earn allocation remained active after its confirmed redemption.");
}
await trustBottomNav.getByRole("button", { name: "Home", exact: true }).click();
await page.getByRole("button", { name: "Open transaction history", exact: true }).click();
const trustHistorySearch = trustActivitySheet.getByLabel("Search transaction history");
await trustHistorySearch.fill("INTERNAL PERPETUAL");
await trustActivitySheet.getByText("Sent BTC", { exact: true }).waitFor();
await trustActivitySheet.getByText("Received BTC", { exact: true }).waitFor();
if (await trustActivitySheet.locator("article").count() !== 2) {
  throw new Error("Trust practice-position open and close did not produce exactly two ledger activities.");
}
await trustHistorySearch.fill("INTERNAL EARN");
await trustActivitySheet.getByText("Sent SOL", { exact: true }).waitFor();
await trustActivitySheet.getByText("Received SOL", { exact: true }).waitFor();
if (await trustActivitySheet.locator("article").count() !== 2) {
  throw new Error("Trust Earn allocation and redemption did not produce exactly two ledger activities.");
}
await trustActivitySheet.getByRole("button", { name: "Close", exact: true }).click();
await page.locator('[data-testid="trust-home"]').getByRole("button", { name: /^Watchlist/ }).click();
await page.getByRole("button", { name: "Add BTC to watchlist", exact: true }).waitFor();
await page.getByRole("button", { name: "Remove BNB from watchlist", exact: true }).waitFor();
await page.getByRole("button", { name: "Go back", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();

await page.getByRole("button", { name: "Open wallet accounts" }).click();
const trustAccountsSheet = page.locator("section[aria-label='Accounts']");
await trustAccountsSheet.getByRole("heading", { name: "Accounts", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Accounts");
await trustAccountsSheet.getByLabel("New account name").fill("Trust Smoke Savings");
await trustAccountsSheet.getByRole("button", { name: "Add account", exact: true }).click();
const trustSavingsAccount = trustAccountsSheet.locator("article").filter({ hasText: "Trust Smoke Savings" });
await trustSavingsAccount.getByText("Trust Smoke Savings", { exact: true }).waitFor();
const trustSavingsSwitch = trustSavingsAccount.getByRole("button", { name: "Switch to account", exact: true });
if (await trustSavingsSwitch.isVisible().catch(() => false)) await trustSavingsSwitch.click();
await trustSavingsAccount.getByRole("button", { name: "Current account", exact: true }).waitFor();
await trustAccountsSheet.getByRole("button", { name: "Close", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();
const trustZeroBalance = await page.locator('[data-testid="trust-portfolio-balance"]').evaluate((balance) => {
  const bounds = balance.getBoundingClientRect();
  const style = getComputedStyle(balance);
  const decimal = [...balance.querySelectorAll("span")].find((span) => span.textContent?.includes(".00"));
  const decimalStyle = decimal ? getComputedStyle(decimal) : null;
  const decimalBounds = decimal?.getBoundingClientRect();
  return {
    text: balance.textContent?.trim(),
    ariaLabel: balance.getAttribute("aria-label"),
    color: style.color,
    visible: style.visibility !== "hidden" && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0,
    fullyFits: balance.scrollWidth <= balance.clientWidth + 1 && bounds.left >= -1 && bounds.right <= window.innerWidth + 1,
    decimal: decimal ? {
      fontRatio: Number.parseFloat(decimalStyle.fontSize) / Number.parseFloat(style.fontSize),
      color: decimalStyle.color,
      fullyVisible: decimalBounds.left >= bounds.left - 1 && decimalBounds.right <= bounds.right + 1,
    } : null,
  };
});
if (!trustZeroBalance.visible || !trustZeroBalance.fullyFits || !/0\.00$/.test(trustZeroBalance.text ?? "") || !/0\.00$/.test(trustZeroBalance.ariaLabel ?? "") || (trustZeroBalance.decimal && (trustZeroBalance.decimal.fontRatio < 0.9 || trustZeroBalance.decimal.color !== trustZeroBalance.color || !trustZeroBalance.decimal.fullyVisible))) {
  throw new Error(`Trust zero balance is clipped, low-contrast, or uses mismatched decimal typography: ${JSON.stringify(trustZeroBalance)}`);
}
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator('[data-testid="trust-home"]').waitFor({ timeout: 20_000 });
await page.getByRole("button", { name: "Open wallet accounts" }).filter({ hasText: "Trust Smoke Savings" }).waitFor();
if (!/0\.00$/.test(await page.locator('[data-testid="trust-portfolio-balance"]').textContent() ?? "")) {
  throw new Error("Trust zero balance did not persist after reload.");
}
await page.getByRole("button", { name: "Open wallet accounts" }).click();
await page.locator("section[aria-label='Accounts']").getByText("Trust Smoke Savings", { exact: true }).waitFor();
await page.locator("section[aria-label='Accounts']").getByRole("button", { name: "Close", exact: true }).click();

function createInMemoryWalletLedger(ownerId) {
  let snapshot = null;
  let lastTransferRequest = null;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const accountsFromState = (state) => Object.values(state.wallets).flatMap((wallet) =>
    wallet.accounts.map((account) => ({ ...clone(account), ownerId })));
  const responseSnapshot = () => clone(snapshot ?? { accounts: [], transactions: [], operations: [] });
  const fulfill = (route, payload, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify(payload),
  });

  const handler = async (route) => {
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
          operations: clone(body.state.operations ?? []),
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

    if (body.action === "balanceOperation" && body.operation) {
      const existing = snapshot?.operations.find((operation) => operation.clientRequestId === body.operation.clientRequestId);
      if (existing) {
        const sameAccount = existing.walletId === body.operation.walletId && existing.accountId === body.operation.accountId;
        const normalizeDeltas = (deltas) => JSON.stringify(Object.fromEntries(Object.entries(deltas ?? {}).sort(([left], [right]) => left.localeCompare(right))));
        if (!sameAccount || normalizeDeltas(existing.deltas) !== normalizeDeltas(body.operation.deltas)) {
          await fulfill(route, { code: "DUPLICATE", error: "Request ID already used for a different operation." }, 409);
          return;
        }
        await fulfill(route, { connected: true, snapshot: responseSnapshot(), operation: clone(existing) });
        return;
      }
      const account = snapshot?.accounts.find((candidate) => candidate.id === body.operation.accountId && candidate.walletId === body.operation.walletId);
      const deltas = body.operation.deltas && typeof body.operation.deltas === "object" ? Object.entries(body.operation.deltas) : [];
      if (!account || !body.operation.clientRequestId || deltas.length === 0 || !Array.isArray(body.operation.activities) || body.operation.activities.length === 0) {
        await fulfill(route, { code: "INVALID_REQUEST", error: "Invalid balance operation." }, 400);
        return;
      }
      const nextBalances = { ...account.balances };
      for (const [rawSymbol, rawDelta] of deltas) {
        const symbol = rawSymbol.toUpperCase();
        const delta = Number(rawDelta);
        const next = Number(nextBalances[symbol] ?? 0) + delta;
        if (!Number.isFinite(delta) || delta === 0 || next < -1e-12) {
          await fulfill(route, { code: next < 0 ? "INSUFFICIENT_FUNDS" : "INVALID_REQUEST", error: "Invalid balance operation." }, 400);
          return;
        }
        nextBalances[symbol] = Number(Math.max(0, next).toFixed(12));
      }
      account.balances = nextBalances;
      const operation = {
        id: `simop_smoke_${Date.now()}`,
        clientRequestId: body.operation.clientRequestId,
        walletId: body.operation.walletId,
        accountId: body.operation.accountId,
        deltas: clone(body.operation.deltas),
        activities: clone(body.operation.activities),
        timestamp: new Date().toISOString(),
        note: "INTERNAL DEMO BALANCE OPERATION — NO REAL FUNDS",
      };
      snapshot.operations.unshift(operation);
      await fulfill(route, { connected: true, snapshot: responseSnapshot(), operation: clone(operation) });
      return;
    }

    if (body.action === "transfer" && body.transfer) {
      lastTransferRequest = clone(body.transfer);
      const destinationInput = typeof body.transfer.destinationAddress === "string" ? body.transfer.destinationAddress.trim() : "";
      const domainAccountId = destinationInput.match(/^([a-zA-Z0-9_-]{3,180})\.larpz$/i)?.[1];
      const destination = snapshot?.accounts.find((account) =>
        destinationInput
          ? domainAccountId ? account.id === domainAccountId : account.address === destinationInput
          : account.id === body.transfer.destinationAccountId);
      const symbol = String(body.transfer.tokenSymbol ?? "").toUpperCase();
      const transferAmount = Number(body.transfer.amount);
      const existing = snapshot?.transactions.find((transaction) => transaction.clientRequestId === body.transfer.clientRequestId);
      if (existing) {
        const replayMatches = existing.sourceAccountId === body.transfer.sourceAccountId
          && existing.destinationAccountId === destination?.id
          && existing.tokenSymbol === symbol
          && existing.amount === transferAmount;
        if (!replayMatches) {
          await fulfill(route, { code: "DUPLICATE", error: "Request ID already used for a different transfer." }, 409);
          return;
        }
        await fulfill(route, { connected: true, snapshot: responseSnapshot(), transaction: clone(existing) });
        return;
      }
      const source = snapshot?.accounts.find((account) => account.id === body.transfer.sourceAccountId);
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
  handler.getSnapshot = responseSnapshot;
  handler.getLastTransferRequest = () => clone(lastTransferRequest);
  return handler;
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
await phantomPage.getByRole("button", { name: "Use Larpz Wallet Account 1" }).click();
await phantomPage.waitForFunction(() => [...document.querySelectorAll("button")]
  .some((button) => button.textContent?.includes("Review transfer") && !button.disabled), undefined, { timeout: 20_000 });
await phantomPage.getByRole("button", { name: "Close Send" }).click();

await trustPage.goto(`${baseUrl}/trust-wallet`, { waitUntil: "domcontentloaded" });
await trustPage.getByRole("button", { name: "Send", exact: true }).waitFor({ timeout: 20_000 });
await trustPage.getByRole("button", { name: "Send", exact: true }).click();
const crossWalletTransfer = trustPage.locator("section[aria-label='Send']");
await crossWalletTransfer.getByText("Shared network connected:", { exact: false }).waitFor({ timeout: 20_000 });
const sharedSnapshotBeforeTransfer = sharedWalletLedger.getSnapshot();
const phantomDestinationAccount = sharedSnapshotBeforeTransfer.accounts.find((account) => account.walletId === "ghost" && account.name === "Account 1");
if (!phantomDestinationAccount) throw new Error("Cross-PWA Phantom destination account was not synchronized.");
const phantomDestinationDomain = `${phantomDestinationAccount.id}.larpz`;
const phantomBnbBeforeTransfer = Number(phantomDestinationAccount.balances.BNB ?? 0);
await crossWalletTransfer.getByLabel("Source wallet").selectOption("trust");
await crossWalletTransfer.getByLabel("Currency").selectOption("BNB");
const transferSelects = crossWalletTransfer.locator("select");
if (await transferSelects.count() !== 5) throw new Error("Cross-PWA transfer form did not expose the expected wallet and account selectors.");
await crossWalletTransfer.getByRole("button", { name: "Send to another user", exact: true }).click();
await crossWalletTransfer.getByLabel("Destination wallet address").fill(phantomDestinationDomain);
await crossWalletTransfer.getByLabel("Transfer amount").fill("0.2999");
await crossWalletTransfer.getByRole("button", { name: /Review transfer/ }).click();
await crossWalletTransfer.getByRole("heading", { name: "Review transfer" }).waitFor();
await crossWalletTransfer.getByText(phantomDestinationDomain, { exact: true }).waitFor();
await crossWalletTransfer.getByRole("button", { name: "Confirm transfer" }).click();
await crossWalletTransfer.getByRole("heading", { name: "Transfer complete" }).waitFor({ timeout: 10_000 });

// Replaying the exact request must return the original transaction without a
// second debit or credit. Reusing its ID with changed input must be rejected.
const completedTransferRequest = sharedWalletLedger.getLastTransferRequest();
const snapshotBeforeReplay = sharedWalletLedger.getSnapshot();
const completedCrossTransfer = snapshotBeforeReplay.transactions.find((transaction) => transaction.clientRequestId === completedTransferRequest?.clientRequestId);
if (!completedTransferRequest || !completedCrossTransfer) throw new Error("Cross-PWA transfer request was not captured for replay coverage.");
const postWalletRequest = async (transfer) => trustPage.evaluate(async ({ ownerId, transferInput }) => {
  const response = await fetch("/api/wallet-ledger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "transfer", ownerId, transfer: transferInput }),
  });
  return { status: response.status, body: await response.json() };
}, { ownerId: sharedOwnerId, transferInput: transfer });
const replayResult = await postWalletRequest(completedTransferRequest);
const snapshotAfterReplay = sharedWalletLedger.getSnapshot();
if (replayResult.status !== 200 || replayResult.body.transaction?.id !== completedCrossTransfer.id) {
  throw new Error(`Exact transfer replay was not idempotent: ${JSON.stringify(replayResult)}`);
}
if (snapshotAfterReplay.transactions.length !== snapshotBeforeReplay.transactions.length
  || JSON.stringify(snapshotAfterReplay.accounts) !== JSON.stringify(snapshotBeforeReplay.accounts)) {
  throw new Error("Exact transfer replay changed balances or created a duplicate transaction.");
}
const conflictingReplay = await postWalletRequest({ ...completedTransferRequest, amount: 0.1 });
const snapshotAfterConflict = sharedWalletLedger.getSnapshot();
if (conflictingReplay.status !== 409 || conflictingReplay.body.code !== "DUPLICATE") {
  throw new Error(`Conflicting transfer replay was not rejected: ${JSON.stringify(conflictingReplay)}`);
}
if (JSON.stringify(snapshotAfterConflict) !== JSON.stringify(snapshotAfterReplay)) {
  throw new Error("Rejected duplicate transfer mutated the shared ledger.");
}

await phantomPage.bringToFront();
await phantomPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
const receivedBnbHolding = phantomPage.getByRole("button")
  .filter({ hasText: "BNB" })
  .filter({ hasText: "0.2999 BNB" })
  .first();
await receivedBnbHolding.waitFor({ state: "visible", timeout: 6_000 });
await receivedBnbHolding.locator('img[alt="BNB logo"]').waitFor({ state: "attached" });
const refreshedPhantomAccount = sharedWalletLedger.getSnapshot().accounts.find((account) => account.id === phantomDestinationAccount.id);
if (!refreshedPhantomAccount || Math.abs(Number(refreshedPhantomAccount.balances.BNB ?? 0) - (phantomBnbBeforeTransfer + 0.2999)) > 1e-8) {
  throw new Error("Cross-PWA .larpz transfer did not immediately credit the receiving Phantom account.");
}

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

console.log("Mobile wallet smoke test passed: Phantom focus/QR/swipe/transfers, Larpz Wallet charts/settings/actions, and Larpz Trust-style responsive home, Buy/Sell, swipe Swap, receive/send QR, same- and cross-wallet .larpz transfers, idempotent replay protection, immediate receiving-PWA refresh, token charts/search/watchlist, Earn, Perpetuals, settings, refresh, accounts, history, and reload persistence.");
