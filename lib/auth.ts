import { storageKeys, readStorage, writeStorage, createId, normalizeLicenseKey } from "@/lib/storage";
import type { AppUser } from "@/lib/types";

export const walletOwnerCookieName = "larpz_wallet_owner_id";

const walletOwnerCookieMaxAgeSeconds = 60 * 60 * 24 * 365 * 5;
const walletOwnerIdPattern = /^[a-zA-Z0-9_-]{3,120}$/;
const licenseWalletOwnerIdPattern = /^lic_[a-f0-9]{32}$/;

function normalizedWalletOwnerId(value: unknown) {
  return typeof value === "string" && walletOwnerIdPattern.test(value) ? value : null;
}

export function isLicenseWalletOwnerId(value: unknown) {
  return typeof value === "string" && licenseWalletOwnerIdPattern.test(value);
}

export function resolveWalletOwnerId(cookieOwnerId: unknown, userId: unknown) {
  if (isLicenseWalletOwnerId(cookieOwnerId)) return cookieOwnerId as string;
  if (isLicenseWalletOwnerId(userId)) return userId as string;
  return "";
}

export function getWalletOwnerIdFromCookie() {
  if (typeof document === "undefined") return null;
  const encodedName = `${encodeURIComponent(walletOwnerCookieName)}=`;
  for (const part of document.cookie.split(";")) {
    const cookie = part.trim();
    if (!cookie.startsWith(encodedName)) continue;
    try {
      return normalizedWalletOwnerId(decodeURIComponent(cookie.slice(encodedName.length)));
    } catch {
      return null;
    }
  }
  return null;
}

export function persistWalletOwnerIdCookie(userId: string) {
  if (typeof document === "undefined") return;
  const ownerId = normalizedWalletOwnerId(userId);
  if (!ownerId) return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(walletOwnerCookieName)}=${encodeURIComponent(ownerId)}; Path=/; Max-Age=${walletOwnerCookieMaxAgeSeconds}; SameSite=Lax${secure}`;
}

export function clearWalletOwnerIdCookie() {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(walletOwnerCookieName)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

const seedUsers: AppUser[] = [
  {
    id: "usr_admin",
    name: "Larpz Admin",
    email: "admin@larpz.app",
    passwordHash: "3eb3fe66b31e3b4d10fa70b5cad49c7112294af6ae4e476a1c405155d45aa121",
    role: "admin",
    status: "active",
    createdAt: new Date("2026-01-03T10:00:00.000Z").toISOString(),
    licenseKey: "DEMO-PRO1-ACTI-2026",
  },
  {
    id: "usr_demo",
    name: "Demo Creator",
    email: "demo@larpz.app",
    passwordHash: "588c55f3ce2b8569b153c5abbf13f9f74308b88a20017cc699b835cc93195d16",
    role: "user",
    status: "active",
    createdAt: new Date("2026-02-10T15:30:00.000Z").toISOString(),
    licenseKey: "DEMO-PRO1-USER-2026",
  },
];

function ensureUsers() {
  const current = readStorage<AppUser[]>(storageKeys.users, []);
  if (current.length === 0) {
    writeStorage(storageKeys.users, seedUsers);
    return seedUsers;
  }
  return current;
}

function writeSession(userId: string | null, persistent = true) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = JSON.stringify({ userId });

  if (userId) persistWalletOwnerIdCookie(userId);
  else clearWalletOwnerIdCookie();

  if (persistent) {
    window.localStorage.setItem(storageKeys.session, payload);
    window.sessionStorage.removeItem(storageKeys.session);
    return;
  }

  window.sessionStorage.setItem(storageKeys.session, payload);
  window.localStorage.removeItem(storageKeys.session);
}

function readSession() {
  if (typeof window === "undefined") {
    return { userId: null as string | null };
  }

  const raw =
    window.localStorage.getItem(storageKeys.session) ??
    window.sessionStorage.getItem(storageKeys.session);

  if (!raw) {
    return { userId: null as string | null };
  }

  try {
    return JSON.parse(raw) as { userId: string | null };
  } catch {
    return { userId: null as string | null };
  }
}

async function hashPassword(password: string) {
  const payload = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function licenseIdentityId(rawLicenseKey: string) {
  const licenseKey = normalizeLicenseKey(rawLicenseKey);
  if (!licenseKey) throw new Error("Enter a valid activation key.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`larpz-license:${licenseKey}`));
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `lic_${fingerprint.slice(0, 32)}`;
}

export async function loginWithLicenseKey(rawLicenseKey: string, persistent = true) {
  const licenseKey = normalizeLicenseKey(rawLicenseKey);
  const id = await licenseIdentityId(licenseKey);
  const users = ensureUsers();
  const existing = users.find((user) => user.id === id);
  const user: AppUser = existing
    ? { ...existing, licenseKey, status: "active" }
    : {
        id,
        name: `Wallet User ${licenseKey.slice(-4)}`,
        email: `wallet-${id.slice(4, 16)}@license.local`,
        passwordHash: "license-key-auth",
        role: "user",
        status: "active",
        licenseKey,
        createdAt: new Date().toISOString(),
      };

  writeStorage(storageKeys.users, existing
    ? users.map((candidate) => candidate.id === id ? user : candidate)
    : [...users, user]);
  writeSession(user.id, persistent);
  return user;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  persistent?: boolean;
}) {
  const users = ensureUsers();
  const email = input.email.toLowerCase().trim();

  if (users.some((user) => user.email.toLowerCase() === email)) {
    throw new Error("An account with this email already exists.");
  }

  const user: AppUser = {
    id: createId("usr"),
    name: input.name.trim(),
    email,
    passwordHash: await hashPassword(input.password),
    role: "user",
    status: "active",
    createdAt: new Date().toISOString(),
  };

  writeStorage(storageKeys.users, [...users, user]);
  writeSession(user.id, input.persistent ?? true);

  return user;
}

export async function loginUser(input: {
  email: string;
  password: string;
  persistent?: boolean;
}) {
  const users = ensureUsers();
  const email = input.email.toLowerCase().trim();
  const passwordHash = await hashPassword(input.password);
  const user = users.find((item) => item.email.toLowerCase() === email);

  if (!user || user.passwordHash !== passwordHash) {
    throw new Error("Invalid email or password.");
  }

  if (user.status !== "active") {
    throw new Error("This account is currently inactive.");
  }

  writeSession(user.id, input.persistent ?? true);
  return user;
}

export function logoutUser() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKeys.session);
  window.sessionStorage.removeItem(storageKeys.session);
  clearWalletOwnerIdCookie();
}

export function getCurrentUser() {
  const users = ensureUsers();
  const session = readSession();

  if (!session.userId) {
    return null;
  }

  return users.find((user) => user.id === session.userId) ?? null;
}

export const getUser = getCurrentUser;

export function getUsers() {
  return ensureUsers();
}

export function saveUsers(users: AppUser[]) {
  writeStorage(storageKeys.users, users);
}

export function attachLicenseToUser(userId: string, licenseKey: string) {
  const users = ensureUsers();
  const next = users.map((user) =>
    user.id === userId
      ? {
          ...user,
          licenseKey,
        }
      : user,
  );

  writeStorage(storageKeys.users, next);
}
