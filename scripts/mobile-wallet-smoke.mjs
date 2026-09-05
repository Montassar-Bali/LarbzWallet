import { chromium } from "playwright-core";

const baseUrl = process.env.WALLET_TEST_URL || "http://localhost:3000";
const phantomScreenshotDir = process.env.PHANTOM_SCREENSHOT_DIR || "";
const ledgerScreenshotDir = process.env.LEDGER_SCREENSHOT_DIR || "";
const trustScreenshotDir = process.env.TRUST_SCREENSHOT_DIR || "";
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
      balanceMetrics: balance ? { text: balance.textContent, clientWidth: balance.clientWidth, scrollWidth: balance.scrollWidth, fontSize: balanceStyle?.fontSize } : null,
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
const phantomWatchlistClose = page.getByRole("button", { name: "Dismiss watchlist card" });
await phantomWatchlistClose.waitFor();
await phantomWatchlistClose.scrollIntoViewIfNeeded();
const phantomWatchlistCard = phantomWatchlistClose.locator("xpath=ancestor::aside");
if (phantomScreenshotDir) await phantomWatchlistCard.screenshot({ path: `${phantomScreenshotDir}/phantom-watchlist-close.png` });
const phantomWatchlistCloseLayout = await phantomWatchlistClose.evaluate((button) => {
  const buttonBounds = button.getBoundingClientRect();
  const iconBounds = button.querySelector("svg")?.getBoundingClientRect();
  return {
    buttonWidth: buttonBounds.width,
    buttonHeight: buttonBounds.height,
    iconOffsetX: iconBounds ? iconBounds.left - buttonBounds.left : null,
    iconOffsetY: iconBounds ? iconBounds.top - buttonBounds.top : null,
    iconWidth: iconBounds?.width ?? null,
    iconHeight: iconBounds?.height ?? null,
  };
});
if (phantomWatchlistCloseLayout.buttonWidth < 44 || phantomWatchlistCloseLayout.buttonHeight < 44
  || phantomWatchlistCloseLayout.iconOffsetX !== 12 || phantomWatchlistCloseLayout.iconOffsetY !== 12
  || phantomWatchlistCloseLayout.iconWidth !== 20 || phantomWatchlistCloseLayout.iconHeight !== 20) {
  throw new Error(`Phantom watchlist close button is not a centered 44px target: ${JSON.stringify(phantomWatchlistCloseLayout)}`);
}
await phantomWatchlistClose.click();
await phantomWatchlistCard.waitFor({ state: "detached" });
await page.getByRole("button", { name: "Open wallet menu" }).click();
await page.getByRole("complementary").getByRole("button", { name: "Watchlist", exact: true }).click();
const phantomWatchlistHeading = page.getByRole("heading", { name: "Watchlist", exact: true });
await phantomWatchlistHeading.waitFor();
const phantomWatchlistHeader = phantomWatchlistHeading.locator("xpath=parent::header");
if (phantomScreenshotDir) await page.screenshot({ path: `${phantomScreenshotDir}/phantom-watchlist-layout.png` });
const phantomWatchlistLayout = await phantomWatchlistHeader.evaluate((header) => {
  const scrollArea = header.parentElement;
  const bounds = scrollArea?.getBoundingClientRect();
  return {
    viewportHeight: window.innerHeight,
    scrollAreaBottom: bounds?.bottom ?? null,
  };
});
if (phantomWatchlistLayout.scrollAreaBottom === null
  || Math.abs(phantomWatchlistLayout.viewportHeight - phantomWatchlistLayout.scrollAreaBottom) > 1) {
  throw new Error(`Phantom watchlist does not extend through the bottom safe area: ${JSON.stringify(phantomWatchlistLayout)}`);
}
await phantomWatchlistHeader.getByRole("button", { name: "Go back" }).click();
await page.getByPlaceholder("Search Phantom").waitFor();
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

if (process.env.WALLET_TEST_SCOPE === "phantom") {
  if (errors.length) throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  await context.close();
  await browser.close();
  console.log("Phantom mobile smoke test passed: watchlist close control is crisp, centered, accessible, and dismisses the card.");
  process.exit(0);
}

await context.route("**/api/market-chart**", async (route) => {
  const requestUrl = new URL(route.request().url());
  const symbol = (requestUrl.searchParams.get("symbol") || "SOL").toUpperCase();
  const period = (requestUrl.searchParams.get("period") || "1D").toUpperCase();
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

await page.goto(`${baseUrl}/ledger-wallet`, { waitUntil: "domcontentloaded" });
const ledgerRoot = page.locator('[data-testid="ledger-wallet"]');
const ledgerHome = page.locator('[data-testid="ledger-home"]');
await ledgerRoot.waitFor({ timeout: 20_000 });
await ledgerHome.waitFor();
await page.getByRole("heading", { name: "Wallet", exact: true }).waitFor();
await page.locator('[data-testid="ledger-primary-tabs"]').getByRole("tab", { name: "Crypto", exact: true }).waitFor();
await page.locator('[data-testid="ledger-primary-tabs"]').getByRole("tab", { name: "Market", exact: true }).waitFor();
await page.locator('[data-testid="ledger-portfolio-chart"]').waitFor({ timeout: 10_000 });
if (ledgerScreenshotDir) await page.screenshot({ path: `${ledgerScreenshotDir}/ledger-home.png`, fullPage: true });
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet home");
const ledgerHomeText = await ledgerHome.innerText();
if (/TikTok|@northlarp|recording indicator/i.test(ledgerHomeText)) {
  throw new Error("Larpz Wallet still contains source-video watermarks or recording UI.");
}

const ledgerBottomNav = page.locator('[data-testid="ledger-bottom-nav"]');
await ledgerBottomNav.waitFor();
for (const tab of ["Wallet", "Earn", "Transfer", "Discover", "My Ledger"]) {
  await ledgerBottomNav.getByRole("button", { name: tab, exact: true }).waitFor();
}
if (ledgerScreenshotDir) await ledgerBottomNav.screenshot({ path: `${ledgerScreenshotDir}/ledger-bottom-nav.png` });
const ledgerNavGeometry = await ledgerBottomNav.evaluate((nav) => {
  const bounds = nav.getBoundingClientRect();
  const buttons = [...nav.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
  const center = nav.querySelector('button[aria-label="Transfer"] span')?.getBoundingClientRect();
  return {
    bottomGap: window.innerHeight - bounds.bottom,
    centerOffset: center ? Math.abs(center.left + center.width / 2 - window.innerWidth / 2) : Number.POSITIVE_INFINITY,
    centerIsRound: center ? Math.abs(center.width - center.height) < 1 : false,
    centerProtrudes: center ? center.top < bounds.top && center.bottom > bounds.top : false,
    equalColumns: buttons.length === 5 && Math.max(...buttons.map(({ width }) => width)) - Math.min(...buttons.map(({ width }) => width)) < 1,
  };
});
if (Math.abs(ledgerNavGeometry.bottomGap) > 1 || ledgerNavGeometry.centerOffset > 1 || !ledgerNavGeometry.centerIsRound || !ledgerNavGeometry.centerProtrudes || !ledgerNavGeometry.equalColumns) {
  throw new Error(`Ledger bottom navigation geometry does not match the reference: ${JSON.stringify(ledgerNavGeometry)}`);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
]) {
  await page.setViewportSize(viewport);
  await assertViewportContentFits(page, "Larpz Wallet home", viewport.width);
}
await page.setViewportSize({ width: 390, height: 844 });

const ledgerActions = page.locator('[data-testid="ledger-actions"]');
for (const action of ["Buy", "Swap", "Send", "Receive", "Earn"]) {
  await ledgerActions.getByRole("button", { name: action, exact: true }).waitFor();
}

for (const period of ["1D", "1W", "1M", "1Y", "ALL"]) {
  const periodTab = ledgerHome.getByRole("tab", { name: period, exact: true });
  await periodTab.click();
  if (await periodTab.getAttribute("aria-selected") !== "true") throw new Error(`Larpz Wallet did not select the ${period} chart period.`);
}
await ledgerHome.getByRole("button", { name: "Hide portfolio balance" }).click();
if ((await page.locator('[data-testid="ledger-portfolio-balance"]').textContent()) !== "••••••") throw new Error("Larpz Wallet balance visibility control did not hide the balance.");
await ledgerHome.getByRole("button", { name: "Show portfolio balance" }).click();

const ledgerHoldingsTabs = page.locator('[data-testid="ledger-holdings-tabs"]');
await ledgerHoldingsTabs.getByRole("tab", { name: "Accounts", exact: true }).click();
await ledgerHome.getByRole("button", { name: "Add account", exact: true }).waitFor();
await ledgerHome.getByText(/sim_ledger_/).first().waitFor();
await ledgerHoldingsTabs.getByRole("tab", { name: "Assets", exact: true }).click();
await ledgerHome.getByRole("button", { name: "See all assets", exact: true }).click();
await page.getByRole("heading", { name: "All assets", exact: true }).waitFor();
await page.getByLabel("Search all assets").fill("Bitcoin");
await page.locator('[data-testid="ledger-all-assets"]').getByText("Bitcoin", { exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();
await ledgerHome.waitFor();

await page.locator('[data-testid="ledger-allocation"]').getByRole("button", { name: "View detailed portfolio allocation" }).click();
await page.locator('[data-testid="ledger-allocation-detail"]').waitFor();
await page.getByRole("heading", { name: "Allocation", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();
await ledgerHome.waitFor();

await page.locator('[data-testid="ledger-primary-tabs"]').getByRole("tab", { name: "Market", exact: true }).click();
await page.getByRole("heading", { name: "Explore", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();
await ledgerHome.waitFor();

await ledgerHome.getByRole("button", { name: "Open Larpz card" }).click();
await page.getByRole("heading", { name: "Card", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();
await ledgerHome.getByRole("button", { name: "Open notifications" }).click();
await page.getByRole("heading", { name: "Notifications", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await ledgerActions.getByRole("button", { name: "Receive", exact: true }).click();
const ledgerReceiveSheet = page.locator("section[aria-label='Receive']");
await ledgerReceiveSheet.getByRole("heading", { name: "Receive", exact: true }).waitFor();
const ledgerReceiveQr = ledgerReceiveSheet.getByRole("img", { name: "Wallet address QR code" });
await ledgerReceiveQr.waitFor();
if (await ledgerReceiveQr.locator("circle").count() < 20) throw new Error("Larpz Wallet Receive did not generate an address QR code.");
await ledgerReceiveSheet.getByRole("button", { name: /Larpz Wallet address/i }).click();
await ledgerReceiveSheet.getByText("Address copied", { exact: true }).waitFor();
await ledgerReceiveSheet.getByRole("button", { name: "Close", exact: true }).click();
await ledgerReceiveSheet.waitFor({ state: "hidden" });

await ledgerActions.getByRole("button", { name: "Buy", exact: true }).click();
await page.getByRole("heading", { name: "Buy", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();
await ledgerActions.getByRole("button", { name: "Swap", exact: true }).click();
await page.getByRole("heading", { name: "Swap", exact: true }).waitFor();
await page.getByRole("button", { name: "Back to Larpz Wallet home" }).click();

await ledgerBottomNav.getByRole("button", { name: "Transfer", exact: true }).click();
const ledgerTransferSheet = page.locator("section[aria-label='Send']");
await ledgerTransferSheet.getByRole("heading", { name: "Send", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet transfer");
if (await ledgerTransferSheet.getByLabel("Source wallet").inputValue() !== "ledger") {
  throw new Error("Larpz Wallet Send did not default to its own source account.");
}
await ledgerTransferSheet.getByRole("button", { name: "Scan recipient QR code" }).click();
const ledgerCameraScanner = page.getByRole("dialog", { name: "QR code scanner" });
await ledgerCameraScanner.waitFor();
await ledgerCameraScanner.getByLabel("Live camera preview").waitFor();
await ledgerCameraScanner.waitFor({ state: "hidden", timeout: 8_000 });
const ledgerScannedAddress = await ledgerTransferSheet.getByLabel("Destination wallet address").inputValue();
if (ledgerScannedAddress !== "sim_ledger_cameraqr123") {
  throw new Error(`Larpz Wallet camera scanner did not populate the destination field: ${ledgerScannedAddress}`);
}
await ledgerTransferSheet.getByRole("button", { name: "Close", exact: true }).click();
await ledgerTransferSheet.waitFor({ state: "hidden" });

await page.getByRole("button", { name: "Open Larpz Wallet settings" }).click();
const ledgerEditPortfolio = page.locator('[data-testid="ledger-edit-portfolio-sheet"]');
await ledgerEditPortfolio.waitFor();
await ledgerEditPortfolio.getByRole("heading", { name: "Edit Portfolio", exact: true }).waitFor();
if (ledgerScreenshotDir) await page.screenshot({ path: `${ledgerScreenshotDir}/ledger-settings.png` });
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet Edit Portfolio");
const originalLedgerBtcBalance = await ledgerEditPortfolio.getByLabel("BTC balance").inputValue();
await ledgerEditPortfolio.getByLabel("BTC balance").fill("999999999.99999999");
await ledgerEditPortfolio.getByLabel("Currency").selectOption("EUR");
await ledgerEditPortfolio.getByLabel("Optional CoinGecko API key").fill("smoke-market-key-2026");
await ledgerEditPortfolio.getByLabel("USDT network").selectOption("ETH");
await ledgerEditPortfolio.getByRole("checkbox", { name: "Pro market details" }).check();
await ledgerEditPortfolio.getByRole("radio", { name: "Send first", exact: true }).click();
await ledgerEditPortfolio.getByRole("radio", { name: "Light", exact: true }).click();
await ledgerEditPortfolio.getByRole("button", { name: "Save", exact: true }).click();
await ledgerEditPortfolio.getByRole("status").filter({ hasText: "Portfolio settings saved for this account." }).waitFor();
await page.locator('html[data-ledger-color-scheme="light"]').waitFor();
await ledgerEditPortfolio.getByRole("button", { name: "Close", exact: true }).click();
await ledgerEditPortfolio.waitFor({ state: "hidden" });
for (const viewport of [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
]) {
  await page.setViewportSize(viewport);
  await assertViewportContentFits(page, "Larpz Wallet very large balance", viewport.width);
}
await page.setViewportSize({ width: 390, height: 844 });

await ledgerBottomNav.getByRole("button", { name: "Earn", exact: true }).click();
await page.getByRole("heading", { name: "Earn", exact: true }).waitFor();
await ledgerBottomNav.getByRole("button", { name: "Wallet", exact: true }).click();
await ledgerHome.waitFor();

await ledgerBottomNav.getByRole("button", { name: "Discover", exact: true }).click();
await page.getByRole("heading", { name: "Explore", exact: true }).waitFor();
await ledgerBottomNav.getByRole("button", { name: "Wallet", exact: true }).click();
await ledgerHome.waitFor();

await ledgerBottomNav.getByRole("button", { name: "My Ledger", exact: true }).click();
await ledgerEditPortfolio.waitFor();
if (await ledgerEditPortfolio.getByLabel("Currency").inputValue() !== "EUR"
  || await ledgerEditPortfolio.getByLabel("Optional CoinGecko API key").inputValue() !== "smoke-market-key-2026"
  || await ledgerEditPortfolio.getByLabel("USDT network").inputValue() !== "ETH") {
  throw new Error("Larpz Wallet account-scoped Edit Portfolio settings did not persist.");
}
if (!await ledgerEditPortfolio.getByRole("checkbox", { name: "Pro market details" }).isChecked()
  || !await ledgerEditPortfolio.getByRole("radio", { name: "Send first", exact: true }).isChecked()
  || !await ledgerEditPortfolio.getByRole("radio", { name: "Light", exact: true }).isChecked()) {
  throw new Error("Larpz Wallet account-scoped portfolio preferences did not persist.");
}
await ledgerEditPortfolio.getByLabel("BTC balance").fill(originalLedgerBtcBalance);
await ledgerEditPortfolio.getByRole("button", { name: "Save", exact: true }).click();
await ledgerEditPortfolio.getByRole("status").filter({ hasText: "Portfolio settings saved for this account." }).waitFor();
await ledgerEditPortfolio.getByRole("button", { name: "Close", exact: true }).click();
await ledgerEditPortfolio.waitFor({ state: "hidden" });

await ledgerHome.getByRole("button", { name: "Add transaction", exact: true }).click();
const ledgerAddTransaction = page.locator('[data-testid="ledger-add-transaction-sheet"]');
await ledgerAddTransaction.waitFor();
await ledgerAddTransaction.getByRole("heading", { name: "Add Transaction", exact: true }).waitFor();
if (ledgerScreenshotDir) await page.screenshot({ path: `${ledgerScreenshotDir}/ledger-transaction.png` });
await assertWritingFieldsAvoidIosZoom(page, "Larpz Wallet Add Transaction");
await ledgerAddTransaction.getByRole("radio", { name: "Received", exact: true }).click();
await ledgerAddTransaction.getByLabel("Transaction crypto").selectOption("BTC");
await ledgerAddTransaction.getByLabel("Transaction amount").fill("0.00001");
await ledgerAddTransaction.getByRole("button", { name: "Add Transaction", exact: true }).click();
await ledgerAddTransaction.getByRole("status").filter({ hasText: "Transaction added to this Larpz Wallet account." }).waitFor();
await ledgerAddTransaction.getByRole("button", { name: "Close", exact: true }).click();
await ledgerAddTransaction.waitFor({ state: "hidden" });
await ledgerHome.getByText("+0.00001 BTC", { exact: true }).first().waitFor();

if (process.env.WALLET_TEST_SCOPE === "ledger") {
  if (errors.length) throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  await context.close();
  await browser.close();
  console.log("Ledger mobile smoke test passed: responsive home, chart, actions, transfer source lock, account-scoped settings, bottom navigation, and atomic Add Transaction.");
  process.exit(0);
}

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
const trustNavGeometry = await trustBottomNav.evaluate((nav) => {
  const rail = nav.querySelector('[data-testid="trust-nav-rail"]');
  const search = nav.querySelector('[data-testid="trust-nav-search"]');
  if (!(rail instanceof HTMLElement) || !(search instanceof HTMLButtonElement)) throw new Error("Trust navigation rail or Search control is missing.");
  const navRect = nav.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const searchRect = search.getBoundingClientRect();
  const tabs = [...rail.querySelectorAll(":scope > button")];
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    nav: { left: navRect.left, right: navRect.right, bottom: navRect.bottom, height: navRect.height },
    rail: { left: railRect.left, right: railRect.right, top: railRect.top, bottom: railRect.bottom, width: railRect.width, height: railRect.height, radius: Number.parseFloat(getComputedStyle(rail).borderRadius), background: getComputedStyle(rail).backgroundColor },
    search: { left: searchRect.left, right: searchRect.right, top: searchRect.top, bottom: searchRect.bottom, width: searchRect.width, height: searchRect.height, radius: Number.parseFloat(getComputedStyle(search).borderRadius), background: getComputedStyle(search).backgroundColor, directChild: search.parentElement === nav },
    tabs: tabs.map((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error("Trust navigation contains a non-button tab.");
      const rect = button.getBoundingClientRect();
      const icon = button.querySelector("svg");
      if (!(icon instanceof SVGElement)) throw new Error(`Trust ${button.getAttribute("aria-label")} tab has no icon.`);
      const iconRect = icon.getBoundingClientRect();
      return {
        name: button.getAttribute("aria-label"),
        current: button.getAttribute("aria-current"),
        visibleText: button.textContent?.trim() ?? "",
        width: rect.width,
        height: rect.height,
        radius: Number.parseFloat(getComputedStyle(button).borderRadius),
        background: getComputedStyle(button).backgroundColor,
        iconWidth: iconRect.width,
        iconHeight: iconRect.height,
        iconCenterDelta: Math.max(
          Math.abs((iconRect.left + iconRect.width / 2) - (rect.left + rect.width / 2)),
          Math.abs((iconRect.top + iconRect.height / 2) - (rect.top + rect.height / 2)),
        ),
      };
    }),
  };
});
const trustNavNames = trustNavGeometry.tabs.map(({ name }) => name).join(",");
const trustNavWidths = trustNavGeometry.tabs.map(({ width }) => width);
const trustNavActive = trustNavGeometry.tabs.filter(({ current }) => current === "page");
const trustNavInactiveBackground = trustNavGeometry.tabs.find(({ current }) => current !== "page")?.background;
const trustNavMismatch = Math.abs(trustNavGeometry.nav.left - 16) > 0.5
  || Math.abs(trustNavGeometry.viewport.width - trustNavGeometry.nav.right - 16) > 0.5
  || Math.abs(trustNavGeometry.viewport.height - trustNavGeometry.nav.bottom - 12) > 0.5
  || Math.abs(trustNavGeometry.nav.height - 68) > 0.5
  || Math.abs(trustNavGeometry.rail.width - 288) > 0.5
  || Math.abs(trustNavGeometry.rail.height - 68) > 0.5
  || Math.abs(trustNavGeometry.search.width - 60) > 0.5
  || Math.abs(trustNavGeometry.search.height - 68) > 0.5
  || Math.abs(trustNavGeometry.search.left - trustNavGeometry.rail.right - 10) > 0.5
  || Math.abs(trustNavGeometry.search.top - trustNavGeometry.rail.top) > 0.5
  || Math.abs(trustNavGeometry.search.bottom - trustNavGeometry.rail.bottom) > 0.5
  || !trustNavGeometry.search.directChild
  || trustNavGeometry.rail.radius < 27
  || trustNavGeometry.search.radius < 26
  || trustNavNames !== "Home,Market,Earn,Discover"
  || Math.max(...trustNavWidths) - Math.min(...trustNavWidths) > 0.5
  || trustNavGeometry.tabs.some((tab) => tab.visibleText || tab.width < 44 || tab.height < 44 || tab.radius < 22 || tab.iconWidth < 27 || tab.iconWidth > 29 || tab.iconHeight < 27 || tab.iconHeight > 29 || tab.iconCenterDelta > 0.5)
  || trustNavActive.length !== 1
  || trustNavActive[0]?.name !== "Home"
  || trustNavActive[0]?.background === trustNavInactiveBackground
  || trustNavGeometry.rail.background !== trustNavGeometry.search.background;
if (trustNavMismatch) throw new Error(`Trust bottom navigation does not match the icon-only reference: ${JSON.stringify(trustNavGeometry)}`);
for (const action of ["Send", "Receive", "Swap", "Buy"]) {
  await page.locator('[data-testid="trust-home"]').getByRole("button", { name: action, exact: true }).waitFor();
}
await page.evaluate(() => document.fonts.ready);
const trustTypography = await page.locator('[data-testid="trust-home"]').evaluate((home) => {
  const styleOf = (element) => {
    if (!(element instanceof HTMLElement)) throw new Error("Trust typography anchor is missing.");
    const style = getComputedStyle(element);
    return { fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing };
  };
  const buttonWithText = (label) => [...home.querySelectorAll("button")].find((button) => button.textContent?.trim().startsWith(label));
  const send = [...home.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Send");
  const solana = [...home.querySelectorAll("strong")].find((element) => element.textContent?.trim() === "Solana");
  return {
    account: styleOf(home.querySelector('[data-testid="trust-account-name"]')),
    balance: styleOf(home.querySelector('[data-testid="trust-portfolio-balance"]')),
    change: styleOf(home.querySelector('[data-testid="trust-portfolio-change"]')),
    action: styleOf(send),
    section: styleOf(buttonWithText("Tokens")),
    token: styleOf(solana),
  };
});
const expectedTrustTypography = {
  account: { fontSize: "17px", lineHeight: "22px" },
  balance: { fontSize: "48px", lineHeight: "48px" },
  change: { fontSize: "18px", lineHeight: "24px" },
  action: { fontSize: "16px", lineHeight: "20px" },
  section: { fontSize: "22px", lineHeight: "28px" },
  token: { fontSize: "18px", lineHeight: "23px" },
};
for (const [anchor, expected] of Object.entries(expectedTrustTypography)) {
  const actual = trustTypography[anchor];
  const fontSizeDelta = Math.abs(Number.parseFloat(actual.fontSize) - Number.parseFloat(expected.fontSize));
  const lineHeightDelta = Math.abs(Number.parseFloat(actual.lineHeight) - Number.parseFloat(expected.lineHeight));
  if (fontSizeDelta > 0.1 || lineHeightDelta > 0.1) {
    throw new Error(`Trust ${anchor} typography does not match the reference: ${JSON.stringify(actual)}`);
  }
}
const trustActionLayout = await page.locator('[data-testid="trust-actions"]').evaluate((row) => [...row.children].map((button) => {
  const tile = button.querySelector('[data-testid="trust-action-tile"]');
  const label = button.querySelector('[data-testid="trust-action-label"]');
  const icon = tile?.querySelector("svg");
  if (!(button instanceof HTMLButtonElement) || !(tile instanceof HTMLElement) || !(label instanceof HTMLElement) || !(icon instanceof SVGElement)) {
    throw new Error("A Trust action is missing its button, icon tile, label, or icon.");
  }
  const buttonRect = button.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  const labelRect = label.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  return {
    name: button.getAttribute("aria-label"),
    labelInsideTile: tile.contains(label),
    tileWidth: tileRect.width,
    tileHeight: tileRect.height,
    gap: labelRect.top - tileRect.bottom,
    labelCenterDelta: Math.abs((labelRect.left + labelRect.width / 2) - (tileRect.left + tileRect.width / 2)),
    iconCenterDelta: Math.max(
      Math.abs((iconRect.left + iconRect.width / 2) - (tileRect.left + tileRect.width / 2)),
      Math.abs((iconRect.top + iconRect.height / 2) - (tileRect.top + tileRect.height / 2)),
    ),
    buttonWidth: buttonRect.width,
    buttonHeight: buttonRect.height,
  };
}));
if (trustActionLayout.map(({ name }) => name).join(",") !== "Send,Receive,Swap,Buy") {
  throw new Error(`Trust actions are not the expected English labels: ${JSON.stringify(trustActionLayout)}`);
}
for (const action of trustActionLayout) {
  if (action.labelInsideTile || Math.abs(action.tileHeight - 56) > 0.1 || action.tileWidth < 75 || action.tileWidth > 85 || action.gap < 9 || action.gap > 12 || action.labelCenterDelta > 0.5 || action.iconCenterDelta > 0.5 || action.buttonWidth < 44 || action.buttonHeight < 44) {
    throw new Error(`Trust ${action.name} action does not match the detached-label reference layout: ${JSON.stringify(action)}`);
  }
}
if (trustScreenshotDir) {
  await page.locator('[data-testid="trust-home"]').evaluate((home) => { if (home.parentElement) home.parentElement.scrollTop = 0; });
  await page.screenshot({ path: `${trustScreenshotDir}/trust-home.png` });
  await trustBottomNav.screenshot({ path: `${trustScreenshotDir}/trust-bottom-nav.png` });
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
if (process.env.WALLET_TEST_SCOPE === "trust-typography") {
  if (errors.length) throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  await context.close();
  await browser.close();
  console.log("Trust typography smoke test passed: home text scale, line heights, and responsive bounds match the mobile reference.");
  process.exit(0);
}

if (process.env.WALLET_TEST_SCOPE === "trust-earn") {
  await trustBottomNav.getByRole("button", { name: "Earn", exact: true }).click();
  const focusedTrustEarn = page.locator('[data-testid="trust-earn"]');
  await focusedTrustEarn.getByRole("heading", { name: "Earn", exact: true }).waitFor();
  await focusedTrustEarn.getByRole("heading", { name: "Deposit assets and open your first position.", exact: true }).waitFor();
  if (await trustBottomNav.getByRole("button", { name: "Earn", exact: true }).getAttribute("aria-current") !== "page") {
    throw new Error("Trust Earn did not activate the infinity navigation tab.");
  }
  const focusedEarnText = await focusedTrustEarn.innerText();
  if (/20% Batterie|Stromsparmodus|Zahle|Einzahlung|Beliebt/i.test(focusedEarnText)) {
    throw new Error("Trust Earn contains source-language or iPhone notification text.");
  }
  const focusedEarnRows = focusedTrustEarn.locator('[data-testid="trust-earn-popular"] [data-testid^="trust-earn-market-"]');
  if (await focusedEarnRows.count() !== 5) throw new Error("Trust Earn should show five live popular markets.");
  if (!(await focusedEarnRows.evaluateAll((rows) => rows.every((row) => Number(row.getAttribute("data-price")) > 0 && Number.isFinite(Number(row.getAttribute("data-volume"))))))) {
    throw new Error("Trust Earn popular markets are not backed by valid live market values.");
  }
  await page.evaluate(() => document.fonts.ready);
  const focusedEarnGeometry = await page.evaluate(() => {
    const requireElement = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Trust Earn is missing ${selector}.`);
      return element;
    };
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const root = requireElement('[data-testid="trust-earn"]');
    const hero = requireElement('[data-testid="trust-earn-hero"]');
    const title = requireElement('[data-testid="trust-earn-title"]');
    const mark = hero.querySelector("svg");
    const deposit = requireElement('[data-testid="trust-earn-deposit"]');
    const popular = requireElement('[data-testid="trust-earn-popular"]');
    const rows = [...popular.querySelectorAll('[data-testid^="trust-earn-market-"]')];
    const firstIcon = rows[0]?.querySelector(':scope > span:first-of-type');
    const actions = requireElement('[data-testid="trust-earn-actions"]');
    const long = requireElement('[data-testid="trust-earn-long"]');
    const short = requireElement('[data-testid="trust-earn-short"]');
    const nav = requireElement('[data-testid="trust-bottom-nav"]');
    if (!(mark instanceof SVGElement) || !(firstIcon instanceof HTMLElement)) throw new Error("Trust Earn hero or market icon is incomplete.");
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      root: rect(root),
      title: { ...rect(title), fontSize: Number.parseFloat(getComputedStyle(title).fontSize), lineHeight: Number.parseFloat(getComputedStyle(title).lineHeight) },
      mark: rect(mark),
      deposit: { ...rect(deposit), radius: Number.parseFloat(getComputedStyle(deposit).borderRadius) },
      rows: rows.map((row) => rect(row)),
      firstIcon: rect(firstIcon),
      sparklines: rows.filter((row) => Boolean(row.querySelector("svg"))).length,
      actions: rect(actions),
      long: rect(long),
      short: rect(short),
      nav: rect(nav),
    };
  });
  const focusedEarnLayoutMismatch = focusedEarnGeometry.viewportWidth !== 390
    || focusedEarnGeometry.documentWidth > focusedEarnGeometry.viewportWidth
    || Math.abs(focusedEarnGeometry.root.left - 16) > 0.5
    || Math.abs(focusedEarnGeometry.viewportWidth - focusedEarnGeometry.root.right - 16) > 0.5
    || focusedEarnGeometry.title.fontSize < 26 || focusedEarnGeometry.title.fontSize > 30
    || focusedEarnGeometry.title.lineHeight < 32 || focusedEarnGeometry.title.lineHeight > 36
    || focusedEarnGeometry.mark.width < 100 || focusedEarnGeometry.mark.width > 114
    || focusedEarnGeometry.mark.height < 64 || focusedEarnGeometry.mark.height > 74
    || Math.abs(focusedEarnGeometry.deposit.width - 358) > 0.5
    || Math.abs(focusedEarnGeometry.deposit.height - 56) > 0.5
    || focusedEarnGeometry.deposit.radius < 27
    || focusedEarnGeometry.rows.length !== 5
    || focusedEarnGeometry.rows.some(({ height }) => Math.abs(height - 68) > 0.5)
    || Math.abs(focusedEarnGeometry.firstIcon.width - 42) > 0.5
    || Math.abs(focusedEarnGeometry.firstIcon.height - 42) > 0.5
    || focusedEarnGeometry.sparklines !== 5
    || Math.abs(focusedEarnGeometry.actions.left - 16) > 0.5
    || Math.abs(focusedEarnGeometry.viewportWidth - focusedEarnGeometry.actions.right - 16) > 0.5
    || Math.abs(focusedEarnGeometry.actions.height - 56) > 0.5
    || Math.abs(focusedEarnGeometry.long.width - focusedEarnGeometry.short.width) > 0.5
    || Math.abs(focusedEarnGeometry.short.left - focusedEarnGeometry.long.right - 12) > 0.5
    || Math.abs(focusedEarnGeometry.nav.top - focusedEarnGeometry.actions.bottom - 10) > 0.5;
  if (focusedEarnLayoutMismatch) throw new Error(`Trust Earn does not match the mobile reference geometry: ${JSON.stringify(focusedEarnGeometry)}`);
  if (trustScreenshotDir) await page.screenshot({ path: `${trustScreenshotDir}/trust-earn.png` });

  await focusedTrustEarn.locator('[data-testid="trust-earn-deposit"]').click();
  const focusedEarnReceive = page.locator("section[aria-label='Receive']");
  await focusedEarnReceive.getByRole("heading", { name: "Receive", exact: true }).waitFor();
  await focusedEarnReceive.getByRole("img", { name: "Wallet address QR code" }).waitFor();
  await focusedEarnReceive.getByRole("button", { name: "Close", exact: true }).click();
  await focusedEarnReceive.waitFor({ state: "hidden" });

  const focusedSolMarket = focusedTrustEarn.locator('[data-testid="trust-earn-market-sol-25"]');
  await focusedSolMarket.click();
  if (await focusedSolMarket.getAttribute("aria-pressed") !== "true") throw new Error("Trust Earn did not select the SOL market.");
  await page.locator('[data-testid="trust-earn-short"]').click();
  const focusedEarnOrder = page.locator('[data-testid="trust-perpetual-order"]');
  await focusedEarnOrder.getByRole("heading", { name: "SOL perpetual", exact: true }).waitFor();
  await enterWalletKeypadAmount(focusedEarnOrder, "Perpetual collateral", "0.00001");
  await focusedEarnOrder.getByRole("button", { name: "Review practice order", exact: true }).click();
  const focusedEarnReview = page.locator('[data-testid="trust-perpetual-review"]');
  await focusedEarnReview.getByText(/short SOL · 25x/i).waitFor();
  await focusedEarnReview.getByRole("button", { name: "Go back", exact: true }).click();
  await focusedEarnOrder.getByRole("button", { name: "Go back", exact: true }).click();
  await focusedTrustEarn.getByRole("heading", { name: "Deposit assets and open your first position.", exact: true }).waitFor();
  await page.locator('[data-testid="trust-earn-long"]').click();
  await focusedEarnOrder.getByRole("heading", { name: "SOL perpetual", exact: true }).waitFor();
  if (!((await focusedEarnOrder.getByRole("button", { name: "long", exact: true }).getAttribute("class")) ?? "").includes("bg-[#183927]")) {
    throw new Error("Trust Earn Long action did not preselect the long side.");
  }
  await focusedEarnOrder.getByRole("button", { name: "Go back", exact: true }).click();
  await focusedTrustEarn.getByRole("heading", { name: "Deposit assets and open your first position.", exact: true }).waitFor();
  const focusedYieldOffer = focusedTrustEarn.getByRole("button", { name: "Allocate DOT to Earn", exact: true });
  await focusedYieldOffer.evaluate((offer) => {
    const scroller = offer.closest('[data-testid="trust-earn"]')?.parentElement;
    if (!(scroller instanceof HTMLElement)) throw new Error("Trust Earn has no scroll container.");
    scroller.scrollTop = scroller.scrollHeight;
  });
  const focusedYieldClearance = await focusedYieldOffer.evaluate((offer) => {
    const actions = document.querySelector('[data-testid="trust-earn-actions"]');
    if (!(actions instanceof HTMLElement)) throw new Error("Trust Earn fixed actions are missing.");
    return actions.getBoundingClientRect().top - offer.getBoundingClientRect().bottom;
  });
  if (focusedYieldClearance < 8) throw new Error(`Trust Earn below-fold tools are obscured by the fixed actions: ${focusedYieldClearance}px clearance.`);
  await focusedYieldOffer.click();
  await page.locator('[data-testid="trust-earn-amount"]').getByRole("heading", { name: "Earn DOT", exact: true }).waitFor();

  if (errors.length) throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  await context.close();
  await browser.close();
  console.log("Trust Earn smoke test passed: reference layout, live markets, Deposit, selection, Long/Short routing, and navigation.");
  process.exit(0);
}

if (process.env.WALLET_TEST_SCOPE === "trust-discover") {
  await trustBottomNav.getByRole("button", { name: "Discover", exact: true }).click();
  const focusedTrustDiscover = page.locator('[data-testid="trust-discover"]');
  await focusedTrustDiscover.getByRole("heading", { name: "Discover", exact: true }).waitFor();
  if (await trustBottomNav.getByRole("button", { name: "Discover", exact: true }).getAttribute("aria-current") !== "page") {
    throw new Error("Trust Discover did not activate the compass navigation tab.");
  }
  await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Discover");
  const focusedDiscoverSearch = focusedTrustDiscover.getByLabel("Search dApps", { exact: true });
  if (await focusedDiscoverSearch.getAttribute("placeholder") !== "Search for a dApp URL or enter one") {
    throw new Error("Trust Discover does not use the English reference search placeholder.");
  }
  const focusedDiscoverText = await focusedTrustDiscover.innerText();
  if (/20% Batterie|Stromsparmodus|Zum Aktivieren|Suche nach der dApp|gib sie ein|Entdecke dApps/i.test(focusedDiscoverText)) {
    throw new Error("Trust Discover contains source-language or iPhone notification text.");
  }
  const focusedDiscoverRows = focusedTrustDiscover.locator('[data-testid="trust-discover-list"] > [data-testid^="trust-discover-row-"]');
  if (await focusedDiscoverRows.count() !== 5) throw new Error("Trust Discover should show five featured dApps.");
  for (const dapp of ["Lido", "Aave", "Uniswap", "PancakeSwap", "Pendle"]) {
    await focusedTrustDiscover.getByText(dapp, { exact: true }).waitFor();
  }

  await page.evaluate(() => document.fonts.ready);
  const focusedDiscoverGeometry = await page.evaluate(() => {
    const requireElement = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Trust Discover is missing ${selector}.`);
      return element;
    };
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const root = requireElement('[data-testid="trust-discover"]');
    const search = requireElement('[data-testid="trust-discover-search"]');
    const input = root.querySelector('input[aria-label="Search dApps"]');
    const banner = requireElement('[data-testid="trust-discover-banner"]');
    const categories = requireElement('[data-testid="trust-discover-categories"]');
    const list = requireElement('[data-testid="trust-discover-list"]');
    const rows = [...list.querySelectorAll(':scope > [data-testid^="trust-discover-row-"]')];
    const firstIcon = rows[0]?.firstElementChild;
    const nav = requireElement('[data-testid="trust-bottom-nav"]');
    if (!(input instanceof HTMLInputElement) || !(firstIcon instanceof HTMLElement)) throw new Error("Trust Discover search or dApp icon is incomplete.");
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      root: rect(root),
      search: { ...rect(search), radius: Number.parseFloat(getComputedStyle(search).borderRadius) },
      inputFontSize: Number.parseFloat(getComputedStyle(input).fontSize),
      banner: { ...rect(banner), radius: Number.parseFloat(getComputedStyle(banner).borderRadius) },
      categories: rect(categories),
      categoriesScrollable: categories.scrollWidth > categories.clientWidth,
      categoryCount: categories.querySelectorAll(':scope > button').length,
      rows: rows.map((row) => rect(row)),
      firstIcon: rect(firstIcon),
      nav: rect(nav),
    };
  });
  const focusedDiscoverLayoutMismatch = focusedDiscoverGeometry.viewportWidth !== 390
    || focusedDiscoverGeometry.documentWidth > focusedDiscoverGeometry.viewportWidth
    || focusedDiscoverGeometry.bodyWidth > focusedDiscoverGeometry.viewportWidth
    || Math.abs(focusedDiscoverGeometry.root.left - 16) > 0.5
    || Math.abs(focusedDiscoverGeometry.viewportWidth - focusedDiscoverGeometry.root.right - 16) > 0.5
    || Math.abs(focusedDiscoverGeometry.search.width - 358) > 0.5
    || Math.abs(focusedDiscoverGeometry.search.height - 48) > 0.5
    || focusedDiscoverGeometry.search.radius < 20
    || focusedDiscoverGeometry.inputFontSize < 16
    || Math.abs(focusedDiscoverGeometry.banner.width - 358) > 0.5
    || focusedDiscoverGeometry.banner.height < 104 || focusedDiscoverGeometry.banner.height > 160
    || focusedDiscoverGeometry.banner.radius < 20
    || focusedDiscoverGeometry.categoryCount !== 5
    || !focusedDiscoverGeometry.categoriesScrollable
    || focusedDiscoverGeometry.categories.height < 40
    || focusedDiscoverGeometry.rows.length !== 5
    || focusedDiscoverGeometry.rows.some(({ height }) => height < 64 || height > 76)
    || focusedDiscoverGeometry.firstIcon.width < 40 || focusedDiscoverGeometry.firstIcon.width > 52
    || focusedDiscoverGeometry.firstIcon.height < 40 || focusedDiscoverGeometry.firstIcon.height > 52
    || focusedDiscoverGeometry.nav.top < 700;
  if (focusedDiscoverLayoutMismatch) throw new Error(`Trust Discover does not match the mobile reference geometry: ${JSON.stringify(focusedDiscoverGeometry)}`);
  if (trustScreenshotDir) await page.screenshot({ path: `${trustScreenshotDir}/trust-discover.png` });

  await focusedTrustDiscover.locator('[data-testid="trust-discover-banner"]').click();
  const focusedDappView = page.locator('[data-testid="trust-dapp-view"]');
  await focusedDappView.waitFor();
  await focusedDappView.getByText(/bStocks/i).first().waitFor();
  await focusedDappView.getByRole("button", { name: "Go back", exact: true }).click();
  await focusedTrustDiscover.waitFor();

  await focusedTrustDiscover.locator('[data-testid="trust-discover-row-lido"]').click();
  await focusedDappView.getByRole("heading", { name: "Lido", exact: true }).waitFor();
  await focusedDappView.getByRole("button", { name: "Go back", exact: true }).click();
  await focusedTrustDiscover.waitFor();

  const focusedDexCategory = focusedTrustDiscover.locator('[data-testid="trust-discover-category-dex"]');
  await focusedDexCategory.click();
  if (await focusedDexCategory.getAttribute("aria-pressed") !== "true") throw new Error("Trust Discover did not activate the DEX category.");
  const focusedDexRows = focusedTrustDiscover.locator('[data-testid="trust-discover-list"] > [data-testid^="trust-discover-row-"]');
  if (await focusedDexRows.count() !== 2) throw new Error("Trust Discover DEX category should contain Uniswap and PancakeSwap.");
  await focusedTrustDiscover.getByText("Uniswap", { exact: true }).waitFor();
  await focusedTrustDiscover.getByText("PancakeSwap", { exact: true }).waitFor();

  await focusedTrustDiscover.locator('[data-testid="trust-discover-category-featured"]').click();
  await focusedDiscoverSearch.fill("Aave");
  if (await focusedDiscoverRows.count() !== 1 || await focusedTrustDiscover.getByText("Aave", { exact: true }).count() !== 1) {
    throw new Error("Trust Discover search did not filter the dApp list to Aave.");
  }
  await focusedDiscoverSearch.fill("not-a-real-dapp-xyz");
  await focusedTrustDiscover.getByRole("status").filter({ hasText: /No dApps found/i }).waitFor();
  await focusedDiscoverSearch.fill("");
  if (await focusedDiscoverRows.count() !== 5) throw new Error("Trust Discover did not restore the featured dApp list after clearing search.");

  const focusedWalletSettings = focusedTrustDiscover.getByRole("button").filter({ hasText: "Wallet settings" });
  await focusedWalletSettings.scrollIntoViewIfNeeded();
  const focusedSettingsClearance = await focusedWalletSettings.evaluate((button) => {
    const nav = document.querySelector('[data-testid="trust-bottom-nav"]');
    if (!(nav instanceof HTMLElement)) throw new Error("Trust Discover bottom navigation is missing.");
    return nav.getBoundingClientRect().top - button.getBoundingClientRect().bottom;
  });
  if (focusedSettingsClearance < 8) throw new Error(`Trust Discover below-fold wallet tools are obscured by the bottom navigation: ${focusedSettingsClearance}px clearance.`);
  await focusedWalletSettings.click();
  await page.getByRole("heading", { name: "Wallet settings", exact: true }).waitFor();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await focusedTrustDiscover.waitFor();

  if (errors.length) throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  await context.close();
  await browser.close();
  console.log("Trust Discover smoke test passed: reference layout, English copy, dApp browsing, category/search filtering, wallet tools, and navigation.");
  process.exit(0);
}

if (!["trust-market", "trust-earn", "trust-discover"].includes(process.env.WALLET_TEST_SCOPE ?? "")) {
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
}

await trustBottomNav.getByRole("button", { name: "Market", exact: true }).click();
const trustMarket = page.locator('[data-testid="trust-market"]');
await trustMarket.getByRole("heading", { name: "Markets", exact: true }).waitFor();
await assertWritingFieldsAvoidIosZoom(page, "Larpz Trust-style Markets");
if (await trustBottomNav.getByRole("button", { name: "Market", exact: true }).getAttribute("aria-current") !== "page") {
  throw new Error("Trust Markets did not activate the Market navigation tab.");
}
const trustMarketText = await trustMarket.innerText();
if (/Meistgehandelt|Netzwerk|Volumen|Prognosen|Märkte/i.test(trustMarketText)) {
  throw new Error("Trust Markets still contains German source-interface text.");
}
await page.evaluate(() => document.fonts.ready);
const trustMarketGeometry = await page.evaluate(() => {
  const requireElement = (selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) throw new Error(`Trust Markets is missing ${selector}.`);
    return element;
  };
  const rect = (element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
  };
  const market = requireElement('[data-testid="trust-market"]');
  const header = requireElement('[data-testid="trust-market-header"]');
  const title = header.querySelector("h1");
  const search = requireElement('[data-testid="trust-market-search"]');
  const shortcuts = requireElement('[data-testid="trust-market-shortcuts"]');
  const cards = requireElement('[data-testid="trust-market-top-cards"]');
  const categories = requireElement('[data-testid="trust-market-categories"]');
  const filters = requireElement('[data-testid="trust-market-filters"]');
  const list = requireElement('[data-testid="trust-market-list"]');
  const swap = requireElement('[data-testid="trust-market-swap"]');
  const nav = requireElement('[data-testid="trust-bottom-nav"]');
  if (!(title instanceof HTMLElement)) throw new Error("Trust Markets title is missing.");
  return {
    viewportWidth: window.innerWidth,
    market: rect(market),
    title: rect(title),
    search: rect(search),
    shortcuts: [...shortcuts.children].map((element) => rect(element)),
    cards: [...cards.children].map((element) => ({ ...rect(element), sparkline: Boolean(element.querySelector("svg")) })),
    cardsScrollable: cards.scrollWidth > cards.clientWidth,
    categoriesScrollable: categories.scrollWidth > categories.clientWidth,
    filters: [...filters.children].map((element) => rect(element)),
    rows: [...list.querySelectorAll(':scope > [data-testid^="trust-market-row-"]')].slice(0, 3).map((element) => rect(element)),
    swap: rect(swap),
    nav: rect(nav),
  };
});
const shortcutWidths = trustMarketGeometry.shortcuts.map(({ width }) => width);
const trustMarketLayoutMismatch = Math.abs(trustMarketGeometry.market.left - 16) > 0.5
  || Math.abs(trustMarketGeometry.viewportWidth - trustMarketGeometry.market.right - 16) > 0.5
  || Math.abs((trustMarketGeometry.title.left + trustMarketGeometry.title.width / 2) - trustMarketGeometry.viewportWidth / 2) > 0.5
  || Math.abs(trustMarketGeometry.search.width - 48) > 0.5
  || Math.abs(trustMarketGeometry.search.height - 48) > 0.5
  || trustMarketGeometry.shortcuts.length !== 2
  || Math.max(...shortcutWidths) - Math.min(...shortcutWidths) > 0.5
  || trustMarketGeometry.shortcuts.some(({ height }) => height < 60)
  || trustMarketGeometry.cards.length !== 3
  || trustMarketGeometry.cards.some(({ width, height, sparkline }) => width < 115 || width > 117 || height < 140 || !sparkline)
  || !trustMarketGeometry.cardsScrollable
  || !trustMarketGeometry.categoriesScrollable
  || trustMarketGeometry.filters.length !== 3
  || trustMarketGeometry.filters.some(({ height }) => height < 40)
  || trustMarketGeometry.rows.length < 3
  || trustMarketGeometry.rows.some(({ height }) => height < 68)
  || Math.abs(trustMarketGeometry.swap.left - 16) > 0.5
  || Math.abs(trustMarketGeometry.viewportWidth - trustMarketGeometry.swap.right - 16) > 0.5
  || Math.abs(trustMarketGeometry.swap.height - 52) > 0.5
  || Math.abs(trustMarketGeometry.nav.top - trustMarketGeometry.swap.bottom - 10) > 0.5;
if (trustMarketLayoutMismatch) throw new Error(`Trust Markets does not match the mobile reference geometry: ${JSON.stringify(trustMarketGeometry)}`);
if (trustScreenshotDir) await page.screenshot({ path: `${trustScreenshotDir}/trust-market.png` });

await trustMarket.getByRole("button", { name: "Search markets", exact: true }).click();
const trustMarketSearch = page.locator('[data-testid="trust-market-search-screen"]');
await trustMarketSearch.getByRole("heading", { name: "Search markets", exact: true }).waitFor();
const trustMarketSearchInput = trustMarketSearch.getByLabel("Search markets", { exact: true });
await trustMarketSearchInput.waitFor();
if (await trustMarketSearchInput.getAttribute("placeholder") !== "Tokens, stocks, dApps, addresses") {
  throw new Error("Trust search does not use the English reference placeholder.");
}
if (!(await trustMarketSearchInput.evaluate((input) => input === document.activeElement))) {
  throw new Error("Trust search did not focus the search input when it opened.");
}
if (await page.locator('[data-testid="trust-bottom-nav"]').count()) {
  throw new Error("Trust search should hide the bottom navigation while the search field is active.");
}
await trustMarketSearch.getByRole("heading", { name: "Trending", exact: true }).waitFor();
const trustTrendingRows = trustMarketSearch.locator('[data-testid="trust-market-search-results"] > [data-testid^="trust-market-search-row-"]');
if (await trustTrendingRows.count() !== 6) throw new Error("Trust search should show six live trending results.");
const trustTrendingVolumes = await trustTrendingRows.evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("data-volume"))));
if (trustTrendingVolumes.some((volume, index) => index > 0 && trustTrendingVolumes[index - 1] < volume)) {
  throw new Error(`Trust search trending results are not sorted by live volume: ${JSON.stringify(trustTrendingVolumes)}`);
}
const trustSearchText = await trustMarketSearch.innerText();
if (/Aktien|Adressen|Suche|Trends auf Deutsch/i.test(trustSearchText)) {
  throw new Error("Trust search still contains German source-interface text.");
}
const trustSearchGeometry = await page.evaluate(() => {
  const requireElement = (selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) throw new Error(`Trust search is missing ${selector}.`);
    return element;
  };
  const rect = (element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
  };
  const screen = requireElement('[data-testid="trust-market-search-screen"]');
  const header = requireElement('[data-testid="trust-market-search-header"]');
  const field = requireElement('[data-testid="trust-market-search-field"]');
  const input = requireElement('[data-testid="trust-market-search-input"]');
  const close = requireElement('[data-testid="trust-market-search-close"]');
  const results = requireElement('[data-testid="trust-market-search-results"]');
  const rows = [...results.querySelectorAll(':scope > [data-testid^="trust-market-search-row-"]')];
  const firstIcon = rows[0]?.querySelector('button:first-child > span');
  const firstStar = rows[0]?.querySelector('[data-testid^="trust-market-search-star-"]');
  if (!(firstIcon instanceof HTMLElement) || !(firstStar instanceof HTMLElement)) throw new Error("Trust search result controls are incomplete.");
  return {
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    screen: rect(screen),
    header: rect(header),
    field: rect(field),
    inputFontSize: Number.parseFloat(getComputedStyle(input).fontSize),
    close: rect(close),
    rows: rows.map((row) => rect(row)),
    firstIcon: rect(firstIcon),
    firstStar: rect(firstStar),
  };
});
const trustSearchLayoutMismatch = trustSearchGeometry.viewportWidth !== 390
  || trustSearchGeometry.documentWidth > trustSearchGeometry.viewportWidth
  || Math.abs(trustSearchGeometry.screen.left - 16) > 0.5
  || Math.abs(trustSearchGeometry.viewportWidth - trustSearchGeometry.screen.right - 16) > 0.5
  || Math.abs(trustSearchGeometry.field.height - 48) > 0.5
  || Math.abs(trustSearchGeometry.close.width - 48) > 0.5
  || Math.abs(trustSearchGeometry.close.height - 48) > 0.5
  || Math.abs(trustSearchGeometry.close.left - trustSearchGeometry.field.right - 8) > 0.5
  || trustSearchGeometry.inputFontSize < 16
  || trustSearchGeometry.rows.length !== 6
  || trustSearchGeometry.rows.some(({ height }) => Math.abs(height - 68) > 0.5)
  || Math.abs(trustSearchGeometry.firstIcon.width - 40) > 0.5
  || Math.abs(trustSearchGeometry.firstIcon.height - 40) > 0.5
  || Math.abs(trustSearchGeometry.firstStar.width - 44) > 0.5
  || Math.abs(trustSearchGeometry.firstStar.height - 44) > 0.5;
if (trustSearchLayoutMismatch) throw new Error(`Trust search does not match the mobile reference geometry: ${JSON.stringify(trustSearchGeometry)}`);
if (trustScreenshotDir) await page.screenshot({ path: `${trustScreenshotDir}/trust-search.png` });

const trustUnstarredResult = trustMarketSearch.getByRole("button", { name: /^Add .* to watchlist$/ }).first();
if (!await trustUnstarredResult.count()) throw new Error("Trust search needs at least one unstarred trending result.");
const trustSearchStarTestId = await trustUnstarredResult.getAttribute("data-testid");
if (!trustSearchStarTestId) throw new Error("Trust search favorite control is missing its test identifier.");
const trustSearchStar = trustMarketSearch.locator(`[data-testid="${trustSearchStarTestId}"]`);
await trustSearchStar.click();
if (await trustSearchStar.getAttribute("aria-pressed") !== "true") throw new Error("Trust search could not add a trending token to the watchlist.");
await trustSearchStar.click();
if (await trustSearchStar.getAttribute("aria-pressed") !== "false") throw new Error("Trust search could not remove a trending token from the watchlist.");

await trustMarketSearchInput.fill("Solana");
await trustMarketSearch.getByRole("heading", { name: "Search results", exact: true }).waitFor();
await trustMarketSearch.locator('[data-testid="trust-market-search-row-sol"]').waitFor();
if (await trustMarketSearch.locator('[data-testid="trust-market-search-row-btc"]').count()) throw new Error("Trust search did not filter token results.");
await trustMarketSearch.getByRole("button", { name: "Open Solana search result", exact: true }).click();
await page.getByRole("heading", { name: "Solana", exact: true }).waitFor();
await page.getByRole("button", { name: "Go back", exact: true }).click();
await trustMarketSearch.getByRole("heading", { name: "Search markets", exact: true }).waitFor();
if (await trustMarketSearchInput.inputValue() !== "Solana") throw new Error("Trust search did not preserve the query after returning from a token.");

await trustMarketSearchInput.fill("not-a-real-result-xyz");
await trustMarketSearch.getByRole("status").filter({ hasText: "No results found." }).waitFor();
await trustMarketSearchInput.fill("swap");
await trustMarketSearch.locator('[data-testid="trust-market-search-feature-swap"]').click();
await page.locator('[data-testid="trust-swap-screen"]').getByRole("heading", { name: "Swap", exact: true }).waitFor();
await page.getByRole("button", { name: "Go back", exact: true }).click();
await trustMarketSearch.getByRole("heading", { name: "Search markets", exact: true }).waitFor();
await trustMarketSearch.locator('[data-testid="trust-market-search-close"]').click();
await trustMarket.getByRole("heading", { name: "Markets", exact: true }).waitFor();

await trustMarket.getByRole("button", { name: "Predictions", exact: true }).click();
const trustPredictions = page.locator('[data-testid="trust-predictions"]');
await trustPredictions.getByRole("heading", { name: "Predictions", exact: true }).waitFor();
await trustPredictions.getByText("Practice predictions", { exact: true }).waitFor();
await trustPredictions.getByRole("button", { name: "Predict BTC price movement", exact: true }).waitFor();
await page.getByRole("button", { name: "Go back", exact: true }).click();
await trustMarket.getByRole("heading", { name: "Markets", exact: true }).waitFor();

await trustMarket.getByRole("button", { name: "Meme Rush", exact: true }).click();
const trustStockMemeCategory = page.locator('[data-testid="trust-market-category-stock-meme"]');
if (await trustStockMemeCategory.getAttribute("aria-pressed") !== "true") throw new Error("Trust Meme Rush did not activate its market category.");
await page.locator('[data-testid="trust-market-row-doge"]').waitFor();
await page.locator('[data-testid="trust-market-category-hot"]').click();
if (await page.locator('[data-testid="trust-market-category-hot"]').getAttribute("aria-pressed") !== "true") throw new Error("Trust Hot tokens category did not activate.");

const trustMarketNetwork = page.locator('[data-testid="trust-market-network-filter"]');
await trustMarketNetwork.selectOption("solana");
const solanaMarketRows = page.locator('[data-testid="trust-market-list"] > [data-testid^="trust-market-row-"]');
if (await solanaMarketRows.count() < 1 || (await solanaMarketRows.evaluateAll((rows) => rows.every((row) => row.getAttribute("data-network") === "solana"))) !== true) {
  throw new Error("Trust Markets network filter did not limit results to Solana.");
}
await trustMarketNetwork.selectOption("all");
const trustMarketPeriod = page.locator('[data-testid="trust-market-period-filter"]');
await trustMarketPeriod.selectOption("7d");
if (await trustMarketPeriod.inputValue() !== "7d") throw new Error("Trust Markets period filter did not update.");
await trustMarketPeriod.selectOption("24h");
const trustMarketSort = page.locator('[data-testid="trust-market-sort"]');
await trustMarketSort.selectOption("price-desc");
const marketPrices = await page.locator('[data-testid="trust-market-list"] > [data-testid^="trust-market-row-"]').evaluateAll((rows) => rows.slice(0, 3).map((row) => Number(row.getAttribute("data-price"))));
if (marketPrices.some((price, index) => index > 0 && marketPrices[index - 1] < price)) throw new Error(`Trust Markets price sort is not descending: ${JSON.stringify(marketPrices)}`);
await trustMarketSort.selectOption("volume-desc");

await page.locator('[data-testid="trust-market-swap"]').click();
await page.locator('[data-testid="trust-swap-screen"]').getByRole("heading", { name: "Swap", exact: true }).waitFor();
await page.getByRole("button", { name: "Go back", exact: true }).click();
await trustMarket.getByRole("heading", { name: "Markets", exact: true }).waitFor();

await page.locator('[data-testid="trust-market-row-btc"]').click();
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
await trustMarket.getByRole("heading", { name: "Markets", exact: true }).waitFor();
await page.locator('[data-testid="trust-market-card-bnb"]').click();
await page.getByRole("button", { name: "Add to watchlist" }).click();
const trustAddWatchNotice = page.getByRole("status").filter({ hasText: "BNB added to your watchlist" });
await trustAddWatchNotice.waitFor();
await trustAddWatchNotice.waitFor({ state: "hidden", timeout: 5_000 });
await page.getByRole("button", { name: "Go back", exact: true }).click();
await trustMarket.getByRole("heading", { name: "Markets", exact: true }).waitFor();
await trustBottomNav.getByRole("button", { name: "Home", exact: true }).click();
await page.locator('[data-testid="trust-home"]').waitFor();

if (process.env.WALLET_TEST_SCOPE === "trust-market") {
  if (errors.length) throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  await context.close();
  await browser.close();
  console.log("Trust Markets smoke test passed: responsive layout, live data, search, shortcuts, filters, token details, watchlist, Swap, and bottom navigation.");
  process.exit(0);
}

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
await page.locator('[data-testid="trust-search-close"]').click();

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
