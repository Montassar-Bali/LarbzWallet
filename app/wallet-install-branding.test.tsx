import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { metadata as ledgerMetadata } from "@/app/ledger-wallet/page";
import { metadata as trustMetadata } from "@/app/trust-wallet/page";
import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";
import { WalletLauncher } from "@/components/dashboard/wallet-launcher";

const wallets = [
  {
    name: "Ledger Wallet",
    route: "/ledger-wallet",
    manifestPath: "/manifests/ledger.webmanifest",
    iconPath: "/icons/wallets/ledger.png",
    metadata: ledgerMetadata,
  },
  {
    name: "Trust Wallet",
    route: "/trust-wallet",
    manifestPath: "/manifests/trust.webmanifest",
    iconPath: "/icons/wallets/trust.png",
    metadata: trustMetadata,
  },
] as const;

describe("wallet install branding", () => {
  it("uses the Ledger and Trust names in both wallet launchers", () => {
    const launchPage = renderToStaticMarkup(<WalletLaunchPage />);
    const dashboardLauncher = renderToStaticMarkup(<WalletLauncher value="ledger" onChange={() => {}} />);

    for (const markup of [launchPage, dashboardLauncher]) {
      expect(markup).toContain("Get Ledger Wallet");
      expect(markup).toContain("Get Trust Wallet");
      expect(markup).not.toContain("Get Larpz Wallet");
      expect(markup).not.toContain("Get Larpz Trust Style");
    }
  });

  it.each(wallets)("publishes dedicated $name metadata and manifest", async ({
    name,
    route,
    manifestPath,
    iconPath,
    metadata,
  }) => {
    expect(metadata).toMatchObject({
      title: name,
      manifest: manifestPath,
      icons: {
        apple: [{ url: iconPath, sizes: "280x280", type: "image/png" }],
      },
      appleWebApp: {
        capable: true,
        title: name,
      },
    });

    const manifest = JSON.parse(
      await readFile(new URL(`../public${manifestPath}`, import.meta.url), "utf8"),
    );

    expect(manifest).toMatchObject({
      id: route,
      name,
      short_name: name,
      start_url: route,
      scope: route,
      icons: [{ src: iconPath, sizes: "280x280", type: "image/png" }],
    });

    await expect(readFile(new URL(`../public${iconPath}`, import.meta.url))).resolves.not.toHaveLength(0);
  });
});
