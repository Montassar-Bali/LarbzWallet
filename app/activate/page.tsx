"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { activateLicense, validateLicense } from "@/lib/license";
import { normalizeLicenseKey } from "@/lib/storage";

type ActivateState = "idle" | "loading" | "error" | "success";

export default function ActivatePage() {
  const [key, setKey] = useState(() => {
    if (typeof window === "undefined") return "";
    const queryKey = new URLSearchParams(window.location.search).get("key");
    return queryKey ? normalizeLicenseKey(queryKey) : "";
  });
  const [status, setStatus] = useState<ActivateState>("idle");
  const [message, setMessage] = useState("");
  const { loginWithLicense } = useAuth();
  const router = useRouter();

  const handleActivate = async () => {
    if (!key) {
      setStatus("error");
      setMessage("Please enter a valid license key.");
      return;
    }

    setStatus("loading");
    setMessage("");

    await new Promise((resolve) => setTimeout(resolve, 450));

    const validation = validateLicense(key);
    if (!validation.valid) {
      setStatus("error");
      setMessage(validation.reason || "Invalid license key. Please check and try again.");
      return;
    }

    try {
      const licenseUser = await loginWithLicense(key);
      activateLicense(key, { id: licenseUser.id, email: licenseUser.email });
      router.replace("/wallet-launch");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Invalid license key. Please check and try again.";
      setStatus("error");
      setMessage(msg);
    }
  };

  return (
    <div className="larpz-marketing">
      <div className="ambient-bg" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <MarketingNavbar />

      <section className="login-page">
        <div className="login-card">
          <Link className="logo" href="/" aria-label="Larpz Wallet home">
            <span className="logo-icon">
              <Image src="/assets/logo_m.png" alt="Larpz Wallet logo" width={36} height={36} className="logo-img" />
            </span>
            <span className="logo-text">
              Larpz <span>Wallet</span>
            </span>
          </Link>

          <h2>Activate Your License</h2>
          <p className="subtitle">Enter the license key you received after purchase to get started.</p>

          <div className="browser-warning">
            ⚠️ <strong>Important:</strong> Activate your key directly here in the browser — <strong>not</strong> via
            Telegram. Use <strong>Safari on iOS</strong> or <strong>Chrome on Android</strong> for the PWA to work
            correctly.
          </div>

          <div className="form-group">
            <label htmlFor="licenseKey">License Key</label>
            <input
              type="text"
              id="licenseKey"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              maxLength={19}
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => setKey(normalizeLicenseKey(event.target.value))}
            />
          </div>

          <button className="btn btn-primary" id="loginBtn" type="button" onClick={handleActivate} disabled={status === "loading"}>
            {status === "loading" ? "Activating..." : "Activate License"}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M566.6 342.6C579.1 330.1 579.1 309.8 566.6 297.3L406.6 137.3C394.1 124.8 373.8 124.8 361.3 137.3C348.8 149.8 348.8 170.1 361.3 182.6L466.7 288L96 288C78.3 288 64 302.3 64 320C64 337.7 78.3 352 96 352L466.7 352L361.3 457.4C348.8 469.9 348.8 490.2 361.3 502.7C373.8 515.2 394.1 515.2 406.6 502.7L566.6 342.7z" />
            </svg>
          </button>

          {status === "error" ? <div className="login-error">{message}</div> : null}
          {status === "success" ? (
            <>
              <div className="login-success">{message}</div>
              <div className="mt-4 rounded-xl border border-[#a08dff55] bg-[#a08dff1f] p-4 text-center text-sm text-[#ded5ff]">
                Your license is active. Choose a wallet style to continue.
              </div>
              <Link href="/wallet-launch" className="btn btn-primary mt-4 w-full">
                Choose a Wallet
              </Link>
            </>
          ) : null}

          <Link href="/" className="login-back">
            ← Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
