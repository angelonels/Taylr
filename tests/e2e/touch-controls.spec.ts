import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: enlarged 44px stepper actions clip inside fine-pointer row tracks.
test("Coarse pointer controls keep inputs and actions within their row", async () => {
  const instance = await isolatedBrowser(undefined, { hasTouch: true });
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId),
      page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#keep").click();
    for (const row of await dock.locator(".value-stepper").all()) {
      const geometry = await row.evaluate((e) => ({
        width: e.clientWidth,
        scroll: e.scrollWidth,
      }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
    }
    await page.screenshot({ path: evidencePath("coarse-controls.png") });
  } finally {
    await context.tracing.stop({ path: evidencePath("coarse-controls.zip") });
    await instance.close();
  }
});
