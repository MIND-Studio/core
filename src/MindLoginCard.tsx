"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Identity, LoginHandler } from "./types";
import { readLastIdentity } from "./identity-hint";
import "./login-card.css";

export type MindLoginCardProps = {
  appName: string;
  defaultIssuer: string;
  onLogin: LoginHandler;
  accent?: string;
  allowCustomIssuer?: boolean;
  tagline?: string;
  trustLine?: string;
  needsReauth?: boolean;
  lastIdentity?: Identity | null;
  logoLetter?: string;
};

export function MindLoginCard({
  appName,
  defaultIssuer,
  onLogin,
  accent = "#6366f1",
  allowCustomIssuer = true,
  tagline = "Sign in once. Use everywhere.",
  trustLine = "Your identity lives in your pod. We never see your password.",
  needsReauth,
  lastIdentity: lastIdentityProp,
  logoLetter = "M",
}: MindLoginCardProps) {
  const [storedIdentity, setStoredIdentity] = useState<Identity | null>(null);
  const [pending, setPending] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [issuer, setIssuer] = useState(defaultIssuer);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lastIdentityProp === undefined) {
      setStoredIdentity(readLastIdentity(appName));
    }
  }, [appName, lastIdentityProp]);

  const identity = lastIdentityProp !== undefined ? lastIdentityProp : storedIdentity;
  const displayName = identity?.displayName ?? identity?.webId.split("/").filter(Boolean).pop();
  const issuerHost = (() => {
    try {
      return new URL(issuer).host;
    } catch {
      return issuer;
    }
  })();

  async function handleClick(useStored: boolean) {
    setError(null);
    setPending(true);
    try {
      const targetIssuer = useStored && identity?.issuer ? identity.issuer : issuer;
      await onLogin({ issuer: targetIssuer });
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  const buttonLabel = needsReauth
    ? "Reconnect"
    : identity && !showAdvanced
      ? `Continue as ${displayName ?? "you"}`
      : "Continue with Mind";

  const rootStyle = { "--mind-accent": accent } as CSSProperties;

  return (
    <div className="mind-login-root" style={rootStyle}>
      <div className="mind-login-card">
        <header className="mind-login-header">
          <div className="mind-login-logo" aria-hidden>
            {logoLetter}
          </div>
          <div>
            <p className="mind-login-kicker">Mind</p>
            <h1 className="mind-login-title">{appName}</h1>
          </div>
          {!identity && !needsReauth && <p className="mind-login-tagline">{tagline}</p>}
          {needsReauth && (
            <p className="mind-login-warning">Your session expired. Reconnect to continue.</p>
          )}
        </header>

        {identity && !showAdvanced && !needsReauth && (
          <div className="mind-login-identity-chip">
            <div className="mind-login-avatar" aria-hidden>
              {(displayName ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="mind-login-identity-meta">
              <p className="mind-login-identity-name">{displayName}</p>
              <p className="mind-login-identity-sub">
                {identity.issuer ? new URL(identity.issuer).host : identity.webId}
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => handleClick(!showAdvanced && !!identity)}
          disabled={pending}
          className="mind-login-primary"
        >
          {pending ? "Redirecting…" : buttonLabel}
          {!pending && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          )}
        </button>

        {error && (
          <p className="mind-login-error" role="alert">
            {error}
          </p>
        )}

        {allowCustomIssuer && (
          <div className="mind-login-center">
            <button
              type="button"
              onClick={() => setShowAdvanced((v: boolean) => !v)}
              className="mind-login-toggle"
            >
              {showAdvanced ? "Use default pod" : "Use a different pod"}
              <svg
                className="mind-login-toggle-chev"
                data-open={showAdvanced}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {showAdvanced && (
              <div className="mind-login-advanced">
                <label className="mind-login-label" htmlFor="mind-login-issuer">
                  Solid OIDC issuer
                </label>
                <input
                  id="mind-login-issuer"
                  type="url"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder="https://your-pod.example/"
                  className="mind-login-input"
                />
                <p className="mind-login-hint">Default: {defaultIssuer}</p>
              </div>
            )}
          </div>
        )}

        <div className="mind-login-divider">
          <p className="mind-login-trust">
            {trustLine}
            {!showAdvanced && (
              <>
                {" "}You will sign in at{" "}
                <span className="mind-login-issuer-host">{issuerHost}</span>.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
