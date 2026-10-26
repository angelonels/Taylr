import { defineConfig } from "@playwright/test";
import { evidencePath } from "./tests/run-evidence.mjs";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: true,
  timeout: 300000,
  outputDir: evidencePath("results"),
  reporter: [
    ["list"],
    ["json", { outputFile: evidencePath("runner-results.json") }],
    ["html", { outputFolder: evidencePath("report"), open: "never" }],
  ],
  use: {
    trace: "off",
    screenshot: "off",
    actionTimeout: 15000,
    navigationTimeout: 60000,
  },
  // Public-site contracts never visit the local fixture. They must not claim
  // its port or depend on an unrelated development server being stopped.
  webServer:
    process.env.TAYLR_LIVE_SITES === "1" ||
    process.env.TAYLR_FIXTURE_MODE === "route"
      ? undefined
      : {
          command: "npm run dev",
          url: "http://127.0.0.1:5173/tests/fixture.html",
          reuseExistingServer: false,
        },
});
