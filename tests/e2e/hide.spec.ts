import { test } from "@playwright/test";
import { evidenceFingerprint } from "../evidence.mjs";
import { readFileSync } from "node:fs";
const sites = JSON.parse(
  readFileSync(new URL("../sites.json", import.meta.url), "utf8"),
);
async function run(id: string, component?: any) {
  const { isolatedBrowser } = await import("../isolated-browser.mjs");
  const { runFixture } = await import("../scenarios/fixture.mjs");
  const { runLiveSite } = await import("../scenarios/live.mjs");
  const base = sites.find((site) => site.id === id);
  const site = base
    ? { ...base, ...component, caseId: component?.id ?? "primary", id: base.id }
    : undefined;
  const resultId = component ? `${id}--${component.id}` : id;
  const fingerprint = component
    ? evidenceFingerprint(base, component)
    : undefined;
  let instance;
  const startedAt = new Date().toISOString();
  let result;
  try {
    instance = await isolatedBrowser(site);
    result =
      id === "fixture"
        ? (await runFixture(instance.context, instance.extensionId),
          { site: id, passed: true })
        : await runLiveSite(instance.context, instance.extensionId, site);
  } catch (error) {
    result = { site: id, passed: false, error: error.message };
    throw error;
  } finally {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir("output/playwright/session-results", { recursive: true });
    await writeFile(
      `output/playwright/session-results/${resultId}.json`,
      JSON.stringify(
        {
          ...result,
          browser: "disposable-playwright-chromium",
          fingerprint,
          startedAt,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    await instance?.close();
  }
}

test("Hide: click safety, scope, persistence, dynamic DOM, Undo, Restore, keyboard, and reflow", async () => {
  await run("fixture");
});
for (const site of sites)
  for (const component of site.components) {
    test(
      `${site.name} · ${component.component}: Hide, Undo, persistence, Restore, Exit`,
      { lock: `site:${new URL(site.url).hostname}` },
      async () => {
        test.skip(
          process.env.TAYLR_LIVE_SITES !== "1",
          "Public sites are opt-in.",
        );
        test.skip(
          !!process.env.TAYLR_SITES &&
            !process.env.TAYLR_SITES.split(",").includes(site.id),
          "Not selected for this run.",
        );
        test.skip(
          !!process.env.TAYLR_COMPONENTS &&
            !process.env.TAYLR_COMPONENTS.split(",").includes(component.id),
          "Not selected for this run.",
        );
        await run(site.id, component);
      },
    );
  }
