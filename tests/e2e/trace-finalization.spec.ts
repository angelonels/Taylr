import { test, expect } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import { evidencePath } from "../run-evidence.mjs";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure first: ordinary trace compression/I/O taking four seconds marks a
// completely verified component as failed despite eventually writing its trace.
for (const outcome of ["passed", "contract-failed"]) {
  test(`${outcome} contracts allow bounded trace flush without losing evidence`, async () => {
    const site = {
      id: `slow-trace-${outcome}`,
      caseId: "primary",
      component: "Card",
      url: "http://127.0.0.1:5173/slow-trace",
      target: outcome === "passed" ? "#selected" : "#missing",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    const { context, extensionId } = instance;
    await context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><style>body{padding:80px}article,aside{padding:30px;margin:20px}</style><article id="selected"><h2>Nested card</h2></article><aside id="kept">Independent</aside>',
      }),
    );
    const stop = context.tracing.stop.bind(context.tracing);
    let stopped: Promise<void> | undefined;
    context.tracing.stop = (options) => {
      stopped = new Promise<void>((resolve) => setTimeout(resolve, 4000)).then(
        () => stop(options),
      );
      return stopped;
    };
    const tracePolicy = process.env.TAYLR_TRACE;
    // This fixture explicitly tests successful trace flushing. Ordinary live
    // passes deliberately discard traces under the default failures policy.
    if (outcome === "passed") process.env.TAYLR_TRACE = "full";
    try {
      if (outcome === "passed") {
        expect((await runLiveSite(context, extensionId, site)).outcome).toBe(
          "passed",
        );
      } else {
        await expect(
          runLiveSite(context, extensionId, site),
        ).rejects.toMatchObject({ outcome });
      }
      const directory = evidencePath("sites", site.id, site.caseId);
      const checks = JSON.parse(
        await readFile(`${directory}/checks.json`, "utf8"),
      );
      expect(checks.artifactErrors).toEqual([]);
      expect((await stat(`${directory}/trace.zip`)).size).toBeGreaterThan(0);
    } finally {
      if (tracePolicy === undefined) delete process.env.TAYLR_TRACE;
      else process.env.TAYLR_TRACE = tracePolicy;
      await stopped?.catch(() => {});
      await instance.close();
    }
  });
}
