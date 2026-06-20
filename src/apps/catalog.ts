/**
 * Default Mind app catalog — the seed for a new user's launcher. Once seeded
 * into `{pod}/home/apps.ttl` the user owns the list (add/remove/reorder), so
 * this is only the starting point.
 *
 * This is the *shipped* suite — the apps that actually exist in the mindpods.org
 * deployment (dock, drive, builder, codespaces). Add more here as they ship.
 *
 * URLs are environment-driven: each resolves from a build-time
 * `NEXT_PUBLIC_APP_<NAME>_URL` (inlined by Next at build), falling back to the
 * app's local dev port. The mindpods.org images set these to the public
 * `https://<app>.mindpods.org` origins as build-args; local dev needs no config.
 *
 * IMPORTANT: these must stay STATIC `process.env.NEXT_PUBLIC_*` member accesses
 * — Next only inlines those, never dynamic `process.env[key]` lookups.
 */
export type AppEntry = {
  /** Stable slug used as the Turtle subject fragment. */
  key: string;
  label: string;
  url: string;
  /** A single emoji shown on the tile. */
  icon: string;
  blurb: string;
  order: number;
};

const DOCK_URL = process.env.NEXT_PUBLIC_APP_DOCK_URL ?? "http://localhost:3080";
const DRIVE_URL = process.env.NEXT_PUBLIC_APP_DRIVE_URL ?? "http://localhost:3060";
const BUILDER_URL = process.env.NEXT_PUBLIC_APP_BUILDER_URL ?? "http://localhost:3070";
const CODESPACES_URL = process.env.NEXT_PUBLIC_APP_CODESPACES_URL ?? "http://localhost:3010";
const PROJECTS_URL = process.env.NEXT_PUBLIC_APP_PROJECTS_URL ?? "http://localhost:3160";

export const DEFAULT_APPS: AppEntry[] = [
  { key: "dock", label: "Dock", url: DOCK_URL, icon: "🧭", blurb: "Your pod, all in one place.", order: 0 },
  { key: "drive", label: "Drive", url: DRIVE_URL, icon: "📁", blurb: "Your files, in your pod.", order: 1 },
  { key: "projects", label: "Projects", url: PROJECTS_URL, icon: "📋", blurb: "Plan work — board, timeline, briefings.", order: 2 },
  { key: "builder", label: "Builder", url: BUILDER_URL, icon: "🛠️", blurb: "Wish an app, watch it build.", order: 3 },
  { key: "codespaces", label: "Codespaces", url: CODESPACES_URL, icon: "🧰", blurb: "Publish a site to your pod.", order: 4 },
];
