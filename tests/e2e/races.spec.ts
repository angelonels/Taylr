import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";

// Failure contracts: delayed mutation replies must never repaint newer broadcasts;
// closing during Save must remain possible, without transferring Undo ownership.
test("Ordered state: delayed Save and Restore replies cannot overwrite newer rules", async () => {
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
    let dock = await openDock(context, bridge, page);
    const tabId = await bridge.evaluate(
      async (url) =>
        (await chrome.tabs.query({})).find((t) => t.url === url).id,
      page.url(),
    );
    const hold = async (type: string) =>
      bridge.evaluate(
        async ({ tabId, type }) => {
          await chrome.scripting.executeScript({
            target: { tabId },
            args: [type],
            func: (type) => {
              const original = chrome.runtime.sendMessage.bind(chrome.runtime);
              chrome.runtime.sendMessage = async (...args) => {
                const result = await original(...args);
                if (args[0]?.type === type)
                  await new Promise<void>((resolve) => {
                    globalThis.releaseMutation = () => {
                      chrome.runtime.sendMessage = original;
                      resolve();
                    };
                  });
                return result;
              };
            },
          });
        },
        { tabId, type },
      );
    const release = () =>
      bridge.evaluate(
        async (tabId) =>
          chrome.scripting.executeScript({
            target: { tabId },
            func: () => globalThis.releaseMutation(),
          }),
        tabId,
      );
    const rpc = (type: string, selector?: string) =>
      bridge.evaluate(
        ({ type, selector }) =>
          chrome.runtime.sendMessage({
            type,
            origin: "http://127.0.0.1:5173",
            selector,
            label: "Newer change",
          }),
        { type, selector },
      );
    await hold("add");
    await dock.locator("#hide").click();
    await page.locator("#distraction").click();
    await expect(page.locator("#distraction")).toBeHidden();
    await dock.locator("#close").click();
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toHaveCount(0);
    await rpc("restore");
    await expect(page.locator("#distraction")).toBeVisible();
    await release();
    dock = await openDock(context, bridge, page);
    await expect(dock.locator("#undo")).toBeDisabled();
    await rpc("add", "#distraction");
    await dock.locator("#rules-toggle").click();
    await hold("restore");
    await dock.locator("#restore").click();
    await expect(page.locator("#distraction")).toBeVisible();
    await rpc("add", "#keep");
    await expect(dock.locator("#rules")).toContainText("Newer change");
    await release();
    await expect(dock.locator("#restore")).toBeEnabled();
    await expect(page.locator("#keep")).toBeHidden();
    await expect(dock.locator("#rules li")).toHaveCount(1);
    await rpc("restore");
    await expect(page.locator("#keep")).toBeVisible();
  } finally {
    await context.tracing.stop({
      path: "output/playwright/ordered-state-trace.zip",
    });
    await instance.close();
  }
});
