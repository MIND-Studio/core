"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTokens, ledgerOrigin, type TokensView } from "./api";

/**
 * The slice of the Solid client {@link useMindBalance} needs. The full
 * `SolidClient` from `@mind-studio/core/solid` satisfies this structurally, so
 * apps just pass their `solid` instance — no extra wiring.
 */
export interface WalletClient {
  /** The active authed fetch (session fetch standalone; broker fetch embedded). */
  authedFetch(): typeof fetch;
  /** Active identity, or null when signed-out. */
  currentIdentity(): { webId: string; podRoot: string } | null;
}

export type MindBalanceStatus =
  | "loading"
  | "ok"
  | "signed-out"
  | "unauthorized"
  /** Server has no ledger routes (e.g. stock CSS) — hide the balance. */
  | "unsupported"
  /** Ledger present but switched off server-side. */
  | "disabled"
  | "error";

export interface UseMindBalanceResult {
  status: MindBalanceStatus;
  /** MIND balance, or null until an `ok` read lands. */
  balance: number | null;
  /** The ledger's unit label (e.g. `"MIND"`), or null. */
  unit: string | null;
  /** The full ledger view on an `ok` read (balance + signed history). */
  view: TokensView | null;
  /** True while the first/refreshing fetch is in flight. */
  loading: boolean;
  error: string | null;
  /** Re-fetch the balance now. */
  refresh: () => void;
}

export interface UseMindBalanceOptions {
  /**
   * The active WebID. Pass it from your session hook (e.g. `useSession().webid`)
   * so the balance re-fetches when the user signs in/out. When omitted the hook
   * reads `client.currentIdentity()` once on mount and on `refresh()`.
   */
  webId?: string | null;
  /** Auto-refresh interval in ms. Omit/0 to fetch only on mount + `refresh()`. */
  pollMs?: number;
}

/**
 * Read-only MIND balance for any app that consumes `@mind-studio/core/solid`.
 *
 * Hits the account's same-origin `/.tokens` ledger with the client's authed
 * fetch. Works **standalone** (the app holds its own session). Embedded in the
 * shell the bridge brokers pod I/O only, so this resolves to `unsupported`/
 * `error` and the UI should simply hide — render a balance only on `status:"ok"`.
 */
export function useMindBalance(
  client: WalletClient,
  opts: UseMindBalanceOptions = {}
): UseMindBalanceResult {
  const { webId, pollMs } = opts;
  const [view, setView] = useState<TokensView | null>(null);
  const [status, setStatus] = useState<MindBalanceStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  const run = useCallback(async () => {
    const id = ++reqId.current;
    const identity = client.currentIdentity();
    if (!identity) {
      if (id === reqId.current) {
        setStatus("signed-out");
        setView(null);
        setError(null);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    const result = await fetchTokens(client.authedFetch(), ledgerOrigin(identity.webId));
    if (id !== reqId.current) return; // a newer call superseded this one
    setLoading(false);
    if (result.status === "ok") {
      setView(result.view);
      setStatus("ok");
      setError(null);
    } else {
      setView(null);
      setStatus(result.status);
      setError(result.status === "error" ? result.detail : null);
    }
  }, [client]);

  // Re-run on mount and whenever the active WebID changes (sign in/out).
  useEffect(() => {
    void run();
    // `webId` is intentionally in deps: it drives the refetch on identity change.
  }, [run, webId]);

  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => void run(), pollMs);
    return () => clearInterval(t);
  }, [run, pollMs]);

  return {
    status,
    balance: view?.balance ?? null,
    unit: view?.unit ?? null,
    view,
    loading,
    error,
    refresh: () => void run(),
  };
}
