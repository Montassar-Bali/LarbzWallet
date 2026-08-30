import {
  executeRemoteTransfer,
  RemoteWalletError,
  syncRemoteWallet,
} from "@/lib/wallet-ledger-database";

export const runtime = "nodejs";

type WalletLedgerRequest = {
  action?: "bootstrap" | "sync" | "transfer";
  ownerId?: unknown;
  state?: unknown;
  transfer?: {
    clientRequestId?: unknown;
    sourceAccountId?: unknown;
    destinationAccountId?: unknown;
    destinationAddress?: unknown;
    tokenSymbol?: unknown;
    amount?: unknown;
  };
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as WalletLedgerRequest;
    if (body.action === "bootstrap" || body.action === "sync") {
      const snapshot = await syncRemoteWallet({
        ownerId: body.ownerId,
        state: body.state,
        replaceBalances: body.action === "sync",
      });
      return Response.json({ connected: true, snapshot }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "transfer" && body.transfer) {
      const result = await executeRemoteTransfer({
        ownerId: body.ownerId,
        clientRequestId: body.transfer.clientRequestId,
        sourceAccountId: body.transfer.sourceAccountId,
        destinationAccountId: body.transfer.destinationAccountId,
        destinationAddress: body.transfer.destinationAddress,
        tokenSymbol: body.transfer.tokenSymbol,
        amount: body.transfer.amount,
      });
      return Response.json({ connected: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    throw new RemoteWalletError("INVALID_REQUEST", "Unknown shared wallet action.");
  } catch (error) {
    const code = error instanceof RemoteWalletError ? error.code : "DATABASE_ERROR";
    const status = code === "DATABASE_NOT_CONFIGURED" ? 503
      : code === "ACCOUNT_NOT_FOUND" || code === "INVALID_ADDRESS" ? 404
        : code === "DUPLICATE" ? 409
          : 400;
    const message = error instanceof Error ? error.message : "Shared wallet request failed.";
    return Response.json({ error: message, code }, { status });
  }
}
