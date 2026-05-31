"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@mind-studio/ui";
import { ensureSeeded, type AppEntry, type PodFetch } from "../apps";

/**
 * A curated, low-chroma hue per app so the grid reads like a real home screen
 * rather than a rainbow. Custom apps get a stable hue hashed from their key.
 */
const HUES: Record<string, number> = {
  dock: 210,
  drive: 248,
  builder: 78,
  codespaces: 196,
  // Hues for apps not yet shipped — kept so a user who re-adds one gets a
  // stable colour instead of a hashed fallback.
  chat: 165,
  social: 300,
  market: 14,
  os: 268,
  agents: 145,
};

function hueFor(key: string): number {
  const base = key.split("-")[0] ?? key;
  if (base in HUES) return HUES[base]!;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

export type MindAppLauncherProps = {
  /**
   * Controlled mode: render exactly these apps and skip any pod read. When
   * omitted, the launcher self-fetches from `{podRoot}/home/apps.ttl`
   * (seeding DEFAULT_APPS on first run) using `podFetch`.
   */
  apps?: AppEntry[];
  /** Pod root for self-fetch mode (ignored when `apps` is supplied). */
  podRoot?: string;
  /** DPoP-bound fetch from the consumer's Solid session. */
  podFetch?: PodFetch;
  /** If set, a "Manage apps" footer link points here (e.g. the home page). */
  manageHref?: string;
  /** Override the trigger button's classes. */
  triggerClassName?: string;
  /** Called if the pod read fails in self-fetch mode. */
  onError?: (err: unknown) => void;
  /** Render the menu open on mount (uncontrolled). Handy for previews/tests. */
  defaultOpen?: boolean;
};

/** The 3×3 "apps" grid icon, à la Google's launcher. */
function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="currentColor">
      {[0, 7, 14].flatMap((y) =>
        [0, 7, 14].map((x) => <circle key={`${x}-${y}`} cx={x + 2} cy={y + 2} r="1.6" />),
      )}
    </svg>
  );
}

export function MindAppLauncher({
  apps: appsProp,
  podRoot,
  podFetch,
  manageHref,
  triggerClassName,
  onError,
  defaultOpen,
}: MindAppLauncherProps) {
  const [fetched, setFetched] = useState<AppEntry[] | null>(appsProp ?? null);

  useEffect(() => {
    if (appsProp || !podRoot) return;
    let alive = true;
    ensureSeeded(podRoot, podFetch)
      .then((a) => {
        if (alive) setFetched(a);
      })
      .catch((err) => onError?.(err));
    return () => {
      alive = false;
    };
    // onError intentionally excluded — consumers often pass an inline fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appsProp, podRoot, podFetch]);

  const apps = appsProp ?? fetched;

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Open apps"
          className={
            triggerClassName ??
            "grid size-9 place-items-center rounded-full text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          }
        >
          <GridIcon />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[18rem] p-3">
        <div className="px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Your apps
        </div>
        {apps === null ? (
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid place-items-center gap-1.5 rounded-xl p-2.5">
                <div className="size-11 animate-pulse rounded-2xl bg-muted" />
                <div className="h-2.5 w-12 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No apps yet.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {apps.map((app) => (
              <a
                key={app.key}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                title={app.blurb || app.label}
                className="group grid place-items-center gap-1.5 rounded-xl p-2.5 text-center outline-none transition hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                style={{ ["--h" as string]: String(hueFor(app.key)) } as CSSProperties}
              >
                <span
                  className="grid size-11 place-items-center rounded-2xl text-xl transition group-hover:scale-105"
                  style={{
                    background: "oklch(0.72 0.13 var(--h) / 0.16)",
                    boxShadow: "inset 0 0 0 1px oklch(0.72 0.13 var(--h) / 0.28)",
                  }}
                >
                  {app.icon}
                </span>
                <span className="w-full truncate text-[11.5px] font-medium text-foreground">
                  {app.label}
                </span>
              </a>
            ))}
          </div>
        )}
        {manageHref ? (
          <a
            href={manageHref}
            className="mt-2 block rounded-lg border-t border-[color:var(--border)] pt-2.5 text-center text-[12.5px] font-medium text-muted-foreground outline-none transition hover:text-foreground focus-visible:text-foreground"
          >
            Manage apps
          </a>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
