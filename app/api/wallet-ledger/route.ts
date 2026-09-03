import {
  executeRemoteBalanceOperation,
  executeRemoteTransfer,
  linkRemoteWalletOwner,
  patchRemoteWalletAccount,
  RemoteWalletError,
  syncRemoteWallet,
  walletOwnerIdForLicense,
} from "@/lib/wallet-ledger-database";

export const runtime = "nodejs";

type WalletLedgerRequest = {
  action?: "bootstrap" | "sync" | "patchAccount" | "linkOwner" | "transfer" | "balanceOperation";
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
  operation?: {
    clientRequestId?: unknown;
    walletId?: unknown;
    accountId?: unknown;
    deltas?: unknown;
    activities?: unknown;
  };
};

function requestOwnerId(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== "larpz_wallet_owner_id") continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return "";
    }
  }
  return "";
}

function assertAuthorizedOwner(request: Request, ownerId: unknown) {
  if (typeof ownerId !== "string" || !/^lic_[a-f0-9]{32}$/.test(ownerId) || requestOwnerId(request) !== ownerId) {
    throw new RemoteWalletError("ACTIVATION_REQUIRED", "Activate this installed wallet before accessing its shared demo ledger.");
  }
}

export async function POST(request: Request) {
  let body: WalletLedgerRequest = {};
  try {
    body = await request.json() as WalletLedgerRequest;
    if (body.action && body.action !== "linkOwner") assertAuthorizedOwner(request, body.ownerId);
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
    if (body.action === "balanceOperation" && body.operation) {
      const result = await executeRemoteBalanceOperation({
        ownerId: body.ownerId,
        clientRequestId: body.operation.clientRequestId,
        walletId: body.operation.walletId,
        accountId: body.operation.accountId,
        deltas: body.operation.deltas,
        activities: body.operation.activities,
      });
      return Response.json({ connected: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    throw new RemoteWalletError("INVALID_REQUEST", "Unknown shared wallet action.");
  } catch (error) {
    const code = error instanceof RemoteWalletError ? error.code : "DATABASE_ERROR";
    const message = error instanceof Error ? error.message : "Shared wallet request failed.";
    if (code === "DATABASE_NOT_CONFIGURED") {
      const ownerId = body.action === "linkOwner"
        ? await walletOwnerIdForLicense(body.licenseKey)
        : undefined;
      return Response.json(
        { connected: false, error: message, code, ownerId, linkStatus: ownerId ? "local" : undefined },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const status = code === "ACTIVATION_REQUIRED" ? 401
      : code === "ACCOUNT_NOT_FOUND" || code === "INVALID_ADDRESS" ? 404
        : code === "DUPLICATE" ? 409
          : 400;
    return Response.json({ error: message, code }, { status });
  }
}
