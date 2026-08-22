import { Check, X } from "lucide-react";
import Link from "next/link";

import { pricingTiers } from "@/config/pricing";

export function PricingSection() {
  return (
    <section className="pricing" id="pricing" style={{ maxWidth: "1100px" }}>
      <span className="section-label">Pricing</span>
      <h2 className="section-title">Larpz Wallet Pricing</h2>

      <div className="pricing-grid">
        {pricingTiers.map((tier) => (
          <div key={tier.id} className={`pricing-card ${tier.highlighted ? "popular" : ""}`.trim()}>
            <div className="tag">{tier.name}</div>
            <div className="price">${tier.price}</div>
            <div className="price-sub">{tier.period}</div>

            <ul className="pricing-features">
              {tier.features.map((feature) => (
                <li key={feature.label} className={feature.included ? "included" : "excluded"}>
                  {feature.included ? <Check strokeWidth={2.5} /> : <X strokeWidth={2.5} />}
                  {feature.label}
                </li>
              ))}
            </ul>

            <Link
              href="/buy"
              className={`btn ${tier.highlighted ? "btn-primary" : "btn-ghost"} pricing-buy-link`}
              data-pkg={tier.id}
            >
              Buy
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M566.6 342.6C579.1 330.1 579.1 309.8 566.6 297.3L406.6 137.3C394.1 124.8 373.8 124.8 361.3 137.3C348.8 149.8 348.8 170.1 361.3 182.6L466.7 288L96 288C78.3 288 64 302.3 64 320C64 337.7 78.3 352 96 352L466.7 352L361.3 457.4C348.8 469.9 348.8 490.2 361.3 502.7C373.8 515.2 394.1 515.2 406.6 502.7L566.6 342.7z" />
              </svg>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
