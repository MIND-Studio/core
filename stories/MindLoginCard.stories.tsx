import type { Meta, StoryObj } from "@storybook/react-vite";
import { MindLoginCard } from "../src/MindLoginCard";

/**
 * The unified sign-in surface shared across every Mind app. Self-contained plain
 * CSS (no Tailwind / @mind-studio/ui) — each app only tints it via `accent`.
 */
const meta: Meta<typeof MindLoginCard> = {
  title: "Core/MindLoginCard",
  component: MindLoginCard,
  parameters: { layout: "centered" },
  args: {
    appName: "Drive",
    defaultIssuer: "https://codespaces-pod.duckdns.org/",
    accent: "#2f5fa6",
    onLogin: async () => {},
  },
  argTypes: {
    accent: { control: "color" },
    onLogin: { table: { disable: true } },
  },
};
export default meta;

type Story = StoryObj<typeof MindLoginCard>;

/** First visit — generic "Continue with Mind". */
export const Default: Story = {};

/** Returning user — recognized identity becomes "Continue as <name>". */
export const ReturningUser: Story = {
  args: {
    lastIdentity: {
      webId: "https://alice.codespaces-pod.duckdns.org/profile/card#me",
      displayName: "Alice Rivera",
    },
  },
};

/** Reconnect state after the known DPoP-state-loss case (amber warning). */
export const NeedsReauth: Story = {
  args: {
    needsReauth: true,
    lastIdentity: {
      webId: "https://alice.codespaces-pod.duckdns.org/profile/card#me",
      displayName: "Alice Rivera",
    },
  },
};

/** A different app accent (Codespaces orange) + custom copy. */
export const BrandedCodespaces: Story = {
  args: {
    appName: "Codespaces",
    accent: "#c66c1f",
    logoLetter: "C",
    tagline: "Push a site straight to your pod.",
  },
};

/** Issuer picker hidden — for apps pinned to a single pod. */
export const NoCustomIssuer: Story = {
  args: { appName: "Home", accent: "#1f8a52", allowCustomIssuer: false },
};
