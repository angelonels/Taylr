import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure contracts: install grants all HTTP(S) sites without per-site prompts;
// Pause restores existing rules in every tab, blocks new Hide, survives reload,
// leaves another origin alone, and Resume reapplies the preserved rules.
test("Site access: install grants, pause across tabs, reload and resume", async () => {
  const instance = await isolatedBrowser(undefined, {
    productionPermissions: true,
  });
  const { context, extensionId, worker } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    expect(
      await bridge.evaluate(() =>
        chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] }),
      ),
    ).toBe(true);
    await worker.evaluate(() => {
      chrome.permissions.request = async () => {
        throw new Error("Unexpected per-site permission prompt");
      };
    });
    const first = await context.newPage();
    await first.goto("http://127.0.0.1:5173/tests/fixture.html");
    const dock = await openDock(context, bridge, first);
    await dock.locator("#hide").click();
    await expect(dock.locator("#hide")).toHaveAttribute("aria-pressed", "true");
    await first.locator("#distraction").click();
    await expect(first.locator("#distraction")).toBeHidden();
    await first.keyboard.press("Escape");
    const second = await context.newPage();
    await second.goto(first.url());
    await expect(second.locator("#distraction")).toBeHidden();
    await first.bringToFront();
    await dock.locator("#site-toggle").click();
    await dock.locator("#site-pause").click();
    await expect(dock.locator("#site-pause")).toHaveText("Resume site");
    await expect(dock.locator("#hide")).toBeDisabled();
    await expect(first.locator("#distraction")).toBeVisible();
    await expect(second.locator("#distraction")).toBeVisible();
    expect(
      await bridge.evaluate(
        async () =>
          (await chrome.storage.local.get("site:http://127.0.0.1:5173"))[
            "site:http://127.0.0.1:5173"
          ].rules.length,
      ),
    ).toBe(1);
    const rejected = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "add",
        origin: "http://127.0.0.1:5173",
        selector: "#other",
        label: "Blocked",
      }),
    );
    expect(rejected.error).toContain("Resume this site");
    const fresh = await context.newPage();
    await fresh.goto(first.url());
    await expect(fresh.locator("#distraction")).toBeVisible();
    expect(await fresh.locator("taylr-tools").count()).toBe(0);
    await second.reload();
    await expect(second.locator("#distraction")).toBeVisible();
    const secondDock = await openDock(context, bridge, second);
    await expect(secondDock.locator("#hide")).toBeDisabled();
    const other = await context.newPage();
    await other.route("https://example.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body><article id="other">Other site</article></body></html>',
      }),
    );
    await other.goto("https://example.test/");
    const otherDock = await openDock(context, bridge, other);
    await expect(otherDock.locator("#hide")).toBeEnabled();
    await otherDock.locator("#hide").click();
    await expect(otherDock.locator("#hide")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await other.keyboard.press("Escape");
    await first.bringToFront();
    await dock.locator("#site-pause").click();
    await expect(dock.locator("#site-pause")).toHaveText("Pause site");
    await expect(first.locator("#distraction")).toBeHidden();
    await expect(second.locator("#distraction")).toBeHidden();
    await expect(fresh.locator("#distraction")).toBeHidden();
    await second.reload();
    await expect(second.locator("#distraction")).toBeHidden();
    await first.screenshot({ path: evidencePath("site-access.png") });
    const settings = context.waitForEvent("page");
    await dock.locator("#chrome-access").click();
    await expect(await settings).toHaveURL(
      `chrome://extensions/?id=${extensionId}`,
    );
  } finally {
    await context.tracing.stop({ path: evidencePath("site-access-trace.zip") });
    await instance.close();
  }
});

// Chrome shares dynamic script registration across regular/private contexts.
// Pause is partitioned application state and must not mutate that shared registry.
test("Site access: Pause preserves the shared restoration registration", async () => {
  const instance = await isolatedBrowser(undefined, {
    productionPermissions: true,
  });
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
    const before = await bridge.evaluate(() =>
      chrome.scripting.getRegisteredContentScripts(),
    );
    expect(before.length).toBeGreaterThan(0);
    await bridge.evaluate(async () => {
      const origin = "http://127.0.0.1:5173";
      await chrome.runtime.sendMessage({
        type: "add",
        origin,
        selector: "#distraction",
        label: "Card",
      });
      await chrome.runtime.sendMessage({
        type: "set-paused",
        origin,
        paused: true,
      });
    });
    await expect(page.locator("#distraction")).toBeVisible();
    expect(
      await bridge.evaluate(() =>
        chrome.scripting.getRegisteredContentScripts(),
      ),
    ).toEqual(before);
    const fresh = await context.newPage();
    await fresh.goto(page.url());
    await expect(fresh.locator("#distraction")).toBeVisible();
    await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "set-paused",
        origin: "http://127.0.0.1:5173",
        paused: false,
      }),
    );
    await expect(dock.locator("#hide")).toBeEnabled();
    await expect(fresh.locator("#distraction")).toBeHidden();
    await fresh.reload();
    await expect(fresh.locator("#distraction")).toBeHidden();
  } finally {
    await context.tracing.stop({
      path: evidencePath("site-shared-registration-trace.zip"),
    });
    await instance.close();
  }
});
