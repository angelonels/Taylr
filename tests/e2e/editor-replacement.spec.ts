import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: a framework replaces a locked node. Stale controls must clear
// with feedback; an unsaved draft must not migrate to the replacement.
for (const saved of [false, true]) {
  test(`Editor recovers from ${saved ? "saved" : "draft"} target replacement`, async () => {
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
      await page.goto("http://127.0.0.1:5173/tests/fixture.html");
      const target = page.locator("#keep");
      const dock = await openDock(context, bridge, page);
      await startEdit(dock);
      await target.click();
      await dock.locator("#edit-opacity").fill("43");
      await expect(target).toHaveCSS("opacity", "0.43");
      if (saved) {
        await dock.locator("#edit-save").click();
        await expect(dock.locator("#status")).toHaveText("Changes saved.");
      }
      await target.evaluate((element) =>
        element.replaceWith(element.cloneNode(true)),
      );
      await expect(
        dock.getByRole("region", { name: "Element editor" }),
      ).toHaveCount(0);
      await expect(dock.locator("#status")).toHaveText(
        "This element changed. Pick it again.",
      );
      await expect(target).toHaveCSS("opacity", saved ? "0.43" : "1");
      await target.click();
      await expect(
        dock.getByRole("region", { name: "Element editor" }),
      ).toBeVisible();
      await expect(dock.locator("#edit-opacity")).toHaveValue(
        saved ? "43" : "100",
      );
    } finally {
      await context.tracing.stop({
        path: evidencePath(`editor-replacement-${saved}.zip`),
      });
      await instance.close();
    }
  });
}
