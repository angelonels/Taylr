import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// A heading's pointer hit promotes to its card link. Child must follow that
// hit's branch, rather than the first image/wrapper in a different branch.
for (const boxless of [false, true]) {
  test(`Picker Child follows the hovered branch (${boxless ? "boxless" : "visible"} wrapper)`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId } = instance;
    const url = "http://127.0.0.1:5173/picker-branch";
    await context.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Picker branches</title><style>body{padding:60px}a{display:block;width:400px;padding:20px;background:#ddd}#leading{height:70px;background:#bbb}#copy{padding:16px}#heading{margin:0;padding:15px}#wrapper{display:${boxless ? "contents" : "block"}}</style><a id="card" href="/story"><div id="leading">Leading graphic branch</div><div id="copy"><div id="wrapper"><h2 id="heading">Hovered heading</h2></div></div></a>`,
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
      const selectedIs = async (id: string) => {
        const state = await bridge.evaluate(async (url) => {
          const tab = (await chrome.tabs.query({})).find(
            (tab) => tab.url === url,
          )!;
          return chrome.tabs.sendMessage(tab.id!, {
            type: "get-picker",
            selection: true,
          });
        }, url);
        return page.evaluate(
          ({ selector, id }) =>
            document.querySelector(selector) === document.getElementById(id),
          { selector: state.selector, id },
        );
      };
      await page.locator("#heading").hover();
      await expect.poll(() => selectedIs("card")).toBe(true);
      const branch = boxless
        ? ["copy", "heading"]
        : ["copy", "wrapper", "heading"];
      for (const id of branch) {
        await page.keyboard.press("ArrowDown");
        await expect.poll(() => selectedIs(id)).toBe(true);
        if (id === "copy") {
          await page.keyboard.press("ArrowUp");
          await page.locator("#leading").hover();
          await expect.poll(() => selectedIs("card")).toBe(true);
          await page.keyboard.press("ArrowDown");
          await expect.poll(() => selectedIs("copy")).toBe(true);
          // Restore the raw hit for the deeper, still-unvisited child branch.
          await page.locator("#heading").hover();
        }
      }
      // Explicit Parent/Child history must retain the same branch, too.
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowDown");
      await expect.poll(() => selectedIs("heading")).toBe(true);
      await page.keyboard.press("Enter");
      await dock.locator("#edit-opacity").fill("67");
      await expect(page.locator("#heading")).toHaveCSS("opacity", "0.67");
      await expect(page.locator("#leading")).toHaveCSS("opacity", "1");
      await page.keyboard.press("Escape");
      await startEdit(dock);
      await page.locator("#leading").hover();
      await expect.poll(() => selectedIs("card")).toBe(true);
      await page.keyboard.press("ArrowDown");
      await expect.poll(() => selectedIs("leading")).toBe(true);
    } finally {
      await context.tracing.stop({
        path: evidencePath(
          `picker-branch-${boxless ? "boxless" : "visible"}.zip`,
        ),
      });
      await instance.close();
    }
  });
}
