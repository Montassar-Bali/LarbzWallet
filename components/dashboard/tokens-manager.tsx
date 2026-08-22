"use client";

import Image from "next/image";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { WalletToken } from "@/lib/types";
import { deleteToken, getTokens, saveToken } from "@/lib/wallet";
import { formatCurrency, formatPercentage } from "@/lib/utils";

type TokenForm = {
  id?: string;
  name: string;
  symbol: string;
  price: string;
  balance: string;
  change24h: string;
  image: string;
};

const emptyForm: TokenForm = {
  name: "",
  symbol: "",
  price: "",
  balance: "",
  change24h: "",
  image: "",
};

function mapTokenToForm(token: WalletToken): TokenForm {
  return {
    id: token.id,
    name: token.name,
    symbol: token.symbol,
    price: token.price.toString(),
    balance: token.balance.toString(),
    change24h: token.change24h.toString(),
    image: token.image,
  };
}

export function TokensManager() {
  const [tokens, setTokens] = useState<WalletToken[]>(() => getTokens());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TokenForm>(emptyForm);

  const projectedValue = useMemo(() => {
    const price = Number(form.price);
    const balance = Number(form.balance);
    if (!Number.isFinite(price) || !Number.isFinite(balance)) {
      return 0;
    }

    return price * balance;
  }, [form.balance, form.price]);

  const handleChange = (field: keyof TokenForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleEdit = (token: WalletToken) => {
    setForm(mapTokenToForm(token));
    setOpen(true);
  };

  const handleDelete = (tokenId: string) => {
    const next = deleteToken(tokenId);
    setTokens(next);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        handleChange("image", reader.result);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const token = saveToken({
      id: form.id,
      name: form.name.trim(),
      symbol: form.symbol.trim().toUpperCase(),
      price: Number(form.price),
      balance: Number(form.balance),
      change24h: Number(form.change24h),
      image: form.image || "https://placehold.co/64x64/0f172a/e2e8f0?text=T",
    });

    setTokens((current) => {
      const index = current.findIndex((item) => item.id === token.id);
      if (index >= 0) {
        const cloned = [...current];
        cloned[index] = token;
        return cloned;
      }

      return [...current, token];
    });

    setOpen(false);
    setForm(emptyForm);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Token Manager</CardTitle>
            <CardDescription>
              Add, edit, and remove demo tokens. Values are simulation-only display data.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Token
          </Button>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-6 text-sm text-[var(--muted-foreground)]">
              No tokens yet. Create your first demo token to populate this wallet simulation.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted-foreground)]">
                    <th className="px-2 py-3">Token</th>
                    <th className="px-2 py-3">Price</th>
                    <th className="px-2 py-3">Balance</th>
                    <th className="px-2 py-3">Value</th>
                    <th className="px-2 py-3">24h</th>
                    <th className="px-2 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {tokens.map((token) => (
                    <tr key={token.id}>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-3">
                          <Image
                            src={token.image}
                            alt={`${token.name} icon`}
                            width={28}
                            height={28}
                            className="rounded-full border border-[var(--border)]"
                            unoptimized
                          />
                          <div>
                            <p className="text-[var(--foreground)]">{token.name}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">{token.symbol}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[var(--foreground)]">{formatCurrency(token.price)}</td>
                      <td className="px-2 py-3 text-[var(--foreground)]">{token.balance.toLocaleString()}</td>
                      <td className="px-2 py-3 text-[var(--foreground)]">
                        {formatCurrency(token.price * token.balance)}
                      </td>
                      <td
                        className={
                          token.change24h >= 0
                            ? "px-2 py-3 text-emerald-300"
                            : "px-2 py-3 text-rose-300"
                        }
                      >
                        {formatPercentage(token.change24h)}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(token)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(token.id)}>
                            <Trash2 className="h-4 w-4 text-rose-300" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        title={form.id ? "Edit Token" : "Add Token"}
        description="Demo-only token configuration. No real blockchain contracts are created."
        open={open}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="tokenName" className="text-sm text-[var(--muted-foreground)]">
                Token name
              </label>
              <Input
                id="tokenName"
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tokenSymbol" className="text-sm text-[var(--muted-foreground)]">
                Symbol
              </label>
              <Input
                id="tokenSymbol"
                value={form.symbol}
                onChange={(event) => handleChange("symbol", event.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="tokenPrice" className="text-sm text-[var(--muted-foreground)]">
                Price (USD)
              </label>
              <Input
                id="tokenPrice"
                type="number"
                min="0"
                step="0.0001"
                value={form.price}
                onChange={(event) => handleChange("price", event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tokenBalance" className="text-sm text-[var(--muted-foreground)]">
                Balance
              </label>
              <Input
                id="tokenBalance"
                type="number"
                min="0"
                step="0.0001"
                value={form.balance}
                onChange={(event) => handleChange("balance", event.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="tokenChange" className="text-sm text-[var(--muted-foreground)]">
                24h percentage
              </label>
              <Input
                id="tokenChange"
                type="number"
                step="0.01"
                value={form.change24h}
                onChange={(event) => handleChange("change24h", event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tokenImage" className="text-sm text-[var(--muted-foreground)]">
                Token image URL
              </label>
              <Input
                id="tokenImage"
                type="url"
                value={form.image}
                onChange={(event) => handleChange("image", event.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-3">
            <label htmlFor="tokenFile" className="text-sm text-[var(--muted-foreground)]">
              Upload token image
            </label>
            <Input id="tokenFile" type="file" accept="image/*" onChange={handleImageUpload} />
            <p className="text-xs text-[var(--muted-foreground)]">
              Local image upload is stored only on this device for simulation usage.
            </p>
          </div>

          <p className="text-sm text-[var(--muted-foreground)]">
            Calculated token value: <strong className="text-[var(--foreground)]">{formatCurrency(projectedValue)}</strong>
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Token</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
