import { defineConfig } from "vitest/config";

export default defineConfig({
  // Expo injects __DEV__ at bundle time; tests run in plain Node.
  define: {
    __DEV__: "false",
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
