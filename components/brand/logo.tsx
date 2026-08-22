import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  href?: string;
  compact?: boolean;
};

export function Logo({ className, href = "/", compact }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]",
        className,
      )}
      aria-label={`${siteConfig.siteName} home`}
    >
      <span className="inline-flex h-9 w-9 overflow-hidden rounded-[10px] shadow-[0_4px_20px_rgba(139,92,246,0.3)]">
        <Image
          src="/assets/logo_m.png"
          alt={`${siteConfig.siteName} logo`}
          width={36}
          height={36}
          className="h-full w-full object-cover"
          priority
        />
      </span>
      {compact ? null : (
        <span className="text-xl font-bold tracking-[-0.02em] text-white">
          Larpz <span className="text-[#ab9ff2]">Wallet</span>
        </span>
      )}
    </Link>
  );
}
