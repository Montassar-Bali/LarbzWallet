const steps = [
  {
    id: "1",
    title: "Purchase a License",
    description: "Grab Larpz Wallet in the \"Buy\" page. Choose the plan that works for you, no hidden fees.",
  },
  {
    id: "2",
    title: "Receive Your Key",
    description: "After payment, you'll receive a unique license key via Telegram or email. Keep it safe.",
  },
  {
    id: "3",
    title: "Activate & Flex",
    description: "Enter your license key, download the app, and start customizing your dream portfolio. Time to larp.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="how-it-works" id="how-it-works">
      <span className="section-label">How It Works</span>
      <h2 className="section-title">How Larpz Wallet Works</h2>
      <div className="steps">
        {steps.map((step) => (
          <div key={step.id} className="step">
            <div className="step-num">{step.id}</div>
            <div className="step-content">
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
