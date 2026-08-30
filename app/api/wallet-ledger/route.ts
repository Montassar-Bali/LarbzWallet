import {
  executeRemoteTransfer,
  linkRemoteWalletOwner,
  patchRemoteWalletAccount,
  RemoteWalletError,
  syncRemoteWallet,
} from "@/lib/wallet-ledger-database";

export const runtime = "nodejs";

type WalletLedgerRequest = {
  action?: "bootstrap" | "sync" | "patchAccount" | "linkOwner" | "transfer";
  ownerId?: unknown;
  licenseKey?: unknown;
  legacyOwnerId?: unknown;
  state?: unknown;
  accountId?: unknown;
  name?: unknown;
  balances?: unknown;
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
        mode: body.action === "bootstrap" ? "initialize" : "metadata",
      });
      return Response.json({ connected: true, snapshot }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "patchAccount") {
      const snapshot = await patchRemoteWalletAccount({
        ownerId: body.ownerId,
        accountId: body.accountId,
        name: body.name,
        balances: body.balances,
      });
      return Response.json({ connected: true, snapshot }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "linkOwner") {
      const result = await linkRemoteWalletOwner({
        licenseKey: body.licenseKey,
        legacyOwnerId: body.legacyOwnerId,
      });
      return Response.json({ connected: true, ...result }, { headers: { "Cache-Control": "no-store" } });
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
      : code === "ACTIVATION_REQUIRED" ? 401
      : code === "ACCOUNT_NOT_FOUND" || code === "INVALID_ADDRESS" ? 404
        : code === "DUPLICATE" ? 409
          : 400;
    const message = error instanceof Error ? error.message : "Shared wallet request failed.";
    return Response.json({ error: message, code }, { status });
  }
}
