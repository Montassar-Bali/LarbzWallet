"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { siteConfig } from "@/config/site";

const links = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Buy", href: "/buy" },
  { label: "Reviews", href: "/#reviews" },
];

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className={`mobile-menu ${open ? "open" : ""}`} id="mobileMenu">
        <button className="mobile-close" aria-label="Close menu" type="button" onClick={() => setOpen(false)}>
          <X size={24} />
        </button>
        <Link href="/" onClick={() => setOpen(false)}>Home</Link>
        <Link href="/#features" onClick={() => setOpen(false)}>Features</Link>
        <Link href="/#pricing" onClick={() => setOpen(false)}>Pricing</Link>
        <Link href="/buy" onClick={() => setOpen(false)}>Buy</Link>
        <Link href="/#reviews" onClick={() => setOpen(false)}>Reviews</Link>
        <Link href="/activate" className="btn btn-primary nav-dashboard-btn" style={{ marginTop: "12px" }} onClick={() => setOpen(false)}>
          Activate License
        </Link>
      </div>

      <nav className="larpz-nav">
        <div className="nav-inner">
          <Link className="logo" href="/" aria-label={`${siteConfig.siteName} home`}>
            <span className="logo-icon">
              <Image src="/assets/logo_m.png" alt="Larpz Wallet logo" width={36} height={36} className="logo-img" />
            </span>
            <span className="logo-text">
              Larpz <span>Wallet</span>
            </span>
          </Link>

          <div className="nav-links">
            {links.map((link) => (
              <Link key={link.label} href={link.href}>
                {link.label}
              </Link>
            ))}
            <Link href="/activate" className="btn btn-primary nav-dashboard-btn" style={{ marginLeft: "8px", color: "#FFFFFF" }}>
              Activate License
            </Link>
          </div>

          <button className="mobile-toggle" aria-label="Open menu" type="button" onClick={() => setOpen(true)}>
            <Menu size={24} />
          </button>
        </div>
      </nav>
    </>
  );
}
