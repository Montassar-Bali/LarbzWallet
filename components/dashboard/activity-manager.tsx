"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { WalletActivity } from "@/lib/types";
import { createTransaction, getTokens, getTransactions } from "@/lib/wallet";
import { getCurrentUser, getUsers } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

const statuses: WalletActivity["status"][] = ["completed", "pending", "failed"];

type PendingRecord = {
  type: WalletActivity["type"];
  tokenSymbol: string;
  amount: number;
  counterpartyLabel: string;
  date: string;
  status: WalletActivity["status"];
  recipientId?: string;
};

export function ActivityManager() {
  const [records, setRecords] = useState<WalletActivity[]>(() => getTransactions());
  const [type, setType] = useState<WalletActivity["type"]>("send");
  const [tokenSymbol, setTokenSymbol] = useState("BTC");
  const [amount, setAmount] = useState("1");
  const [counterpartyLabel, setCounterpartyLabel] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [status, setStatus] = useState<WalletActivity["status"]>("completed");
  const [pendingRecord, setPendingRecord] = useState<PendingRecord | null>(null);
  const [flash, setFlash] = useState("");
  const currentUser = getCurrentUser();
  const otherUsers = getUsers().filter((item) => item.id !== currentUser?.id);
  const [recipientId, setRecipientId] = useState("");

  const tokenOptions = useMemo(() => getTokens().map((token) => token.symbol), []);

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setPendingRecord({
      type,
      tokenSymbol,
      amount: Number(amount),
      counterpartyLabel: counterpartyLabel.trim() || (type === "send" ? "Recipient" : "Sender"),
      date: new Date(date).toISOString(),
      status,
      recipientId: type === "send" ? recipientId || undefined : undefined,
    });
  };

  const confirmCreate = () => {
    if (!pendingRecord) {
      return;
    }

    const record = createTransaction(pendingRecord);
    if (pendingRecord.type === "send" && recipientId) {
      createTransaction({
        ...pendingRecord,
        type: "receive",
        counterpartyLabel: currentUser?.name ?? "Local sender",
        senderId: currentUser?.id,
      });
    }
    setRecords((current) => [record, ...current]);
    setFlash(
      pendingRecord.type === "receive"
        ? `Received ${pendingRecord.amount.toLocaleString()} ${pendingRecord.tokenSymbol} (SIMULATED TRANSACTION)`
        : `Sent ${pendingRecord.amount.toLocaleString()} ${pendingRecord.tokenSymbol} (SIMULATED TRANSACTION)`,
    );
    setPendingRecord(null);
    setAmount("1");
    setCounterpartyLabel("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Simulated Send / Receive</CardTitle>
          <CardDescription>
            Create fictional transfers. Larpz Wallet never creates real blockchain transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-1">
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm ${type === "send" ? "bg-[#a08dff30] text-[#d8ceff]" : "text-[var(--muted-foreground)]"}`}
                onClick={() => setType("send")}
              >
                Simulate Send
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm ${type === "receive" ? "bg-[#a08dff30] text-[#d8ceff]" : "text-[var(--muted-foreground)]"}`}
                onClick={() => setType("receive")}
              >
                Simulate Receive
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="activityToken" className="text-sm text-[var(--muted-foreground)]">
                  Token
                </label>
                <select
                  id="activityToken"
                  value={tokenSymbol}
                  onChange={(event) => setTokenSymbol(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm"
                >
                  {tokenOptions.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </div>

              {type === "send" && otherUsers.length > 0 ? (
                <div className="space-y-2">
                  <label htmlFor="recipientAccount" className="text-sm text-[var(--muted-foreground)]">Recipient account</label>
                  <select id="recipientAccount" value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm">
                    <option value="">Local label only</option>
                    {otherUsers.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.email})</option>)}
                  </select>
                </div>
              ) : null}

              <div className="space-y-2">
                <label htmlFor="activityAmount" className="text-sm text-[var(--muted-foreground)]">
                  Amount
                </label>
                <Input
                  id="activityAmount"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="counterparty" className="text-sm text-[var(--muted-foreground)]">
                  {type === "send" ? "Recipient" : "Sender"}
                </label>
                <Input
                  id="counterparty"
                  value={counterpartyLabel}
                  onChange={(event) => setCounterpartyLabel(event.target.value)}
                  placeholder={type === "send" ? "Recipient label" : "Sender label"}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="activityDate" className="text-sm text-[var(--muted-foreground)]">
                  Date
                </label>
                <Input
                  id="activityDate"
                  type="datetime-local"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="activityStatus" className="text-sm text-[var(--muted-foreground)]">
                Status
              </label>
              <select
                id="activityStatus"
                value={status}
                onChange={(event) => setStatus(event.target.value as WalletActivity["status"])}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm md:max-w-sm"
              >
                {statuses.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit">Review Simulated Transaction</Button>
          </form>
        </CardContent>
      </Card>

      {flash ? (
        <div className="rounded-xl border border-[#a08dff55] bg-[#a08dff1f] px-4 py-3 text-sm text-[#ded5ff]">
          {flash}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>All entries below are clearly marked as simulated transactions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {records.map((record) => (
            <article
              key={record.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[var(--foreground)]">{record.counterpartyLabel}</p>
                <p className="text-sm text-[var(--foreground)]">
                  {record.type === "receive" ? "+" : "-"}
                  {record.amount} {record.tokenSymbol}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className="border-[#a08dff55] bg-[#a08dff1f] text-[#ded5ff]">{record.note}</Badge>
                <Badge>{record.status}</Badge>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                {record.type === "send" ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownLeft className="h-3.5 w-3.5" />
                )}
                <span>{formatDate(record.date)}</span>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>

      <Modal
        title="Confirm Simulated Transaction"
        description="This action creates a SIMULATED TRANSACTION record only."
        open={!!pendingRecord}
        onClose={() => setPendingRecord(null)}
      >
        {pendingRecord ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-3 text-sm text-zinc-300">
              <p>Type: {pendingRecord.type}</p>
              <p>Token: {pendingRecord.tokenSymbol}</p>
              <p>Amount: {pendingRecord.amount}</p>
              <p>{pendingRecord.type === "send" ? "Recipient" : "Sender"}: {pendingRecord.counterpartyLabel}</p>
              <p>Date: {formatDate(pendingRecord.date)}</p>
              <p>Status: {pendingRecord.status}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-zinc-500">SIMULATED TRANSACTION</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingRecord(null)}>
                Cancel
              </Button>
              <Button onClick={confirmCreate}>Confirm & Save</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
