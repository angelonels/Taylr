import { expect } from "@playwright/test";
export async function driver(context, extensionId) {
  const bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${extensionId}/test-driver.html`);
  return bridge;
}
export async function invokeAction(context, bridge, page) {
  await page.bringToFront();
  const tab = await bridge.evaluate(
    async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url),
    page.url(),
  );
  if (!tab) throw new Error("Test page tab is not accessible.");
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  await worker.evaluate((tab) => globalThis.__invokeTaylrAction(tab), tab);
}
export async function openDock(context, bridge, page) {
  await invokeAction(context, bridge, page);
  await expect(page.getByRole("toolbar", { name: "Taylr" })).toBeVisible();
  return page.locator("taylr-tools");
}
