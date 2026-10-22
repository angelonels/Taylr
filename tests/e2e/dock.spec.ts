import { evidencePath } from "../run-evidence.mjs";
import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, invokeAction } from "../dock-actions.mjs";

test("Floating dock: preserve layout, trusted input, drag, keyboard movement, rules and reopen", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const manifest = await bridge.evaluate(() => chrome.runtime.getManifest());
    expect(manifest).not.toHaveProperty("side_panel");
    expect(manifest.permissions).not.toContain("sidePanel");
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const geometry = () =>
      page.evaluate(() => ({
        width: innerWidth,
        client: document.documentElement.clientWidth,
        body: document.body.getBoundingClientRect().width,
        scroll: scrollY,
      }));
    const before = await geometry();
    const dock = await openDock(context, bridge, page);
    expect(await geometry()).toEqual(before);
    await expect(dock.locator("#hide")).toBeVisible();
    const grip = dock.getByRole("button", {
      name: "Move toolbar",
      exact: true,
    });
    const initial = await dock.locator(".dock").boundingBox();
    await grip.focus();
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await dock.locator(".dock").boundingBox()).x)
      .toBeLessThan(initial.x - 15);
    const handle = await grip.boundingBox();
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(handle.x - 110, handle.y + 180, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(async () => (await dock.locator(".dock").boundingBox()).y)
      .toBeGreaterThan(initial.y + 80);
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page.locator("#keep").focus();
    await page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    await expect(page.locator("#keep")).toBeVisible();
    await page.evaluate(() =>
      document
        .querySelector("taylr-tools")
        .shadowRoot.querySelector("#hide-selection")
        .click(),
    );
    await expect(page.locator("#keep")).toBeVisible();
    // Native buttons emit a trusted click for Shift+Enter even when the picker
    // ignores the modified keydown. That click must not bypass the key guard.
    await page.locator("#nested-child").focus();
    await page.keyboard.press("Shift+Enter");
    await expect(page.locator("#nested-child")).toBeVisible();
    await expect(page.locator("#click-count")).toHaveText("0");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      0,
    );
    await expect(dock.locator("#hide")).toBeFocused();
    await dock.locator("#hide").click();
    await page.locator("#distraction").click();
    await expect(page.locator("#distraction")).toBeHidden();
    await dock.locator("#done").click();
    await dock.locator("#rules-toggle").click();
    await expect(dock.locator("#rules")).toContainText("An unwanted sidebar");
    await dock.locator("#restore").click();
    await expect(page.locator("#distraction")).toBeVisible();
    await dock.locator("#close").click();
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toHaveCount(0);
    await openDock(context, bridge, page);
    await expect(dock.locator("#hide")).toBeVisible();
    expect(await page.locator("taylr-tools").count()).toBe(1);
    await page.screenshot({ path: evidencePath("floating-dock.png") });
    await dock
      .locator(".dock")
      .screenshot({ path: evidencePath("dock-preview.png") });
    await invokeAction(context, bridge, page);
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toHaveCount(0);
  } finally {
    await context.tracing.stop({ path: evidencePath("dock-trace.zip") });
    await instance.close();
  }
});
