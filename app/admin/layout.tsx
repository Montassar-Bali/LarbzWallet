import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Larpz Admin",
  },
  description: "Secure Larpz Wallet administration.",
  manifest: null,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
