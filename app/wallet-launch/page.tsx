import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";
import { isWalletThemeId } from "@/lib/wallet";

export default async function WalletLaunchRoute({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const wallet = Array.isArray(query.wallet) ? query.wallet[0] : query.wallet;
  const initialWallet = isWalletThemeId(wallet) ? wallet : undefined;

  return <WalletLaunchPage initialWallet={initialWallet} />;
}
