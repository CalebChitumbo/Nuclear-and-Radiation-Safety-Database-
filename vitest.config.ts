import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The security-rules suite needs the Firestore emulator — see
    // vitest.rules.config.ts and `npm run test:rules`.
    exclude: ["tests/rules/**", "node_modules/**"],
    environment: "node",
    globals: false,
  },
});
