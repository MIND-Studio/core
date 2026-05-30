import type { Identity } from "./types";

const storageKey = (app: string) => `mind:${app.toLowerCase().replace(/\s+/g, "-")}:last-identity`;

export function readLastIdentity(app: string): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(app));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.webId !== "string") return null;
    return parsed as Identity;
  } catch {
    return null;
  }
}

export function writeLastIdentity(app: string, identity: Identity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(app), JSON.stringify(identity));
  } catch {
    // localStorage may be unavailable (private mode, quota); silently ignore.
  }
}

export function clearLastIdentity(app: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(app));
  } catch {
    // ignore
  }
}
