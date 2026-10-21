import { expect } from "@playwright/test";

export async function runFixture(browser, extensionId) {
  const context = await browser.newContext();
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  const page = await context.newPage();
  const panel = await context.newPage();
  let ownsProfile = false;
  try {
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");

    await page.bringToFront();
    await panel.goto(
      `chrome-extension://${extensionId}/panel.html?tab=${new URL(page.url()).searchParams.get("tab") || ""}`,
    );
    // Resolve the fixture tab explicitly; the panel is opened as a tab for automation.
    await panel.evaluate(async () => {
      const [target] = await chrome.tabs.query({
        url: "http://127.0.0.1:5173/tests/fixture.html",
        currentWindow: true,
      });
      history.replaceState(null, "", `?tab=${target.id}`);
    });
    await panel.reload();
    const initial = await panel.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "get",
        origin: "http://127.0.0.1:5173",
      }),
    );
    if (!initial.profile || initial.profile.rules.length)
      throw new Error("Refusing to modify existing fixture rules.");
    ownsProfile = true;
    // Real worker RPCs: concurrent writers retain both rules and attribute creation exactly.
    const concurrent = await panel.evaluate(async () => {
      const origin = "http://127.0.0.1:5173";
      const results = await Promise.all(
        ["#distraction", "#keep"].map((selector) =>
          chrome.runtime.sendMessage({
            type: "add",
            origin,
            selector,
            label: selector,
          }),
        ),
      );
      const profile = await chrome.runtime.sendMessage({ type: "get", origin });
      const regular = await chrome.storage.local.get(`site:${origin}`);
      await chrome.runtime.sendMessage({ type: "restore", origin });
      return {
        results,
        profile: profile.profile,
        regular,
        privateContext: chrome.extension.inIncognitoContext,
      };
    });
    expect(concurrent.privateContext).toBe(true);
    expect(concurrent.profile.rules).toHaveLength(2);
    expect(concurrent.results.map((result) => result.createdRuleId)).toEqual(
      concurrent.profile.rules.map((rule) => rule.id),
    );
    expect(concurrent.results[0].createdRuleId).not.toBe(
      concurrent.results[1].createdRuleId,
    );
    expect(
      await panel.evaluate(() =>
        chrome.storage.session.get("private-site:http://127.0.0.1:5173"),
      ),
    ).toHaveProperty(["private-site:http://127.0.0.1:5173"]);
    expect(
      await panel.evaluate(() =>
        chrome.storage.local.get("site:http://127.0.0.1:5173"),
      ),
    ).toEqual(concurrent.regular);

    await panel.getByRole("button", { name: "Hide", exact: true }).click();
    await page.bringToFront();
    await page.locator("#distraction").click();
    await expect(page.locator("#distraction")).toBeHidden();
    await expect(page.locator("#keep")).toBeVisible();
    await expect(page.locator("#click-count")).toHaveText("0");
    await page.screenshot({ path: "output/playwright/hidden.png" });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await expect(page.locator("#distraction")).toBeHidden();
    await page.getByRole("button", { name: "Replace content" }).click();
    await expect(page.locator("#distraction")).toBeHidden();
    await panel.reload();
    await panel.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.locator("#distraction")).toBeVisible();
    await panel.getByRole("button", { name: "Hide", exact: true }).click();
    await page.locator("#distraction").click();
    const other = await panel.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "add",
        origin: "http://127.0.0.1:5173",
        selector: "#keep",
        label: "Other tab",
      }),
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator("#keep")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    await panel.evaluate(
      (id) =>
        chrome.runtime.sendMessage({
          type: "remove",
          origin: "http://127.0.0.1:5173",
          id,
        }),
      other.createdRuleId,
    );
    await expect(page.locator("#keep")).toBeVisible();
    await expect(page.locator("#distraction")).toBeVisible();
    await page.locator("#keep").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#keep")).toBeHidden();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator("#keep")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toHaveCount(0);
    for (const width of [320, 375, 768, 1024, 1440, 2560]) {
      await panel.setViewportSize({ width, height: 900 });
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await panel.setViewportSize({ width: 360, height: 900 });
    await panel.screenshot({ path: "output/playwright/side-panel.png" });
    await panel.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await panel.screenshot({ path: "output/playwright/side-panel-dark.png" });
    await page.screenshot({ path: "output/playwright/restored.png" });
    // Exercise normal panel tab tracking, including a delayed action completing on a protected tab.
    await panel.evaluate(() => history.replaceState(null, "", "panel.html"));
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator("#site")).toHaveText("127.0.0.1");
    await panel.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "add",
        origin: "http://127.0.0.1:5173",
        selector: "#distraction",
        label: "Distraction",
      }),
    );
    await expect(panel.locator("#restore")).toBeEnabled();
    await panel.evaluate(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = async (...args) => {
        const result = await original(...args);
        if (args[0].type === "restore")
          await new Promise((resolve) => {
            window.releaseRestore = resolve;
          });
        return result;
      };
      document.querySelector("#restore").click();
    });
    await expect
      .poll(() => panel.evaluate(() => !!window.releaseRestore))
      .toBe(true);
    const protectedPage = await context.newPage();
    await protectedPage.goto("chrome://version");
    await protectedPage.bringToFront();
    await expect(panel.locator("#site")).toHaveText("This page is protected");
    await panel.evaluate(() => window.releaseRestore());
    await expect(panel.locator("#count")).toHaveText("No site selected");
    await expect(panel.locator("#hide")).toBeDisabled();
    await page.bringToFront();
    await expect(panel.locator("#hide")).toBeEnabled();
    // Fault injection at the browser API boundary verifies denied-access recovery without a real prompt.
    await panel.evaluate(() => {
      chrome.permissions.request = async () => false;
      document.querySelector("#hide").click();
    });
    await expect(panel.locator("#status")).toContainText("Allow access");
    await expect(panel.locator("#hide")).toBeEnabled();
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator("#hide")).toBeEnabled();
    await panel.close();
  } finally {
    if (ownsProfile && !panel.isClosed())
      await panel
        .evaluate(async () => {
          await chrome.runtime.sendMessage({
            type: "restore",
            origin: "http://127.0.0.1:5173",
          });
        })
        .catch(() => {});
    await context.tracing.stop({ path: "output/playwright/hide-trace.zip" });
    await context.close();
  }
}
