import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNavbar } from "@/components/marketing/navbar";

export default function TermsPage() {
  return (
    <>
      <MarketingNavbar />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-32 sm:px-6">
        <h1 className="font-display text-4xl font-bold text-white">Terms & Conditions</h1>
        <p className="mt-5 text-sm leading-relaxed text-zinc-400">
          This software is provided for entertainment, demonstrations, and testing purposes. All data shown
          in the product is simulated. Larpz Wallet does not perform real blockchain transactions or manage
          actual cryptocurrency custody.
        </p>
      </main>
      <MarketingFooter />
    </>
  );
}
