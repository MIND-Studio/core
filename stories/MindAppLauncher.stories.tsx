import type { Meta, StoryObj } from "@storybook/react-vite";
import { MindAppLauncher } from "../src/launcher/MindAppLauncher";
import { DEFAULT_APPS } from "../src/apps";

/**
 * The Google-style app-grid dropdown. Built on @mind-studio/ui's DropdownMenu;
 * these stories use the controlled `apps` prop (no pod needed) and render open
 * via `defaultOpen` so the grid is visible. Toggle the toolbar Mode to preview
 * the dark surface.
 */
const meta: Meta<typeof MindAppLauncher> = {
  title: "Core/MindAppLauncher",
  component: MindAppLauncher,
  args: { defaultOpen: true, apps: DEFAULT_APPS, manageHref: "/home" },
  // Give the portalled menu room to render under the trigger.
  decorators: [
    (Story) => (
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: "20rem" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MindAppLauncher>;

/** The seeded default suite. */
export const Default: Story = {};

/** No "Manage apps" footer (used in apps that aren't the launcher's owner). */
export const NoManageLink: Story = { args: { manageHref: undefined } };

/** Empty registry. */
export const Empty: Story = { args: { apps: [] } };

/** Loading skeleton — no `apps` and no pod to fetch from. */
export const Loading: Story = { args: { apps: undefined } };
