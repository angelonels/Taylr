import { test, expect, type Page } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: choosing a valid browser-computed current value rejects it against
// the editor's smaller preset list before recognizing an unchanged baseline.
test("Current browser baseline choices preserve an unrelated draft", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  const url = "http://127.0.0.1:5173/editor-baseline-choice";
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
        body: "<!doctype html><title>Baseline choice</title><style>body{padding:70px}#selected{padding:35px;border:4px inset black;font-weight:373}</style><button id='selected'>Selected component</button>",
      }),
    );
    const bridge = await driver(context, extensionId);
    page = await context.newPage();
    await page.goto(url);
    const target = page.locator("#selected");
    await expect(target).toHaveCSS("border-style", "inset");
    await expect(target).toHaveCSS("font-weight", "373");
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await target.click();
    await dock.locator("#edit-opacity").fill("67");
    await expect(dock.locator("#edit-save")).toBeEnabled();
    for (const [property, baseline] of [
      ["border-style", "inset"],
      ["font-weight", "373"],
    ]) {
      const trigger = dock.locator(`#edit-${property}`);
      await trigger.click();
      const current = dock.locator(`[role="option"][data-value="${baseline}"]`);
      await expect(current).toHaveAttribute("aria-selected", "true");
      await current.click();
      await expect(trigger).not.toHaveAttribute("aria-invalid", "true");
      await expect(dock.locator(`#edit-${property}-error`)).toHaveCount(0);
      await expect(dock.getByRole("button", { name: /^Fix / })).toHaveCount(0);
      await expect(dock.locator("#edit-save")).toBeEnabled();
      await expect(dock.locator("#edit-opacity")).toHaveValue("67");
    }
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    const result = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "get",
        origin: "http://127.0.0.1:5173",
      }),
    );
    expect(result.profile.rules).toHaveLength(1);
    expect(result.profile.rules[0].styles).toEqual({ opacity: "0.67" });
    await page.reload();
    await expect(target).toHaveCSS("border-style", "inset");
    await expect(target).toHaveCSS("font-weight", "373");
    await expect(target).toHaveCSS("opacity", "0.67");
  } finally {
    try {
      if (page && !page.isClosed())
        await page.screenshot({
          path: evidencePath("editor-baseline-choice.png"),
        });
    } finally {
      try {
        await context.tracing.stop({
          path: evidencePath("editor-baseline-choice.zip"),
        });
      } finally {
        await instance.close();
      }
    }
  }
});
