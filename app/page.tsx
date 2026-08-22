import { BlogSection } from "@/components/marketing/blog-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { FeaturesSection } from "@/components/marketing/features-grid";
import { FinalCtaSection } from "@/components/marketing/final-cta";
import { MarketingFooter } from "@/components/marketing/footer";
import { HeroSection } from "@/components/marketing/hero";
import { HowItWorksSection } from "@/components/marketing/how-it-works";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { PricingSection } from "@/components/marketing/pricing-section";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import { Testimonials } from "@/components/marketing/testimonials";

export default function HomePage() {
  return (
    <div className="larpz-marketing">
      <div className="ambient-bg" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <MarketingNavbar />
      <main>
        <HeroSection />
        <ProductShowcase />
        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
        <Testimonials />
        <FaqSection />
        <FinalCtaSection />
        <BlogSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
