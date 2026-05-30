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
    return viteConfig;
  },
};

export default config;
