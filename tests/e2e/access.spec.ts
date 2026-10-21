import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";

// An ordinary HTTPS page must not be classified as Chrome-protected merely because
// a previous panel lacked access to its URL. This does not bypass website challenges.
test("LeetCode: action opens dock on ordinary HTTPS, record application access separately", async () => {
  test.skip(
    process.env.TAYLR_LIVE_SITES !== "1",
    "Public access smoke is opt-in.",
  );
  const instance = await isolatedBrowser({
    url: "https://leetcode.com/problemset/",
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
    await page.goto("https://leetcode.com/problemset/", {
      waitUntil: "domcontentloaded",
    });
    const title = await page.title();
    const dock = await openDock(context, bridge, page);
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await expect(dock).not.toContainText(/protected/i);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: "output/playwright/leetcode-access.png" });
    await writeFile(
      "output/playwright/leetcode-access.json",
      JSON.stringify(
        {
          url: page.url(),
          title,
          dock: "verified",
          application: /just a moment|security|checking/i.test(title)
            ? "blocked by website challenge; problem components unverified"
            : "loaded; problem components not covered by this smoke",
        },
        null,
        2,
      ),
    );
  } finally {
    await context.tracing.stop({
      path: "output/playwright/leetcode-access-trace.zip",
    });
    await instance.close();
  }
});

// Failure contract: denied persistent site access has a recovery path and never
// masquerades as a Chrome-protected URL, even when the dock is already mounted.
test("Denied site access: clear recovery and no mutation", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId, worker } = instance;
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
    await worker.evaluate(() => {
      chrome.permissions.contains = async () => false;
    });
    await dock.locator("#hide").click();
    await expect(dock.locator("#status")).toContainText("allow access");
    await expect(dock.locator("#status")).not.toContainText("protected");
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      0,
    );
    await expect(page.locator("#distraction")).toBeVisible();
    await dock.locator("#close").click();
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toHaveCount(0);
  } finally {
    await context.tracing.stop({
      path: "output/playwright/denied-access-trace.zip",
    });
    await instance.close();
  }
});

// Failure contract: two first-use toolbar invocations may race registration, but
// must never turn a valid website into a reload-error notice or duplicate scripts.
test("Concurrent toolbar invocation: one registration and no false error", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId, worker } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const tab = await bridge.evaluate(
      async (url) => (await chrome.tabs.query({})).find((t) => t.url === url),
      page.url(),
    );
    const result = await worker.evaluate(async (tab) => {
      await Promise.all([
        globalThis.__invokeTaylrAction(tab),
        globalThis.__invokeTaylrAction(tab),
      ]);
      return {
        badge: await chrome.action.getBadgeText({ tabId: tab.id }),
        scripts: (await chrome.scripting.getRegisteredContentScripts()).length,
      };
    }, tab);
    expect(result).toEqual({ badge: "", scripts: 1 });
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toHaveCount(0);
    const dock = await openDock(context, bridge, page);
    await expect(dock.locator("#hide")).toBeEnabled();
  } finally {
    await context.tracing.stop({
      path: "output/playwright/concurrent-action-trace.zip",
    });
    await instance.close();
  }
});
