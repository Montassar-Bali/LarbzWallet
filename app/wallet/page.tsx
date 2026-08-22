import { WalletAppRoute } from "@/components/wallet/wallet-app-route";
import type { WalletThemeId } from "@/config/wallets";
import { isWalletThemeId } from "@/lib/wallet";

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const wallet = Array.isArray(query.wallet) ? query.wallet[0] : query.wallet;
  const initialTheme = isWalletThemeId(wallet) ? (wallet as WalletThemeId) : undefined;

  return <WalletAppRoute initialTheme={initialTheme} />;
}
