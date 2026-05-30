/**
 * Default Mind app catalog — the seed for a new user's launcher. Once seeded
 * into `{pod}/home/apps.ttl` the user owns the list (add/remove/reorder), so
 * this is only the starting point. URLs are the local dev ports; adjust for
 * a hosted deployment.
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

export const DEFAULT_APPS: AppEntry[] = [
  { key: "home", label: "Home", url: "http://localhost:3080", icon: "🏠", blurb: "Your pod, all in one place.", order: 0 },
  { key: "builder", label: "Builder", url: "http://localhost:3070", icon: "🛠️", blurb: "Wish an app, watch it build.", order: 1 },
  { key: "drive", label: "Drive", url: "http://localhost:3060", icon: "📁", blurb: "Your files, in your pod.", order: 2 },
  { key: "chat", label: "Chat", url: "http://localhost:3030", icon: "💬", blurb: "Real-time conversations.", order: 3 },
  { key: "social", label: "Social", url: "http://localhost:3000", icon: "🌐", blurb: "Posts, friends, messages.", order: 4 },
  { key: "market", label: "Market", url: "http://localhost:3000", icon: "🛒", blurb: "A privacy-first marketplace.", order: 5 },
  { key: "codespaces", label: "Codespaces", url: "http://localhost:3010", icon: "🧰", blurb: "Publish a site to your pod.", order: 6 },
  { key: "os", label: "Mind OS", url: "http://localhost:3020", icon: "🖥️", blurb: "A computer in your browser.", order: 7 },
  { key: "agents", label: "Agents", url: "http://localhost:3030", icon: "🤖", blurb: "Your own team of agents.", order: 8 },
];
