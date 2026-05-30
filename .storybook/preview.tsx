import type { Preview, Decorator } from "@storybook/react-vite";
import React from "react";
import "./tailwind.css";

/* A light/dark toolbar toggle. @mind-studio/ui tokens live on :root (light) and
   `.dark`; MindLoginCard adapts via prefers-color-scheme, so we also set the
   wrapper's color-scheme so both component families follow the toggle. */
const withMode: Decorator = (Story, ctx) => {
  const mode = (ctx.globals.mode ?? "light") as "light" | "dark";
  return (
    <div
      className={mode === "dark" ? "dark" : undefined}
      style={{
        colorScheme: mode,
        background: "var(--background)",
        color: "var(--foreground)",
        minHeight: "100svh",
        padding: "2rem",
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(accent|color)$/i, date: /Date$/i } },
    layout: "fullscreen",
  },
  globalTypes: {
    mode: {
      description: "Light / dark",
      defaultValue: "light",
      toolbar: {
        title: "Mode",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withMode],
};

export default preview;
