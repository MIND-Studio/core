"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Identity, LoginHandler } from "./types";
import { readLastIdentity } from "./identity-hint";
import { InvalidCredentialsError } from "./inrupt-adapter";
import "./login-card.css";

/** All user-facing texts — override (e.g. for localization) via `strings`. */
export const LOGIN_CARD_STRINGS = {
  continueWith: "Continue with Mind",
  continueAs: (name: string) => `Continue as ${name}`,
  reconnect: "Reconnect",
  sessionExpired: "Your session expired. Reconnect to continue.",
  pendingRedirect: "Redirecting…",
  pendingCredentials: "Signing in…",
  usernameLabel: "Username",
  passwordLabel: "Password",
  invalidCredentials: "Wrong username or password.",
  loginFailed: "Login failed",
  switchAccount: "Use another account",
  useDifferentPod: "Use a different pod",
  useDefaultPod: "Use default pod",
  issuerLabel: "Solid OIDC issuer",
  issuerHint: (defaultIssuer: string) => `Default: ${defaultIssuer}`,
  signInAt: (host: string) => `You sign in directly at ${host}.`,
};

export type LoginCardStrings = typeof LOGIN_CARD_STRINGS;

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
  /**
   * Collect credentials in-app instead of redirecting to the issuer's
   * hosted login page. `"username"` for issuers in open/dev mode,
   * `"username-password"` for password-mode issuers. The values are passed
   * to `onLogin` — pair with `browserOidcLogin`, which completes the whole
   * flow without ever showing the issuer's page (and falls back to the
   * hosted form for issuers that don't support it).
   */
  credentials?: "none" | "username" | "username-password";
  /** Pin the card's color scheme instead of following prefers-color-scheme. */
  mode?: "light" | "dark";
  /** Override any user-facing text (e.g. localization). */
  strings?: Partial<LoginCardStrings>;
};

function usernameFromWebId(webId: string): string | null {
  const m = webId.match(/^https?:\/\/[^/]+\/([^/]+)\//);
  return m ? m[1] : null;
}

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
  credentials = "none",
  mode,
  strings,
}: MindLoginCardProps) {
  const t: LoginCardStrings = { ...LOGIN_CARD_STRINGS, ...strings };
  const withCredentials = credentials !== "none";
  const withPassword = credentials === "username-password";

  const [storedIdentity, setStoredIdentity] = useState<Identity | null>(null);
  const [ignoreStored, setIgnoreStored] = useState(false);
  const [pending, setPending] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [issuer, setIssuer] = useState(defaultIssuer);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lastIdentityProp === undefined) {
      setStoredIdentity(readLastIdentity(appName));
    }
  }, [appName, lastIdentityProp]);

  const identity =
    (lastIdentityProp !== undefined ? lastIdentityProp : storedIdentity) ??
    null;
  const useStored = !!identity && !ignoreStored && !showAdvanced;
  const displayName =
    identity?.displayName ?? identity?.webId.split("/").filter(Boolean).pop();
  const storedUsername = identity ? usernameFromWebId(identity.webId) : null;
  const issuerHost = (() => {
    try {
      return new URL(issuer).host;
    } catch {
      return issuer;
    }
  })();

  async function submit() {
    setError(null);
    setPending(true);
    try {
      const targetIssuer = useStored && identity?.issuer ? identity.issuer : issuer;
      await onLogin({
        issuer: targetIssuer,
        username: withCredentials
          ? (useStored && storedUsername ? storedUsername : username.trim())
          : undefined,
        password: withPassword ? password : undefined,
      });
    } catch (err) {
      setPending(false);
      if (err instanceof InvalidCredentialsError) {
        setError(t.invalidCredentials);
        setPassword("");
      } else {
        setError(err instanceof Error ? err.message : t.loginFailed);
      }
    }
  }

  const buttonLabel = needsReauth
    ? t.reconnect
    : useStored
      ? t.continueAs(displayName ?? "you")
      : t.continueWith;
  const pendingLabel = withCredentials ? t.pendingCredentials : t.pendingRedirect;
  // Username comes from the chip when continuing as the stored identity.
  const needsUsernameInput = withCredentials && !(useStored && storedUsername);
  const submitDisabled =
    pending || (needsUsernameInput && username.trim().length === 0);

  const rootStyle = { "--mind-accent": accent } as CSSProperties;

  return (
    <div className="mind-login-root" style={rootStyle} data-mode={mode}>
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
            <p className="mind-login-warning">{t.sessionExpired}</p>
          )}
        </header>

        {useStored && !needsReauth && (
          <div className="mind-login-identity-chip">
            <div className="mind-login-avatar" aria-hidden>
              {(displayName ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="mind-login-identity-meta">
              <p className="mind-login-identity-name">{displayName}</p>
              <p className="mind-login-identity-sub">
                {identity?.issuer ? new URL(identity.issuer).host : identity?.webId}
              </p>
            </div>
          </div>
        )}

        <form
          className="mind-login-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {needsUsernameInput && (
            <div className="mind-login-field">
              <label className="mind-login-label" htmlFor="mind-login-username">
                {t.usernameLabel}
              </label>
              <input
                id="mind-login-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mind-login-input"
                autoFocus
              />
            </div>
          )}
          {withPassword && (
            <div className="mind-login-field">
              <label className="mind-login-label" htmlFor="mind-login-password">
                {t.passwordLabel}
              </label>
              <input
                id="mind-login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mind-login-input"
              />
            </div>
          )}

          <button type="submit" disabled={submitDisabled} className="mind-login-primary">
            {pending ? pendingLabel : buttonLabel}
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
        </form>

        {error && (
          <p className="mind-login-error" role="alert">
            {error}
          </p>
        )}

        {useStored && withCredentials && !needsReauth && (
          <div className="mind-login-center">
            <button
              type="button"
              onClick={() => setIgnoreStored(true)}
              className="mind-login-toggle"
            >
              {t.switchAccount}
            </button>
          </div>
        )}

        {allowCustomIssuer && (
          <div className="mind-login-center">
            <button
              type="button"
              onClick={() => setShowAdvanced((v: boolean) => !v)}
              className="mind-login-toggle"
            >
              {showAdvanced ? t.useDefaultPod : t.useDifferentPod}
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
                  {t.issuerLabel}
                </label>
                <input
                  id="mind-login-issuer"
                  type="url"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder="https://your-pod.example/"
                  className="mind-login-input"
                />
                <p className="mind-login-hint">{t.issuerHint(defaultIssuer)}</p>
              </div>
            )}
          </div>
        )}

        <div className="mind-login-divider">
          <p className="mind-login-trust">
            {trustLine}
            {!showAdvanced && <> {t.signInAt(issuerHost)}</>}
          </p>
        </div>
      </div>
    </div>
  );
}
