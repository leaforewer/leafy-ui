export * from "./components";

export const LeafyVue = {
  name: "@leafy-ui/vue",
  version: "0.1.0",
};

// Vue plugin installation function
import type { App } from "vue";

export function install(_app: App) {}

// Default export for plugin usage
export default {
  install,
};
