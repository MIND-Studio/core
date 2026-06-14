"use client";

import { useMindBalance, type WalletClient } from "./hooks";

const fmt = new Intl.NumberFormat("en-US");

export interface MindTokensProps {
  /** The app's Solid client (pass your `solid` instance). */
  client: WalletClient;
  /** Active WebID from your session hook, so the badge refreshes on sign in/out. */
  webId?: string | null;
  /** Auto-refresh interval in ms. Default off. */
  pollMs?: number;
  /** Accent color for the unit label. Default wallet amber. */
  accent?: string;
  /** Hide the unit suffix (e.g. show just `1,234`). */
  hideUnit?: boolean;
  /** className passthrough for the wrapper. */
  className?: string;
  /**
   * What to render before the first `ok` read or when the ledger is
   * unavailable (signed-out, embedded, unsupported, disabled, error). Default
   * `null` — the badge simply doesn't appear until there's a real balance.
   */
  fallback?: React.ReactNode;
}

/**
 * A tiny read-only MIND balance badge any app can drop in its header.
 *
 * Renders only when a real balance is available (`status:"ok"`); otherwise it
 * shows `fallback` (default nothing). Inline-styled — no Tailwind/theme
 * dependency, so it drops into any app's chrome unchanged.
 */
export function MindTokens({
  client,
  webId,
  pollMs,
  accent = "#f59e0b",
  hideUnit = false,
  className,
  fallback = null,
}: MindTokensProps) {
  const { status, balance, unit } = useMindBalance(client, { webId, pollMs });

  if (status !== "ok" || balance == null) return <>{fallback}</>;

  return (
    <span
      className={className}
      title="MIND balance"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 5,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>{fmt.format(balance)}</span>
      {!hideUnit && (
        <span
          style={{
            color: accent,
            fontSize: "0.8em",
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          {unit ?? "MIND"}
        </span>
      )}
    </span>
  );
}
