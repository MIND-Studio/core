import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(viteConfig) {
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    viteConfig.plugins = viteConfig.plugins ?? [];
    viteConfig.plugins.push(tailwindcss());
    // The shipped catalog reads `process.env.NEXT_PUBLIC_APP_*_URL` (Next
    // inlines these at build). Storybook's Vite has no `process` global, so
    // stub `process.env` to `{}` — the catalog then falls back to its
    // localhost dev URLs, which is exactly what we want to preview.
    viteConfig.define = { ...viteConfig.define, "process.env": "{}" };
    return viteConfig;
  },
};

export default config;
