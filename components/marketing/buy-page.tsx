"use client";

import { Bitcoin, Check, Copy, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { MarketingNavbar } from "@/components/marketing/navbar";
import { buyTiers } from "@/config/pricing";
import { issueDemoLicense } from "@/lib/license";

const paymentCoins = [
  ["SOL", "Solana", "#41e5a3"], ["ETH", "Ethereum", "#7187e8"], ["BNB", "BNB (BSC)", "#f3bb2e"],
  ["BTC", "Bitcoin", "#f7931a"], ["LTC", "Litecoin", "#b9b9b9"], ["XMR", "Monero", "#ff6b18"],
  ["TRX", "Tron", "#f20d3a"], ["USDT", "USDT (ERC-20)", "#28a17d"], ["USDT-TRC", "USDT (TRC-20)", "#28a17d"],
  ["USDT-SOL", "USDT (Solana)", "#28a17d"],
] as const;

const paymentAddress = "bc1q6gpupechw7zyfha5f9wzsmp4znmrw2rdy7qnq";

function DemoQrCode() {
  const rows = [
    "111111101010101111111", "100000101110101100001", "101110100010111101101", "101110101111001101101",
    "101110100101101101101", "100000101011101100001", "111111101010101111111", "000000001101000000000",
    "110111111001111011101", "001001001110001100010", "111010111011101011111", "010111000100010100101",
    "101101111011111101110", "000000001101000000000", "111111101001011111111", "100000100111010100001",
    "101110101010111101101", "101110100110001101101", "101110101111101101101", "100000101000101100001",
    "111111101101111111111",
  ];
  return <div className="demo-qr" aria-label="Simulated payment QR code">{rows.flatMap((row, y) => [...row].map((cell, x) => <span key={`${y}-${x}`} className={cell === "1" ? "on" : "off"} />))}</div>;
}

export function BuyPageContent() {
  const [selectedTier, setSelectedTier] = useState("popular");
  const [paymentMethod, setPaymentMethod] = useState<"crypto" | "card">("crypto");
  const [selectedCoin, setSelectedCoin] = useState("BTC");
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [order, setOrder] = useState<{ id: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const tier = useMemo(() => buyTiers.find((item) => item.id === selectedTier) ?? buyTiers[1], [selectedTier]);
  const coin = paymentCoins.find((item) => item[0] === selectedCoin) ?? paymentCoins[3];
  const cryptoAmount = (tier.price / 78320).toFixed(8);

  const createOrder = () => {
    const plan = tier.id === "popular" ? "pro" : tier.id === "best-value" ? "lifetime" : "starter";
    const license = issueDemoLicense(plan);
    setOrder({ id: `ORD-${crypto.randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`, key: license.key });
  };

  const copyAddress = async () => {
    await navigator.clipboard?.writeText(paymentAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="larpz-marketing">
      <div className="ambient-bg" aria-hidden="true"><div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" /></div>
      <MarketingNavbar />
      <main className="buy-page">
        {!order ? <>
          <div className="buy-intro"><span className="buy-kicker"><i /> Instant key delivery</span><h1>Choose Your Plan</h1><p>Select a package, pick your payment method, and get your license key in seconds.</p></div>
          <div className="buy-packages">{buyTiers.map((item) => <button key={item.id} type="button" className={`buy-card ${item.highlighted ? "popular" : ""} ${selectedTier === item.id ? "selected" : ""}`.trim()} onClick={() => setSelectedTier(item.id)}><div className="tag">{item.name}</div><div className="price">${item.price}</div><div className="price-sub">{item.period}</div><ul>{item.features.map((feature) => <li key={feature.label}><Check strokeWidth={2.5} />{feature.label}</li>)}</ul></button>)}</div>
          <section className="checkout-panel">
            <p className="buy-kicker">Pay with</p>
            <div className="payment-methods"><button type="button" className={paymentMethod === "crypto" ? "active" : ""} onClick={() => setPaymentMethod("crypto")}><Bitcoin /> Crypto</button><button type="button" className={paymentMethod === "card" ? "active" : ""} onClick={() => setPaymentMethod("card")}><CreditCard /> Card / Apple Pay</button></div>
            {paymentMethod === "crypto" ? <><div className="coin-grid">{paymentCoins.map(([id, label, color]) => <button type="button" key={id} className={selectedCoin === id ? "active" : ""} onClick={() => setSelectedCoin(id)}><span style={{ backgroundColor: color }}>{id === "BTC" ? "₿" : id.slice(0, 1)}</span>{label}</button>)}</div><p className="payment-total"><strong>{tier.name}</strong> - ${tier.price} ≈ <b>{cryptoAmount} {coin[0]}</b></p></> : <div className="card-note">Card and Apple Pay are available in the production checkout integration. This local demo creates a simulated order without charging a card.</div>}
            <div className="discount-section"><div className="discount-row"><input className="discount-input" placeholder="Promo code or license key" value={promo} onChange={(event) => setPromo(event.target.value)} /><button className="discount-apply" type="button" onClick={() => setPromoApplied(Boolean(promo.trim()))}>Apply</button></div>{promoApplied ? <small className="promo-success">Code accepted for this demo order.</small> : null}</div>
            <button className="btn btn-primary buy-submit" type="button" onClick={createOrder}>{paymentMethod === "crypto" ? `Pay $${tier.price} with ${coin[1].split(" ")[0]}` : `Pay $${tier.price} with Card`}</button>
            <p className="buy-terms">By continuing, you agree to our <a href="/terms">Terms &amp; Conditions</a> and <a href="/privacy">Privacy Policy</a>.</p>
          </section>
        </> : <section className="order-panel"><div className="order-header"><span>{order.id}</span><strong>{tier.name}</strong><b>${tier.price}</b></div><div className="browser-warning"><strong>Keep this page open!</strong> This is a simulated checkout. No real crypto or card payment is processed.</div><p className="buy-kicker">Send exactly</p><div className="order-amount">{cryptoAmount} {coin[0]}</div><p className="order-muted">Use the QR code or copy the demo address below.</p><DemoQrCode /><button type="button" className="address-copy" onClick={copyAddress}><span>{paymentAddress}</span>{copied ? <Check /> : <Copy />}</button><button type="button" className="btn btn-primary buy-submit" onClick={() => router.push(`/activate?key=${encodeURIComponent(order.key)}`)}>Confirm Demo Payment &amp; Get License Key</button><p className="buy-terms">Your license key will be shown on the activation page after this simulated confirmation.</p></section>}
        <div className="buy-help">Need help or want to pay with another method? Message <a href="https://t.me/LarpzWallet_Bot">@LarpzWallet_Bot</a> on Telegram.</div>
      </main>
    </div>
  );
}
