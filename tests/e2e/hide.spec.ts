import { test } from "@playwright/test";
import { evidenceFingerprint, evidenceIdentity } from "../evidence.mjs";
import { classifyFailure, evidencePath } from "../run-evidence.mjs";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
const sites = JSON.parse(
  readFileSync(new URL("../sites.json", import.meta.url), "utf8"),
);

type ComponentContract = { id: string; [key: string]: unknown };
async function run(id: string, component?: ComponentContract) {
  const { isolatedBrowser } = await import("../isolated-browser.mjs");
  const { runFixture } = await import("../scenarios/fixture.mjs");
  const { runLiveSite } = await import("../scenarios/live.mjs");
  const base = sites.find((site) => site.id === id);
  const site = base
    ? { ...base, ...component, caseId: component?.id ?? "primary", id: base.id }
    : undefined;
  const resultId = component ? `${id}--${component.id}` : id;
  const started = Date.now();
  let instance;
  let failure;
  let result;
  try {
    instance = await isolatedBrowser(site);
    result =
      id === "fixture"
        ? (await runFixture(instance.context, instance.extensionId),
          { site: id, passed: true, outcome: "passed" })
        : await runLiveSite(instance.context, instance.extensionId, site);
  } catch (error) {
    failure = classifyFailure(error, instance ? "verification" : "launch");
    result = {
      site: id,
      passed: false,
      outcome: failure.outcome,
      phase: failure.phase,
      access: failure.access,
      checks: failure.checks,
      timings: failure.timings,
      error: failure.message,
    };
  } finally {
    // Completion is recorded only after browser cleanup and attachment succeed.
    // Auxiliary failures never erase the original verification/access diagnosis.
    const finalizationErrors: { phase: string; message: string }[] = [];
    const retain = (error: Error, phase: string) => {
      finalizationErrors.push({ phase, message: error.message });
      if (!failure) failure = classifyFailure(error, phase);
      else
        test.info().annotations.push({
          type: `${phase}-error`,
          description: error.message,
        });
    };
    try {
      await instance?.close();
    } catch (error) {
      retain(error, "cleanup");
    }
    const record = () =>
      JSON.stringify(
        {
          ...result,
          ...(failure
            ? {
                passed: false,
                outcome: failure.outcome,
                phase: failure.phase,
                access: failure.access,
                error: failure.message,
              }
            : {}),
          finalizationErrors,
          browser: "disposable-playwright-chromium",
          runId: process.env.TAYLR_RUN_ID,
          fingerprint: component
            ? evidenceFingerprint(base, component)
            : undefined,
          identity: component ? evidenceIdentity(base, component) : undefined,
          environment: instance?.environment,
          startedAt: new Date(started).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
        },
        null,
        2,
      );
    let serialized = record();
    try {
      await test.info().attach("verification-result", {
        body: serialized,
        contentType: "application/json",
      });
    } catch (error) {
      retain(error, "artifacts");
      serialized = record();
    }
    try {
      await mkdir(evidencePath("session-results"), { recursive: true });
      await writeFile(
        evidencePath("session-results", `${resultId}.json`),
        serialized,
      );
    } catch (error) {
      retain(error, "artifacts");
    }
  }

  if (failure?.outcome === "blocked") {
    test.info().annotations.push({
      type: "external-block",
      description: failure.message,
    });
    test.skip(true, `Observed website access block: ${failure.message}`);
  }
  if (failure) throw failure;
}

test("Hide: click safety, scope, persistence, dynamic DOM, Undo, Restore, keyboard, and reflow", async () => {
  await run("fixture");
});
if (process.env.TAYLR_LIVE_SITES === "1")
  for (const site of sites)
    for (const component of site.components) {
      if (
        process.env.TAYLR_SITES &&
        !process.env.TAYLR_SITES.split(",").includes(site.id)
      )
        continue;
      if (
        process.env.TAYLR_COMPONENTS &&
        !process.env.TAYLR_COMPONENTS.split(",").includes(component.id)
      )
        continue;
      if (
        process.env.TAYLR_CASES &&
        !process.env.TAYLR_CASES.split(",").includes(
          `${site.id}:${component.id}`,
        )
      )
        continue;
      test(
        `${site.name} · ${component.component}: Hide, Undo, persistence, Restore, Exit`,
        { lock: `site:${new URL(site.url).hostname}` },
        async () => {
          await run(site.id, component);
        },
      );
    }
