import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { constants } from "node:fs";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const [mode = "local", ...args] = process.argv.slice(2);
if (!["local", "canary", "catalog", "compare"].includes(mode)) {
  throw new Error(
    "Usage: node scripts/run-tests.mjs local|canary|catalog|compare [Playwright options]",
  );
}
const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
const runDirectory = join("output/playwright/runs", id);
const canaries = [
  "youtube:primary",
  "lichess:primary",
  "excalidraw:canvas",
  "googlemaps:search",
  "tradingview:drawing",
  "scratch:blocks",
];
const comparison = ["youtube:primary", "excalidraw:canvas", "canva:primary"];
const execute = (command, parameters, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, parameters, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
async function preflight() {
  await mkdir(runDirectory, { recursive: true });
  const path = join(runDirectory, "preflight.json");
  const startedAt = new Date().toISOString();
  let command = "npm ci";
  try {
    const { chromium } = await import("@playwright/test");
    const executable = chromium.executablePath();
    command = "npx playwright install chromium";
    await access(executable, constants.X_OK);
    command = "npm run build";
    const buildSkipped = process.env.TAYLR_SKIP_BUILD === "1";
    if (!buildSkipped) {
      const log = join(runDirectory, "build.log");
      console.log("Building extension once before browser tests…");
      const built = await promisify(execFile)("npm", ["run", "build"], {
        maxBuffer: 10 * 1024 * 1024,
      })
        .then(({ stdout, stderr }) => ({
          passed: true,
          output: stdout + stderr,
        }))
        .catch((error) => ({
          passed: false,
          output: `${error.stdout ?? ""}${error.stderr ?? ""}\n${error.message}`,
        }));
      await writeFile(log, built.output);
      if (!built.passed)
        throw new Error(
          `Extension build failed; no browser cases were launched. See ${log}`,
        );
      console.log(`Build succeeded: ${log}`);
    }
    JSON.parse(await readFile("dist/manifest.json", "utf8"));
    await writeFile(
      path,
      JSON.stringify(
        {
          outcome: "passed",
          phase: "preflight",
          startedAt,
          completedAt: new Date().toISOString(),
          executable,
          buildSkipped,
        },
        null,
        2,
      ),
    );
    return true;
  } catch (error) {
    await writeFile(
      path,
      JSON.stringify(
        {
          outcome: "environment-error",
          phase: "preflight",
          startedAt,
          completedAt: new Date().toISOString(),
          reason: error.message,
          command,
        },
        null,
        2,
      ),
    );
    console.error(
      `Preflight failed: ${error.message}\nRun: ${command}\nPreflight evidence: ${path}`,
    );
    process.exitCode = 1;
    return false;
  }
}
async function run(browserMode, cases) {
  const root = join(runDirectory, browserMode);
  await mkdir(root, { recursive: true });
  const env = {
    TAYLR_RUN_ROOT: root,
    TAYLR_RUN_ID: id,
    TAYLR_SCOPE: mode,
    TAYLR_HEADED: browserMode === "headed" ? "1" : "0",
    TAYLR_LIVE_SITES: mode === "local" ? "0" : "1",
    TAYLR_CASES: process.env.TAYLR_CASES ?? cases?.join(",") ?? "",
    TAYLR_TRACE: process.env.TAYLR_TRACE ?? "failures",
  };
  const startedAt = new Date().toISOString();
  const started = Date.now();
  await writeFile(
    join(root, "run.json"),
    JSON.stringify(
      {
        id,
        scope: mode,
        browserMode,
        startedAt,
        filters: {
          cases: env.TAYLR_CASES,
          sites: process.env.TAYLR_SITES,
          components: process.env.TAYLR_COMPONENTS,
        },
      },
      null,
      2,
    ),
  );
  const cli = ["node_modules/@playwright/test/cli.js", "test"];
  if (mode !== "local")
    cli.push("tests/e2e/hide.spec.ts", "--grep-invert", "Hide: click safety");
  const code = await execute(process.execPath, [...cli, ...args], env);
  let counts;
  if (mode !== "local") {
    const reportCode = await execute(
      process.execPath,
      ["scripts/report-sites.mjs"],
      env,
    );
    if (reportCode)
      throw new Error(
        `Report generation failed (${reportCode}); evidence at ${root}`,
      );
    counts = JSON.parse(
      await readFile(join(root, "catalog-results.json"), "utf8"),
    ).counts;
  }
  const summary = {
    browserMode,
    root,
    elapsedMs: Date.now() - started,
    runnerExit: code,
    counts,
  };
  await writeFile(join(root, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`Evidence: ${root}/report/index.html`);
  return summary;
}
if (await preflight()) {
  const summaries = [];
  if (mode === "compare") {
    // Match viewport/version/contracts, changing only display mode; never use personal browser data.
    summaries.push(await run("headless", comparison));
    summaries.push(await run("headed", comparison));
  } else
    summaries.push(
      await run(
        process.env.TAYLR_HEADED === "1" ? "headed" : "headless",
        mode === "canary" ? canaries : undefined,
      ),
    );
  await writeFile(
    join(runDirectory, "summary.json"),
    JSON.stringify({ id, mode, summaries }, null, 2),
  );
  await writeFile(
    "output/playwright/latest-run.json",
    JSON.stringify({ id, mode, root: runDirectory }, null, 2),
  );
  const failures = summaries.some(
    ({ runnerExit, counts }) =>
      runnerExit !== 0 ||
      (counts &&
        [
          "product-failed",
          "contract-failed",
          "environment-error",
          "harness-error",
          "unrun",
          "stale",
        ].some((status) => counts[status] > 0)),
  );
  const blocked = summaries.some(({ counts }) => counts?.blocked > 0);
  // 2 means attempted but externally blocked, never a complete pass. 1 means a defect/infrastructure failure.
  process.exitCode = failures ? 1 : blocked ? 2 : 0;
}
