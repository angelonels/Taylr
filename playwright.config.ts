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
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173/tests/fixture.html",
    reuseExistingServer: false,
  },
});
