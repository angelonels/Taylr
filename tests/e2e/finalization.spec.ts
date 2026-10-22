import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";

// Failure first: actual runner failures during cleanup or attachment must agree
// with persisted/session/catalog outcomes, without erasing an earlier diagnosis.
// Playwright requires destructuring; this scenario owns child browser runners.
// oxlint-disable-next-line no-empty-pattern
test("Runner finalization never leaves a passing catalog after cleanup or attachment failure", async ({}, testInfo) => {
  test.setTimeout(90000);
  const source = await readFile("tests/e2e/hide.spec.ts", "utf8");
  for (const scenario of [
    "cleanup",
    "attachment",
    "blocked-cleanup",
    "product-attachment",
  ]) {
    const root = resolve(testInfo.outputPath(scenario));
    await mkdir(root, { recursive: true });
    let probe = source.replaceAll(
      /(["'])\.\.\/([^"']+)\1/g,
      (_, quote, path) => `${quote}${resolve("tests", path)}${quote}`,
    );
    probe = probe.replace(
      "instance = await isolatedBrowser(site);",
      `Object.assign(site, {url:"http://127.0.0.1:5173/tests/fixture.html",origins:["http://127.0.0.1:5173"],target:"#distraction",keep:"#keep",targetIndex:undefined,keepIndex:undefined,identity:undefined,dismiss:undefined,invariant:undefined});\ninstance = await isolatedBrowser(site);`,
    );
    if (scenario.startsWith("blocked") || scenario.startsWith("product"))
      probe = probe.replace(
        "await runLiveSite(instance.context, instance.extensionId, site)",
        `await Promise.reject(Object.assign(new Error("Injected original diagnosis"), {outcome:"${scenario.startsWith("blocked") ? "blocked" : "product-failed"}",phase:"baseline"}))`,
      );
    if (scenario.endsWith("cleanup"))
      probe = probe.replace(
        "await instance?.close();",
        'await instance?.close(); throw new Error("Injected cleanup failure");',
      );
    else
      probe = probe.replace(
        'await test.info().attach("verification-result", {',
        'throw new Error("Injected attachment failure");\nawait test.info().attach("verification-result", {',
      );
    await writeFile(join(root, "probe.spec.ts"), probe);
    await writeFile(
      join(root, "config.mjs"),
      `export default ${JSON.stringify({ testDir: root, testMatch: "probe.spec.ts", workers: 1, timeout: 30000, reporter: [["json", { outputFile: join(root, "runner.json") }]] })}`,
    );
    const env = {
      ...process.env,
      TAYLR_RUN_ROOT: root,
      TAYLR_LIVE_SITES: "1",
      TAYLR_SITES: "youtube",
      TAYLR_COMPONENTS: "primary",
      TAYLR_CASES: "",
      TAYLR_HEADED: "0",
    };
    const child = await promisify(execFile)(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        join(root, "config.mjs"),
        "--grep",
        "YouTube",
      ],
      { env },
    )
      .then(() => ({ code: 0 }))
      .catch((error) => ({ code: error.code }));
    const record = JSON.parse(
      await readFile(
        join(root, "session-results/youtube--primary.json"),
        "utf8",
      ),
    );
    const expected = scenario.startsWith("blocked")
      ? "blocked"
      : scenario.startsWith("product")
        ? "product-failed"
        : "harness-error";
    expect(child.code).toBe(expected === "blocked" ? 0 : 1);
    expect(record.outcome).toBe(expected);
    expect(record.passed).toBe(false);
    const runner = JSON.parse(
      await readFile(join(root, "runner.json"), "utf8"),
    );
    expect(
      runner.stats[expected === "blocked" ? "skipped" : "unexpected"],
    ).toBe(1);
    await writeFile(
      join(root, "run.json"),
      JSON.stringify({
        browserMode: "headless",
        purpose:
          "Failure-injection fixture only; not website compatibility evidence",
        filters: { cases: "youtube:primary" },
      }),
    );
    await promisify(execFile)(process.execPath, ["scripts/report-sites.mjs"], {
      env,
    });
    const catalog = JSON.parse(
      await readFile(join(root, "catalog-results.json"), "utf8"),
    );
    expect(catalog.counts.passed).toBe(0);
    expect(catalog.counts[expected]).toBe(1);
    await testInfo.attach(`${scenario}-result`, {
      path: join(root, "session-results/youtube--primary.json"),
      contentType: "application/json",
    });
  }
});
