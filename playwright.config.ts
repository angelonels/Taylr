import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 300000,
  outputDir: "output/playwright/results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/playwright/report", open: "never" }],
  ],
  use: { trace: "off", screenshot: "off" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173/tests/fixture.html",
    reuseExistingServer: true,
  },
});
