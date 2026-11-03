import { readFileSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";
import { defineConfig } from "@playwright/test";
import { evidencePath } from "./tests/run-evidence.mjs";

// Containers can cap CPU and memory below what the host reports.
function cpus() {
  try {
    const [quota, period] = readFileSync("/sys/fs/cgroup/cpu.max", "utf8")
      .trim()
      .split(" ");
    if (quota !== "max")
      return Math.min(
        availableParallelism(),
        Math.max(1, Math.floor(Number(quota) / Number(period))),
      );
  } catch {
    // No cgroup v2 CPU limit is visible.
  }
  return availableParallelism();
}
const memory = process.constrainedMemory() || totalmem();
const requested = process.env.TAYLR_WORKERS;
export default defineConfig({
  testDir: "tests/e2e",
  // Measured on 4 CPUs: 2 workers took 13.5 minutes, 4 took 10.9 with the
  // CPU 92% busy, so more workers than cores only adds contention. Each
  // disposable browser also needs memory; keep about 2 GiB per worker.
  // TAYLR_WORKERS accepts a count or a percentage of cores, such as 50%.
  workers: requested?.endsWith("%")
    ? requested
    : Number(requested) ||
      Math.max(1, Math.min(cpus(), Math.floor(memory / 2 ** 31))),
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
