"use client";

import { useEffect, useState } from "react";
import { Button } from "@mind-studio/ui";
import { MindLoginCard } from "../MindLoginCard";
import { writeLastIdentity, clearLastIdentity } from "../identity-hint";
import { FeedbackWidget } from "../feedback";
import { useSolidClient } from "./context";
import { useSession, useBrokeredTheme } from "./hooks";

/**
 * Renders its children only when the app runs **standalone**. Inside the Mind
 * shell (brokered mode) it renders nothing — the shell already provides the
 * chrome (title, navigation, launcher, theme), so the app's own masthead would
 * be redundant. Detection is the broker handshake.
 */
export function StandaloneOnly({ children }: { children: React.ReactNode }) {
  const client = useSolidClient();
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    if (client.broker.isBrokered()) {
      setEmbedded(true);
      return;
    }
    let alive = true;
    client.broker.initBroker().then((id) => {
      if (alive && id) setEmbedded(true);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  if (embedded) return null;
  return <>{children}</>;
}

/**
 * Applies the shell's color mode to the app's `<ThemeProvider>` when embedded;
 * a no-op standalone. Renders nothing.
 */
export function BrokerThemeSync() {
  useBrokeredTheme();
  return null;
}

export type ConnectFormProps = {
  /** One-line value prop shown under the app name on the login card. */
  tagline: string;
  /** Brand accent for the login card (hex). */
  accent: string;
  /** Where the "Open" button on the connected panel links to. */
  openHref: string;
  /** Label for that button. Default `Open →`. */
  openLabel?: string;
  /**
   * Attach a stable Solid-OIDC `clientId` document (`/api/client-id`) on
   * non-localhost origins so the IdP stops re-prompting for consent. Default
   * true; a containerised dev IdP can't dereference a localhost client-id doc,
   * so it's always skipped on localhost regardless.
   */
  useClientIdDoc?: boolean;
};

/**
 * The standalone sign-in surface: shows {@link MindLoginCard} when signed-out
 * and a "connected" panel once a session resolves. Wraps the OIDC redirect with
 * the stable client-id-document trick. Drop-in for each app's old ConnectForm —
 * only `tagline`, `accent`, and `openHref` vary.
 */
export function ConnectForm({
  tagline,
  accent,
  openHref,
  openLabel = "Open →",
  useClientIdDoc = true,
}: ConnectFormProps) {
  const client = useSolidClient();
  const [webId, setWebId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .ensureSession()
      .then((info) => {
        const id = info.webId ?? null;
        setWebId(id);
        if (id) {
          writeLastIdentity(client.appName, {
            webId: id,
            displayName: id.split("/").filter(Boolean).pop(),
          });
        }
      })
      .catch((e) => setError(String(e)));
  }, [client]);

  async function onLogout() {
    await client.session().logout();
    clearLastIdentity(client.appName);
    setWebId(null);
  }

  function startLogin(issuer: string) {
    const origin = window.location.origin;
    const isLocal = /localhost|127\.0\.0\.1/.test(origin);
    return import("@inrupt/solid-client-authn-browser").then(({ login }) =>
      login({
        oidcIssuer: issuer,
        redirectUrl: new URL("/login/callback", origin).toString(),
        clientName: client.clientName,
        ...(isLocal || !useClientIdDoc
          ? {}
          : { clientId: new URL("/api/client-id", origin).toString() }),
      }),
    );
  }

  if (webId) {
    return (
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
          Connected
        </p>
        <p className="mt-2 break-all font-mono text-sm" data-testid="webid">
          {webId}
        </p>
        <div className="mt-4 flex gap-3">
          <Button asChild>
            <a href={openHref}>{openLabel}</a>
          </Button>
          <Button variant="outline" onClick={onLogout}>
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <MindLoginCard
        appName={client.appName}
        tagline={tagline}
        defaultIssuer={client.defaultIssuer}
        accent={accent}
        onLogin={async ({ issuer }) => {
          client.rememberIssuer(issuer);
          // Fall back to the app's default only if a deep link wasn't already
          // remembered by the signed-out screen the user came from.
          client.rememberReturnToDefault(client.defaultReturnPath);
          await startLogin(issuer);
        }}
      />
      {error && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

export type FeedbackLauncherProps = {
  /** App slug, stamped on each feedback record. */
  appKey: string;
  /** The app's public-append feedback inbox container URL. */
  inbox: string;
  variant?: "inline" | "floating";
  position?: "bottom-right" | "bottom-left";
  appVersion?: string;
};

/**
 * Mounts the floating/inline 💬 feedback widget, bridging the app's session
 * (WebID + authed fetch from {@link useSession}) to the storage-agnostic
 * widget. Both are optional — signed-out users submit anonymously.
 */
export function FeedbackLauncher({
  appKey,
  inbox,
  variant = "floating",
  position,
  appVersion,
}: FeedbackLauncherProps) {
  const { webid, fetch } = useSession();
  return (
    <FeedbackWidget
      appKey={appKey}
      inbox={inbox}
      fetch={fetch ?? undefined}
      webId={webid}
      variant={variant}
      position={position}
      appVersion={appVersion}
    />
  );
}
