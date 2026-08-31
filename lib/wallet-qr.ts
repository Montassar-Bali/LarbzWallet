const walletAddressPattern = /^sim_(ghost|ledger|trust)_[a-z0-9]+$/i;

function normalizedWalletAddress(value: string) {
  const trimmed = value.trim();
  return walletAddressPattern.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function isWalletAddress(value: string) {
  return normalizedWalletAddress(value) !== null;
}

export function walletAddressFromQrPayload(payload: string) {
  const trimmed = payload.trim();
  if (!trimmed) return null;
  const rawAddress = normalizedWalletAddress(trimmed);
  if (rawAddress) return rawAddress;

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "solana:" || protocol === "wallet:") {
      const pathAddress = normalizedWalletAddress(decodeURIComponent(parsed.pathname));
      if (pathAddress) return pathAddress;
    }

    if (protocol === "https:" || protocol === "http:" || protocol === "solana:" || protocol === "wallet:") {
      for (const key of ["address", "recipient", "to"]) {
        const queryAddress = normalizedWalletAddress(parsed.searchParams.get(key) ?? "");
        if (queryAddress) return queryAddress;
      }
    }
  } catch {
    return null;
  }
  return null;
}
