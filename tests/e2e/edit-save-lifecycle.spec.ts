import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failures: Escape drops Undo for an already committed Save; post-save selector
// recomputation forks one edit when a site adds a stronger semantic attribute.
for (const mode of ["escape", "identity", "hidden", "detached"]) {
  test(`Save lifecycle: ${mode}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId, worker } = instance;
    const url = "http://127.0.0.1:5173/save-lifecycle";
    await context.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Save lifecycle</title><style>body{padding:80px}button{padding:40px}</style><button id='selected'>Selected</button>",
      }),
    );
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto(url);
      const dock = await openDock(context, bridge, page);
      await startEdit(dock);
      await page.locator("#selected").click();
      await dock.locator("#edit-opacity").fill("67");
      await worker.evaluate(() => {
        const write = chrome.storage.local.set.bind(chrome.storage.local);
        chrome.storage.local.set = async (items) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return write(items);
        };
      });
      await dock.locator("#edit-save").click();
      await expect(dock.locator("#edit-save")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      if (mode === "escape") {
        await page.keyboard.press("Escape");
        await expect(dock.locator("#undo")).toBeEnabled();
        await dock.locator("#undo").click();
        await expect(page.locator("#selected")).toHaveCSS("opacity", "1");
      } else if (mode === "identity") {
        await page
          .locator("#selected")
          .evaluate((element) =>
            element.setAttribute("data-testid", "stable-control"),
          );
        await expect(dock.locator("#status")).toHaveText("Changes saved.");
        await dock.locator("#edit-border-radius").fill("17px");
        await dock.locator("#edit-save").click();
        await expect(dock.locator("#status")).toHaveText("Changes saved.");
        const result = await bridge.evaluate(() =>
          chrome.runtime.sendMessage({
            type: "get",
            origin: "http://127.0.0.1:5173",
          }),
        );
        expect(result.profile.rules).toHaveLength(1);
        await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
        await expect(page.locator("#selected")).toHaveCSS(
          "border-radius",
          "17px",
        );
      } else {
        await page.locator("#selected").evaluate((element, mode) => {
          if (mode === "hidden") (element as HTMLElement).hidden = true;
          else element.remove();
        }, mode);
        await expect(dock.locator("#status")).toHaveText("Changes saved.");
        await page.evaluate((mode) => {
          if (mode === "hidden")
            document.getElementById("selected")!.hidden = false;
          else {
            const replacement = document.createElement("button");
            replacement.id = "selected";
            replacement.textContent = "Selected";
            document.body.append(replacement);
          }
        }, mode);
        await expect(dock.locator("#undo")).toBeEnabled();
        if (mode === "hidden")
          await expect(dock.locator("#edit-save")).toBeDisabled();
        await dock.locator("#undo").click();
        await expect(page.locator("#selected")).toHaveCSS("opacity", "1");
      }
    } finally {
      await context.tracing.stop({
        path: evidencePath(`save-lifecycle-${mode}.zip`),
      });
      await instance.close();
    }
  });
}
