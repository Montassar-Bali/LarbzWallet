import { featureItems } from "@/config/features";

export function FeaturesSection() {
  return (
    <section className="features" id="features">
      <span className="section-label">Features</span>
      <h2 className="section-title">
        Everything you need <br />
        to flex responsibly with a fake wallet.
      </h2>
      <div className="features-grid">
        {featureItems.map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className="feature-card">
              <div className="feature-icon">
                <Icon />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
