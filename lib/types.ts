export type UserRole = "user" | "admin";
export type UserStatus = "active" | "inactive";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  licenseKey?: string;
  createdAt: string;
};

export type WalletToken = {
  id: string;
  name: string;
  symbol: string;
  price: number;
  balance: number;
  change24h: number;
  image: string;
  updatedAt: string;
};

export type ActivityType = "send" | "receive";
export type ActivityStatus = "completed" | "pending" | "failed";

export type WalletActivity = {
  id: string;
  type: ActivityType;
  tokenSymbol: string;
  amount: number;
  counterpartyLabel: string;
  date: string;
  status: ActivityStatus;
  note: string;
  recipientId?: string;
  senderId?: string;
};

export type LicenseStatus = "active" | "expired" | "unused" | "revoked";

export type LicenseRecord = {
  key: string;
  userId?: string;
  userEmail?: string;
  plan: "starter" | "pro" | "lifetime";
  status: LicenseStatus;
  expiration: string;
  activatedAt?: string;
};

export type PortfolioSummary = {
  totalValue: number;
  change24h: number;
  topAssets: WalletToken[];
};
