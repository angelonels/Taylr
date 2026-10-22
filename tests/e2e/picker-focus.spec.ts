import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: site-driven focus events are trusted too. A focus manager must
// not replace the component the user explicitly chose with Parent/Child.
test("Picker refinement survives page-driven focus changes", async () => {
  const instance = await isolatedBrowser();
  await instance.context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(instance.context, instance.extensionId);
    const page = await instance.context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const dock = await openDock(instance.context, bridge, page);
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page.locator("#nested-child").hover();
    await page.keyboard.press("ArrowUp");
    await page.evaluate(() =>
      document.querySelector<HTMLElement>("#keep").focus(),
    );
    await page.keyboard.press("Enter");
    await expect(page.locator("#nested")).toBeHidden();
    await expect(page.locator("#keep")).toBeVisible();
    await dock.locator("#undo").click();
    await expect(page.locator("#nested")).toBeVisible();
    // Native Tab explicitly hands selection to the next focused page control.
    await page.locator("#nested-child").hover();
    await page.keyboard.press("ArrowUp");
    await page.evaluate(() =>
      document.querySelector<HTMLElement>("#keep").focus(),
    );
    await page.keyboard.press("Tab");
    await expect(page.locator("#nested-child")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#nested-child")).toBeHidden();
    await expect(page.locator("#nested-first")).toBeVisible();
    await expect(page.locator("#keep")).toBeVisible();
  } finally {
    try {
      await instance.context.tracing.stop({
        path: evidencePath("picker-focus-trace.zip"),
      });
    } finally {
      await instance.close();
    }
  }
});

// Failure first: Undo can wake a site's focus manager while the last hovered
// DOM node remains unchanged. Returning to that node is a new pointer choice.
test("Picker follows the same hovered component after Undo and site focus", async () => {
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
    const dock = await openDock(context, bridge, page);
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    const target = page.locator("#nested-child");
    const retained = page.locator("#keep");
    await target.hover();
    await page.keyboard.press("Enter");
    await expect(target).toBeHidden();
    await dock.locator("#undo").click();
    await expect(target).toBeVisible();
    await page.evaluate(() =>
      document.querySelector<HTMLElement>("#keep").focus(),
    );
    await expect(retained).toBeFocused();
    await target.hover();
    const selected = await bridge.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
      return chrome.tabs.sendMessage(tab.id, {
        type: "get-picker",
        selection: true,
      });
    }, page.url());
    expect(selected.active).toBe(true);
    expect(
      await target.evaluate(
        (element, selector) => document.querySelector(selector) === element,
        selected.selector,
      ),
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(target).toBeHidden();
    await expect(retained).toBeVisible();
    await expect(page.locator("#nested-first")).toBeVisible();
    const saved = await bridge.evaluate(
      (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
      new URL(page.url()).origin,
    );
    expect(saved.profile.rules).toHaveLength(1);
    expect(saved.profile.rules[0].selector).toBe("button#nested-child");
  } finally {
    try {
      await context.tracing.stop({
        path: evidencePath("picker-undo-focus-trace.zip"),
      });
    } finally {
      await instance.close();
    }
  }
});
