import Image from "next/image";

const phoneMocks = [
  { src: "/assets/mockup-phone.png", alt: "Solana wallet demo" },
  { src: "/assets/mockup-phone-l.png", alt: "Ledger wallet demo" },
  { src: "/assets/mockup-phone-t.png", alt: "Trust wallet demo" },
  { src: "/assets/mockup-phone-e.png", alt: "Exodus wallet demo" },
  { src: "/assets/mockup-phone-l.png", alt: "", clone: true },
  { src: "/assets/mockup-phone-l-og.png", alt: "", clone: true },
  { src: "/assets/mockup-phone-og.png", alt: "", clone: true },
  { src: "/assets/mockup-phone-t.png", alt: "", clone: true },
  { src: "/assets/mockup-phone-t-og.png", alt: "", clone: true },
  { src: "/assets/mockup-phone-e.png", alt: "", clone: true },
  { src: "/assets/mockup-phone.png", alt: "", clone: true },
  { src: "/assets/mockup-phone-l.png", alt: "", clone: true },
];

export function ProductShowcase() {
  return (
    <section className="phone-section" aria-label="Wallet previews">
      <div className="phone-carousel-track">
        {phoneMocks.map((mock, index) => (
          <div key={`${mock.src}-${index}`} className={`phone-mockup ${mock.clone ? "phone-clone" : ""}`.trim()} aria-hidden={mock.clone ? "true" : undefined}>
            <Image src={mock.src} alt={mock.alt || ""} width={340} height={680} priority={index < 4} />
          </div>
        ))}
      </div>
    </section>
  );
}
