import { expect } from "@playwright/test";
export async function driver(context, extensionId) {
  const bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${extensionId}/test-driver.html`);
  return bridge;
}
// A disposable test owns one browser window. Activate the intended Page once
// to learn its tab ID; application URLs are mutable and never identify tabs.
const tabIds = new WeakMap();
export async function tabForPage(bridge, page) {
  await page.bringToFront();
  let id = tabIds.get(page);
  if (id === undefined) {
    id = await bridge.evaluate(
      async () =>
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id,
    );
    if (id === undefined) throw new Error("Test page tab is not accessible.");
    tabIds.set(page, id);
  }
  return bridge.evaluate((tabId) => chrome.tabs.get(tabId), id);
}
export async function invokeAction(context, bridge, page) {
  const tab = await tabForPage(bridge, page);
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  await worker.evaluate((tab) => globalThis.__invokeTaylrAction(tab), tab);
}
export async function openDock(context, bridge, page) {
  await invokeAction(context, bridge, page);
  await expect(page.getByRole("toolbar", { name: "Taylr" })).toBeVisible();
  return page.locator("taylr-tools");
}
