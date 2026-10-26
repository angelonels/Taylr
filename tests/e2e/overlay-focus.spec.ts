import { test, expect, type Page } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: an unrelated native toggle remounts the overlay and steals draft focus.
test("Page details toggle preserves focused editor draft", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  const url = "http://127.0.0.1:5173/overlay-focus";
  let page: Page | undefined;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    await context.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Overlay focus</title><style>body{padding:70px;font:16px sans-serif}button{padding:30px;margin-bottom:30px}details{width:320px}</style><button id='selected'>Selected component</button><details id='disclosure'><summary>Page details</summary><p>Additional page content</p></details>",
      }),
    );
    const bridge = await driver(context, extensionId);
    page = await context.newPage();
    await page.goto(url);
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#selected").click();
    const opacity = dock.locator("#edit-opacity");
    await opacity.fill("67");
    await expect(opacity).toBeFocused();
    await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
    await page.locator("#disclosure").evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          element.addEventListener("toggle", () => resolve(), { once: true });
          (element as HTMLDetailsElement).open = true;
        }),
    );
    await expect(page.locator("#disclosure")).toHaveAttribute("open", "");
    await expect(opacity).toBeFocused();
    await expect(opacity).toHaveValue("67");
    await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
    const saved = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "get",
        origin: "http://127.0.0.1:5173",
      }),
    );
    expect(saved.profile.rules).toHaveLength(0);
  } finally {
    try {
      if (page && !page.isClosed())
        await page.screenshot({
          path: evidencePath("overlay-focus-details.png"),
        });
    } finally {
      try {
        await context.tracing.stop({
          path: evidencePath("overlay-focus-details.zip"),
        });
      } finally {
        await instance.close();
      }
    }
  }
});
