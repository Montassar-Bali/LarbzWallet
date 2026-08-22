const canUseStorage = () => typeof window !== "undefined";

export const storageKeys = {
  users: "larpz_users",
  session: "larpz_session",
  tokens: "larpz_tokens",
  transactions: "larpz_transactions",
  licenses: "larpz_licenses",
  walletTheme: "larpz_wallet_theme",
};

export function readStorage<T>(key: string, fallback: T): T {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    if (!value) {
      return fallback;
    }

    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function removeStorage(key: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(key);
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeLicenseKey(raw: string) {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const chunks = cleaned.match(/.{1,4}/g) ?? [];
  return chunks.slice(0, 4).join("-");
}
