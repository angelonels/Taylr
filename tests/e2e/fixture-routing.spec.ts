import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: a controlled fixture must not depend on a shared development
// server or make a network request to an unrelated process that owns its port.
test("Controlled fixture is owned by the disposable browser even offline", async () => {
  const instance = await isolatedBrowser();
  await instance.context.tracing.start({ screenshots: true, snapshots: true });
  try {
    await instance.context.setOffline(true);
    const page = await instance.context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    await expect(page).toHaveTitle("Taylr acceptance fixture");
    await expect(page.locator("#keep")).toBeVisible();
  } finally {
    await instance.context.tracing.stop({
      path: evidencePath("fixture-routing.zip"),
    });
    await instance.close();
  }
});
