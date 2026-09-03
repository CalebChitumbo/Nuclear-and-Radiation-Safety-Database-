import { defineConfig } from "vitest/config";

/**
 * The security-rules suite. It runs against the Firestore emulator, so it is
 * kept out of `npm test` and started with `npm run test:rules`, which wraps it
 * in `firebase emulators:exec` — against firebase.rules-test.json, a config
 * holding only Firestore, so the emulator never tries to stand up the hosting
 * framework the real firebase.json describes.
 */
export default defineConfig({
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    // One process: every test shares the one emulator and clears it between
    // tests, so parallel files would trample each other.
    fileParallelism: false,
  },
});
