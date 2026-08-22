import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckoutPlaceholderPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Checkout Placeholder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            This MVP includes a placeholder checkout flow. Stripe can be integrated later.
          </p>
          <Button asChild>
            <Link href="/register">Back to Larpz Wallet</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
