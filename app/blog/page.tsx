import { BlogSection } from "@/components/marketing/blog-section";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNavbar } from "@/components/marketing/navbar";

export default function BlogPage() {
  return (
    <div className="larpz-marketing">
      <div className="ambient-bg" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <MarketingNavbar />
      <main className="pt-36">
        <BlogSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
