import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";

// Integration failure contract: test-origin grants must not stand in for a real activeTab gesture.
test.fixme(
  process.env.TAYLR_NATIVE_ACTION !== "1",
  "Diagnostic only: page.keyboard does not trigger browser action accelerators in tested headless/headed Chromium; real activeTab integration remains unverified.",
);
test("Native action: keyboard shortcut grants activeTab without host grants", async () => {
  const instance = await isolatedBrowser(undefined, { nativeAction: true });
  try {
    const page = await instance.context.newPage();
    await instance.context.route(
      "https://example.com/taylr-permission",
      (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Native permission fixture</title><article id='target'>Hide this card</article><main>Keep this</main>",
        }),
    );
    await page.goto("https://example.com/taylr-permission");
    await page.bringToFront();
    await expect(
      instance.worker.evaluate(() =>
        chrome.permissions.contains({ origins: ["https://example.com/*"] }),
      ),
    ).resolves.toBe(false);
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+Shift+Y" : "Control+Shift+Y",
    );
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toBeVisible({
      timeout: 3000,
    });
  } finally {
    await instance.close();
  }
});
