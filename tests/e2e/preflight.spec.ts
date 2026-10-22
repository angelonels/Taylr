import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Failure first: an unavailable bundled browser must fail once before the catalog,
// with a repeatable environment record and an actionable installation command.
test("Runner preflight: missing browser stops before component launches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "taylr-preflight-"));
  try {
    const result = await new Promise<{ code: number | null; output: string }>(
      (resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["scripts/run-tests.mjs", "catalog"],
          {
            env: {
              ...process.env,
              PLAYWRIGHT_BROWSERS_PATH: directory,
              TAYLR_SKIP_BUILD: "1",
              TAYLR_SITES: "youtube",
              TAYLR_COMPONENTS: "primary",
              TAYLR_CASES: "",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let output = "";
        child.stdout.on("data", (data) => {
          output += data;
        });
        child.stderr.on("data", (data) => {
          output += data;
        });
        child.on("error", reject);
        child.on("exit", (code) => resolve({ code, output }));
      },
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("Preflight evidence:");
    expect(result.output).not.toContain("Running 1 test");
    const path = result.output.match(/Preflight evidence: (.+)/)?.[1]?.trim();
    expect(path).toBeTruthy();
    const evidence = JSON.parse(await readFile(path!, "utf8"));
    expect(evidence).toMatchObject({
      outcome: "environment-error",
      phase: "preflight",
      command: "npx playwright install chromium",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Failure first: an acceptance invocation must not inherit the fixture server
// owned by another invocation; that owner can disappear midway through testing.
// Playwright requires a destructured fixture parameter for testInfo.
// oxlint-disable-next-line no-empty-pattern
test("Runner ownership: an occupied fixture server fails before cases launch", async ({}, testInfo) => {
  const directory = testInfo.outputPath("occupied-server");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "probe.spec.ts"),
    `import { test } from ${JSON.stringify(resolve("node_modules/@playwright/test/index.mjs"))};\ntest("must not launch", () => { throw new Error("INHERITED_SERVER_CASE_LAUNCHED"); });`,
  );
  await writeFile(
    join(directory, "config.ts"),
    `import config from ${JSON.stringify(resolve("playwright.config.ts"))};\nexport default { ...config, testDir: ${JSON.stringify(directory)}, testMatch: "probe.spec.ts", reporter: "list", outputDir: ${JSON.stringify(join(directory, "results"))} };`,
  );
  const result = await new Promise<{ code: number | null; output: string }>(
    (resolveResult, reject) => {
      const child = spawn(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          join(directory, "config.ts"),
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      child.on("error", reject);
      child.on("exit", (code) => resolveResult({ code, output }));
    },
  );
  await testInfo.attach("ownership-probe", {
    body: result.output,
    contentType: "text/plain",
  });
  expect(result.code).toBe(1);
  expect(result.output).toContain("already used");
  expect(result.output).not.toContain("INHERITED_SERVER_CASE_LAUNCHED");
});
