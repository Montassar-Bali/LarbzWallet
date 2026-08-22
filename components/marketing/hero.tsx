export function HeroSection() {
  return (
    <section className="hero" id="main-content">
      <div className="hero-badge">
        <span className="dot" /> Now available on iOS & Android
      </div>
      <p className="hero-tagline">
        Fake It &apos;till You <span className="gradient">Make It.</span>
      </p>
      <h1>The #1 Fake Crypto Wallet App</h1>
      <p>
        Display any balance on a pixel-perfect Phantom Wallet, Trust Wallet, Ledger, or Exodus interface. Live prices,
        custom tokens, push notifications — built purely for entertainment.
      </p>

      <div className="hero-price">
        <span className="amount">$30</span>
        <span className="period">starting price</span>
      </div>

      <div className="hero-actions">
        <a href="#pricing" className="btn btn-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 640 640" aria-hidden="true">
            <path d="M297.4 566.6C309.9 579.1 330.2 579.1 342.7 566.6L502.7 406.6C515.2 394.1 515.2 373.8 502.7 361.3C490.2 348.8 469.9 348.8 457.4 361.3L352 466.7L352 96C352 78.3 337.7 64 320 64C302.3 64 288 78.3 288 96L288 466.7L182.6 361.3C170.1 348.8 149.8 348.8 137.3 361.3C124.8 373.8 124.8 394.1 137.3 406.6L297.3 566.6z" />
          </svg>
          Get Larpz Wallet
        </a>
        <a href="https://t.me/larpzwalletcom" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" height="18" width="18" viewBox="0 0 640 640" aria-hidden="true">
            <path d="M320 72C183 72 72 183 72 320C72 457 183 568 320 568C457 568 568 457 568 320C568 183 457 72 320 72zM435 240.7C431.3 279.9 415.1 375.1 406.9 419C403.4 437.6 396.6 443.8 390 444.4C375.6 445.7 364.7 434.9 350.7 425.7C328.9 411.4 316.5 402.5 295.4 388.5C270.9 372.4 286.8 363.5 300.7 349C304.4 345.2 367.8 287.5 369 282.3C369.2 281.6 369.3 279.2 367.8 277.9C366.3 276.6 364.2 277.1 362.7 277.4C360.5 277.9 325.6 300.9 258.1 346.5C248.2 353.3 239.2 356.6 231.2 356.4C222.3 356.2 205.3 351.4 192.6 347.3C177.1 342.3 164.7 339.6 165.8 331C166.4 326.5 172.5 322 184.2 317.3C256.5 285.8 304.7 265 328.8 255C397.7 226.4 412 221.4 421.3 221.2C423.4 221.2 427.9 221.7 430.9 224.1C432.9 225.8 434.1 228.2 434.4 230.8C434.9 234 435 237.3 434.8 240.6z" />
          </svg>
          Join Telegram
        </a>
      </div>
    </section>
  );
}
