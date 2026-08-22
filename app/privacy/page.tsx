import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNavbar } from "@/components/marketing/navbar";

export default function PrivacyPage() {
  return (
    <>
      <MarketingNavbar />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-32 sm:px-6">
        <h1 className="font-display text-4xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-5 text-sm leading-relaxed text-zinc-400">
          Larpz Wallet is a simulator product. This MVP stores local demonstration data in your browser
          to power fictional balances, tokens, and simulated activity. The app does not collect seed phrases,
          private keys, or real wallet credentials.
        </p>
      </main>
      <MarketingFooter />
    </>
  );
}
