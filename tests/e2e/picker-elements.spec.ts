import { evidencePath } from "../run-evidence.mjs";
import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";

// Failure contract: valid HTML names can contain a colon (for example Office
// exports). Selector generation must escape the tag without breaking persistence.
test("Picker: namespaced HTML content hides and restores across reload", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.addInitScript(() =>
      document.addEventListener("DOMContentLoaded", () => {
        const element = document.createElement("o:p");
        element.id = "office-content";
        element.textContent = "Content exported from a document";
        element.style.cssText = "display:block;padding:24px;background:#eee";
        document.querySelector("#distraction").before(element);
      }),
    );
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const dock = await openDock(context, bridge, page);
    await dock.locator("#hide").click();
    await page.locator("#office-content").click();
    await expect(page.locator("#office-content")).toBeHidden();
    await expect(page.locator("#keep")).toBeVisible();
    await page.reload();
    await expect(page.locator("#office-content")).toHaveCount(1);
    await expect(page.locator("#office-content")).toBeHidden();
    await openDock(context, bridge, page);
    await dock.locator("#rules-toggle").click();
    await dock.locator("#restore").click();
    await expect(page.locator("#office-content")).toBeVisible();
  } finally {
    await context.tracing.stop({
      path: evidencePath("namespaced-elements-trace.zip"),
    });
    await instance.close();
  }
});
